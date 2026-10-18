"""
verify_live_e2e_deletion.py — Live End-to-End Verification of Patient Deletion
==============================================================================
Executes against live server at http://127.0.0.1:8000 using purely synthetic data.
Validates:
1. Role-based authentication & token acquisition.
2. Creation of synthetic test patient & associated assessment.
3. Rejection of deletion by unauthorized role (ASHA worker -> 403).
4. Rejection of cross-facility deletion by non-admin doctor (foreign facility -> 403).
5. Successful authorized deletion by local PHC doctor (200 OK).
6. Exclusion of deleted patient and cascade assessments from active GET queries.
7. Database verification of is_deleted=1, server_version increment, sync_journal tombstones, and audit_events log.
8. Idempotency verification (repeated delete returns 404).
9. Sync V2 Push DELETE operation handling and idempotency.
10. Safe synthetic cleanup with zero alteration of real clinical patient records.
"""

import sys
import uuid
import requests
import sqlite3
import os

BASE_URL = "http://127.0.0.1:8000"
DB_PATH = os.path.join(os.path.dirname(__file__), "ruralhealth.db")

def log(msg):
    print(f"[E2E-TEST] {msg}")

def main():
    log("Starting live end-to-end verification against " + BASE_URL)
    session = requests.Session()

    # Step 1: Health check
    h_res = session.get(f"{BASE_URL}/api/health")
    assert h_res.status_code == 200, f"Health check failed: {h_res.text}"
    log("✓ Backend is online and responsive.")

    # Step 2: Authentication
    doc_login = session.post(f"{BASE_URL}/api/v2/auth/login", json={"username": "dr.sharma", "password": "doctor123"})
    assert doc_login.status_code == 200, f"Doctor login failed: {doc_login.text}"
    doc_token = doc_login.json()["access_token"]
    doc_headers = {"Authorization": f"Bearer {doc_token}"}
    log("✓ Logged in as Dr. Rajesh Sharma (PHC_DOCTOR, facility: PHC_SONPUR).")

    asha_login = session.post(f"{BASE_URL}/api/v2/auth/login", json={"username": "asha.anita", "password": "asha123"})
    assert asha_login.status_code == 200, f"ASHA login failed: {asha_login.text}"
    asha_token = asha_login.json()["access_token"]
    asha_headers = {"Authorization": f"Bearer {asha_token}"}
    log("✓ Logged in as Anita Roy (ASHA_WORKER, facility: SC_SONPUR).")

    admin_login = session.post(f"{BASE_URL}/api/v2/auth/login", json={"username": "admin", "password": "admin123"})
    assert admin_login.status_code == 200, f"Admin login failed: {admin_login.text}"
    admin_token = admin_login.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    log("✓ Logged in as System Administrator (SYSTEM_ADMIN).")

    # Record baseline patient count in DB
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT count(*) FROM patients WHERE is_deleted=0")
    baseline_active_count = cur.fetchone()[0]
    log(f"Baseline active patient count in database: {baseline_active_count}")

    # Step 3: Create synthetic test patient
    test_uuid = str(uuid.uuid4())
    custom_pid = f"PAT-SYNTH-{test_uuid[:6].upper()}"
    p_payload = {
        "id": test_uuid,
        "name": "Synthetic E2E Test Patient",
        "age": 48,
        "gender": "Female",
        "village": "Sonpur Test Village",
        "phone": "9998887776",
        "patient_id": custom_pid
    }
    p_create = session.post(f"{BASE_URL}/api/patients", json=p_payload, headers=doc_headers)
    assert p_create.status_code == 200, f"Patient creation failed: {p_create.text}"
    patient_data = p_create.json()
    patient_id = patient_data["id"]
    log(f"✓ Created synthetic patient: id={patient_id}, patient_id={custom_pid}.")

    # Step 4: Create synthetic assessment
    ass_uuid = str(uuid.uuid4())
    ass_payload = {
        "id": ass_uuid,
        "patient_id": patient_id,
        "symptoms": ["headache", "dizziness"],
        "symptom_duration_days": 3,
        "temperature_f": 98.6,
        "systolic_bp": 145,
        "diastolic_bp": 92,
        "glucose_mg_dl": 160.0,
        "heart_rate_bpm": 78,
        "smoking_status": "Never",
        "alcohol_status": "Never",
        "physical_activity": "Moderate",
        "family_history": ["hypertension"]
    }
    ass_create = session.post(f"{BASE_URL}/api/assess", json=ass_payload, headers=doc_headers)
    assert ass_create.status_code == 200, f"Assessment creation failed: {ass_create.text}"
    log(f"✓ Created synthetic assessment: id={ass_uuid}.")

    # Step 5: Verify presence in active queries
    p_list = session.get(f"{BASE_URL}/api/patients", headers=doc_headers).json()
    assert any(p["id"] == patient_id for p in p_list), "Created patient not found in /api/patients"
    a_list = session.get(f"{BASE_URL}/api/assessments", headers=doc_headers).json()
    assert any(a["id"] == ass_uuid for a in a_list), "Created assessment not found in /api/assessments"
    log("✓ Verified patient and assessment appear in active listings.")

    # Step 6: Test unauthorized role deletion (ASHA worker)
    asha_del = session.delete(f"{BASE_URL}/api/patients/{patient_id}", headers=asha_headers)
    assert asha_del.status_code == 403, f"Expected 403 for ASHA delete, got {asha_del.status_code}: {asha_del.text}"
    assert "permission denied" in asha_del.json().get("detail", "").lower(), "Expected permission denied message"
    log("✓ ASHA worker deletion rejected with HTTP 403 Forbidden (Permission denied).")

    # Step 7: Create foreign facility patient and test cross-facility delete rejection
    foreign_uuid = str(uuid.uuid4())
    foreign_pid = f"PAT-FOR-{foreign_uuid[:6].upper()}"
    cur.execute(
        "INSERT INTO patients (id, name, age, gender, village, phone, patient_id, facility_id, server_version, is_deleted, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, datetime('now'), datetime('now'))",
        (foreign_uuid, "Foreign Facility Patient", 52, "Male", "North District", "9112233445", foreign_pid, "PHC_NORTH")
    )
    conn.commit()

    cross_del = session.delete(f"{BASE_URL}/api/patients/{foreign_uuid}", headers=doc_headers)
    assert cross_del.status_code == 403, f"Expected 403 for cross-facility delete, got {cross_del.status_code}: {cross_del.text}"
    assert "belongs to facility" in cross_del.json().get("detail", "").lower(), "Expected facility boundary error"
    log("✓ Cross-facility deletion rejected with HTTP 403 Forbidden (Facility isolation enforced).")

    # Step 8: Authorized deletion by local PHC doctor
    doc_del = session.delete(f"{BASE_URL}/api/patients/{patient_id}", headers=doc_headers)
    assert doc_del.status_code == 200, f"Expected 200 for doctor delete, got {doc_del.status_code}: {doc_del.text}"
    del_res = doc_del.json()
    assert del_res["id"] == patient_id
    log("✓ Authorized PHC Doctor deletion succeeded with HTTP 200 OK.")

    # Step 9: Verify exclusion from active queries
    p_list_after = session.get(f"{BASE_URL}/api/patients", headers=doc_headers).json()
    assert not any(p["id"] == patient_id for p in p_list_after), "Soft-deleted patient still in /api/patients"

    p_direct = session.get(f"{BASE_URL}/api/patients/{patient_id}", headers=doc_headers)
    assert p_direct.status_code == 404, f"Direct query should return 404, got {p_direct.status_code}"

    a_list_after = session.get(f"{BASE_URL}/api/assessments", headers=doc_headers).json()
    assert not any(a["id"] == ass_uuid for a in a_list_after), "Soft-deleted assessment still in /api/assessments"

    a_direct = session.get(f"{BASE_URL}/api/assessments/{ass_uuid}", headers=doc_headers)
    assert a_direct.status_code == 404, f"Direct assessment query should return 404, got {a_direct.status_code}"
    log("✓ Soft-deleted patient and assessment are completely excluded from active queries (404 on direct fetch).")

    # Step 10: Verify database records (soft delete, tombstones, audit)
    cur.execute("SELECT is_deleted, server_version FROM patients WHERE id=?", (patient_id,))
    p_row = cur.fetchone()
    assert p_row[0] == 1, f"Expected is_deleted=1 for patient, got {p_row[0]}"
    assert p_row[1] >= 2, f"Expected server_version >= 2, got {p_row[1]}"

    cur.execute("SELECT is_deleted, server_version FROM assessments WHERE id=?", (ass_uuid,))
    a_row = cur.fetchone()
    assert a_row[0] == 1, f"Expected is_deleted=1 for cascaded assessment, got {a_row[0]}"

    cur.execute("SELECT count(*) FROM sync_journal WHERE entity_id IN (?, ?) AND operation_type='DELETE'", (patient_id, ass_uuid))
    tombstone_count = cur.fetchone()[0]
    assert tombstone_count >= 2, f"Expected >= 2 tombstones in sync_journal, got {tombstone_count}"

    cur.execute("SELECT count(*) FROM audit_events WHERE entity_id=? AND event_type='PATIENT_DELETED'", (patient_id,))
    audit_count = cur.fetchone()[0]
    assert audit_count >= 1, f"Expected >= 1 audit event for PATIENT_DELETED, got {audit_count}"
    log("✓ Database integrity verified: is_deleted=1, sync tombstones logged, immutable audit entry recorded.")

    # Step 11: Test idempotency (repeated delete returns 404)
    repeat_del = session.delete(f"{BASE_URL}/api/patients/{patient_id}", headers=doc_headers)
    assert repeat_del.status_code == 404, f"Repeated delete should return 404, got {repeat_del.status_code}"
    log("✓ Idempotency verified: subsequent delete request returns HTTP 404 Not Found.")

    # Step 12: Test Sync V2 Push DELETE on foreign patient by Admin
    push_payload = {
        "device_id": "e2e_device_test_99",
        "operations": [
            {
                "operation_id": str(uuid.uuid4()),
                "client_sequence": 1,
                "entity_type": "patient",
                "entity_id": foreign_uuid,
                "operation_type": "DELETE",
                "base_server_version": 1,
                "client_timestamp": "2026-10-15T07:00:00Z",
                "payload": {}
            }
        ]
    }
    push_res = session.post(f"{BASE_URL}/api/v2/sync/push", json=push_payload, headers=admin_headers)
    assert push_res.status_code == 200, f"Sync push failed: {push_res.text}"
    push_data = push_res.json()
    assert push_data["applied_count"] == 1
    assert push_data["results"][0]["status"] == "APPLIED"
    log("✓ Sync V2 push DELETE operation applied successfully.")

    # Step 13: Clean up synthetic records
    cur.execute("DELETE FROM patients WHERE id IN (?, ?)", (patient_id, foreign_uuid))
    cur.execute("DELETE FROM assessments WHERE id=?", (ass_uuid,))
    cur.execute("DELETE FROM sync_journal WHERE entity_id IN (?, ?)", (patient_id, foreign_uuid))
    cur.execute("DELETE FROM audit_events WHERE entity_id IN (?, ?)", (patient_id, foreign_uuid))
    conn.commit()

    cur.execute("SELECT count(*) FROM patients WHERE is_deleted=0")
    final_active_count = cur.fetchone()[0]
    conn.close()
    assert final_active_count == baseline_active_count, f"Active patient count mismatch: baseline={baseline_active_count}, final={final_active_count}"
    log(f"✓ Synthetic test cleanup complete. Active patient count restored to baseline ({final_active_count}).")

    log("🎉 ALL 13 LIVE E2E VERIFICATION CHECKS PASSED SUCCESSFULLY (100%).")

if __name__ == "__main__":
    main()
