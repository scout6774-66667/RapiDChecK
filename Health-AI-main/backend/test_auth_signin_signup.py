"""
test_auth_signin_signup.py — Comprehensive tests for Sign In and Get Started flows
===================================================================================
Tests cover:
1. Login with email address (case-insensitive) and username
2. Login credential validation & failure states
3. Public self-registration (Get Started) with default ASHA_WORKER role
4. Prevention of privileged role assignment (SYSTEM_ADMIN, PHC_DOCTOR, etc.) during public registration
5. Duplicate email handling (409 Conflict)
6. Password complexity & email format validation (400 Bad Request)
7. End-to-end registration followed by immediate sign in
8. Role-based restrictions for admin-assisted vs public registration
"""

import pytest
import uuid
import json
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db, UserModel
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
    Base.metadata.drop_all(bind=test_engine)

@pytest.fixture
def client():
    return TestClient(app)

def make_token(user_id: str, username: str, role: str, facility_id: str = "PHC_MAIN") -> str:
    return create_access_token({
        "sub": user_id,
        "username": username,
        "role": role,
        "full_name": f"Test {username}",
        "facility_id": facility_id
    })


# ─── 1. SIGN IN WITH EMAIL & USERNAME TESTS ───────────────────────────────────

def test_login_with_email_success(client):
    """Verify that user can sign in using their registered email address."""
    res = client.post("/api/v2/auth/login", json={
        "username": "dr.sharma@phc.in",
        "password": "doctor123"
    })
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["user"]["email"] == "dr.sharma@phc.in"
    assert data["user"]["role"] == "PHC_DOCTOR"


def test_login_with_email_case_insensitive(client):
    """Verify that email login is case-insensitive."""
    res = client.post("/api/v2/auth/login", json={
        "username": "DR.SHARMA@PHC.IN",
        "password": "doctor123"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["user"]["username"] == "dr.sharma"


def test_login_with_username_success(client):
    """Verify that traditional username sign-in continues to work seamlessly."""
    res = client.post("/api/v2/auth/login", json={
        "username": "asha.anita",
        "password": "asha123"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["user"]["email"] == "anita.roy@health.gov.in"
    assert data["user"]["role"] == "ASHA_WORKER"


def test_login_invalid_password_returns_401(client):
    """Verify that incorrect password returns 401 Unauthorized without disclosing account existence."""
    res = client.post("/api/v2/auth/login", json={
        "username": "dr.sharma@phc.in",
        "password": "WrongPassword123!"
    })
    assert res.status_code == 401
    assert "Invalid" in res.json()["detail"]


def test_login_nonexistent_user_returns_401(client):
    """Verify that non-existent email/username returns 401 Unauthorized."""
    res = client.post("/api/v2/auth/login", json={
        "username": "unknown.person@example.com",
        "password": "AnyPassword123!"
    })
    assert res.status_code == 401
    assert "Invalid" in res.json()["detail"]


# ─── 2. GET STARTED / PUBLIC REGISTRATION TESTS ───────────────────────────────

def test_public_registration_success(client):
    """Verify public Get Started registration creates an account with default ASHA_WORKER role."""
    res = client.post("/api/v2/auth/register", json={
        "full_name": "Priya Mondal",
        "email": "priya.mondal@health.org",
        "password": "PriyaStrongPass@2026"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["email"] == "priya.mondal@health.org"
    assert data["full_name"] == "Priya Mondal"
    assert data["role"] == "ASHA_WORKER"  # Enforces default public role
    assert data["is_active"] == 1
    assert "id" in data


def test_public_registration_cannot_grant_privileged_roles(client):
    """Public registrations MUST NOT be able to self-assign ADMIN or DOCTOR roles."""
    # Attempting to assign SYSTEM_ADMIN
    res_admin = client.post("/api/v2/auth/register", json={
        "full_name": "Rogue Admin",
        "email": "rogue.admin@example.com",
        "password": "RoguePassword123!",
        "role": "SYSTEM_ADMIN"
    })
    assert res_admin.status_code == 403
    assert "Public registration cannot assign privileged roles" in res_admin.json()["detail"]

    # Attempting to assign PHC_DOCTOR
    res_doc = client.post("/api/v2/auth/register", json={
        "full_name": "Fake Doctor",
        "email": "fake.doctor@example.com",
        "password": "DoctorPassword123!",
        "role": "PHC_DOCTOR"
    })
    assert res_doc.status_code == 403
    assert "Public registration cannot assign privileged roles" in res_doc.json()["detail"]


def test_public_registration_duplicate_email_returns_409(client):
    """Registering an email that already exists must return 409 Conflict."""
    res = client.post("/api/v2/auth/register", json={
        "full_name": "Duplicate Anita",
        "email": "anita.roy@health.gov.in",  # seeded email
        "password": "NewPassword123!"
    })
    assert res.status_code == 409
    assert "already registered" in res.json()["detail"].lower()


def test_public_registration_short_password_rejected(client):
    """Password with less than 8 characters must be rejected with 400 Bad Request."""
    res = client.post("/api/v2/auth/register", json={
        "full_name": "Short Pass User",
        "email": "shortpass@health.org",
        "password": "short"
    })
    assert res.status_code == 400
    assert "8 characters" in res.json()["detail"]


def test_public_registration_invalid_email_rejected(client):
    """Malformed email must be rejected with 400 Bad Request."""
    res = client.post("/api/v2/auth/register", json={
        "full_name": "Bad Email User",
        "email": "not-an-email",
        "password": "ValidPassword123!"
    })
    assert res.status_code == 400
    assert "email" in res.json()["detail"].lower()


def test_public_registration_short_name_rejected(client):
    """Full name with less than 2 characters must be rejected with 400 Bad Request."""
    res = client.post("/api/v2/auth/register", json={
        "full_name": "A",
        "email": "valid.user@health.org",
        "password": "ValidPassword123!"
    })
    assert res.status_code == 400
    assert "Full name" in res.json()["detail"]


def test_registered_user_can_immediately_sign_in(client):
    """End-to-end test: register a new user, then sign in with their credentials."""
    email = "new.worker@bengal.gov.in"
    password = "SecureWorkerPass2026!"
    name = "Kavita Sen"

    # 1. Register
    reg_res = client.post("/api/v2/auth/register", json={
        "full_name": name,
        "email": email,
        "password": password
    })
    assert reg_res.status_code == 200

    # 2. Sign in with email
    login_res = client.post("/api/v2/auth/login", json={
        "username": email,
        "password": password
    })
    assert login_res.status_code == 200
    token_data = login_res.json()
    assert token_data["user"]["email"] == email
    assert token_data["user"]["full_name"] == name
    assert token_data["user"]["role"] == "ASHA_WORKER"

    # 3. Access authenticated /api/v2/auth/me
    token = token_data["access_token"]
    me_res = client.get("/api/v2/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200
    assert me_res.json()["user"]["email"] == email


# ─── 3. ADMIN VS NON-ADMIN REGISTRATION ROLES ─────────────────────────────────

def test_doctor_cannot_administer_registration(client):
    """Doctor with Bearer token cannot use registration endpoint to create roles."""
    token = make_token("usr_dr_sharma", "dr.sharma", "PHC_DOCTOR")
    res = client.post("/api/v2/auth/register", json={
        "full_name": "Dr. Another",
        "email": "another.doc@phc.org",
        "password": "DocPassword123!",
        "role": "PHC_DOCTOR"
    }, headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403


def test_admin_can_register_doctor_with_token(client):
    """System Admin with Bearer token can provision doctor accounts."""
    admin_token = make_token("usr_admin", "admin", "SYSTEM_ADMIN")
    res = client.post("/api/v2/auth/register", json={
        "username": "dr.kulkarni",
        "full_name": "Dr. S. Kulkarni, MD",
        "email": "dr.kulkarni@phc.org",
        "password": "AdminSetPassword123!",
        "role": "PHC_DOCTOR",
        "license_number": "MCI-2022-77112",
        "facility_id": "PHC_NORTH"
    }, headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200
    data = res.json()
    assert data["role"] == "PHC_DOCTOR"
    assert data["license_number"] == "MCI-2022-77112"


def test_patient_self_registration_and_login(client):
    """Verify that a general user can self-register with role PATIENT and log in successfully."""
    reg_res = client.post("/api/v2/auth/register", json={
        "full_name": "Sunil Das",
        "email": "sunil.das@citizen.in",
        "password": "CitizenPassword123!",
        "role": "PATIENT"
    })
    assert reg_res.status_code == 200
    data = reg_res.json()
    assert data["role"] == "PATIENT"
    assert data["full_name"] == "Sunil Das"
    assert data["email"] == "sunil.das@citizen.in"

    # Now verify login works
    login_res = client.post("/api/v2/auth/login", json={
        "username": "sunil.das@citizen.in",
        "password": "CitizenPassword123!"
    })
    assert login_res.status_code == 200
    login_data = login_res.json()
    assert login_data["user"]["role"] == "PATIENT"
    assert "access_token" in login_data
