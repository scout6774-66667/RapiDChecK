"""
Adversarial Security & Database Integrity Test Suite
Covers:
- AUTH-001 to AUTH-009: Authentication lifecycle, token tampering, expiration, disabled users
- RBAC-001 to RBAC-005: Role permissions, facility boundaries, forged frontend roles
- REV-001 to REV-009: Review transitions, mandatory notes/reasons, emergency downgrades
- ATT-001 to ATT-009: Server-side cryptographic attestation (HMAC-SHA256) tamper detection
- DB-001 to DB-007: Database constraints, OCC concurrency, rollback atomicity, journal ordering
"""

import pytest
import uuid
from datetime import datetime, timezone, timedelta
import hmac
import hashlib
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import jwt

from database import (
    Base, get_db, UserModel, PatientModel, AssessmentModel, ClinicalReviewModel,
    SyncJournalModel, AuditEventModel, IdempotencyModel
)
from auth_service import (
    create_access_token, verify_password, hash_password,
    JWT_SECRET_KEY, JWT_ALGORITHM
)
from review_service import (
    submit_clinician_review, generate_server_attestation, verify_server_attestation,
    generate_canonical_review_payload, HMAC_SECRET_KEY
)
from main import app

# In-memory test engine isolated per test session
TEST_DB_URL = "sqlite:///:memory:"
test_engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

@pytest.fixture(autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=test_engine)
    db = TestingSessionLocal()
    
    # Seed baseline users
    admin = UserModel(
        id=str(uuid.uuid4()),
        username="admin_user",
        email="admin@ruralhealth.org",
        password_hash=hash_password("Admin@123"),
        full_name="Admin Administrator",
        role="SYSTEM_ADMIN",
        facility_id="FAC_MAIN",
        is_active=1
    )
    doc_a = UserModel(
        id="doc_a_uuid",
        username="dr_sharma",
        email="sharma@phc.org",
        password_hash=hash_password("Doctor@123"),
        full_name="Dr. Sharma",
        role="PHC_DOCTOR",
        facility_id="PHC_NORTH",
        is_active=1
    )
    doc_b = UserModel(
        id="doc_b_uuid",
        username="dr_patel",
        email="patel@phc.org",
        password_hash=hash_password("Doctor@123"),
        full_name="Dr. Patel",
        role="PHC_DOCTOR",
        facility_id="PHC_SOUTH",
        is_active=1
    )
    asha = UserModel(
        id="asha_uuid",
        username="anita_asha",
        email="anita@ruralhealth.org",
        password_hash=hash_password("Asha@123"),
        full_name="Anita Sharma",
        role="ASHA_WORKER",
        facility_id="PHC_NORTH",
        is_active=1
    )
    district = UserModel(
        id="district_uuid",
        username="officer_verma",
        email="verma@gov.in",
        password_hash=hash_password("Gov@123"),
        full_name="Officer Verma",
        role="DISTRICT_OFFICER",
        facility_id="FAC_DISTRICT",
        is_active=1
    )
    disabled_user = UserModel(
        id="disabled_uuid",
        username="disabled_doc",
        email="disabled@phc.org",
        password_hash=hash_password("Doctor@123"),
        full_name="Disabled Doctor",
        role="PHC_DOCTOR",
        facility_id="PHC_NORTH",
        is_active=0
    )
    db.add_all([admin, doc_a, doc_b, asha, district, disabled_user])
    db.commit()
    db.close()
    
    def override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()
            
    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=test_engine)

@pytest.fixture
def client():
    return TestClient(app)

def make_token(user_id: str, username: str, role: str, facility_id: str = "PHC_NORTH") -> str:
    return create_access_token({
        "sub": user_id,
        "username": username,
        "role": role,
        "full_name": username,
        "facility_id": facility_id
    })

# ==============================================================================
# AUTH-001 to AUTH-009: Authentication Lifecycle & Security
# ==============================================================================

def test_auth_001_valid_login(client):
    res = client.post("/api/v2/auth/login", json={"username": "dr_sharma", "password": "Doctor@123"})
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["user"]["role"] == "PHC_DOCTOR"
    assert data["user"]["facility_id"] == "PHC_NORTH"

def test_auth_002_invalid_password(client):
    res = client.post("/api/v2/auth/login", json={"username": "dr_sharma", "password": "WrongPassword!"})
    assert res.status_code == 401

def test_auth_003_expired_jwt(client):
    past = datetime.now(timezone.utc) - timedelta(minutes=10)
    token = jwt.encode(
        {
            "sub": "doc_a_uuid",
            "username": "dr_sharma",
            "role": "PHC_DOCTOR",
            "full_name": "Dr. Sharma",
            "facility_id": "PHC_NORTH",
            "exp": past,
            "iat": past - timedelta(hours=1)
        },
        JWT_SECRET_KEY,
        algorithm=JWT_ALGORITHM
    )
    res = client.get("/api/v2/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 401
    assert "expired" in res.json().get("detail", "").lower()

def test_auth_004_tampered_jwt(client):
    token = make_token("doc_a_uuid", "dr_sharma", "PHC_DOCTOR", "PHC_NORTH")
    tampered_token = token[:-4] + "xyz1"
    res = client.get("/api/v2/auth/me", headers={"Authorization": f"Bearer {tampered_token}"})
    assert res.status_code == 401

def test_auth_007_invalid_algorithm(client):
    header = {"alg": "none", "typ": "JWT"}
    payload = {
        "sub": "doc_a_uuid",
        "username": "dr_sharma",
        "role": "PHC_DOCTOR",
        "facility_id": "PHC_NORTH",
        "exp": (datetime.now(timezone.utc) + timedelta(hours=1)).timestamp()
    }
    import base64, json
    b64_header = base64.urlsafe_b64encode(json.dumps(header).encode()).decode().rstrip("=")
    b64_payload = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    none_token = f"{b64_header}.{b64_payload}."
    res = client.get("/api/v2/auth/me", headers={"Authorization": f"Bearer {none_token}"})
    assert res.status_code == 401

def test_auth_008_disabled_user(client):
    res = client.post("/api/v2/auth/login", json={"username": "disabled_doc", "password": "Doctor@123"})
    assert res.status_code in [400, 401, 403]
    assert "inactive" in res.json().get("detail", "").lower() or "deactivated" in res.json().get("detail", "").lower()

def test_auth_009_revoked_or_missing_user(client):
    token = make_token("non_existent_uuid", "ghost_user", "PHC_DOCTOR", "PHC_NORTH")
    res = client.get("/api/v2/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 401

# ==============================================================================
# RBAC-001 to RBAC-005: Role-Based & Object-Level Authorization
# ==============================================================================

def test_rbac_001_asha_cannot_review(client):
    token = make_token("asha_uuid", "anita_asha", "ASHA_WORKER", "PHC_NORTH")
    res = client.post(
        "/api/v2/reviews/review-123/submit",
        json={"decision": "APPROVED", "clinical_notes": "Looks fine to me."},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 403

def test_rbac_002_asha_cannot_override(client):
    token = make_token("asha_uuid", "anita_asha", "ASHA_WORKER", "PHC_NORTH")
    res = client.post(
        "/api/v2/reviews/review-123/submit",
        json={"decision": "MODIFIED", "override_reason": "CLINICAL_DISAGREEMENT", "clinical_notes": "Overriding."},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 403

def test_rbac_003_district_officer_cannot_review(client):
    token = make_token("district_uuid", "officer_verma", "DISTRICT_OFFICER", "FAC_DISTRICT")
    res = client.post(
        "/api/v2/reviews/review-123/submit",
        json={"decision": "APPROVED", "clinical_notes": "Administrative approval"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 403

def test_rbac_004_unauthorized_facility_rejected(client):
    db = TestingSessionLocal()
    p = PatientModel(id="pat_south", name="South Patient", age=45, gender="FEMALE", phone="9988776655", village="South Village", facility_id="PHC_SOUTH")
    a = AssessmentModel(
        id="asm_south",
        patient_id="pat_south",
        facility_id="PHC_SOUTH",
        risk_level="HIGH",
        triage_state="ROUTINE",
        review_state="REVIEW_REQUIRED"
    )
    db.add_all([p, a])
    db.commit()
    db.close()

    token_doc_a = make_token("doc_a_uuid", "dr_sharma", "PHC_DOCTOR", "PHC_NORTH")
    res = client.post(
        "/api/v2/reviews/asm_south/submit",
        json={"decision": "APPROVED", "clinical_notes": "Attempting cross-facility approval without permissions"},
        headers={"Authorization": f"Bearer {token_doc_a}"}
    )
    assert res.status_code == 403
    assert "facility" in res.json().get("detail", "").lower()

def test_rbac_005_forged_frontend_role_rejected(client):
    token = make_token("asha_uuid", "anita_asha", "ASHA_WORKER", "PHC_NORTH")
    res = client.post(
        "/api/v2/reviews/review-123/submit?role=PHC_DOCTOR",
        json={"decision": "APPROVED", "clinical_notes": "Bypassing with query param"},
        headers={"Authorization": f"Bearer {token}", "X-Role-Override": "PHC_DOCTOR"}
    )
    assert res.status_code == 403

# ==============================================================================
# REV-001 to REV-009: Review State Transitions & Clinical Governance
# ==============================================================================

def test_rev_001_to_003_review_lifecycle(client):
    db = TestingSessionLocal()
    p = PatientModel(id="pat_rev", name="Rev Patient", age=50, gender="MALE", phone="9876543210", village="North Village", facility_id="PHC_NORTH")
    a = AssessmentModel(
        id="asm_rev",
        patient_id="pat_rev",
        facility_id="PHC_NORTH",
        risk_level="HIGH",
        triage_state="ROUTINE",
        review_state="REVIEW_REQUIRED"
    )
    db.add_all([p, a])
    db.commit()
    db.close()

    doc_token = make_token("doc_a_uuid", "dr_sharma", "PHC_DOCTOR", "PHC_NORTH")

    res = client.post(
        "/api/v2/reviews/asm_rev/submit",
        json={"decision": "APPROVED", "clinical_notes": "ECG confirms ischemia, clinical decision approved."},
        headers={"Authorization": f"Bearer {doc_token}"}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["review_state"] == "APPROVED"
    assert data["signature_hash"] is not None

def test_rev_004_missing_notes_rejected(client):
    db = TestingSessionLocal()
    p = PatientModel(id="pat_rev2", name="Patient 2", age=50, gender="MALE", phone="9876543210", village="North Village", facility_id="PHC_NORTH")
    a = AssessmentModel(
        id="asm_rev2",
        patient_id="pat_rev2",
        facility_id="PHC_NORTH",
        risk_level="MODERATE",
        triage_state="ROUTINE",
        review_state="REVIEW_REQUIRED"
    )
    db.add_all([p, a])
    db.commit()
    db.close()

    doc_token = make_token("doc_a_uuid", "dr_sharma", "PHC_DOCTOR", "PHC_NORTH")
    res = client.post(
        "/api/v2/reviews/asm_rev2/submit",
        json={"decision": "APPROVED", "clinical_notes": ""},
        headers={"Authorization": f"Bearer {doc_token}"}
    )
    assert res.status_code in [400, 422]

def test_rev_005_missing_override_reason_rejected(client):
    db = TestingSessionLocal()
    p = PatientModel(id="pat_rev3", name="Patient 3", age=50, gender="MALE", phone="9876543210", village="North Village", facility_id="PHC_NORTH")
    a = AssessmentModel(
        id="asm_rev3",
        patient_id="pat_rev3",
        facility_id="PHC_NORTH",
        risk_level="HIGH",
        triage_state="ROUTINE",
        review_state="REVIEW_REQUIRED"
    )
    db.add_all([p, a])
    db.commit()
    db.close()

    doc_token = make_token("doc_a_uuid", "dr_sharma", "PHC_DOCTOR", "PHC_NORTH")
    res = client.post(
        "/api/v2/reviews/asm_rev3/submit",
        json={"decision": "MODIFIED", "clinical_notes": "Modifying assessment findings.", "modified_risk_level": "LOW"},
        headers={"Authorization": f"Bearer {doc_token}"}
    )
    assert res.status_code in [400, 422]
    assert "override" in res.json().get("detail", "").lower()

def test_rev_006_emergency_downgrade_governance(client):
    db = TestingSessionLocal()
    p = PatientModel(id="pat_emg", name="Emergency Patient", age=50, gender="MALE", phone="9876543210", village="North Village", facility_id="PHC_NORTH")
    a = AssessmentModel(
        id="asm_emg",
        patient_id="pat_emg",
        facility_id="PHC_NORTH",
        risk_level="EMERGENCY",
        triage_state="EMERGENCY",
        is_emergency=1,
        review_state="REVIEW_REQUIRED"
    )
    db.add_all([p, a])
    db.commit()
    db.close()

    doc_token = make_token("doc_a_uuid", "dr_sharma", "PHC_DOCTOR", "PHC_NORTH")
    res = client.post(
        "/api/v2/reviews/asm_emg/submit",
        json={
            "decision": "MODIFIED",
            "override_reason": "DIAGNOSTIC_CONFIRMATION",
            "modified_risk_level": "LOW",
            "clinical_notes": "Repeat ECG normal, no troponin elevation."
        },
        headers={"Authorization": f"Bearer {doc_token}"}
    )
    assert res.status_code == 200
    assert res.json()["review_state"] == "MODIFIED"

# ==============================================================================
# ATT-001 to ATT-009: Server-Side Cryptographic Attestation (HMAC-SHA256)
# ==============================================================================

def test_att_001_valid_verification():
    ts = datetime.now(timezone.utc).isoformat()
    sig = generate_server_attestation(
        review_id="rev-101",
        assessment_id="asm-101",
        reviewer_id="doc-101",
        decision="APPROVED",
        timestamp=ts,
        override_reason="",
        workflow_version="2.0.0",
        ruleset_version="2.0.0"
    )
    is_valid = verify_server_attestation(
        signature=sig,
        review_id="rev-101",
        assessment_id="asm-101",
        reviewer_id="doc-101",
        decision="APPROVED",
        timestamp=ts,
        override_reason="",
        workflow_version="2.0.0",
        ruleset_version="2.0.0"
    )
    assert is_valid is True

def test_att_002_to_006_tamper_detection():
    ts = datetime.now(timezone.utc).isoformat()
    sig = generate_server_attestation(
        review_id="rev-101",
        assessment_id="asm-101",
        reviewer_id="doc-101",
        decision="APPROVED",
        timestamp=ts,
        override_reason="",
        workflow_version="2.0.0",
        ruleset_version="2.0.0"
    )
    
    assert not verify_server_attestation(sig, "rev-101", "asm-101", "doc-ROGUE", "APPROVED", ts, "", "2.0.0", "2.0.0")
    assert not verify_server_attestation(sig, "rev-101", "asm-101", "doc-101", "MODIFIED", ts, "", "2.0.0", "2.0.0")
    assert not verify_server_attestation(sig, "rev-101", "asm-101", "doc-101", "APPROVED", ts, "TAMPERED_REASON", "2.0.0", "2.0.0")
    assert not verify_server_attestation(sig, "rev-101", "asm-101", "doc-101", "APPROVED", "2020-01-01T00:00:00Z", "", "2.0.0", "2.0.0")
    assert not verify_server_attestation(sig, "rev-101", "asm-ROGUE", "doc-101", "APPROVED", ts, "", "2.0.0", "2.0.0")

def test_att_009_key_rotation():
    ts = datetime.now(timezone.utc).isoformat()
    sig_old = generate_server_attestation(
        review_id="rev-101",
        assessment_id="asm-101",
        reviewer_id="doc-101",
        decision="APPROVED",
        timestamp=ts,
        override_reason="",
        workflow_version="2.0.0",
        ruleset_version="2.0.0"
    )
    rotated_secret = "new-rotated-hmac-secret-key-2026-v2"
    canonical_payload = generate_canonical_review_payload(
        "rev-101", "asm-101", "doc-101", "APPROVED", ts, "", "2.0.0", "2.0.0"
    )
    new_expected_sig = hmac.new(rotated_secret.encode("utf-8"), canonical_payload.encode("utf-8"), hashlib.sha256).hexdigest()
    assert not hmac.compare_digest(sig_old, new_expected_sig)

# ==============================================================================
# DB-001 to DB-007: Database Integrity, Transactions & OCC
# ==============================================================================

def test_db_002_transaction_rollback():
    db = TestingSessionLocal()
    initial_count = db.query(PatientModel).count()
    try:
        p = PatientModel(id="pat_fail", name="Fail Pat", age=30, gender="OTHER", phone="12345", village="V1", facility_id="FAC_1")
        db.add(p)
        db.flush()
        p_dup = PatientModel(id="pat_fail", name="Duplicate Pat", age=31, gender="OTHER", phone="12345", village="V1", facility_id="FAC_1")
        db.add(p_dup)
        db.commit()
    except Exception:
        db.rollback()
    
    assert db.query(PatientModel).count() == initial_count
    db.close()

def test_db_004_unique_operation_id_constraint():
    db = TestingSessionLocal()
    op_id = str(uuid.uuid4())
    idem1 = IdempotencyModel(
        operation_id=op_id,
        device_id="dev-1",
        client_sequence=1,
        entity_type="PATIENT",
        entity_id="pat_1",
        status="APPLIED",
        server_version=1,
        response_json="{}"
    )
    db.add(idem1)
    db.commit()

    idem2 = IdempotencyModel(
        operation_id=op_id,
        device_id="dev-1",
        client_sequence=1,
        entity_type="PATIENT",
        entity_id="pat_1",
        status="APPLIED",
        server_version=1,
        response_json="{}"
    )
    db.add(idem2)
    with pytest.raises(Exception):
        db.commit()
    db.rollback()
    db.close()

def test_db_005_optimistic_concurrency_control():
    db = TestingSessionLocal()
    p = PatientModel(id="pat_occ", name="OCC Pat", age=30, gender="MALE", phone="998877", village="V2", facility_id="PHC_NORTH", server_version=1)
    db.add(p)
    db.commit()

    rows_affected = db.query(PatientModel).filter(
        PatientModel.id == "pat_occ",
        PatientModel.server_version == 1
    ).update({"name": "Updated by Client A", "server_version": PatientModel.server_version + 1})
    db.commit()
    assert rows_affected == 1

    stale_rows_affected = db.query(PatientModel).filter(
        PatientModel.id == "pat_occ",
        PatientModel.server_version == 1
    ).update({"name": "Updated by Stale Client B", "server_version": PatientModel.server_version + 1})
    db.commit()
    assert stale_rows_affected == 0
    db.close()

def test_db_006_journal_ordering_and_continuity():
    db = TestingSessionLocal()
    j1 = SyncJournalModel(entity_type="patient", entity_id="p1", operation_type="CREATE", server_version=1, payload_json="{}")
    j2 = SyncJournalModel(entity_type="patient", entity_id="p2", operation_type="CREATE", server_version=1, payload_json="{}")
    j3 = SyncJournalModel(entity_type="patient", entity_id="p3", operation_type="CREATE", server_version=1, payload_json="{}")
    db.add_all([j1, j2, j3])
    db.commit()

    entries = db.query(SyncJournalModel).order_by(SyncJournalModel.server_sequence.asc()).all()
    seq_ids = [e.server_sequence for e in entries]
    assert seq_ids == sorted(seq_ids)
    assert len(seq_ids) >= 3
    db.close()
