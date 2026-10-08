import pytest
import uuid
from datetime import datetime
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db, PatientModel, AssessmentModel, AppointmentModel, SyncJournalModel, IdempotencyModel
from main import app
from schemas import SyncPushRequest, SyncOperation, SyncPullRequest

# Setup test DB with StaticPool so all threads share the in-memory SQLite instance
TEST_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    TEST_DATABASE_URL,
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
    yield
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=engine)

@pytest.fixture
def client():
    return TestClient(app)


def test_push_patient_create_and_idempotency(client):
    op_id = str(uuid.uuid4())
    patient_id = str(uuid.uuid4())
    device_id = "device_test_01"

    payload = {
        "device_id": device_id,
        "operations": [
            {
                "operation_id": op_id,
                "client_sequence": 1,
                "entity_type": "patient",
                "entity_id": patient_id,
                "operation_type": "CREATE",
                "base_server_version": None,
                "client_timestamp": datetime.utcnow().isoformat(),
                "payload": {
                    "id": patient_id,
                    "name": "Ramesh Kumar",
                    "age": 45,
                    "gender": "Male",
                    "village": "Sonapur",
                    "phone": "9876543210"
                }
            }
        ]
    }

    # 1. First push should apply successfully
    res = client.post("/api/v2/sync/push", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["applied_count"] == 1
    assert data["duplicate_count"] == 0
    assert data["conflict_count"] == 0
    assert data["rejected_count"] == 0
    assert len(data["results"]) == 1
    
    res0 = data["results"][0]
    assert res0["operation_id"] == op_id
    assert res0["status"] == "APPLIED"
    assert res0["server_version"] == 1
    assert res0["server_sequence"] == 1

    # Verify in DB
    db = TestingSessionLocal()
    p = db.query(PatientModel).filter(PatientModel.id == patient_id).first()
    assert p is not None
    assert p.name == "Ramesh Kumar"
    assert p.server_version == 1
    assert p.is_deleted == 0

    journal = db.query(SyncJournalModel).all()
    assert len(journal) == 1
    assert journal[0].entity_id == patient_id
    assert journal[0].operation_type == "CREATE"
    assert journal[0].server_sequence == 1
    db.close()

    # 2. Re-sending identical operation_id should return DUPLICATE without creating duplicates
    res2 = client.post("/api/v2/sync/push", json=payload)
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["applied_count"] == 0
    assert data2["duplicate_count"] == 1
    res2_0 = data2["results"][0]
    assert res2_0["operation_id"] == op_id
    assert res2_0["status"] == "DUPLICATE"
    assert res2_0["server_version"] == 1

    # Verify DB still only has 1 record
    db = TestingSessionLocal()
    assert db.query(PatientModel).count() == 1
    assert db.query(SyncJournalModel).count() == 1
    db.close()


def test_push_occ_conflict_detection(client):
    patient_id = str(uuid.uuid4())
    device_a = "device_a"
    device_b = "device_b"

    # Step 1: Device A creates patient (server_version = 1)
    res1 = client.post("/api/v2/sync/push", json={
        "device_id": device_a,
        "operations": [{
            "operation_id": str(uuid.uuid4()),
            "client_sequence": 1,
            "entity_type": "patient",
            "entity_id": patient_id,
            "operation_type": "CREATE",
            "base_server_version": None,
            "client_timestamp": datetime.utcnow().isoformat(),
            "payload": {
                "id": patient_id,
                "name": "Initial Name",
                "age": 30,
                "gender": "Female",
                "village": "Rampur",
                "phone": "9000000001"
            }
        }]
    })
    assert res1.status_code == 200
    assert res1.json()["applied_count"] == 1

    # Step 2: Device A updates patient (server_version becomes 2)
    res2 = client.post("/api/v2/sync/push", json={
        "device_id": device_a,
        "operations": [{
            "operation_id": str(uuid.uuid4()),
            "client_sequence": 2,
            "entity_type": "patient",
            "entity_id": patient_id,
            "operation_type": "UPDATE",
            "base_server_version": 1,
            "client_timestamp": datetime.utcnow().isoformat(),
            "payload": {
                "name": "Updated by Device A",
                "age": 31
            }
        }]
    })
    assert res2.status_code == 200
    assert res2.json()["applied_count"] == 1
    assert res2.json()["results"][0]["server_version"] == 2

    # Step 3: Device B tries to update based on stale version 1 -> CONFLICT
    res3 = client.post("/api/v2/sync/push", json={
        "device_id": device_b,
        "operations": [{
            "operation_id": str(uuid.uuid4()),
            "client_sequence": 1,
            "entity_type": "patient",
            "entity_id": patient_id,
            "operation_type": "UPDATE",
            "base_server_version": 1,  # Stale! Current server version is 2
            "client_timestamp": datetime.utcnow().isoformat(),
            "payload": {
                "name": "Conflicting Update by Device B",
                "age": 35
            }
        }]
    })
    assert res3.status_code == 200
    data3 = res3.json()
    assert data3["conflict_count"] == 1
    assert data3["applied_count"] == 0
    res3_0 = data3["results"][0]
    assert res3_0["status"] == "CONFLICT"
    assert res3_0["conflict_data"] is not None
    assert res3_0["conflict_data"]["base_server_version"] == 1
    assert res3_0["conflict_data"]["current_server_version"] == 2
    assert res3_0["conflict_data"]["server_payload"]["name"] == "Updated by Device A"


def test_push_assessment_with_governed_evaluation(client):
    patient_id = str(uuid.uuid4())
    ass_id = str(uuid.uuid4())
    
    # 1. Create Patient
    client.post("/api/patients", json={
        "id": patient_id,
        "name": "Geeta Devi",
        "age": 55,
        "gender": "Female",
        "village": "Kalyani"
    })

    # 2. Push Assessment with Emergency Chest Pain
    res = client.post("/api/v2/sync/push", json={
        "device_id": "asha_tablet_4",
        "operations": [{
            "operation_id": str(uuid.uuid4()),
            "client_sequence": 1,
            "entity_type": "assessment",
            "entity_id": ass_id,
            "operation_type": "CREATE",
            "base_server_version": None,
            "client_timestamp": datetime.utcnow().isoformat(),
            "payload": {
                "id": ass_id,
                "patient_id": patient_id,
                "symptoms": ["Chest Pain", "Shortness of Breath"],
                "symptom_duration_days": 1,
                "systolic_bp": 185,
                "diastolic_bp": 115,
                "heart_rate_bpm": 110,
                "smoking_status": "Non-Smoker"
            }
        }]
    })
    assert res.status_code == 200
    data = res.json()
    assert data["applied_count"] == 1
    res0 = data["results"][0]
    assert res0["status"] == "APPLIED"

    # Verify governed evaluation results in DB
    db = TestingSessionLocal()
    ass = db.query(AssessmentModel).filter(AssessmentModel.id == ass_id).first()
    assert ass is not None
    assert ass.risk_level == "HIGH"
    assert ass.triage_state in ("EMERGENCY", "EMERGENCY_RED_FLAG")
    assert ass.is_emergency == 1
    assert len(ass.red_flags) > 0
    assert any("Hypertensive Crisis" in rf or "Chest pain" in rf or "Acute Coronary" in rf for rf in ass.red_flags)
    db.close()


def test_soft_delete_and_tombstone(client):
    patient_id = str(uuid.uuid4())
    
    # Create patient
    client.post("/api/patients", json={
        "id": patient_id,
        "name": "ToDelete Patient",
        "age": 40,
        "gender": "Male",
        "village": "Sonapur"
    })

    # Push DELETE
    res = client.post("/api/v2/sync/push", json={
        "device_id": "asha_tablet_5",
        "operations": [{
            "operation_id": str(uuid.uuid4()),
            "client_sequence": 1,
            "entity_type": "patient",
            "entity_id": patient_id,
            "operation_type": "DELETE",
            "base_server_version": 1,
            "client_timestamp": datetime.utcnow().isoformat(),
            "payload": {"id": patient_id}
        }]
    })
    assert res.status_code == 200
    assert res.json()["applied_count"] == 1

    # Verify soft deleted in DB
    db = TestingSessionLocal()
    p = db.query(PatientModel).filter(PatientModel.id == patient_id).first()
    assert p.is_deleted == 1
    assert p.server_version == 2
    
    # Verify SyncJournalModel recorded the DELETE tombstone
    del_entry = db.query(SyncJournalModel).filter(
        SyncJournalModel.entity_id == patient_id,
        SyncJournalModel.operation_type == "DELETE"
    ).first()
    assert del_entry is not None
    assert del_entry.server_version == 2
    assert del_entry.payload["is_deleted"] == 1
    db.close()


def test_cursor_pull_pagination_and_incremental(client):
    device_id = "device_asha_main"

    # Create 5 patients via Push API
    for i in range(1, 6):
        client.post("/api/v2/sync/push", json={
            "device_id": f"device_other_{i}",
            "operations": [{
                "operation_id": str(uuid.uuid4()),
                "client_sequence": 1,
                "entity_type": "patient",
                "entity_id": f"patient_seq_{i}",
                "operation_type": "CREATE",
                "base_server_version": None,
                "client_timestamp": datetime.utcnow().isoformat(),
                "payload": {
                    "id": f"patient_seq_{i}",
                    "name": f"Patient Number {i}",
                    "age": 20 + i,
                    "gender": "Male",
                    "village": "Sonapur"
                }
            }]
        })

    # Pull 1: Get first 2 items from last_server_sequence = 0
    pull1 = client.post("/api/v2/sync/pull", json={
        "device_id": device_id,
        "last_server_sequence": 0,
        "limit": 2
    })
    assert pull1.status_code == 200
    pdata1 = pull1.json()
    assert len(pdata1["entries"]) == 2
    assert pdata1["has_more"] is True
    assert pdata1["current_server_sequence"] == 5
    assert pdata1["entries"][0]["server_sequence"] == 1
    assert pdata1["entries"][1]["server_sequence"] == 2

    # Pull 2: Get next items using cursor = 2
    pull2 = client.get(f"/api/v2/sync/pull?since_seq=2&limit=2&device_id={device_id}")
    assert pull2.status_code == 200
    pdata2 = pull2.json()
    assert len(pdata2["entries"]) == 2
    assert pdata2["has_more"] is True
    assert pdata2["entries"][0]["server_sequence"] == 3
    assert pdata2["entries"][1]["server_sequence"] == 4

    # Pull 3: Get final items using cursor = 4
    pull3 = client.get(f"/api/v2/sync/pull?since_seq=4&limit=10&device_id={device_id}")
    assert pull3.status_code == 200
    pdata3 = pull3.json()
    assert len(pdata3["entries"]) == 1
    assert pdata3["has_more"] is False
    assert pdata3["entries"][0]["server_sequence"] == 5
    assert pdata3["entries"][0]["entity_id"] == "patient_seq_5"

    # Pull 4: Fully synced client polls -> 0 entries
    pull4 = client.get(f"/api/v2/sync/pull?since_seq=5&limit=10&device_id={device_id}")
    assert pull4.status_code == 200
    pdata4 = pull4.json()
    assert len(pdata4["entries"]) == 0
    assert pdata4["has_more"] is False
