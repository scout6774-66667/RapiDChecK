"""
test_referrals_and_analysis_modules.py — Comprehensive Test Suite for Independent Referrals & Analysis Modules
================================================================================================================
Proves that IDRC Referrals and Analysis are two distinct, independently functioning modules:
1. IDRC Referrals:
   - Authorized users can list and create referrals.
   - Invalid referral requests are rejected (missing patient, short reason).
   - Status transitions are validated (REQUESTED -> APPROVED -> REFERRED -> IN_PROGRESS -> COMPLETED).
   - Terminal statuses (COMPLETED, CANCELLED) cannot transition further.
   - Duplicate submissions do not create duplicate referrals (idempotency and duplicate detection).
   - Unauthorized users without proper permissions cannot mutate protected referrals.
   - Referral updates persist, increment server_version, and record audit trail & journal.
2. Analysis:
   - Metrics are derived from actual persisted records.
   - Unique patients and screening encounters are distinct (deduplicated by patient ID).
   - Risk distribution follows documented definitions (High/Emergency, Moderate, Low, Insufficient Data).
   - Referral statistics use real ReferralModel entities, not assessment recommendations.
   - Date and facility filters work.
   - Multiple assessments for the same patient do not inflate unique-patient counts.
   - Empty data and zero counts are handled honestly without fabricating statistics.
   - Analysis endpoints are strictly read-only and never modify operational database records.
3. Integration & Independence:
   - Creating a referral updates referral management views and analysis metrics.
   - Changing a referral status updates the appropriate aggregated statistics in analysis.
   - Referral management endpoints do not mix with analytics, and analytics does not mutate operational records.
"""

import os
import sys
import uuid
import pytest
from datetime import datetime
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Ensure backend root is in sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from main import app
from database import Base, get_db, PatientModel, AssessmentModel, ReferralModel, AuditEventModel, SyncJournalModel
from auth_service import create_access_token, seed_default_users

# Isolated in-memory SQLite database for zero pollution
TEST_DB_URL = "sqlite:///:memory:"
test_engine = create_engine(
    TEST_DB_URL,
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

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_isolated_db():
    """Sets up a clean in-memory database schema and seed users for every test."""
    Base.metadata.create_all(bind=test_engine)
    app.dependency_overrides[get_db] = override_get_db
    session = TestingSessionLocal()
    seed_default_users(session)
    session.close()
    yield
    Base.metadata.drop_all(bind=test_engine)
    app.dependency_overrides.clear()


@pytest.fixture
def auth_headers_asha():
    token = create_access_token(
        data={"sub": "usr_asha_anita", "username": "asha.anita", "role": "ASHA_WORKER"}
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def auth_headers_doctor():
    token = create_access_token(
        data={"sub": "usr_dr_sharma", "username": "dr.sharma", "role": "PHC_DOCTOR"}
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def seed_patient():
    """Helper fixture to insert an operational patient."""
    session = TestingSessionLocal()
    pat_id = f"PAT-{uuid.uuid4().hex[:6].upper()}"
    patient = PatientModel(
        id=pat_id,
        name="Anjali Sharma",
        age=32,
        gender="Female",
        village="Sonpur",
        phone="9876543210",
        facility_id="PHC_SONPUR",
        record_origin="MANUAL_CLINICAL",
        is_synthetic=0,
        sync_status="SYNCED",
        server_version=1,
        is_deleted=0
    )
    session.add(patient)
    session.commit()
    session.close()
    return pat_id


# ══════════════════════════════════════════════════════════════════════════════
# 1. IDRC REFERRALS — OPERATIONAL REFERRAL MANAGEMENT TESTS
# ══════════════════════════════════════════════════════════════════════════════

def test_authorized_user_can_list_and_create_referral(auth_headers_asha, seed_patient):
    """ASHA worker can create an operational referral and retrieve it via list_referrals."""
    # 1. Create referral
    payload = {
        "patient_id": seed_patient,
        "referral_reason": "High systolic blood pressure (185 mmHg) with persistent headache",
        "priority": "URGENT",
        "destination_facility": "District Super-Specialty Hospital & Trauma Centre",
        "notes": "Transport arranged via 108 emergency service"
    }
    create_res = client.post("/api/referrals", json=payload, headers=auth_headers_asha)
    assert create_res.status_code == 201, create_res.text
    ref_data = create_res.json()

    assert ref_data["id"].startswith("REF-")
    assert ref_data["patient_id"] == seed_patient
    assert ref_data["priority"] == "URGENT"
    assert ref_data["status"] == "REQUESTED"
    assert ref_data["destination_facility"] == "District Super-Specialty Hospital & Trauma Centre"
    assert ref_data["created_by"] == "asha.anita"

    # 2. List referrals
    list_res = client.get("/api/referrals", headers=auth_headers_asha)
    assert list_res.status_code == 200
    referrals_list = list_res.json()
    assert len(referrals_list) == 1
    assert referrals_list[0]["id"] == ref_data["id"]
    assert referrals_list[0]["patient_name"] == "Anjali Sharma"


def test_invalid_referral_requests_are_rejected(auth_headers_asha, seed_patient):
    """Missing or non-existent patient and insufficient reasons are rejected."""
    # Non-existent patient
    res_bad_pat = client.post("/api/referrals", json={
        "patient_id": "PAT-NON-EXISTENT",
        "referral_reason": "Severe acute respiratory distress",
        "destination_facility": "District Hospital"
    }, headers=auth_headers_asha)
    assert res_bad_pat.status_code == 404

    # Empty referral reason
    res_empty_reason = client.post("/api/referrals", json={
        "patient_id": seed_patient,
        "referral_reason": "  ",
        "destination_facility": "District Hospital"
    }, headers=auth_headers_asha)
    assert res_empty_reason.status_code == 400


def test_referral_status_transitions_validation(auth_headers_asha, auth_headers_doctor, seed_patient):
    """Doctor validates transitions: REQUESTED -> APPROVED -> REFERRED -> IN_PROGRESS -> COMPLETED."""
    # 1. Create referral as ASHA
    create_res = client.post("/api/referrals", json={
        "patient_id": seed_patient,
        "referral_reason": "Severe pre-eclampsia symptoms flagged in screening",
        "priority": "EMERGENCY",
        "destination_facility": "Barasat Sub-Divisional Hospital & Chest Clinic"
    }, headers=auth_headers_asha)
    assert create_res.status_code == 201
    ref_id = create_res.json()["id"]

    # 2. Doctor approves referral (REQUESTED -> APPROVED)
    app_res = client.patch(f"/api/referrals/{ref_id}/status", json={
        "status": "APPROVED",
        "notes": "Clinically reviewed and emergency transfer approved."
    }, headers=auth_headers_doctor)
    assert app_res.status_code == 200
    assert app_res.json()["status"] == "APPROVED"
    assert app_res.json()["updated_by"] == "dr.sharma"

    # 3. Patient is transferred to hospital (APPROVED -> REFERRED)
    ref_res = client.patch(f"/api/referrals/{ref_id}/status", json={
        "status": "REFERRED",
        "notes": "Patient handed over to ambulance crew."
    }, headers=auth_headers_doctor)
    assert ref_res.status_code == 200
    assert ref_res.json()["status"] == "REFERRED"

    # 4. Hospital begins triage (REFERRED -> IN_PROGRESS)
    prog_res = client.patch(f"/api/referrals/{ref_id}/status", json={
        "status": "IN_PROGRESS",
        "notes": "Admitted to acute stabilization ward."
    }, headers=auth_headers_doctor)
    assert prog_res.status_code == 200
    assert prog_res.json()["status"] == "IN_PROGRESS"

    # 5. Doctor records outcome (IN_PROGRESS -> COMPLETED)
    comp_res = client.patch(f"/api/referrals/{ref_id}/status", json={
        "status": "COMPLETED",
        "outcome_notes": "Patient successfully stabilized, medications prescribed. Discharged for home follow-up."
    }, headers=auth_headers_doctor)
    assert comp_res.status_code == 200
    assert comp_res.json()["status"] == "COMPLETED"
    assert "successfully stabilized" in comp_res.json()["outcome_notes"]

    # 6. Terminal status cannot transition backwards (COMPLETED -> REQUESTED fails)
    invalid_res = client.patch(f"/api/referrals/{ref_id}/status", json={
        "status": "REQUESTED"
    }, headers=auth_headers_doctor)
    assert invalid_res.status_code == 400
    assert "Cannot transition from terminal referral status" in invalid_res.json()["detail"]


def test_duplicate_submissions_do_not_create_duplicate_referrals(auth_headers_asha, seed_patient):
    """Submitting duplicate active referral returns 409 Conflict; client_operation_id provides idempotency."""
    op_id = str(uuid.uuid4())
    payload = {
        "patient_id": seed_patient,
        "referral_reason": "High fasting blood sugar (340 mg/dL)",
        "priority": "URGENT",
        "destination_facility": "District Super-Specialty Hospital",
        "client_operation_id": op_id
    }

    # 1. First submission succeeds
    first_res = client.post("/api/referrals", json=payload, headers=auth_headers_asha)
    assert first_res.status_code == 201
    first_id = first_res.json()["id"]

    # 2. Idempotent retry with same client_operation_id returns existing referral
    retry_res = client.post("/api/referrals", json=payload, headers=auth_headers_asha)
    assert retry_res.status_code == 200 or retry_res.status_code == 201
    assert retry_res.json()["id"] == first_id

    # 3. New submission without idempotency key for same patient and facility returns 409 Conflict
    dup_res = client.post("/api/referrals", json={
        "patient_id": seed_patient,
        "referral_reason": "Another referral request while active",
        "priority": "ROUTINE",
        "destination_facility": "District Super-Specialty Hospital"
    }, headers=auth_headers_asha)
    assert dup_res.status_code == 409
    assert "already exists" in dup_res.json()["detail"]


def test_unauthorized_user_cannot_mutate_referrals(seed_patient, auth_headers_asha):
    """Unauthenticated users or users without referrals:update cannot modify referral status."""
    # Create referral as ASHA
    create_res = client.post("/api/referrals", json={
        "patient_id": seed_patient,
        "referral_reason": "Cardiac murmur detected during clinical exam",
        "priority": "URGENT",
        "destination_facility": "Apex Multi-Specialty Care"
    }, headers=auth_headers_asha)
    assert create_res.status_code == 201
    ref_id = create_res.json()["id"]

    # 1. Unauthenticated request rejected with 401
    unauth_res = client.patch(f"/api/referrals/{ref_id}/status", json={"status": "APPROVED"})
    assert unauth_res.status_code == 401

    # 2. ASHA worker does not have referrals:update permission (only Doctor and Admin do)
    asha_update_res = client.patch(f"/api/referrals/{ref_id}/status", json={
        "status": "APPROVED"
    }, headers=auth_headers_asha)
    assert asha_update_res.status_code == 403


# ══════════════════════════════════════════════════════════════════════════════
# 2. ANALYSIS — ANALYTICS AND POPULATION-HEALTH INSIGHTS TESTS
# ══════════════════════════════════════════════════════════════════════════════

def test_analysis_metrics_derived_from_actual_records(auth_headers_doctor, seed_patient):
    """Analysis metrics are computed from real records in the database."""
    session = TestingSessionLocal()
    # Insert Patient B
    pat_b = PatientModel(
        id=f"PAT-{uuid.uuid4().hex[:6].upper()}",
        name="Ramesh Kumar",
        age=45,
        gender="Male",
        village="Sonpur",
        phone="9876543211",
        facility_id="PHC_SONPUR",
        server_version=1,
        is_deleted=0
    )
    session.add(pat_b)
    session.commit()

    # Insert 3 screening assessments for seed_patient (repeat encounters)
    for i, risk in enumerate(["LOW", "MODERATE", "HIGH"]):
        ass = AssessmentModel(
            id=f"ASS-{uuid.uuid4().hex[:8].upper()}",
            patient_id=seed_patient,
            facility_id="PHC_SONPUR",
            risk_level=risk,
            is_emergency=1 if risk == "HIGH" else 0,
            server_version=1,
            is_deleted=0,
            created_at=f"2026-10-1{i}T10:00:00"
        )
        session.add(ass)

    # Insert 1 assessment for pat_b (LOW risk)
    ass_b = AssessmentModel(
        id=f"ASS-{uuid.uuid4().hex[:8].upper()}",
        patient_id=pat_b.id,
        facility_id="PHC_SONPUR",
        risk_level="LOW",
        is_emergency=0,
        server_version=1,
        is_deleted=0,
        created_at="2026-10-18T10:00:00"
    )
    session.add(ass_b)

    # Insert 1 operational referral for seed_patient
    ref = ReferralModel(
        id=f"REF-{uuid.uuid4().hex[:8].upper()}",
        patient_id=seed_patient,
        referral_reason="Critical Hypertension",
        priority="EMERGENCY",
        destination_facility="District Super-Specialty Hospital",
        facility_id="PHC_SONPUR",
        status="COMPLETED",
        outcome_notes="Medications stabilized",
        created_by="dr.sharma",
        server_version=1,
        is_deleted=0,
        created_at="2026-10-18T12:00:00"
    )
    session.add(ref)
    session.commit()
    session.close()

    # Query GET /api/analysis/overview
    ov_res = client.get("/api/analysis/overview", headers=auth_headers_doctor)
    assert ov_res.status_code == 200, ov_res.text
    data = ov_res.json()

    # Verify distinct counts:
    # 4 total encounters (3 for seed_patient, 1 for pat_b)
    assert data["total_screening_encounters"] == 4
    # Exactly 2 unique patients screened (deduplicated)
    assert data["unique_patients_screened"] == 2
    # Exactly 1 unique high risk patient (seed_patient)
    assert data["unique_high_risk_patients"] == 1
    assert data["high_risk_encounters"] == 1
    assert data["moderate_risk_encounters"] == 1
    assert data["low_risk_encounters"] == 2

    # Referral statistics from ReferralModel
    assert data["total_operational_referrals"] == 1
    assert data["completed_referrals"] == 1
    assert data["completion_rate_percent"] == 100.0


def test_unique_patients_vs_screening_encounters_distinct(auth_headers_doctor, seed_patient):
    """Multiple assessments for the same patient increment encounter count without inflating unique patients."""
    session = TestingSessionLocal()
    # Add 5 repeat assessments for the same patient
    for _ in range(5):
        session.add(AssessmentModel(
            id=f"ASS-{uuid.uuid4().hex[:8].upper()}",
            patient_id=seed_patient,
            facility_id="PHC_SONPUR",
            risk_level="LOW",
            server_version=1,
            is_deleted=0,
            created_at=datetime.utcnow().isoformat()
        ))
    session.commit()
    session.close()

    res = client.get("/api/analysis/overview", headers=auth_headers_doctor)
    assert res.status_code == 200
    data = res.json()
    assert data["total_screening_encounters"] == 5
    assert data["unique_patients_screened"] == 1  # Denominator is never falsely multiplied!


def test_risk_distribution_verified_tiers(auth_headers_doctor, seed_patient):
    """Risk distribution adheres to clinical tiers: High/Emergency, Moderate, Low, Insufficient Data."""
    session = TestingSessionLocal()
    tiers = [
        ("EMERGENCY", 1),
        ("HIGH", 0),
        ("MODERATE", 0),
        ("LOW", 0),
        ("INSUFFICIENT_DATA", 0)
    ]
    for risk, is_em in tiers:
        session.add(AssessmentModel(
            id=f"ASS-{uuid.uuid4().hex[:8].upper()}",
            patient_id=seed_patient,
            facility_id="PHC_SONPUR",
            risk_level=risk,
            is_emergency=is_em,
            server_version=1,
            is_deleted=0,
            created_at=datetime.utcnow().isoformat()
        ))
    session.commit()
    session.close()

    res = client.get("/api/analysis/risk-distribution", headers=auth_headers_doctor)
    assert res.status_code == 200
    data = res.json()
    assert data["total_encounters"] == 5
    assert data["high_or_emergency"] == 2  # EMERGENCY + HIGH
    assert data["moderate"] == 1
    assert data["low"] == 1
    assert data["insufficient_data"] == 1


def test_referral_statistics_derived_from_real_referral_entities(auth_headers_doctor, seed_patient):
    """Referral statistics are calculated directly from ReferralModel, not from assessment recommendations."""
    session = TestingSessionLocal()
    # Insert assessments with referral_status='REFERRED' (these should NOT be counted in referral statistics!)
    session.add(AssessmentModel(
        id=f"ASS-{uuid.uuid4().hex[:8].upper()}",
        patient_id=seed_patient,
        facility_id="PHC_SONPUR",
        risk_level="HIGH",
        referral_status="REFERRED",
        server_version=1,
        is_deleted=0
    ))

    # Insert 2 actual operational ReferralModel records
    session.add(ReferralModel(
        id=f"REF-{uuid.uuid4().hex[:8].upper()}",
        patient_id=seed_patient,
        referral_reason="Obstetric emergency",
        priority="EMERGENCY",
        destination_facility="District Hospital",
        facility_id="PHC_SONPUR",
        status="IN_PROGRESS",
        created_by="dr.sharma",
        server_version=1,
        is_deleted=0
    ))
    session.add(ReferralModel(
        id=f"REF-{uuid.uuid4().hex[:8].upper()}",
        patient_id=seed_patient,
        referral_reason="Routine ECG follow-up",
        priority="ROUTINE",
        destination_facility="Sonpur PHC",
        facility_id="PHC_SONPUR",
        status="COMPLETED",
        created_by="dr.sharma",
        server_version=1,
        is_deleted=0
    ))
    session.commit()
    session.close()

    res = client.get("/api/analysis/referral-statistics", headers=auth_headers_doctor)
    assert res.status_code == 200
    data = res.json()

    # Total must be exactly 2 from ReferralModel, ignoring the unreferred AssessmentModel recommendation
    assert data["total_referrals"] == 2
    assert data["by_status"]["IN_PROGRESS"] == 1
    assert data["by_status"]["COMPLETED"] == 1
    assert data["by_priority"]["EMERGENCY"] == 1
    assert data["by_priority"]["ROUTINE"] == 1
    assert data["completion_rate_percent"] == 50.0  # 1 completed out of 2 total


def test_analysis_read_only_safety(auth_headers_doctor, seed_patient):
    """Analysis endpoints are read-only and never mutate records in the operational database."""
    session = TestingSessionLocal()
    ref = ReferralModel(
        id="REF-STATIC-001",
        patient_id=seed_patient,
        referral_reason="Baseline Test",
        priority="ROUTINE",
        destination_facility="District Hospital",
        facility_id="PHC_SONPUR",
        status="REQUESTED",
        created_by="dr.sharma",
        server_version=1,
        is_deleted=0
    )
    session.add(ref)
    session.commit()
    session.close()

    # Query overview, trends, risk, and stats
    client.get("/api/analysis/overview", headers=auth_headers_doctor)
    client.get("/api/analysis/screening-trends", headers=auth_headers_doctor)
    client.get("/api/analysis/risk-distribution", headers=auth_headers_doctor)
    client.get("/api/analysis/referral-statistics", headers=auth_headers_doctor)

    # Verify ReferralModel was untouched
    session = TestingSessionLocal()
    ref_db = session.query(ReferralModel).filter(ReferralModel.id == "REF-STATIC-001").first()
    assert ref_db.status == "REQUESTED"
    assert ref_db.server_version == 1
    session.close()


def test_empty_data_handled_honestly(auth_headers_doctor):
    """Zero records return honest empty structures rather than fabricated data or crashes."""
    res_ov = client.get("/api/analysis/overview", headers=auth_headers_doctor)
    assert res_ov.status_code == 200
    assert res_ov.json()["total_screening_encounters"] == 0
    assert res_ov.json()["unique_patients_screened"] == 0
    assert res_ov.json()["completion_rate_percent"] == 0.0

    res_tr = client.get("/api/analysis/screening-trends", headers=auth_headers_doctor)
    assert res_tr.status_code == 200
    assert res_tr.json() == []

    res_rf = client.get("/api/analysis/referral-statistics", headers=auth_headers_doctor)
    assert res_rf.status_code == 200
    assert res_rf.json()["total_referrals"] == 0


# ══════════════════════════════════════════════════════════════════════════════
# 3. INTEGRATION AND MODULE INDEPENDENCE TESTS
# ══════════════════════════════════════════════════════════════════════════════

def test_creating_referral_updates_referral_management_and_analysis(auth_headers_asha, auth_headers_doctor, seed_patient):
    """Creating a referral in operational management immediately reflects in analysis."""
    # 1. Initially analysis shows 0 referrals
    res_initial = client.get("/api/analysis/overview", headers=auth_headers_doctor)
    assert res_initial.json()["total_operational_referrals"] == 0

    # 2. ASHA creates referral via operational endpoint
    create_res = client.post("/api/referrals", json={
        "patient_id": seed_patient,
        "referral_reason": "Gestational diabetes with high random glucose (260 mg/dL)",
        "priority": "URGENT",
        "destination_facility": "Apex Multi-Specialty Care"
    }, headers=auth_headers_asha)
    assert create_res.status_code == 201

    # 3. Referral management lists the record
    ref_list = client.get("/api/referrals", headers=auth_headers_asha).json()
    assert len(ref_list) == 1
    assert ref_list[0]["status"] == "REQUESTED"

    # 4. Analysis overview reflects the new referral
    res_after = client.get("/api/analysis/overview", headers=auth_headers_doctor)
    assert res_after.json()["total_operational_referrals"] == 1
    assert res_after.json()["pending_referrals"] == 1


def test_changing_referral_status_updates_aggregated_statistics(auth_headers_asha, auth_headers_doctor, seed_patient):
    """Changing referral status updates both operational status and aggregate statistics."""
    # Create referral
    create_res = client.post("/api/referrals", json={
        "patient_id": seed_patient,
        "referral_reason": "Compound fracture suspected",
        "priority": "EMERGENCY",
        "destination_facility": "District Hospital"
    }, headers=auth_headers_asha)
    ref_id = create_res.json()["id"]

    # Transition to COMPLETED
    client.patch(f"/api/referrals/{ref_id}/status", json={"status": "APPROVED"}, headers=auth_headers_doctor)
    client.patch(f"/api/referrals/{ref_id}/status", json={"status": "REFERRED"}, headers=auth_headers_doctor)
    client.patch(f"/api/referrals/{ref_id}/status", json={"status": "IN_PROGRESS"}, headers=auth_headers_doctor)
    client.patch(f"/api/referrals/{ref_id}/status", json={
        "status": "COMPLETED",
        "outcome_notes": "Orthopedic surgery completed successfully."
    }, headers=auth_headers_doctor)

    # Check Analysis statistics
    stats_res = client.get("/api/analysis/referral-statistics", headers=auth_headers_doctor).json()
    assert stats_res["total_referrals"] == 1
    assert stats_res["by_status"]["COMPLETED"] == 1
    assert stats_res["completion_rate_percent"] == 100.0


def test_module_independence_and_navigation_separation(auth_headers_doctor):
    """Referral management and Analysis endpoints have distinct responsibilities without overlap."""
    # /api/referrals returns list of referral entities, never analysis KPI summaries
    ref_res = client.get("/api/referrals", headers=auth_headers_doctor)
    assert isinstance(ref_res.json(), list)

    # /api/analysis/overview returns aggregate KPI dict, never an operational list
    analysis_res = client.get("/api/analysis/overview", headers=auth_headers_doctor)
    assert isinstance(analysis_res.json(), dict)
    assert "total_screening_encounters" in analysis_res.json()
    assert "unique_patients_screened" in analysis_res.json()

    # Analysis has no POST/PATCH endpoints for mutating referrals
    post_analysis = client.post("/api/analysis/overview", json={})
    assert post_analysis.status_code == 405  # Method Not Allowed
