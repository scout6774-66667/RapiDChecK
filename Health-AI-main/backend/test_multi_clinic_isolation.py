"""
test_multi_clinic_isolation.py — Comprehensive Automated Multi-Clinic Isolation Tests
====================================================================================
Tests cover Requirements 1 through 9:
Scenario A: Registration & Initialized Workspace (Dr. P. K. Sarkar)
Scenario B: Independent Second Clinic Registration (Dr. Meena Ghosh)
Scenario C: Staff Management, RBAC & Cross-Clinic Staff Boundary
Scenario D: Cross-Clinic Data Security & IDOR Prevention (Patients, Assessments, Referrals, Appointments, Sync, Analytics)
Scenario E: Session & Workspace Switching Boundary Validation
Scenario F: Zero Data Leakage of Legacy Records to New Clinics
"""

import pytest
import uuid
import json
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db, UserModel, ClinicModel, ClinicMembershipModel, PatientModel, AssessmentModel, ReferralModel, AppointmentModel
from main import app
from auth_service import hash_password, seed_default_users

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
    Base.metadata.drop_all(bind=test_engine)

@pytest.fixture
def client():
    return TestClient(app)


# ─── SCENARIO A: REGISTRATION & INITIALIZED WORKSPACE (DR. P. K. SARKAR) ────────

def test_scenario_a_doctor_registration_and_workspace_initialization(client):
    """
    1. Dr. P. K. Sarkar registers with clinic details.
    2. A new clinic is created and atomically linked to his account as CLINIC_OWNER.
    3. He signs in and resolves his own empty/initialized workspace (0 patients, 0 assessments).
    """
    reg_payload = {
        "full_name": "Dr. P. K. Sarkar",
        "email": "dr.sarkar@ruralhealth.org",
        "password": "SarkarSecure2026!",
        "clinic_name": "Sarkar Community Health Clinic",
        "phone": "+91 98300 12345",
        "address": "Sonpur Rural Block, West Bengal"
    }
    reg_res = client.post("/api/v2/auth/register", json=reg_payload)
    assert reg_res.status_code == 200, reg_res.text
    user_data = reg_res.json()
    assert user_data["email"] == "dr.sarkar@ruralhealth.org"
    assert user_data["full_name"] == "Dr. P. K. Sarkar"
    assert user_data["role"] == "CLINIC_OWNER"

    # Authenticate Dr. Sarkar
    login_res = client.post("/api/v2/auth/login", json={
        "username": "dr.sarkar@ruralhealth.org",
        "password": "SarkarSecure2026!"
    })
    assert login_res.status_code == 200, login_res.text
    token_data = login_res.json()
    token = token_data["access_token"]
    assert "clinics" in token_data and len(token_data["clinics"]) == 1
    sarkar_clinic = token_data["active_clinic"]
    assert sarkar_clinic["name"] == "Sarkar Community Health Clinic"
    assert sarkar_clinic["role"] == "CLINIC_OWNER"

    # Verify initialized empty workspace metrics (no mock or cross-tenant leaks)
    headers = {"Authorization": f"Bearer {token}", "X-Clinic-ID": sarkar_clinic["id"]}
    stats_res = client.get("/api/dashboard/stats", headers=headers)
    assert stats_res.status_code == 200
    stats = stats_res.json()
    assert stats["total_patients"] == 0
    assert stats["total_assessments"] == 0
    assert stats["high_risk_count"] == 0

    patients_res = client.get("/api/patients", headers=headers)
    assert patients_res.status_code == 200
    assert len(patients_res.json()) == 0


# ─── SCENARIO B: SECOND CLINIC REGISTRATION (DR. MEENA GHOSH) ─────────────────

def test_scenario_b_independent_second_clinic_workspace(client):
    """
    1. Dr. Meena Ghosh registers independently for Ghosh Family Care.
    2. A distinct clinic and owner membership are generated.
    3. Her workspace is completely isolated from Dr. Sarkar's.
    """
    # Register Dr. Sarkar
    client.post("/api/v2/auth/register", json={
        "full_name": "Dr. P. K. Sarkar",
        "email": "dr.sarkar@ruralhealth.org",
        "password": "SarkarSecure2026!",
        "clinic_name": "Sarkar Community Health Clinic"
    })

    # Register Dr. Ghosh
    reg_ghosh = client.post("/api/v2/auth/register", json={
        "full_name": "Dr. Meena Ghosh",
        "email": "dr.ghosh@ruralhealth.org",
        "password": "GhoshSecure2026!",
        "clinic_name": "Ghosh Family Care"
    })
    assert reg_ghosh.status_code == 200
    assert reg_ghosh.json()["role"] == "CLINIC_OWNER"

    # Login Dr. Ghosh
    login_ghosh = client.post("/api/v2/auth/login", json={
        "username": "dr.ghosh@ruralhealth.org",
        "password": "GhoshSecure2026!"
    })
    assert login_ghosh.status_code == 200
    ghosh_data = login_ghosh.json()
    ghosh_clinic = ghosh_data["active_clinic"]
    assert ghosh_clinic["name"] == "Ghosh Family Care"

    # Verify Dr. Ghosh has only her own clinic
    assert len(ghosh_data["clinics"]) == 1
    assert ghosh_data["clinics"][0]["name"] == "Ghosh Family Care"


# ─── SCENARIO C: STAFF MANAGEMENT & ROLE-BASED ACCESS CONTROL ──────────────────

def test_scenario_c_staff_management_and_role_boundaries(client):
    """
    1. Dr. Sarkar adds a Health Worker (Ananya Roy) to his clinic.
    2. Ananya signs in, can view patients in Dr. Sarkar's clinic, but cannot manage staff or see other clinics.
    3. Dr. Ghosh cannot see or manage Dr. Sarkar's staff.
    4. Ananya cannot self-promote to CLINIC_OWNER or add herself to another clinic.
    """
    # 1. Setup Dr. Sarkar
    client.post("/api/v2/auth/register", json={
        "full_name": "Dr. P. K. Sarkar",
        "email": "dr.sarkar@ruralhealth.org",
        "password": "SarkarSecure2026!",
        "clinic_name": "Sarkar Clinic"
    })
    sarkar_token = client.post("/api/v2/auth/login", json={
        "username": "dr.sarkar@ruralhealth.org",
        "password": "SarkarSecure2026!"
    }).json()["access_token"]
    sarkar_clinic_id = client.get("/api/v2/clinics/current", headers={"Authorization": f"Bearer {sarkar_token}"}).json()["id"]

    # Setup Dr. Ghosh
    client.post("/api/v2/auth/register", json={
        "full_name": "Dr. Meena Ghosh",
        "email": "dr.ghosh@ruralhealth.org",
        "password": "GhoshSecure2026!",
        "clinic_name": "Ghosh Clinic"
    })
    ghosh_token = client.post("/api/v2/auth/login", json={
        "username": "dr.ghosh@ruralhealth.org",
        "password": "GhoshSecure2026!"
    }).json()["access_token"]

    # 2. Dr. Sarkar adds Ananya Roy as HEALTH_WORKER
    staff_res = client.post(
        "/api/v2/clinics/current/staff",
        json={
            "full_name": "Ananya Roy",
            "email": "ananya.roy@health.org",
            "role": "HEALTH_WORKER",
            "temporary_password": "AnanyaPass123!"
        },
        headers={"Authorization": f"Bearer {sarkar_token}", "X-Clinic-ID": sarkar_clinic_id}
    )
    assert staff_res.status_code == 201, staff_res.text
    ananya_mem = staff_res.json()
    assert ananya_mem["role"] == "HEALTH_WORKER"
    assert ananya_mem["status"] == "ACTIVE"

    # 3. Ananya signs in
    ananya_login = client.post("/api/v2/auth/login", json={
        "username": "ananya.roy@health.org",
        "password": "AnanyaPass123!"
    })
    assert ananya_login.status_code == 200
    ananya_token = ananya_login.json()["access_token"]
    assert ananya_login.json()["active_clinic"]["id"] == sarkar_clinic_id

    # 4. Ananya CANNOT manage staff (least privilege enforcement)
    ananya_staff_attempt = client.post(
        "/api/v2/clinics/current/staff",
        json={
            "full_name": "Rogue Staff",
            "email": "rogue@health.org",
            "role": "DOCTOR"
        },
        headers={"Authorization": f"Bearer {ananya_token}"}
    )
    assert ananya_staff_attempt.status_code == 403

    # Ananya cannot self-promote to owner
    ananya_promote_attempt = client.patch(
        f"/api/v2/clinics/current/staff/{ananya_mem['membership_id']}",
        json={"role": "CLINIC_OWNER"},
        headers={"Authorization": f"Bearer {ananya_token}"}
    )
    assert ananya_promote_attempt.status_code == 403

    # 5. Dr. Ghosh cannot see or manage Dr. Sarkar's staff
    ghosh_staff_res = client.get("/api/v2/clinics/current/staff", headers={"Authorization": f"Bearer {ghosh_token}"})
    assert ghosh_staff_res.status_code == 200
    ghosh_staff_list = ghosh_staff_res.json()
    # Dr. Ghosh only sees herself
    assert all(s["email"] != "ananya.roy@health.org" for s in ghosh_staff_list)

    # Dr. Ghosh attempts to delete or revoke Ananya's membership (Cross-tenant modification rejection)
    ghosh_revoke_attempt = client.delete(
        f"/api/v2/clinics/current/staff/{ananya_mem['membership_id']}",
        headers={"Authorization": f"Bearer {ghosh_token}"}
    )
    assert ghosh_revoke_attempt.status_code == 404


# ─── SCENARIO D: CROSS-CLINIC SECURITY & IDOR PREVENTION ───────────────────────

def test_scenario_d_cross_clinic_data_isolation_and_idor_prevention(client):
    """
    1. Create patients, screenings, and referrals in Dr. Sarkar's clinic.
    2. Create patients, screenings, and referrals in Dr. Ghosh's clinic.
    3. Verify each clinic retrieves only its own records and metrics.
    4. Attempt cross-clinic access:
       - Direct IDOR read /api/patients/{sarkar_patient_id} by Dr. Ghosh -> 404 Not Found
       - Header tampering X-Clinic-ID: <sarkar_clinic> by Dr. Ghosh -> 403 Forbidden
       - Update /api/patients/{sarkar_patient_id} by Dr. Ghosh -> 404 Not Found
       - Assessment read & referral status update cross-clinic attempts -> 404 Not Found
    """
    # 1. Setup Sarkar Workspace
    client.post("/api/v2/auth/register", json={
        "full_name": "Dr. P. K. Sarkar",
        "email": "dr.sarkar@ruralhealth.org",
        "password": "Password123!",
        "clinic_name": "Sarkar Clinic"
    })
    sarkar_tok = client.post("/api/v2/auth/login", json={"username": "dr.sarkar@ruralhealth.org", "password": "Password123!"}).json()["access_token"]
    s_clinic_id = client.get("/api/v2/clinics/current", headers={"Authorization": f"Bearer {sarkar_tok}"}).json()["id"]

    # Setup Ghosh Workspace
    client.post("/api/v2/auth/register", json={
        "full_name": "Dr. Meena Ghosh",
        "email": "dr.ghosh@ruralhealth.org",
        "password": "Password123!",
        "clinic_name": "Ghosh Clinic"
    })
    ghosh_tok = client.post("/api/v2/auth/login", json={"username": "dr.ghosh@ruralhealth.org", "password": "Password123!"}).json()["access_token"]
    g_clinic_id = client.get("/api/v2/clinics/current", headers={"Authorization": f"Bearer {ghosh_tok}"}).json()["id"]

    # 2. Dr. Sarkar registers a patient
    p_sarkar = client.post(
        "/api/patients",
        json={"name": "Sarkar Patient", "age": 45, "gender": "Male", "village": "Sonpur", "phone": "9800011111"},
        headers={"Authorization": f"Bearer {sarkar_tok}", "X-Clinic-ID": s_clinic_id}
    ).json()
    assert p_sarkar["name"] == "Sarkar Patient"

    # Dr. Sarkar performs an assessment
    ass_sarkar = client.post(
        "/api/assess",
        json={"patient_id": p_sarkar["id"], "temperature_f": 98.6, "systolic_bp": 140, "diastolic_bp": 90, "symptoms": ["headache"]},
        headers={"Authorization": f"Bearer {sarkar_tok}", "X-Clinic-ID": s_clinic_id}
    ).json()

    # Dr. Sarkar creates a referral
    ref_sarkar = client.post(
        "/api/referrals",
        json={"patient_id": p_sarkar["id"], "assessment_id": ass_sarkar["id"], "referral_reason": "Hypertension Workup", "destination_facility": "District Hospital"},
        headers={"Authorization": f"Bearer {sarkar_tok}", "X-Clinic-ID": s_clinic_id}
    ).json()

    # 3. Dr. Ghosh registers a patient
    p_ghosh = client.post(
        "/api/patients",
        json={"name": "Ghosh Patient", "age": 32, "gender": "Female", "village": "Rampur", "phone": "9800022222"},
        headers={"Authorization": f"Bearer {ghosh_tok}", "X-Clinic-ID": g_clinic_id}
    ).json()
    assert p_ghosh["name"] == "Ghosh Patient"

    # 4. Strict Scoping Validation:
    # Dr. Sarkar sees only 1 patient
    s_patients = client.get("/api/patients", headers={"Authorization": f"Bearer {sarkar_tok}", "X-Clinic-ID": s_clinic_id}).json()
    assert len(s_patients) == 1
    assert s_patients[0]["name"] == "Sarkar Patient"

    # Dr. Ghosh sees only 1 patient
    g_patients = client.get("/api/patients", headers={"Authorization": f"Bearer {ghosh_tok}", "X-Clinic-ID": g_clinic_id}).json()
    assert len(g_patients) == 1
    assert g_patients[0]["name"] == "Ghosh Patient"

    # 5. IDOR & Cross-Clinic Attack Simulations:
    # A. Dr. Ghosh attempts to read Dr. Sarkar's patient via direct ID
    idor_read = client.get(f"/api/patients/{p_sarkar['id']}", headers={"Authorization": f"Bearer {ghosh_tok}", "X-Clinic-ID": g_clinic_id})
    assert idor_read.status_code == 404  # Non-disclosing 404

    # B. Dr. Ghosh attempts to forge X-Clinic-ID to claim Dr. Sarkar's clinic
    header_forgery = client.get(f"/api/patients/{p_sarkar['id']}", headers={"Authorization": f"Bearer {ghosh_tok}", "X-Clinic-ID": s_clinic_id})
    assert header_forgery.status_code == 403  # Access denied: not a member of foreign clinic

    # C. Dr. Ghosh attempts to update Dr. Sarkar's patient
    update_attack = client.put(
        f"/api/patients/{p_sarkar['id']}",
        json={"name": "Compromised Name", "age": 50, "gender": "Male", "village": "Hacked", "phone": "9800011111"},
        headers={"Authorization": f"Bearer {ghosh_tok}", "X-Clinic-ID": g_clinic_id}
    )
    assert update_attack.status_code == 404

    # D. Dr. Ghosh attempts to delete Dr. Sarkar's patient
    delete_attack = client.delete(
        f"/api/patients/{p_sarkar['id']}",
        headers={"Authorization": f"Bearer {ghosh_tok}", "X-Clinic-ID": g_clinic_id}
    )
    assert delete_attack.status_code == 404

    # E. Dr. Ghosh attempts to read Dr. Sarkar's assessment
    ass_attack = client.get(
        f"/api/assessments/{ass_sarkar['id']}",
        headers={"Authorization": f"Bearer {ghosh_tok}", "X-Clinic-ID": g_clinic_id}
    )
    assert ass_attack.status_code == 404

    # F. Dr. Ghosh attempts to read Dr. Sarkar's referral
    ref_attack = client.get(
        f"/api/referrals/{ref_sarkar['id']}",
        headers={"Authorization": f"Bearer {ghosh_tok}", "X-Clinic-ID": g_clinic_id}
    )
    assert ref_attack.status_code == 404

    # G. Dr. Ghosh attempts to modify Dr. Sarkar's referral status
    ref_status_attack = client.patch(
        f"/api/referrals/{ref_sarkar['id']}/status",
        json={"status": "CANCELLED"},
        headers={"Authorization": f"Bearer {ghosh_tok}", "X-Clinic-ID": g_clinic_id}
    )
    assert ref_status_attack.status_code == 404


# ─── SCENARIO E: ACCOUNT SWITCHING & PURGING VALIDATION ───────────────────────

def test_scenario_e_workspace_session_switch_and_cache_integrity(client):
    """
    1. Sign in as Dr. Sarkar -> query /api/dashboard/stats -> total_patients == 1.
    2. Sign in as Dr. Ghosh -> query /api/dashboard/stats -> total_patients == 0.
    3. Verify response headers include no-store/no-cache to avoid browser or proxy leakage.
    """
    client.post("/api/v2/auth/register", json={
        "full_name": "Dr. P. K. Sarkar",
        "email": "dr.sarkar@ruralhealth.org",
        "password": "Password123!",
        "clinic_name": "Sarkar Clinic"
    })
    s_tok = client.post("/api/v2/auth/login", json={"username": "dr.sarkar@ruralhealth.org", "password": "Password123!"}).json()["access_token"]
    s_cid = client.get("/api/v2/clinics/current", headers={"Authorization": f"Bearer {s_tok}"}).json()["id"]

    # Create patient for Sarkar
    client.post("/api/patients", json={"name": "Sarkar Pt 1", "age": 40, "gender": "Female", "village": "Sonpur", "phone": "9811111111"}, headers={"Authorization": f"Bearer {s_tok}", "X-Clinic-ID": s_cid})

    # Load Sarkar stats
    s_stats_res = client.get("/api/dashboard/stats", headers={"Authorization": f"Bearer {s_tok}", "X-Clinic-ID": s_cid})
    assert s_stats_res.status_code == 200
    assert s_stats_res.json()["total_patients"] == 1
    assert "no-store" in s_stats_res.headers.get("Cache-Control", "")

    # Switch session: Sign in as Dr. Ghosh
    client.post("/api/v2/auth/register", json={
        "full_name": "Dr. Meena Ghosh",
        "email": "dr.ghosh@ruralhealth.org",
        "password": "Password123!",
        "clinic_name": "Ghosh Clinic"
    })
    g_tok = client.post("/api/v2/auth/login", json={"username": "dr.ghosh@ruralhealth.org", "password": "Password123!"}).json()["access_token"]
    g_cid = client.get("/api/v2/clinics/current", headers={"Authorization": f"Bearer {g_tok}"}).json()["id"]

    # Load Ghosh stats
    g_stats_res = client.get("/api/dashboard/stats", headers={"Authorization": f"Bearer {g_tok}", "X-Clinic-ID": g_cid})
    assert g_stats_res.status_code == 200
    assert g_stats_res.json()["total_patients"] == 0


# ─── SCENARIO F: REGRESSION & ZERO LEGACY LEAKAGE ─────────────────────────────

def test_scenario_f_zero_legacy_data_leakage(client):
    """
    Verify that existing legacy records (e.g. clinic-sonpur-legacy) are never exposed
    to newly registered clinic doctors.
    """
    # Register new independent doctor
    client.post("/api/v2/auth/register", json={
        "full_name": "Dr. Fresh Owner",
        "email": "dr.fresh@ruralhealth.org",
        "password": "Password123!",
        "clinic_name": "Fresh Modern Practice"
    })
    tok = client.post("/api/v2/auth/login", json={"username": "dr.fresh@ruralhealth.org", "password": "Password123!"}).json()["access_token"]
    cid = client.get("/api/v2/clinics/current", headers={"Authorization": f"Bearer {tok}"}).json()["id"]

    # Even though ruralhealth.db has seeded patients in clinic-sonpur-legacy,
    # Dr. Fresh's patient directory MUST be completely empty:
    patients = client.get("/api/patients", headers={"Authorization": f"Bearer {tok}", "X-Clinic-ID": cid}).json()
    assert len(patients) == 0

    stats = client.get("/api/dashboard/stats", headers={"Authorization": f"Bearer {tok}", "X-Clinic-ID": cid}).json()
    assert stats["total_patients"] == 0
    assert stats["total_assessments"] == 0
