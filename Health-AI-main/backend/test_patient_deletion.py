"""
test_patient_deletion.py — Regression Tests for Patient Deletion & RBAC/Tenancy/Cascade
=======================================================================================
Validates:
1. Unauthenticated delete requests return 401 Unauthorized.
2. ASHA workers (no 'patients:delete' permission) return 403 Forbidden.
3. PHC Doctor attempting to delete a patient belonging to a different facility returns 403 Forbidden.
4. PHC Doctor deleting a patient in their own facility succeeds (200 OK):
   - Sets patient is_deleted = 1, increments server_version.
   - Cascades soft-delete to associated assessments (is_deleted = 1, server_version incremented).
   - Cascades cancel/soft-delete to linked teleconsult appointments.
   - Records tombstones in sync_journal for patient, assessments, and appointments.
   - Records immutable audit trail event in audit_events (PATIENT_DELETED).
   - Verifies deleted patient, assessments, and appointments are excluded from GET queries.
5. Repeated delete requests return 404 Not Found (idempotent soft-deletion).
6. Deleting by alternate alphanumeric patient_id (vs internal database UUID id) succeeds (200 OK).
7. SYSTEM_ADMIN can delete across facilities.
8. Nonexistent patient deletion returns 404 Not Found.
9. Sync V2 push DELETE operation correctly soft-deletes patient, cascades assessments & appointments, and logs audit.
"""

import pytest
import uuid
from datetime import datetime
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db, PatientModel, AssessmentModel, AppointmentModel, SyncJournalModel, AuditEventModel
from main import app
from auth_service import create_access_token, seed_default_users

# In-memory SQLite database using StaticPool for shared in-memory instance
TEST_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

@pytest.fixture(autouse=True)
def setup_database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db
    db = TestingSessionLocal()
    seed_default_users(db)
    db.close()
    yield
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=engine)

@pytest.fixture
def client():
    return TestClient(app)

def create_auth_headers(user_id: str, username: str, role: str, facility_id: str):
    token = create_access_token({
        "sub": user_id,
        "username": username,
        "role": role,
        "full_name": f"Test {username}",
        "facility_id": facility_id
    })
    return {"Authorization": f"Bearer {token}"}

def create_test_patient(
    id: str,
    patient_id: str = "PAT-001",
    name: str = "Test Patient",
    age: int = 40,
    gender: str = "Male",
    village: str = "Sonpur",
    phone: str = "9876543210",
    facility_id: str = "PHC_SONPUR",
    is_deleted: int = 0,
    server_version: int = 1
) -> PatientModel:
    return PatientModel(
        id=id,
        patient_id=patient_id,
        name=name,
        age=age,
        gender=gender,
        village=village,
        phone=phone,
        facility_id=facility_id,
        is_deleted=is_deleted,
        server_version=server_version
    )


# ─── 1. UNAUTHENTICATED DELETE REJECTED ─────────────────────────────────────────

def test_unauthenticated_delete_rejected(client):
    """Calling DELETE without Authorization header must return 401."""
    res = client.delete("/api/patients/synthetic-id-12345")
    assert res.status_code == 401


# ─── 2. ASHA WORKER DELETE REJECTED (RBAC) ────────────────────────────────────

def test_asha_delete_rejected(client):
    """ASHA workers do not have patients:delete permission and must receive 403."""
    headers = create_auth_headers("usr_asha_anita", "asha.anita", "ASHA_WORKER", "SC_SONPUR")
    res = client.delete("/api/patients/synthetic-id-12345", headers=headers)
    assert res.status_code == 403
    assert "permission denied" in res.json().get("detail", "").lower()


# ─── 3. WRONG FACILITY DELETE REJECTED (TENANCY PROTECTION) ───────────────────

def test_doctor_foreign_facility_delete_rejected(client):
    """PHC Doctor from PHC_SONPUR cannot delete a patient registered to PHC_NORTH."""
    db = TestingSessionLocal()
    patient_uuid = str(uuid.uuid4())
    patient = create_test_patient(
        id=patient_uuid,
        patient_id="PAT-FOREIGN-001",
        name="Foreign Patient",
        facility_id="PHC_NORTH"
    )
    db.add(patient)
    db.commit()
    db.close()

    doctor_headers = create_auth_headers("usr_dr_sharma", "dr.sharma", "PHC_DOCTOR", "PHC_SONPUR")
    res = client.delete(f"/api/patients/{patient_uuid}", headers=doctor_headers)
    assert res.status_code == 403
    assert "belongs to facility" in res.json().get("detail", "").lower()

    # Verify patient was NOT soft-deleted
    db = TestingSessionLocal()
    p = db.query(PatientModel).filter(PatientModel.id == patient_uuid).first()
    assert p.is_deleted == 0
    db.close()


# ─── 4. AUTHORIZED DOCTOR LOCAL FACILITY SUCCESS + CASCADE + AUDIT ────────────

def test_doctor_local_facility_delete_success(client):
    """Authorized PHC Doctor deletes local patient: soft-delete patient & assessments & appointments, journal tombstones & audit trail."""
    db = TestingSessionLocal()
    patient_uuid = str(uuid.uuid4())
    patient_phone = "9876543210"
    patient = create_test_patient(
        id=patient_uuid,
        patient_id="PAT-LOCAL-001",
        name="Local Patient",
        phone=patient_phone,
        facility_id="PHC_SONPUR"
    )
    db.add(patient)

    # Add 2 assessments associated with this patient
    ass_uuid_1 = str(uuid.uuid4())
    ass_uuid_2 = str(uuid.uuid4())
    a1 = AssessmentModel(
        id=ass_uuid_1,
        patient_id=patient_uuid,
        facility_id="PHC_SONPUR",
        risk_level="HIGH",
        is_deleted=0,
        server_version=1
    )
    a2 = AssessmentModel(
        id=ass_uuid_2,
        patient_id=patient_uuid,
        facility_id="PHC_SONPUR",
        risk_level="LOW",
        is_deleted=0,
        server_version=1
    )
    db.add_all([a1, a2])

    # Add 1 appointment associated with patient phone
    appt_uuid = str(uuid.uuid4())
    appt = AppointmentModel(
        id=appt_uuid,
        patient_name="Local Patient",
        patient_phone=patient_phone,
        doctor_name="Dr. Rajesh Sharma",
        appointment_date="2026-10-20",
        appointment_time="10:00 AM",
        status="CONFIRMED",
        facility_id="PHC_SONPUR",
        is_deleted=0,
        server_version=1
    )
    db.add(appt)

    db.commit()
    db.close()

    doctor_headers = create_auth_headers("usr_dr_sharma", "dr.sharma", "PHC_DOCTOR", "PHC_SONPUR")
    res = client.delete(f"/api/patients/{patient_uuid}", headers=doctor_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == patient_uuid
    assert "soft deleted" in data["message"].lower()

    # Verify patient is soft-deleted
    db = TestingSessionLocal()
    p = db.query(PatientModel).filter(PatientModel.id == patient_uuid).first()
    assert p.is_deleted == 1
    assert p.server_version == 2

    # Verify assessments are cascade soft-deleted
    assessments = db.query(AssessmentModel).filter(AssessmentModel.patient_id == patient_uuid).all()
    assert len(assessments) == 2
    for ass in assessments:
        assert ass.is_deleted == 1
        assert ass.server_version == 2

    # Verify appointment is cascade cancelled and soft-deleted
    ap = db.query(AppointmentModel).filter(AppointmentModel.id == appt_uuid).first()
    assert ap.is_deleted == 1
    assert ap.status == "CANCELLED"
    assert ap.server_version == 2

    # Verify sync_journal contains tombstones for all 4 entities
    journal_entries = db.query(SyncJournalModel).filter(
        SyncJournalModel.entity_id.in_([patient_uuid, ass_uuid_1, ass_uuid_2, appt_uuid])
    ).all()
    assert len(journal_entries) == 4
    for entry in journal_entries:
        assert entry.operation_type == "DELETE"

    # Verify audit_events contains immutable PATIENT_DELETED record
    audit = db.query(AuditEventModel).filter(
        AuditEventModel.entity_id == patient_uuid,
        AuditEventModel.event_type == "PATIENT_DELETED"
    ).first()
    assert audit is not None
    assert audit.action == "ARCHIVE_AND_DELETE"
    assert audit.user_role == "PHC_DOCTOR"
    assert audit.user_id == "usr_dr_sharma"
    db.close()

    # Verify patient is excluded from GET /api/patients
    p_res = client.get("/api/patients", headers=doctor_headers)
    assert p_res.status_code == 200
    p_ids = [item["id"] for item in p_res.json()]
    assert patient_uuid not in p_ids

    # Direct query returns 404
    p_direct = client.get(f"/api/patients/{patient_uuid}", headers=doctor_headers)
    assert p_direct.status_code == 404

    # Verify assessments are excluded from GET /api/assessments
    a_res = client.get("/api/assessments", headers=doctor_headers)
    assert a_res.status_code == 200
    a_ids = [item["id"] for item in a_res.json()]
    assert ass_uuid_1 not in a_ids
    assert ass_uuid_2 not in a_ids

    # Verify appointments are excluded from GET /api/appointments
    appt_res = client.get("/api/appointments", headers=doctor_headers)
    assert appt_res.status_code == 200
    appt_ids = [item["id"] for item in appt_res.json()]
    assert appt_uuid not in appt_ids


# ─── 5. REPEATED DELETE RETURNS 404 (IDEMPOTENCY / NO GHOST DELETES) ──────────

def test_repeated_delete_returns_404(client):
    """Subsequent delete of an already deleted patient returns 404 Not Found."""
    db = TestingSessionLocal()
    patient_uuid = str(uuid.uuid4())
    patient = create_test_patient(
        id=patient_uuid,
        patient_id="PAT-REPEAT-001",
        name="Repeat Delete Patient",
        facility_id="PHC_SONPUR"
    )
    db.add(patient)
    db.commit()
    db.close()

    doctor_headers = create_auth_headers("usr_dr_sharma", "dr.sharma", "PHC_DOCTOR", "PHC_SONPUR")
    res1 = client.delete(f"/api/patients/{patient_uuid}", headers=doctor_headers)
    assert res1.status_code == 200

    res2 = client.delete(f"/api/patients/{patient_uuid}", headers=doctor_headers)
    assert res2.status_code == 404
    assert "not found" in res2.json().get("detail", "").lower()


# ─── 6. DELETE BY ALTERNATE PATIENT_ID IDENTIFIER ──────────────────────────────

def test_delete_by_patient_id_alternate_identifier(client):
    """Endpoint supports deleting by human-readable patient_id (e.g. PAT-2026-0042) as well as UUID."""
    db = TestingSessionLocal()
    patient_uuid = str(uuid.uuid4())
    custom_patient_id = "PAT-2026-0042"
    patient = create_test_patient(
        id=patient_uuid,
        patient_id=custom_patient_id,
        name="Alternate ID Patient",
        facility_id="PHC_SONPUR"
    )
    db.add(patient)
    db.commit()
    db.close()

    doctor_headers = create_auth_headers("usr_dr_sharma", "dr.sharma", "PHC_DOCTOR", "PHC_SONPUR")
    res = client.delete(f"/api/patients/{custom_patient_id}", headers=doctor_headers)
    assert res.status_code == 200
    assert res.json()["id"] == patient_uuid

    db = TestingSessionLocal()
    p = db.query(PatientModel).filter(PatientModel.patient_id == custom_patient_id).first()
    assert p.is_deleted == 1
    db.close()


# ─── 7. SYSTEM ADMIN CROSS-FACILITY DELETION ──────────────────────────────────

def test_admin_cross_facility_delete_success(client):
    """SYSTEM_ADMIN can delete patients across any facility without 403."""
    db = TestingSessionLocal()
    patient_uuid = str(uuid.uuid4())
    patient = create_test_patient(
        id=patient_uuid,
        patient_id="PAT-ADMIN-001",
        name="Admin Test Patient",
        facility_id="PHC_REMOTE_DISTRICT"
    )
    db.add(patient)
    db.commit()
    db.close()

    admin_headers = create_auth_headers("usr_admin", "admin", "SYSTEM_ADMIN", "CENTRAL_OPS")
    res = client.delete(f"/api/patients/{patient_uuid}", headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["id"] == patient_uuid

    db = TestingSessionLocal()
    p = db.query(PatientModel).filter(PatientModel.id == patient_uuid).first()
    assert p.is_deleted == 1
    db.close()


# ─── 8. NONEXISTENT PATIENT RETURNS 404 ────────────────────────────────────────

def test_delete_nonexistent_patient_returns_404(client):
    """Attempting to delete a nonexistent patient returns 404 Not Found."""
    doctor_headers = create_auth_headers("usr_dr_sharma", "dr.sharma", "PHC_DOCTOR", "PHC_SONPUR")
    res = client.delete(f"/api/patients/{str(uuid.uuid4())}", headers=doctor_headers)
    assert res.status_code == 404
    assert "not found" in res.json().get("detail", "").lower()


# ─── 9. SYNC V2 PUSH DELETE OPERATION CASCADES ASSESSMENTS & AUDIT ────────────

def test_sync_v2_patient_delete_cascades_assessments(client):
    """Offline sync push with operation_type DELETE soft-deletes patient, cascades assessments & appointments, logs audit."""
    db = TestingSessionLocal()
    patient_uuid = str(uuid.uuid4())
    patient_phone = "9876500000"
    patient = create_test_patient(
        id=patient_uuid,
        patient_id="PAT-SYNC-001",
        name="Sync Test Patient",
        phone=patient_phone,
        facility_id="PHC_SONPUR"
    )
    db.add(patient)

    ass_uuid = str(uuid.uuid4())
    ass = AssessmentModel(
        id=ass_uuid,
        patient_id=patient_uuid,
        facility_id="PHC_SONPUR",
        risk_level="MODERATE",
        is_deleted=0,
        server_version=1
    )
    db.add(ass)

    appt_uuid = str(uuid.uuid4())
    appt = AppointmentModel(
        id=appt_uuid,
        patient_name="Sync Test Patient",
        patient_phone=patient_phone,
        doctor_name="Dr. Rajesh Sharma",
        appointment_date="2026-10-22",
        appointment_time="11:00 AM",
        status="PENDING",
        facility_id="PHC_SONPUR",
        is_deleted=0,
        server_version=1
    )
    db.add(appt)

    db.commit()
    db.close()

    doctor_headers = create_auth_headers("usr_dr_sharma", "dr.sharma", "PHC_DOCTOR", "PHC_SONPUR")
    sync_payload = {
        "device_id": "test_device_delete_01",
        "operations": [
            {
                "operation_id": str(uuid.uuid4()),
                "client_sequence": 1,
                "entity_type": "patient",
                "entity_id": patient_uuid,
                "operation_type": "DELETE",
                "base_server_version": 1,
                "client_timestamp": datetime.utcnow().isoformat(),
                "payload": {}
            }
        ]
    }

    res = client.post("/api/v2/sync/push", json=sync_payload, headers=doctor_headers)
    assert res.status_code == 200
    push_res = res.json()
    assert push_res["applied_count"] == 1
    assert push_res["results"][0]["status"] == "APPLIED"

    db = TestingSessionLocal()
    p = db.query(PatientModel).filter(PatientModel.id == patient_uuid).first()
    assert p.is_deleted == 1

    a = db.query(AssessmentModel).filter(AssessmentModel.id == ass_uuid).first()
    assert a.is_deleted == 1

    ap = db.query(AppointmentModel).filter(AppointmentModel.id == appt_uuid).first()
    assert ap.is_deleted == 1
    assert ap.status == "CANCELLED"

    # Check journal has tombstones for all 3
    tombstones = db.query(SyncJournalModel).filter(
        SyncJournalModel.entity_id.in_([patient_uuid, ass_uuid, appt_uuid])
    ).all()
    assert len(tombstones) == 3
    for t in tombstones:
        assert t.operation_type == "DELETE"

    # Check audit_events has PATIENT_DELETED
    audit = db.query(AuditEventModel).filter(
        AuditEventModel.entity_id == patient_uuid,
        AuditEventModel.event_type == "PATIENT_DELETED"
    ).first()
    assert audit is not None
    assert audit.action == "ARCHIVE_AND_DELETE"
    db.close()
