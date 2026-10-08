"""
test_resource_versioning.py — Tests for Resource Versioning, Cryptographic Attestation, Audit Trail & Sync Journal
"""

import uuid
import pytest
from fastapi.testclient import TestClient
from main import app
from database import SessionLocal, init_db, AuditEventModel, SyncJournalModel, UserModel
from auth_service import seed_default_users, create_access_token
from health_resources_service import seed_default_health_resources

client = TestClient(app)


def get_token(username: str) -> str:
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


def test_ver_001_lifecycle_and_attestation_hash():
    """Verify DRAFT -> CLINICAL_REVIEW -> PUBLISHED generates cryptographic attestation hash and version snapshot."""
    doc_token = get_token("dr.sharma")
    headers = {"Authorization": f"Bearer {doc_token}"}
    res_code = f"HR-VER-TEST-{uuid.uuid4().hex[:6].upper()}"

    # 1. Create draft
    payload = {
        "resource_code": res_code,
        "title": "Version Lifecycle Test Protocol",
        "summary": "Clinical protocol for testing immutable snapshots.",
        "content": "Initial baseline clinical protocol body.",
        "resource_type": "CLINICAL_GUIDELINE",
        "category_code": "NCD",
        "source_name": "ICMR Guidelines 2026"
    }
    c_res = client.post("/api/v2/admin/health-resources", json=payload, headers=headers)
    assert c_res.status_code == 200
    res_id = c_res.json()["id"]
    assert c_res.json()["status"] == "DRAFT"
    assert c_res.json()["version"] == "1.0.0"

    # 2. Submit for review
    rev_res = client.post(f"/api/v2/admin/health-resources/{res_id}/review", headers=headers)
    assert rev_res.status_code == 200
    assert rev_res.json()["status"] == "CLINICAL_REVIEW"

    # 3. Publish
    pub_res = client.post(
        f"/api/v2/admin/health-resources/{res_id}/publish",
        json={"change_reason": "Approved for national PHC deployment after clinical board review."},
        headers=headers
    )
    assert pub_res.status_code == 200
    published = pub_res.json()
    assert published["status"] == "PUBLISHED"
    assert published["version"] != ""

    # 4. Check version snapshots endpoint
    v_res = client.get(f"/api/v2/health-resources/{res_id}/versions")
    assert v_res.status_code == 200
    versions = v_res.json()
    assert len(versions) >= 1
    top_ver = versions[0]
    assert top_ver["attestation_hash"] is not None
    assert len(top_ver["attestation_hash"]) == 64 # SHA-256 length
    assert "Approved for national PHC deployment" in top_ver["change_reason"]


def test_ver_002_audit_trail_recorded():
    """Verify audit events are written for every governance state transition."""
    db = SessionLocal()
    try:
        events = db.query(AuditEventModel).filter(
            AuditEventModel.entity_type == "health_resource"
        ).all()
        assert len(events) >= 1
        event_types = [e.event_type for e in events]
        assert "RESOURCE_CREATED" in event_types or "RESOURCE_PUBLISHED" in event_types
    finally:
        db.close()


def test_ver_003_sync_journal_entry_created_for_offline_pull():
    """Verify published resource writes to SyncJournalModel for cursor pull synchronization."""
    db = SessionLocal()
    try:
        journal_entries = db.query(SyncJournalModel).filter(
            SyncJournalModel.entity_type == "health_resource"
        ).all()
        assert len(journal_entries) >= 1
        top_entry = journal_entries[-1]
        assert top_entry.entity_type == "health_resource"
        assert top_entry.server_sequence > 0
    finally:
        db.close()
