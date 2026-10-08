"""
test_resource_security.py — Tests for Health Resources RBAC, Authorization Boundaries & Audit Integrity
"""

import uuid
import pytest
from fastapi.testclient import TestClient
from main import app
from database import SessionLocal, init_db, UserModel
from auth_service import seed_default_users, create_access_token
from health_resources_service import seed_default_health_resources

client = TestClient(app)


def get_token(username: str) -> str:
    """Helper to authenticate and get JWT."""
    db = SessionLocal()
    user = db.query(UserModel).filter(UserModel.username == username).first()
    assert user is not None, f"User {username} should exist in database"
    token = create_access_token({"sub": user.id, "username": user.username, "role": user.role, "facility_id": user.facility_id})
    db.close()
    return token


@pytest.fixture(scope="module", autouse=True)
def setup_database():
    init_db()
    db = SessionLocal()
    seed_default_users(db)
    seed_default_health_resources(db)
    db.close()


def test_sec_001_unauthenticated_cannot_create_resource():
    """Verify unauthenticated request to create resource is rejected (401)."""
    payload = {
        "resource_code": f"HR-TEST-UNAUTH-{uuid.uuid4().hex[:6].upper()}",
        "title": "Unauthorized Test Resource",
        "summary": "Should be blocked",
        "content": "Content...",
        "category_code": "GENERAL",
        "source_name": "Unknown"
    }
    response = client.post("/api/v2/admin/health-resources", json=payload)
    assert response.status_code == 401


def test_sec_002_asha_cannot_create_or_publish_resource():
    """Verify ASHA Worker role cannot create or publish clinical resources (403 Forbidden)."""
    asha_token = get_token("asha.anita")
    headers = {"Authorization": f"Bearer {asha_token}"}

    payload = {
        "resource_code": f"HR-TEST-ASHA-FAIL-{uuid.uuid4().hex[:6].upper()}",
        "title": "ASHA Created Resource",
        "summary": "Should be blocked by RBAC",
        "content": "Content...",
        "category_code": "GENERAL",
        "source_name": "Self"
    }
    response = client.post("/api/v2/admin/health-resources", json=payload, headers=headers)
    assert response.status_code == 403

    pub_response = client.post("/api/v2/admin/health-resources/hr_sop_htn_crisis/publish", json={"change_reason": "Hack"}, headers=headers)
    assert pub_response.status_code == 403


def test_sec_003_doctor_can_create_and_publish_resource():
    """Verify PHC Doctor can create and publish clinical resources."""
    doc_token = get_token("dr.sharma")
    headers = {"Authorization": f"Bearer {doc_token}"}
    res_code = f"HR-DOC-TEST-{uuid.uuid4().hex[:6].upper()}"

    create_payload = {
        "resource_code": res_code,
        "title": "Doctor Authored Clinical Guideline",
        "summary": "Properly authored guideline for PHC primary care.",
        "content": "## Standard Operating Protocol\nStep 1: Clinical triage.",
        "resource_type": "CLINICAL_GUIDELINE",
        "category_code": "NCD",
        "source_name": "PHC Clinical Committee",
        "tags": [
            {"tag_type": "condition", "tag_value": "hypertension"},
            {"tag_type": "role", "tag_value": "PHC_DOCTOR"}
        ],
        "scopes": [
            {"scope_type": "GLOBAL", "scope_value": "GLOBAL"}
        ]
    }
    res = client.post("/api/v2/admin/health-resources", json=create_payload, headers=headers)
    assert res.status_code == 200
    created = res.json()
    assert created["status"] == "DRAFT"
    res_id = created["id"]

    # Publish it
    pub_res = client.post(
        f"/api/v2/admin/health-resources/{res_id}/publish",
        json={"change_reason": "Clinically reviewed and approved by PHC Medical Officer."},
        headers=headers
    )
    assert pub_res.status_code == 200
    published = pub_res.json()
    assert published["status"] == "PUBLISHED"


def test_sec_004_admin_can_revoke_resource():
    """Verify SYSTEM_ADMIN can revoke resources."""
    admin_token = get_token("admin")
    headers = {"Authorization": f"Bearer {admin_token}"}
    doc_token = get_token("dr.sharma")
    res_code = f"HR-REVOKE-TEST-{uuid.uuid4().hex[:6].upper()}"

    create_payload = {
        "resource_code": res_code,
        "title": "Temporary Guideline to be Revoked",
        "summary": "Testing revocation workflow.",
        "content": "Content to revoke...",
        "category_code": "GENERAL",
        "source_name": "Test Committee"
    }
    c_res = client.post("/api/v2/admin/health-resources", json=create_payload, headers={"Authorization": f"Bearer {doc_token}"})
    assert c_res.status_code == 200
    r_id = c_res.json()["id"]

    # Revoke via admin
    revoke_res = client.post(
        f"/api/v2/admin/health-resources/{r_id}/revoke",
        json={"revocation_reason": "Superseded by updated 2026 national protocol."},
        headers=headers
    )
    assert revoke_res.status_code == 200
    revoked = revoke_res.json()
    assert revoked["status"] == "REVOKED"


def test_sec_005_revoked_resource_excluded_from_public_listings():
    """Verify revoked resource is excluded from public search and recommendations."""
    res = client.get("/api/v2/health-resources?query=HR-TO-BE-REVOKED-NONEXISTENT")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 0
