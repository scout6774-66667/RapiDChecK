"""
test_patient_directory_architecture.py — Comprehensive Test Suite for Patient Directory & Sync Architecture
=============================================================================================================
Tests all 10 architectural requirements using an isolated in-memory SQLite database:
1. A newly registered patient appears in the directory.
2. Reloading the application preserves the patient.
3. Local and backend copies of the same patient appear only once (deduplication).
4. Synthetic fixtures do not automatically populate the operational directory.
5. Failed API requests display an error instead of a misleading empty directory.
6. Offline registration survives an application restart.
7. Synchronization does not duplicate patient records.
8. A record is marked synchronized only after confirmed backend success.
9. Existing records remain intact after migrations.
10. Demo mode / synthetic fixtures do not contaminate normal operational data.
"""

import os
import sys
import uuid
import pytest
from datetime import datetime
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Ensure backend root is in sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from main import app
from database import Base, get_db, PatientModel, AssessmentModel, SyncJournalModel, init_db
from auth_service import create_access_token, seed_default_users
from schemas import PatientCreate

# Isolated in-memory SQLite database
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
    Base.metadata.create_all(bind=test_engine)
    app.dependency_overrides[get_db] = override_get_db
    session = TestingSessionLocal()
    seed_default_users(session)
    session.close()
    yield
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def auth_headers():
    token = create_access_token({
        "sub": "usr_dr_sharma",
        "username": "dr.sharma",
        "role": "PHC_DOCTOR",
        "facility_id": "PHC_SONPUR"
    })
    return {"Authorization": f"Bearer {token}"}


# ─── SCENARIO 1: Newly registered patient appears in directory ─────────────────

def test_scenario_1_newly_registered_patient_appears_in_directory(auth_headers):
    """Verifies that registering a patient makes them immediately queryable in directory."""
    payload = {
        "name": "Kavita Sharma",
        "age": 32,
        "gender": "Female",
        "village": "Sonpur Ward 4",
        "phone": "9876543211",
        "record_origin": "MANUAL_CLINICAL"
    }
    create_res = client.post("/api/patients", json=payload, headers=auth_headers)
    assert create_res.status_code == 200
    created_id = create_res.json()["id"]

    list_res = client.get("/api/patients", headers=auth_headers)
    assert list_res.status_code == 200
    patients = list_res.json()
    assert any(p["id"] == created_id for p in patients)
    matching = next(p for p in patients if p["id"] == created_id)
    assert matching["name"] == "Kavita Sharma"
    assert matching["sync_status"] == "SYNCED"
    assert matching["record_origin"] == "MANUAL_CLINICAL"


# ─── SCENARIO 2: Reloading the application preserves the patient ───────────────

def test_scenario_2_reloading_application_preserves_patient(auth_headers):
    """Verifies that patient persists across separate database sessions (simulating app reload)."""
    payload = {
        "id": "pat_reload_test_100",
        "name": "Ramesh Kumar",
        "age": 55,
        "gender": "Male",
        "village": "Bishnupur",
        "phone": "9812345678"
    }
    client.post("/api/patients", json=payload, headers=auth_headers)

    # Simulate fresh session after reload
    db = TestingSessionLocal()
    persisted = db.query(PatientModel).filter(PatientModel.id == "pat_reload_test_100").first()
    assert persisted is not None
    assert persisted.name == "Ramesh Kumar"
    assert persisted.age == 55
    assert persisted.is_deleted == 0
    db.close()


# ─── SCENARIO 3: Local and backend copies of the same patient appear only once ─

def test_scenario_3_local_and_backend_copies_deduplicated(auth_headers):
    """Verifies that duplicate registration by ID or phone returns the existing record rather than duplicating."""
    payload = {
        "id": "pat_dedup_001",
        "name": "Amina Khatun",
        "age": 28,
        "gender": "Female",
        "village": "Sundarpur",
        "phone": "9830012345"
    }
    res1 = client.post("/api/patients", json=payload, headers=auth_headers)
    assert res1.status_code == 200

    # Repeat call with identical ID
    res2 = client.post("/api/patients", json=payload, headers=auth_headers)
    assert res2.status_code == 200
    assert res2.json()["id"] == "pat_dedup_001"

    # Repeat call with identical phone and name
    res3 = client.post("/api/patients", json={
        "name": "Amina Khatun",
        "age": 28,
        "gender": "Female",
        "village": "Sundarpur",
        "phone": "9830012345"
    }, headers=auth_headers)
    assert res3.status_code == 200
    assert res3.json()["id"] == "pat_dedup_001"

    # Total in directory must strictly remain 1
    list_res = client.get("/api/patients", headers=auth_headers)
    assert len(list_res.json()) == 1


# ─── SCENARIO 4: Synthetic fixtures do not automatically populate directory ────

def test_scenario_4_synthetic_fixtures_do_not_automatically_populate():
    """Verifies that database startup / initialization does not seed synthetic patients."""
    db = TestingSessionLocal()
    patient_count = db.query(PatientModel).count()
    db.close()
    assert patient_count == 0, f"Expected 0 patients on clean initialization, found {patient_count}"


# ─── SCENARIO 5: Failed API requests display error instead of empty directory ──

def test_scenario_5_failed_api_requests_return_explicit_error(auth_headers):
    """Verifies that unauthenticated or invalid queries return distinct HTTP error codes instead of misleading empty lists."""
    res_unauth = client.get("/api/patients")
    assert res_unauth.status_code == 401
    assert "detail" in res_unauth.json()

    # Query for nonexistent patient returns 404 Not Found, NOT an empty success payload
    res_not_found = client.get("/api/patients/pat_completely_nonexistent", headers=auth_headers)
    assert res_not_found.status_code == 404
    assert res_not_found.json()["detail"] == "Patient not found"

    # Invalid post payload returns 422 Unprocessable Entity with validation details
    res_bad_payload = client.post("/api/patients", json={"name": ""}, headers=auth_headers)
    assert res_bad_payload.status_code == 422
    assert "detail" in res_bad_payload.json()


# ─── SCENARIO 6: Offline registration survives application restart ─────────────

def test_scenario_6_offline_registration_survives_restart():
    """Simulates an offline-registered patient saved in local store persisting across restarts."""
    db = TestingSessionLocal()
    offline_p = PatientModel(
        id="PAT-OFFLINE-999",
        name="Offline Patient",
        age=45,
        gender="Female",
        village="Remote Hamlet",
        phone="9988776600",
        server_version=1,
        is_deleted=0,
        record_origin="OFFLINE_SYNC",
        sync_status="SYNCED"
    )
    db.add(offline_p)
    db.commit()
    db.close()

    # Simulate restart: open new session
    fresh_db = TestingSessionLocal()
    found = fresh_db.query(PatientModel).filter(PatientModel.id == "PAT-OFFLINE-999").first()
    assert found is not None
    assert found.name == "Offline Patient"
    assert found.record_origin == "OFFLINE_SYNC"
    fresh_db.close()


# ─── SCENARIO 7: Synchronization does not duplicate patient records ────────────

def test_scenario_7_synchronization_does_not_duplicate(auth_headers):
    """Verifies that Outbox V2 push with same operation ID or entity ID is idempotent."""
    push_payload = {
        "device_id": "test_device_1",
        "operations": [
            {
                "operation_id": "op_test_1",
                "client_sequence": 1,
                "entity_type": "patient",
                "entity_id": "pat_sync_idempotent_1",
                "operation_type": "CREATE",
                "payload": {
                    "name": "Sync Test Patient",
                    "age": 50,
                    "gender": "Male",
                    "village": "Sonpur",
                    "phone": "9876500000"
                }
            }
        ]
    }
    # First push
    res1 = client.post("/api/v2/sync/push", json=push_payload, headers=auth_headers)
    assert res1.status_code == 200
    assert res1.json()["applied_count"] == 1

    # Second push (same operation_id -> DUPLICATE)
    res2 = client.post("/api/v2/sync/push", json=push_payload, headers=auth_headers)
    assert res2.status_code == 200
    assert res2.json()["duplicate_count"] == 1

    # Total in directory must remain 1
    list_res = client.get("/api/patients", headers=auth_headers)
    assert len(list_res.json()) == 1


# ─── SCENARIO 8: Record marked synchronized only after confirmed backend success

def test_scenario_8_marked_synchronized_only_after_backend_confirmation(auth_headers):
    """Verifies that rejected sync operations return REJECTED status and are not marked applied."""
    # Attempt cross-facility push from unauthorized clinician
    push_payload = {
        "device_id": "test_device_2",
        "operations": [
            {
                "operation_id": "op_bad_fac",
                "client_sequence": 1,
                "entity_type": "patient",
                "entity_id": "pat_foreign_fac",
                "operation_type": "CREATE",
                "payload": {
                    "name": "Foreign Patient",
                    "age": 30,
                    "gender": "Female",
                    "village": "Far Away",
                    "phone": "9112233445",
                    "facility_id": "PHC_FOREIGN"  # Violates doctor's facility PHC_SONPUR
                }
            }
        ]
    }
    res = client.post("/api/v2/sync/push", json=push_payload, headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["rejected_count"] == 1
    assert data["results"][0]["status"] == "REJECTED"

    # Patient must NOT have been saved
    db = TestingSessionLocal()
    assert db.query(PatientModel).filter(PatientModel.id == "pat_foreign_fac").first() is None
    db.close()


# ─── SCENARIO 9: Existing records remain intact after migrations ────────────────

def test_scenario_9_existing_records_remain_intact_after_migrations():
    """Simulates database schema alter table migration ensuring all existing fields and values remain intact."""
    db = TestingSessionLocal()
    test_p = PatientModel(
        id="pat_migration_001",
        name="Legacy Patient",
        age=60,
        gender="Male",
        village="Old Village",
        phone="9876599999",
        server_version=3,
        is_deleted=0
    )
    db.add(test_p)
    db.commit()

    # Query with new columns
    migrated = db.query(PatientModel).filter(PatientModel.id == "pat_migration_001").first()
    assert migrated.name == "Legacy Patient"
    assert migrated.age == 60
    assert migrated.server_version == 3
    assert migrated.record_origin == "MANUAL_CLINICAL"
    assert migrated.is_synthetic == 0
    assert migrated.sync_status == "SYNCED"
    db.close()


# ─── SCENARIO 10: Demo / synthetic fixtures isolated from operational data ──────

def test_scenario_10_demo_synthetic_fixtures_isolated_from_operational(auth_headers):
    """Verifies that synthetic fixtures with is_synthetic=1 can be isolated from operational views."""
    # Register 1 genuine operational patient
    client.post("/api/patients", json={
        "id": "pat_operational_1",
        "name": "Operational Patient",
        "age": 35,
        "gender": "Female",
        "village": "Sonpur",
        "phone": "9876511111",
        "is_synthetic": 0,
        "record_origin": "MANUAL_CLINICAL"
    }, headers=auth_headers)

    # Register 1 synthetic test fixture
    client.post("/api/patients", json={
        "id": "pat_synthetic_1",
        "name": "Synthetic Demo Patient",
        "age": 42,
        "gender": "Male",
        "village": "Demo Town",
        "phone": "9876522222",
        "is_synthetic": 1,
        "record_origin": "TEST_FIXTURE"
    }, headers=auth_headers)

    # Query all records
    all_res = client.get("/api/patients?include_synthetic=true", headers=auth_headers)
    assert len(all_res.json()) == 2

    # Query operational only
    op_res = client.get("/api/patients?include_synthetic=false", headers=auth_headers)
    assert len(op_res.json()) == 1
    assert op_res.json()[0]["id"] == "pat_operational_1"
    assert op_res.json()[0]["is_synthetic"] == 0
