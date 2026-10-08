"""
test_auth_review.py — Unit & Integration Tests for Auth (TASK-010), RBAC (TASK-011), and Clinician Review (TASK-012)
=====================================================================================================================
"""

import pytest
import uuid
import json
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db, UserModel, AssessmentModel, PatientModel, ClinicalReviewModel, AuditEventModel, SyncJournalModel
from main import app
from auth_service import hash_password, verify_password, create_access_token, seed_default_users

TEST_DATABASE_URL = "sqlite:///:memory:"
test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

@pytest.fixture(autouse=True)
def setup_test_db():
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    app.dependency_overrides[get_db] = override_get_db
    db = TestingSessionLocal()
    seed_default_users(db)
    yield db
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=test_engine)

@pytest.fixture
def client():
    return TestClient(app)


# ─── 1. AUTHENTICATION (TASK-010) TESTS ────────────────────────────────────────

def test_password_hashing():
    plain = "SuperSecret123!"
    hashed = hash_password(plain)
    assert hashed.startswith("pbkdf2_sha256$600000$")
    assert verify_password(plain, hashed) is True
    assert verify_password("WrongPassword", hashed) is False

def test_login_success_and_jwt_generation(client):
    res = client.post("/api/v2/auth/login", json={
        "username": "dr.sharma",
        "password": "doctor123"
    })
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["token_type"] == "Bearer"
    assert data["user"]["username"] == "dr.sharma"
    assert data["user"]["role"] == "PHC_DOCTOR"
    assert "reviews:perform" in data["permissions"]

def test_login_invalid_credentials(client):
    res = client.post("/api/v2/auth/login", json={
        "username": "dr.sharma",
        "password": "wrongpassword"
    })
    assert res.status_code == 401
    assert "Invalid username or password" in res.json()["detail"]

def test_get_current_user_profile(client):
    login_res = client.post("/api/v2/auth/login", json={
        "username": "asha.anita",
        "password": "asha123"
    })
    token = login_res.json()["access_token"]

    res = client.get("/api/v2/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = res.json()
    assert data["user"]["role"] == "ASHA_WORKER"
    assert data["user"]["full_name"] == "Anita Roy"
    assert "patients:create" in data["permissions"]
    assert "reviews:perform" not in data["permissions"]


# ─── 2. RBAC PERMISSION ENFORCEMENT (TASK-011) TESTS ──────────────────────────

def test_rbac_asha_cannot_perform_review(client, setup_test_db):
    # Login as ASHA
    login_res = client.post("/api/v2/auth/login", json={
        "username": "asha.anita",
        "password": "asha123"
    })
    token = login_res.json()["access_token"]

    # ASHA worker attempts to access pending review queue -> should be 403 Forbidden
    res = client.get("/api/v2/reviews/pending", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403
    assert "Permission denied" in res.json()["detail"]

def test_rbac_doctor_can_access_review_queue(client):
    # Login as Doctor
    login_res = client.post("/api/v2/auth/login", json={
        "username": "dr.sharma",
        "password": "doctor123"
    })
    token = login_res.json()["access_token"]

    res = client.get("/api/v2/reviews/pending", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert isinstance(res.json(), list)


# ─── 3. CLINICIAN REVIEW & ATTESTATION (TASK-012) TESTS ───────────────────────

def test_assessment_creates_review_required_for_red_flags(client, setup_test_db):
    # Create patient
    p_res = client.post("/api/patients", json={
        "name": "Ramesh Kumar",
        "age": 55,
        "gender": "Male",
        "village": "Sonpur",
        "phone": "9876543210"
    })
    p_id = p_res.json()["id"]

    # Create emergency assessment (Chest Pain + Dyspnea -> Red Flag)
    ass_res = client.post("/api/assess", json={
        "patient_id": p_id,
        "symptoms": ["Chest Pain", "Shortness of Breath"],
        "systolic_bp": 185,
        "diastolic_bp": 115
    })
    assert ass_res.status_code == 200
    ass_data = ass_res.json()
    assert ass_data["is_emergency"] == 1
    assert ass_data["review_state"] == "REVIEW_REQUIRED"

def test_clinician_review_flow_approve_and_attestation(client, setup_test_db):
    # 1. Doctor login
    login_res = client.post("/api/v2/auth/login", json={
        "username": "dr.sharma",
        "password": "doctor123"
    })
    doc_token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {doc_token}"}

    # 2. Create patient & emergency assessment
    p_res = client.post("/api/patients", json={
        "name": "Sunil Das",
        "age": 60,
        "gender": "Male",
        "village": "Sonpur",
        "phone": "9876543211"
    })
    p_id = p_res.json()["id"]

    ass_res = client.post("/api/assess", json={
        "patient_id": p_id,
        "symptoms": ["Chest Pain"],
        "systolic_bp": 190,
        "diastolic_bp": 120
    })
    ass_id = ass_res.json()["id"]

    # 3. Check pending queue
    pending_res = client.get("/api/v2/reviews/pending", headers=headers)
    assert pending_res.status_code == 200
    pending_items = pending_res.json()
    assert any(item["assessment_id"] == ass_id for item in pending_items)

    # 4. Assign to doctor
    assign_res = client.post(f"/api/v2/reviews/{ass_id}/assign", headers=headers)
    assert assign_res.status_code == 200
    assert assign_res.json()["review_state"] == "IN_REVIEW"

    # 5. Doctor submits approval review
    review_submit_res = client.post(f"/api/v2/reviews/{ass_id}/submit", headers=headers, json={
        "decision": "APPROVED",
        "clinical_notes": "Confirmed hypertensive urgency with cardiac risk. Immediate secondary referral dispatched."
    })
    assert review_submit_res.status_code == 200
    review_data = review_submit_res.json()
    assert review_data["decision"] == "APPROVED"
    assert review_data["reviewer_name"] == "Dr. Rajesh Sharma, MBBS"
    assert "signature_hash" in review_data
    assert len(review_data["signature_hash"]) == 64 # SHA256 hex
    assert "I, Dr. Rajesh Sharma" in review_data["attestation_statement"]

    # 6. Verify review history audit trail
    history_res = client.get(f"/api/v2/reviews/{ass_id}/history", headers=headers)
    assert history_res.status_code == 200
    history_items = history_res.json()
    assert len(history_items) == 1
    assert history_items[0]["decision"] == "APPROVED"
    assert history_items[0]["signature_hash"] == review_data["signature_hash"]

def test_clinician_override_mandatory_reason_validation(client, setup_test_db):
    login_res = client.post("/api/v2/auth/login", json={
        "username": "dr.sharma",
        "password": "doctor123"
    })
    headers = {"Authorization": f"Bearer {login_res.json()['access_token']}"}

    # Create patient & assessment
    p_id = client.post("/api/patients", json={"name": "Kavita Sen", "age": 32, "gender": "Female", "village": "Sonpur", "phone": "9876543212"}).json()["id"]
    ass_id = client.post("/api/assess", json={"patient_id": p_id, "symptoms": ["Fever"], "temperature_f": 101.5}).json()["id"]

    # Modifying without override reason should fail (422 Unprocessable Entity)
    fail_res = client.post(f"/api/v2/reviews/{ass_id}/submit", headers=headers, json={
        "decision": "MODIFIED",
        "clinical_notes": "Patient reports fever subsided after oral antipyretic.",
        "modified_risk_level": "LOW"
    })
    assert fail_res.status_code == 422
    assert "override reason is mandatory" in fail_res.json()["detail"]

    # Modifying WITH override reason should succeed
    success_res = client.post(f"/api/v2/reviews/{ass_id}/submit", headers=headers, json={
        "decision": "MODIFIED",
        "clinical_notes": "Patient reports fever subsided completely and physical exam shows no signs of infection.",
        "override_reason": "Clinical resolution confirmed after physical observation at PHC.",
        "modified_risk_level": "LOW",
        "modified_triage_state": "LOW_RISK",
        "modified_action": "Home rest and hydration.",
        "modified_referral_status": "NOT_REFERRED"
    })
    assert success_res.status_code == 200
    assert success_res.json()["decision"] == "MODIFIED"
    assert success_res.json()["review_state"] == "MODIFIED"
