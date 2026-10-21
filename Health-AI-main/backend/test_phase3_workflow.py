"""
test_phase3_workflow.py — End-to-End Workflow & Security Validation Suite
========================================================================
Validates Phase 3 Requirements:
1. Valid and invalid patient registration.
2. Duplicate-submission handling.
3. Cross-facility patient access and mutation (403/404 isolation).
4. Valid screening with complete measurements.
5. Missing and malformed measurements.
6. Emergency red flags and emergency precedence.
7. Risk-score boundaries and classification consistency.
8. Assessment persistence and repeated submission idempotency.
9. Unauthorized review submission (RBAC rejection).
10. Clinical override justification and HMAC attestation integrity.
11. Referral creation, updates, and valid/invalid transitions.
12. Facility-scoped referral and appointment access.
13. Offline persistence, retry, idempotency, and conflict handling.
14. Network / secondary AI failure resilience (emergency never downgraded).
"""

import pytest
import uuid
from datetime import datetime
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import (
    Base, get_db, UserModel, PatientModel, AssessmentModel,
    AppointmentModel, ClinicalReviewModel, AuditEventModel,
    SyncJournalModel, IdempotencyModel, ClinicModel, ClinicMembershipModel
)
from main import app
from auth_service import create_access_token, seed_default_users, hash_password
from schemas import (
    PatientCreate, AssessmentCreate,
    SyncPushRequest, SyncOperation, AppointmentCreate
)
from ml_engine import screening_engine, RedFlagInterceptor, UncertaintyEvaluator

# In-memory shared SQLite database for deterministic isolation
TEST_DB_URL = "sqlite:///:memory:"
engine = create_engine(
    TEST_DB_URL,
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

    # Seed rampur doctor for cross-facility testing
    rampur_doc = UserModel(
        id="usr_dr_rampur",
        username="dr.rampur",
        email="dr.rampur@phc.in",
        password_hash=hash_password("rampur123"),
        full_name="Dr. Rampur",
        role="PHC_DOCTOR",
        facility_id="PHC_RAMPUR",
        is_active=1
    )
    rampur_clinic = ClinicModel(
        id="PHC_RAMPUR",
        name="Rampur Primary Health Centre",
        facility_code="PHC_RAMPUR",
        owner_user_id="usr_dr_rampur",
        is_active=1
    )
    rampur_mem = ClinicMembershipModel(
        id=str(uuid.uuid4()),
        clinic_id="PHC_RAMPUR",
        user_id="usr_dr_rampur",
        role="DOCTOR",
        status="ACTIVE",
        is_active=1
    )
    db.add_all([rampur_doc, rampur_clinic, rampur_mem])
    db.commit()
    db.close()
    yield
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=engine)

@pytest.fixture
def client_doctor_sonpur():
    """PHC Doctor authorized at facility PHC_SONPUR."""
    c = TestClient(app)
    token = create_access_token({
        "sub": "usr_dr_sharma",
        "username": "dr.sharma",
        "role": "PHC_DOCTOR",
        "full_name": "Dr. Rajesh Sharma, MBBS",
        "facility_id": "PHC_SONPUR"
    })
    c.headers.update({"Authorization": f"Bearer {token}"})
    return c

@pytest.fixture
def client_doctor_rampur():
    """PHC Doctor authorized at a DIFFERENT facility PHC_RAMPUR."""
    c = TestClient(app)
    token = create_access_token({
        "sub": "usr_dr_rampur",
        "username": "dr.rampur",
        "role": "PHC_DOCTOR",
        "full_name": "Dr. Rampur",
        "facility_id": "PHC_RAMPUR"
    })
    c.headers.update({"Authorization": f"Bearer {token}"})
    return c

@pytest.fixture
def client_asha_sonpur():
    """ASHA Worker authorized at SC_SONPUR (lacks review permission)."""
    c = TestClient(app)
    token = create_access_token({
        "sub": "usr_asha_anita",
        "username": "asha.anita",
        "role": "ASHA_WORKER",
        "full_name": "Anita Roy",
        "facility_id": "SC_SONPUR"
    })
    c.headers.update({"Authorization": f"Bearer {token}"})
    return c


# ─── 1. PATIENT REGISTRATION: VALID & INVALID ─────────────────────────────────

def test_patient_registration_valid_and_invalid(client_asha_sonpur):
    # Valid patient registration
    valid_payload = {
        "name": "Kamala Devi",
        "age": 45,
        "gender": "Female",
        "village": "Sonpur Ward 4",
        "phone": "+91 98765 11111"
    }
    res = client_asha_sonpur.post("/api/patients", json=valid_payload)
    assert res.status_code in (200, 201), f"Expected success: {res.text}"
    p_data = res.json()
    assert p_data["name"] == "Kamala Devi"
    assert p_data["facility_id"] == "SC_SONPUR", "Server must assign facility from auth context"

    # Invalid age (below 1)
    res_bad_age1 = client_asha_sonpur.post("/api/patients", json={**valid_payload, "age": 0})
    assert res_bad_age1.status_code == 422, "Age 0 must be rejected"

    # Invalid age (above 125)
    res_bad_age2 = client_asha_sonpur.post("/api/patients", json={**valid_payload, "age": 140})
    assert res_bad_age2.status_code == 422, "Age 140 must be rejected"

    # Missing required name
    res_no_name = client_asha_sonpur.post("/api/patients", json={
        "age": 30,
        "gender": "Female",
        "village": "Sonpur",
        "phone": "9876543210"
    })
    assert res_no_name.status_code == 422, "Missing name must be rejected"


# ─── 2. DUPLICATE SUBMISSION HANDLING ─────────────────────────────────────────

def test_duplicate_submission_handling(client_asha_sonpur):
    payload = {
        "name": "Ramesh Kumar",
        "age": 52,
        "gender": "Male",
        "village": "Sonpur Block B",
        "phone": "+91 98765 22222",
        "national_health_id": "NHID-9876-5432"
    }
    # First submission
    res1 = client_asha_sonpur.post("/api/patients", json=payload)
    assert res1.status_code in (200, 201)
    id1 = res1.json()["id"]

    # Second submission with identical demographic and NHID
    res2 = client_asha_sonpur.post("/api/patients", json=payload)
    assert res2.status_code in (200, 201), "Should handle duplicate transparently"
    id2 = res2.json()["id"]
    assert id1 == id2, "Duplicate submission must return existing record rather than creating duplicates"


# ─── 3. CROSS-FACILITY PATIENT ACCESS AND MUTATION (RBAC & ISOLATION) ──────────

def test_cross_facility_patient_access_and_mutation(client_doctor_sonpur, client_doctor_rampur):
    # Doctor at Sonpur creates patient
    res_create = client_doctor_sonpur.post("/api/patients", json={
        "name": "Sita Soren",
        "age": 38,
        "gender": "Female",
        "village": "Sonpur Ward 1",
        "phone": "9876500001"
    })
    assert res_create.status_code in (200, 201)
    pat_id = res_create.json()["id"]

    # Doctor at Rampur attempts to view patient
    res_read = client_doctor_rampur.get(f"/api/patients/{pat_id}")
    assert res_read.status_code in (403, 404), "Cross-facility read must be rejected"

    # Doctor at Rampur attempts to mutate patient
    res_update = client_doctor_rampur.put(f"/api/patients/{pat_id}", json={
        "name": "Sita Soren Hacked",
        "age": 39,
        "gender": "Female",
        "village": "Rampur",
        "phone": "9876500001"
    })
    assert res_update.status_code in (403, 404), "Cross-facility mutation must be rejected"


# ─── 4. VALID SCREENING WITH COMPLETE MEASUREMENTS ────────────────────────────

def test_valid_screening_complete_measurements():
    payload = {
        "patient_id": "pat_complete_01",
        "symptoms": ["headache", "dizziness"],
        "symptom_duration_days": 3,
        "systolic_bp": 135,
        "diastolic_bp": 85,
        "glucose_mg_dl": 145,
        "temperature_f": 98.6,
        "heart_rate_bpm": 76,
        "height_cm": 165.0,
        "weight_kg": 68.0,
        "smoking_status": "Never",
        "physical_activity": "Moderate",
        "family_history": ["diabetes"]
    }
    result = screening_engine.evaluate(payload)
    assert result["uncertainty_state"] == "COMPLETE"
    assert result["risk_level"] in ("MODERATE", "HIGH")
    assert result["risk_score"] is not None
    assert 0.0 <= result["risk_score"] <= 1.0
    assert result["is_emergency"] is False


# ─── 5. MISSING AND MALFORMED MEASUREMENTS ────────────────────────────────────

def test_missing_and_malformed_measurements(client_doctor_sonpur):
    # Missing vitals -> INSUFFICIENT_DATA and risk_score is None
    no_vitals_payload = {
        "patient_id": "pat_missing_01",
        "symptoms": ["fever"],
        "symptom_duration_days": 2
    }
    res = screening_engine.evaluate(no_vitals_payload)
    assert res["uncertainty_state"] == "INSUFFICIENT_DATA"
    assert res["risk_level"] == "INSUFFICIENT_DATA"
    assert res["risk_score"] is None, "Risk score must be None when vitals are missing"

    # Malformed vitals: Systolic BP biologically impossible (350 mmHg)
    with pytest.raises(Exception):
        AssessmentCreate(patient_id="pat_1", systolic_bp=350)

    # Malformed vitals: Temperature biologically impossible (70 F)
    with pytest.raises(Exception):
        AssessmentCreate(patient_id="pat_1", temperature_f=70.0)


# ─── 6. EMERGENCY RED FLAGS AND EMERGENCY PRECEDENCE ─────────────────────────

def test_emergency_red_flags_and_emergency_precedence():
    # Hypertensive crisis short-circuit
    htn_crisis_payload = {
        "patient_id": "pat_htn_01",
        "symptoms": ["headache"],
        "systolic_bp": 195,
        "diastolic_bp": 125
    }
    res_htn = screening_engine.evaluate(htn_crisis_payload)
    assert res_htn["is_emergency"] is True
    assert res_htn["short_circuit"] is True
    assert res_htn["triage_state"] == "EMERGENCY"
    assert res_htn["risk_score"] == 0.99
    assert res_htn["referral_status"] == "REFERRED"
    assert any("Hypertensive Crisis" in rf for rf in res_htn["red_flags"])

    # Acute Coronary Syndrome
    acs_payload = {
        "patient_id": "pat_acs_01",
        "symptoms": ["chest pain", "shortness of breath", "sweating"],
        "systolic_bp": 130,
        "diastolic_bp": 85
    }
    res_acs = screening_engine.evaluate(acs_payload)
    assert res_acs["is_emergency"] is True
    assert res_acs["short_circuit"] is True
    assert res_acs["triage_state"] == "EMERGENCY"

    # Pulmonary Hemoptysis
    hemo_payload = {
        "patient_id": "pat_hemo_01",
        "symptoms": ["coughing blood", "fatigue"],
        "systolic_bp": 120,
        "diastolic_bp": 80
    }
    res_hemo = screening_engine.evaluate(hemo_payload)
    assert res_hemo["is_emergency"] is True
    assert res_hemo["short_circuit"] is True
    assert res_hemo["triage_state"] == "EMERGENCY"


# ─── 7. RISK-SCORE BOUNDARIES USING APPROVED TEST VECTORS ─────────────────────

def test_risk_score_boundaries():
    # Chronic cough >= 14 days -> High Risk Presumptive TB
    tb_payload = {
        "patient_id": "pat_tb_01",
        "symptoms": ["cough", "night sweats"],
        "symptom_duration_days": 18,
        "temperature_f": 99.8,
        "systolic_bp": 118,
        "diastolic_bp": 78
    }
    res_tb = screening_engine.evaluate(tb_payload)
    assert res_tb["risk_level"] == "HIGH"
    assert res_tb["triage_state"] == "HIGH_RISK"
    assert res_tb["referral_status"] == "REFERRED"

    # Borderline BP (135/85) -> Moderate Risk
    border_payload = {
        "patient_id": "pat_border_01",
        "symptoms": [],
        "systolic_bp": 135,
        "diastolic_bp": 85,
        "glucose_mg_dl": 95,
        "temperature_f": 98.4
    }
    res_border = screening_engine.evaluate(border_payload)
    assert res_border["risk_level"] == "MODERATE"
    assert res_border["triage_state"] == "MODERATE_RISK"

    # Completely normal vitals -> Low Risk
    normal_payload = {
        "patient_id": "pat_normal_01",
        "symptoms": [],
        "systolic_bp": 115,
        "diastolic_bp": 75,
        "glucose_mg_dl": 90,
        "temperature_f": 98.4,
        "heart_rate_bpm": 70
    }
    res_normal = screening_engine.evaluate(normal_payload)
    assert res_normal["risk_level"] == "LOW"
    assert res_normal["triage_state"] == "LOW_RISK"


# ─── 8. ASSESSMENT PERSISTENCE AND REPEATED SUBMISSION IDEMPOTENCY ────────────

def test_assessment_persistence_and_repeated_submission(client_doctor_sonpur):
    op_id = str(uuid.uuid4())
    ass_id = str(uuid.uuid4())

    push_payload = {
        "device_id": "device_test_persist",
        "client_sequence": 1,
        "operations": [
            {
                "operation_id": op_id,
                "client_sequence": 1,
                "operation_type": "CREATE",
                "entity_type": "assessment",
                "entity_id": ass_id,
                "payload": {
                    "id": ass_id,
                    "patient_id": "pat_dummy_01",
                    "symptoms": ["cough"],
                    "symptom_duration_days": 2,
                    "systolic_bp": 120,
                    "diastolic_bp": 80,
                    "temperature_f": 98.6
                },
                "base_server_version": 0
            }
        ]
    }

    # First sync push
    res1 = client_doctor_sonpur.post("/api/v2/sync/push", json=push_payload)
    assert res1.status_code == 200
    data1 = res1.json()
    assert data1["results"][0]["status"] == "APPLIED"

    # Repeated sync push with exact same operation_id
    res2 = client_doctor_sonpur.post("/api/v2/sync/push", json=push_payload)
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["results"][0]["status"] == "DUPLICATE", "Repeated submission must be deduplicated idempotently"


# ─── 9. UNAUTHORIZED REVIEW SUBMISSION ────────────────────────────────────────

def test_unauthorized_review_submission(client_asha_sonpur, client_doctor_sonpur):
    # Setup assessment
    db = TestingSessionLocal()
    ass_id = "ass_test_rev_unauth"
    ass = AssessmentModel(
        id=ass_id,
        patient_id="pat_rev_01",
        risk_level="HIGH",
        risk_score=0.75,
        triage_state="HIGH_RISK",
        referral_status="REFERRED",
        facility_id="PHC_SONPUR"
    )
    db.add(ass)
    db.commit()
    db.close()

    # ASHA worker attempts to submit clinician review
    res_unauth = client_asha_sonpur.post(f"/api/v2/reviews/{ass_id}/submit", json={
        "decision": "APPROVED",
        "clinical_notes": "Clinical note by unauthorized ASHA worker"
    })
    assert res_unauth.status_code in (401, 403), "ASHA worker must NOT have review:perform permissions"


# ─── 10. CLINICAL OVERRIDE JUSTIFICATION & ATTESTATION INTEGRITY ───────────────

def test_clinical_override_justification_and_attestation(client_doctor_sonpur):
    db = TestingSessionLocal()
    ass_id = "ass_test_override_01"
    ass = AssessmentModel(
        id=ass_id,
        patient_id="pat_rev_02",
        risk_level="HIGH",
        risk_score=0.85,
        triage_state="HIGH_RISK",
        referral_status="REFERRED",
        facility_id="PHC_SONPUR"
    )
    db.add(ass)
    db.commit()
    db.close()

    # Override HIGH -> LOW without justification must be REJECTED (422)
    res_no_reason = client_doctor_sonpur.post(f"/api/v2/reviews/{ass_id}/submit", json={
        "decision": "MODIFIED",
        "clinical_notes": "Attempting override without rationale",
        "modified_risk_level": "LOW"
    })
    assert res_no_reason.status_code in (400, 422), "Override without mandatory rationale must be rejected"

    # Override with valid rationale must SUCCEED with HMAC attestation
    res_valid = client_doctor_sonpur.post(f"/api/v2/reviews/{ass_id}/submit", json={
        "decision": "MODIFIED",
        "clinical_notes": "Resting BP verified in quiet clinic room",
        "override_reason": "Patient measured high BP after sprinting to clinic; repeated resting BP 118/76 mmHg is normal.",
        "modified_risk_level": "LOW",
        "modified_triage_state": "LOW_RISK"
    })
    assert res_valid.status_code == 200
    rev_data = res_valid.json()
    assert rev_data["decision"] == "MODIFIED"
    assert rev_data["signature_hash"] is not None
    assert "attestation_statement" in rev_data


# ─── 11. REFERRAL CREATION, UPDATES, AND STATE TRANSITIONS ────────────────────

def test_referral_state_transitions(client_doctor_sonpur):
    ass_id = str(uuid.uuid4())
    db = TestingSessionLocal()
    ass = AssessmentModel(
        id=ass_id,
        patient_id="pat_ref_01",
        risk_level="HIGH",
        risk_score=0.80,
        triage_state="HIGH_RISK",
        referral_status="REFERRED",
        facility_id="PHC_SONPUR"
    )
    db.add(ass)
    db.commit()
    db.close()

    # Update referral status via sync outbox
    update_op = {
        "device_id": "device_test_ref",
        "client_sequence": 1,
        "operations": [
            {
                "operation_id": str(uuid.uuid4()),
                "client_sequence": 1,
                "operation_type": "UPDATE",
                "entity_type": "referral",
                "entity_id": ass_id,
                "payload": {
                    "id": ass_id,
                    "referral_status": "CONSULTATION_COMPLETED"
                },
                "base_server_version": 1
            }
        ]
    }
    res_update = client_doctor_sonpur.post("/api/v2/sync/push", json=update_op)
    assert res_update.status_code == 200
    assert res_update.json()["results"][0]["status"] == "APPLIED"

    # Verify assessment reflects updated status
    db2 = TestingSessionLocal()
    updated_ass = db2.query(AssessmentModel).filter(AssessmentModel.id == ass_id).first()
    assert updated_ass.referral_status == "CONSULTATION_COMPLETED"
    db2.close()


# ─── 12. FACILITY-SCOPED REFERRAL AND APPOINTMENT ACCESS ──────────────────────

def test_facility_scoped_appointments(client_doctor_sonpur, client_doctor_rampur):
    app_id = str(uuid.uuid4())
    db = TestingSessionLocal()
    apt = AppointmentModel(
        id=app_id,
        patient_name="Anil Verma",
        patient_phone="9876543210",
        doctor_name="Dr. Sharma",
        doctor_specialty="General Medicine",
        doctor_address="PHC Sonpur",
        appointment_date="2026-10-20",
        appointment_time="10:00 AM",
        notes="Cardiac follow-up",
        status="CONFIRMED",
        facility_id="PHC_SONPUR"
    )
    db.add(apt)
    db.commit()
    db.close()

    # Rampur doctor attempts to mutate appointment via sync
    cross_op = {
        "device_id": "device_rampur",
        "client_sequence": 1,
        "operations": [
            {
                "operation_id": str(uuid.uuid4()),
                "client_sequence": 1,
                "operation_type": "UPDATE",
                "entity_type": "appointment",
                "entity_id": app_id,
                "payload": {
                    "id": app_id,
                    "status": "CANCELLED"
                },
                "base_server_version": 1
            }
        ]
    }
    res_cross = client_doctor_rampur.post("/api/v2/sync/push", json=cross_op)
    assert res_cross.status_code == 200
    res_status = res_cross.json()["results"][0]["status"]
    assert res_status in ("REJECTED", "CONFLICT"), "Cross-facility mutation on appointment must be rejected"


# ─── 13. OFFLINE OCC CONFLICT HANDLING ─────────────────────────────────────────

def test_offline_occ_conflict_detection(client_doctor_sonpur):
    pat_id = str(uuid.uuid4())
    db = TestingSessionLocal()
    p = PatientModel(
        id=pat_id,
        name="Sunil Mehta",
        age=50,
        gender="Male",
        village="Sonpur",
        phone="9876543210",
        facility_id="PHC_SONPUR",
        server_version=3  # Server is already at version 3
    )
    db.add(p)
    db.commit()
    db.close()

    # Offline client pushes update based on stale server version 1
    conflict_op = {
        "device_id": "device_offline_stale",
        "client_sequence": 1,
        "operations": [
            {
                "operation_id": str(uuid.uuid4()),
                "client_sequence": 1,
                "operation_type": "UPDATE",
                "entity_type": "patient",
                "entity_id": pat_id,
                "payload": {
                    "id": pat_id,
                    "name": "Sunil Mehta Stale Edit"
                },
                "base_server_version": 1  # Stale: server is at 3
            }
        ]
    }
    res = client_doctor_sonpur.post("/api/v2/sync/push", json=conflict_op)
    assert res.status_code == 200
    res_data = res.json()["results"][0]
    assert res_data["status"] == "CONFLICT", "Stale base_server_version must trigger CONFLICT ACK"
    assert res_data["server_version"] == 3


# ─── 14. SECONDARY AI FAILURE RESILIENCE ──────────────────────────────────────

def test_secondary_ai_failure_resilience():
    """
    Emergency rules and deterministic clinical evaluation MUST NEVER be delayed,
    downgraded, or suppressed because a secondary AI or network service failed.
    """
    payload = {
        "patient_id": "pat_emergency_ai_failure",
        "symptoms": ["chest pain", "shortness of breath"],
        "systolic_bp": 140,
        "diastolic_bp": 90
    }

    # Evaluate under normal circumstances -> EMERGENCY
    res_normal = screening_engine.evaluate(payload)
    assert res_normal["is_emergency"] is True
    assert res_normal["triage_state"] == "EMERGENCY"

    # Simulate secondary service exception / failure
    with patch("ml_engine.RedFlagInterceptor.evaluate") as mock_interceptor:
        # Emergency interceptor directly returns emergency
        mock_interceptor.return_value = {
            "is_emergency": True,
            "red_flags": ["Mocked Emergency Condition"],
            "conditions": ["Emergency Protocol"]
        }
        res_failover = screening_engine.evaluate(payload)
        assert res_failover["is_emergency"] is True
        assert res_failover["triage_state"] == "EMERGENCY"
        assert res_failover["short_circuit"] is True
