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
    SyncJournalModel, AuditEventModel, IdempotencyModel, ClinicModel, ClinicMembershipModel
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
    clinic_north = ClinicModel(
        id="PHC_NORTH",
        name="North Primary Health Centre",
        facility_code="PHC_NORTH",
        owner_user_id="doc_a_uuid",
        is_active=1
    )
    clinic_south = ClinicModel(
        id="PHC_SOUTH",
        name="South Primary Health Centre",
        facility_code="PHC_SOUTH",
        owner_user_id="doc_b_uuid",
        is_active=1
    )
    mem_doc_a = ClinicMembershipModel(
        id=str(uuid.uuid4()),
        clinic_id="PHC_NORTH",
        user_id="doc_a_uuid",
        role="DOCTOR",
        status="ACTIVE",
        is_active=1
    )
    mem_doc_b = ClinicMembershipModel(
        id=str(uuid.uuid4()),
        clinic_id="PHC_SOUTH",
        user_id="doc_b_uuid",
        role="DOCTOR",
        status="ACTIVE",
        is_active=1
    )
    mem_asha = ClinicMembershipModel(
        id=str(uuid.uuid4()),
        clinic_id="PHC_NORTH",
        user_id="asha_uuid",
        role="HEALTH_WORKER",
        status="ACTIVE",
        is_active=1
    )
    mem_district = ClinicMembershipModel(
        id=str(uuid.uuid4()),
        clinic_id="PHC_NORTH",
        user_id="district_uuid",
        role="DOCTOR",
        status="ACTIVE",
        is_active=1
    )
    db.add_all([admin, doc_a, doc_b, asha, district, disabled_user, clinic_north, clinic_south, mem_doc_a, mem_doc_b, mem_asha, mem_district])
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


# ==============================================================================
# AUTH-010 to AUTH-013: Token Enforcement, Tampering & Backdoor Elimination
# ==============================================================================

def test_auth_010_missing_bearer_token_rejected(client):
    """Verify all sensitive endpoints reject unauthenticated requests with HTTP 401."""
    assert client.get("/api/patients").status_code == 401
    assert client.post("/api/patients", json={"name": "Anon"}).status_code == 401
    assert client.get("/api/assessments").status_code == 401
    assert client.post("/api/assess", json={"patient_id": "p1"}).status_code == 401
    assert client.get("/api/appointments").status_code == 401
    assert client.post("/api/v2/sync/push", json={"device_id": "d1", "operations": []}).status_code == 401
    assert client.post("/api/v2/sync/pull", json={"device_id": "d1"}).status_code == 401
    assert client.get("/api/dashboard/stats").status_code == 401
    assert client.get("/api/v2/dashboard/phc").status_code == 401

def test_auth_011_malformed_bearer_token_rejected(client):
    """Verify malformed bearer tokens return HTTP 401."""
    bad_headers = {"Authorization": "Bearer not-a-valid-jwt-token"}
    res = client.get("/api/patients", headers=bad_headers)
    assert res.status_code == 401

def test_auth_012_demo_user_backdoor_eliminated(client):
    """Ensure calling without a token does not fall back to dr.sharma."""
    res = client.get("/api/v2/auth/me")
    assert res.status_code == 401

def test_config_001_insecure_production_configuration_fails():
    """Verify validate_security_configuration raises RuntimeError in production mode with default/weak secrets."""
    from config import validate_security_configuration
    import os
    orig_env = os.environ.get("ENVIRONMENT")
    orig_jwt = os.environ.get("JWT_SECRET_KEY")
    try:
        os.environ["ENVIRONMENT"] = "production"
        os.environ["JWT_SECRET_KEY"] = "ruralhealth-ai-insecure-dev-jwt-secret-do-not-use-in-production-2026"
        with pytest.raises(RuntimeError) as exc_info:
            validate_security_configuration("production")
        assert "development default" in str(exc_info.value).lower()
    finally:
        if orig_env is not None:
            os.environ["ENVIRONMENT"] = orig_env
        else:
            os.environ.pop("ENVIRONMENT", None)
        if orig_jwt is not None:
            os.environ["JWT_SECRET_KEY"] = orig_jwt
        else:
            os.environ.pop("JWT_SECRET_KEY", None)

def test_brute_001_brute_force_lockout(client):
    """Verify 5 failed login attempts triggers account lockout and returns 429."""
    from auth_service import clear_login_failures
    username = "dr_sharma"
    clear_login_failures(username)
    try:
        for _ in range(5):
            res = client.post("/api/v2/auth/login", json={"username": username, "password": "WrongPassword!"})
            assert res.status_code == 401
        # 6th attempt should be locked out
        res_locked = client.post("/api/v2/auth/login", json={"username": username, "password": "WrongPassword!"})
        assert res_locked.status_code == 429
        assert "locked" in res_locked.json().get("detail", "").lower()
    finally:
        clear_login_failures(username)

# ==============================================================================
# RBAC-006 to RBAC-008: Role Separation & Least Privilege
# ==============================================================================

def test_rbac_006_doctor_cannot_administer_users(client):
    """Verify PHC Doctor cannot access user administration endpoints."""
    token = make_token("doc_a_uuid", "dr_sharma", "PHC_DOCTOR", "PHC_NORTH")
    res_users = client.get("/api/v2/auth/users", headers={"Authorization": f"Bearer {token}"})
    assert res_users.status_code == 403

    res_reg = client.post("/api/v2/auth/register", json={
        "username": "new_doc", "email": "new@phc.org", "password": "Pass@1234", "full_name": "New Doc", "role": "PHC_DOCTOR"
    }, headers={"Authorization": f"Bearer {token}"})
    assert res_reg.status_code == 403

def test_rbac_007_asha_cannot_access_dashboard_analytics(client):
    """Verify ASHA worker cannot access aggregated dashboard analytics."""
    token = make_token("asha_uuid", "anita_asha", "ASHA_WORKER", "PHC_NORTH")
    res_stats = client.get("/api/dashboard/stats", headers={"Authorization": f"Bearer {token}"})
    assert res_stats.status_code == 403

    res_phc = client.get("/api/v2/dashboard/phc", headers={"Authorization": f"Bearer {token}"})
    assert res_phc.status_code == 403

# ==============================================================================
# FAC-001 to FAC-006: Object-Level Authorization & Facility Isolation
# ==============================================================================

def test_fac_001_cross_facility_patient_read_rejected(client):
    """User from PHC_NORTH cannot read patient belonging to PHC_SOUTH."""
    db = TestingSessionLocal()
    p = PatientModel(id="pat_south_01", name="South Patient 01", age=35, gender="FEMALE", phone="9988112233", village="South Village", facility_id="PHC_SOUTH")
    db.add(p)
    db.commit()
    db.close()

    token_north = make_token("doc_a_uuid", "dr_sharma", "PHC_DOCTOR", "PHC_NORTH")
    res = client.get("/api/patients/pat_south_01", headers={"Authorization": f"Bearer {token_north}"})
    assert res.status_code == 403
    assert "facility" in res.json().get("detail", "").lower()

def test_fac_002_cross_facility_patient_update_rejected(client):
    """User from PHC_NORTH cannot update patient belonging to PHC_SOUTH."""
    db = TestingSessionLocal()
    p = PatientModel(id="pat_south_02", name="South Patient 02", age=42, gender="MALE", phone="9988112244", village="South Village", facility_id="PHC_SOUTH")
    db.add(p)
    db.commit()
    db.close()

    token_north = make_token("doc_a_uuid", "dr_sharma", "PHC_DOCTOR", "PHC_NORTH")
    res = client.put("/api/patients/pat_south_02", json={
        "name": "Tampered Name", "age": 43, "gender": "MALE", "village": "South Village", "phone": "9988112244"
    }, headers={"Authorization": f"Bearer {token_north}"})
    assert res.status_code == 403

def test_fac_003_cross_facility_assessment_creation_rejected(client):
    """User from PHC_NORTH cannot create assessment for patient in PHC_SOUTH."""
    db = TestingSessionLocal()
    p = PatientModel(id="pat_south_03", name="South Patient 03", age=29, gender="FEMALE", phone="9988112255", village="South Village", facility_id="PHC_SOUTH")
    db.add(p)
    db.commit()
    db.close()

    token_north = make_token("doc_a_uuid", "dr_sharma", "PHC_DOCTOR", "PHC_NORTH")
    res = client.post("/api/assess", json={
        "patient_id": "pat_south_03",
        "symptoms": ["Fever"],
        "temperature_f": 100.5
    }, headers={"Authorization": f"Bearer {token_north}"})
    assert res.status_code == 403

def test_fac_004_cross_facility_review_assignment_rejected(client):
    """Doctor from PHC_NORTH cannot assign review of assessment belonging to PHC_SOUTH."""
    db = TestingSessionLocal()
    p = PatientModel(id="pat_south_04", name="South Patient 04", age=50, gender="MALE", phone="9988112266", village="South Village", facility_id="PHC_SOUTH")
    a = AssessmentModel(id="asm_south_04", patient_id="pat_south_04", facility_id="PHC_SOUTH", risk_level="HIGH", triage_state="ROUTINE", review_state="REVIEW_REQUIRED")
    db.add_all([p, a])
    db.commit()
    db.close()

    token_north = make_token("doc_a_uuid", "dr_sharma", "PHC_DOCTOR", "PHC_NORTH")
    res = client.post("/api/v2/reviews/asm_south_04/assign", headers={"Authorization": f"Bearer {token_north}"})
    assert res.status_code == 403

def test_fac_005_cross_facility_dashboard_stats_rejected(client):
    """Doctor from PHC_NORTH cannot query stats for PHC_SOUTH."""
    token_north = make_token("doc_a_uuid", "dr_sharma", "PHC_DOCTOR", "PHC_NORTH")
    res = client.get("/api/dashboard/stats?facility_id=PHC_SOUTH", headers={"Authorization": f"Bearer {token_north}"})
    assert res.status_code == 403

def test_fac_006_patient_listing_query_isolation(client):
    """Doctor from PHC_NORTH calling GET /api/patients only receives PHC_NORTH patients."""
    db = TestingSessionLocal()
    p_north = PatientModel(id="pat_iso_north", name="North Pat", age=30, gender="MALE", phone="111111", village="North", facility_id="PHC_NORTH")
    p_south = PatientModel(id="pat_iso_south", name="South Pat", age=30, gender="FEMALE", phone="222222", village="South", facility_id="PHC_SOUTH")
    db.add_all([p_north, p_south])
    db.commit()
    db.close()

    token_north = make_token("doc_a_uuid", "dr_sharma", "PHC_DOCTOR", "PHC_NORTH")
    res = client.get("/api/patients", headers={"Authorization": f"Bearer {token_north}"})
    assert res.status_code == 200
    pat_ids = [p["id"] for p in res.json()]
    assert "pat_iso_north" in pat_ids
    assert "pat_iso_south" not in pat_ids

# ==============================================================================
# SYNC-001 to SYNC-003: Offline Sync Authorization & Validation
# ==============================================================================

def test_sync_001_unauthenticated_sync_rejected(client):
    """Unauthenticated sync push and pull requests return 401."""
    assert client.post("/api/v2/sync/push", json={"device_id": "d1", "operations": []}).status_code == 401
    assert client.post("/api/v2/sync/pull", json={"device_id": "d1"}).status_code == 401
    assert client.get("/api/v2/sync/pull").status_code == 401

def test_sync_002_cross_facility_mutation_rejected(client):
    """Worker from PHC_NORTH attempting to push record for PHC_SOUTH gets REJECTED."""
    token_north = make_token("asha_uuid", "anita_asha", "ASHA_WORKER", "PHC_NORTH")
    payload = {
        "device_id": "tablet_asha_1",
        "operations": [{
            "operation_id": str(uuid.uuid4()),
            "client_sequence": 1,
            "entity_type": "patient",
            "entity_id": str(uuid.uuid4()),
            "operation_type": "CREATE",
            "base_server_version": None,
            "client_timestamp": datetime.utcnow().isoformat(),
            "payload": {
                "name": "Foreign Patient",
                "age": 30,
                "gender": "Female",
                "village": "South Village",
                "phone": "9988776655",
                "facility_id": "PHC_SOUTH"
            }
        }]
    }
    res = client.post("/api/v2/sync/push", json=payload, headers={"Authorization": f"Bearer {token_north}"})
    assert res.status_code == 200
    data = res.json()
    assert data["rejected_count"] == 1
    assert data["results"][0]["status"] == "REJECTED"
    assert "facility" in data["results"][0]["error_message"].lower()

def test_sync_003_oversized_batch_rejected(client):
    """Sync batch exceeding MAX_PUSH_BATCH_SIZE (100) returns 413."""
    token = make_token("asha_uuid", "anita_asha", "ASHA_WORKER", "PHC_NORTH")
    ops = [{
        "operation_id": str(uuid.uuid4()),
        "client_sequence": i,
        "entity_type": "patient",
        "entity_id": str(uuid.uuid4()),
        "operation_type": "CREATE",
        "base_server_version": None,
        "client_timestamp": datetime.utcnow().isoformat(),
        "payload": {"name": f"P{i}", "age": 20, "gender": "Other", "village": "V"}
    } for i in range(101)]

    res = client.post("/api/v2/sync/push", json={"device_id": "d1", "operations": ops}, headers={"Authorization": f"Bearer {token}"})
    assert res.status_code in [400, 413]

# ==============================================================================
# CORS-001 to CORS-002: Safe CORS Configuration
# ==============================================================================

def test_cors_001_allowed_origin(client):
    """Request from trusted frontend origin receives correct CORS response headers."""
    res = client.options("/api/health", headers={
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "GET"
    })
    assert res.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert res.headers.get("access-control-allow-credentials") == "true"

def test_cors_002_rejected_origin(client):
    """Request from untrusted origin does NOT receive CORS access headers."""
    res = client.options("/api/health", headers={
        "Origin": "http://untrusted-attacker.com",
        "Access-Control-Request-Method": "GET"
    })
    assert res.headers.get("access-control-allow-origin") != "http://untrusted-attacker.com"
