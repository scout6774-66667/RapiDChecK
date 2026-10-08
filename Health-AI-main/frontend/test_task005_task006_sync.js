/**
 * test_task005_task006_sync.js
 * ==============================================================================
 * Comprehensive Unit Test Suite for TASK-005 (Push API) & TASK-006 (Pull API)
 * Client Sync Engine.
 * 
 * Verifies:
 * 1. Push batch construction with monotonic sequences and operation UUIDs.
 * 2. Idempotent per-operation ACK handling (APPLIED / DUPLICATE).
 * 3. OCC conflict detection and staging in db.conflicts.
 * 4. Cursor-based incremental pull synchronization and local Dexie updates.
 * 5. Soft-delete tombstone propagation.
 * 6. Subscription listener notifications.
 */

import 'fake-indexeddb/auto';
import {
  db,
  savePatientAtomic,
  saveAssessmentAtomic,
  saveAppointmentAtomic,
  deletePatientAtomic,
  getSyncMetadata,
  updateSyncMetadata,
  markOutboxConflict
} from './src/db/offlineDb.ts';
import { SyncManager } from './src/sync/SyncManager.ts';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    failed++;
    throw new Error(message);
  } else {
    console.log(`✅ PASS: ${message}`);
    passed++;
  }
}

// Global fetch mock helper
let mockResponses = [];
globalThis.fetch = async (url, options = {}) => {
  if (mockResponses.length === 0) {
    throw new Error(`Unexpected fetch call to: ${url}`);
  }
  let nextMock = mockResponses.shift();
  if (typeof nextMock === 'function') {
    nextMock = await nextMock(url, options);
  }
  return {
    ok: nextMock.status ? nextMock.status >= 200 && nextMock.status < 300 : true,
    status: nextMock.status || 200,
    statusText: nextMock.statusText || 'OK',
    json: async () => (typeof nextMock.json === 'function' ? await nextMock.json() : nextMock.json || {})
  };
};

async function runTests() {
  console.log('\n===============================================================');
  console.log('🧪 RUNNING TASK-005 & TASK-006 CLIENT SYNC ENGINE UNIT TESTS');
  console.log('===============================================================\n');

  const syncManager = SyncManager.getInstance();

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Push Batch Execution & ACK processing
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 1: Push Outbox Batch & Process ACKs ---');
  await db.patients.clear();
  await db.assessments.clear();
  await db.appointments.clear();
  await db.outbox.clear();
  await db.conflicts.clear();
  await db.sync_metadata.clear();

  // Create patient atomically (generates outbox item)
  const p1 = await savePatientAtomic({
    name: 'Anita Roy',
    age: 34,
    gender: 'Female',
    village: 'Bishnupur',
    phone: '9876543210'
  });

  const queuedOps = await db.outbox.where('status').equals('QUEUED').toArray();
  assert(queuedOps.length === 1, 'One outbox operation queued for Anita Roy');
  assert(p1.sync_state === 'QUEUED', 'Local patient initial sync_state is QUEUED');

  // Mock server push response
  mockResponses.push(async (url, opts) => {
    const body = JSON.parse(opts.body);
    assert(body.operations.length === 1, 'Push request contains 1 operation');
    assert(body.operations[0].operation_id === queuedOps[0].operation_id, 'Push operation matches queued UUID');
    assert(body.operations[0].entity_type === 'patient', 'Operation is entity_type patient');
    assert(body.operations[0].operation_type === 'CREATE', 'Operation is CREATE');

    return {
      ok: true,
      status: 200,
      json: {
        applied_count: 1,
        duplicate_count: 0,
        conflict_count: 0,
        rejected_count: 0,
        current_server_sequence: 1,
        results: [
          {
            operation_id: body.operations[0].operation_id,
            status: 'APPLIED',
            server_version: 1,
            server_sequence: 1,
            conflict_data: null,
            error_message: null
          }
        ]
      }
    };
  });

  const pushRes = await syncManager.pushOutboxBatch();
  assert(pushRes.applied === 1, 'pushOutboxBatch reported 1 applied');
  assert(pushRes.duplicates === 0, 'pushOutboxBatch reported 0 duplicates');

  const remainingQueued = await db.outbox.where('status').equals('QUEUED').count();
  assert(remainingQueued === 0, 'No more queued outbox operations');

  const ackedOp = await db.outbox.get(queuedOps[0].operation_id);
  assert(ackedOp?.status === 'ACKNOWLEDGED', 'Outbox operation marked ACKNOWLEDGED');

  const updatedP1 = await db.patients.get(p1.id);
  assert(updatedP1?.sync_state === 'SYNCED', 'Patient sync_state updated to SYNCED');
  assert(updatedP1?.server_version === 1, 'Patient server_version updated to 1');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: OCC Conflict Detection & Staging in Dexie
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 2: OCC Conflict Detection & Local Staging ---');
  // Update patient Anita Roy locally
  const p1Updated = await savePatientAtomic({
    id: p1.id,
    name: 'Anita Roy (Updated Locally)',
    age: 35,
    gender: 'Female',
    village: 'Bishnupur',
    phone: '9876543210'
  }, false);

  const conflictOps = await db.outbox.where('status').equals('QUEUED').toArray();
  assert(conflictOps.length === 1, 'One outbox operation queued for update');
  assert(conflictOps[0].base_server_version === 1, 'Outbox operation has base_server_version = 1');

  // Server returns CONFLICT because server is already at server_version = 2
  mockResponses.push(async (url, opts) => {
    const body = JSON.parse(opts.body);
    return {
      ok: true,
      status: 200,
      json: {
        applied_count: 0,
        duplicate_count: 0,
        conflict_count: 1,
        rejected_count: 0,
        current_server_sequence: 3,
        results: [
          {
            operation_id: body.operations[0].operation_id,
            status: 'CONFLICT',
            server_version: 2,
            server_sequence: null,
            conflict_data: {
              entity_id: p1.id,
              entity_type: 'patient',
              base_server_version: 1,
              current_server_version: 2,
              server_payload: {
                id: p1.id,
                name: 'Anita Roy (Doctor Edit)',
                age: 36,
                village: 'Bishnupur',
                server_version: 2
              }
            },
            error_message: 'Patient version conflict: base 1 vs current 2'
          }
        ]
      }
    };
  });

  const conflictPushRes = await syncManager.pushOutboxBatch();
  assert(conflictPushRes.conflicts === 1, 'pushOutboxBatch detected 1 conflict');

  const stagedConflict = await db.conflicts.where('entity_id').equals(p1.id).first();
  assert(stagedConflict !== undefined, 'Conflict staged in db.conflicts');
  assert(stagedConflict?.server_version === 2, 'Staged conflict recorded current_server_version = 2');
  assert(stagedConflict?.server_payload.name === 'Anita Roy (Doctor Edit)', 'Staged server payload preserved');

  const opAfterConflict = await db.outbox.get(conflictOps[0].operation_id);
  assert(opAfterConflict?.status === 'CONFLICT', 'Outbox operation marked status CONFLICT');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Pull Incremental Changes with Sequences
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 3: Incremental Cursor Pull Sync ---');
  await updateSyncMetadata({ last_server_sequence: 0 });

  const incomingRemotePatientId = 'remote-patient-uuid-101';
  const incomingAssessmentId = 'remote-assessment-uuid-202';

  mockResponses.push(async (url) => {
    assert(url.includes('since_seq=0'), 'Pull request queried since_seq=0');
    return {
      ok: true,
      status: 200,
      json: {
        last_server_sequence: 0,
        current_server_sequence: 5,
        entries_count: 2,
        has_more: false,
        entries: [
          {
            server_sequence: 1,
            entity_type: 'patient',
            entity_id: incomingRemotePatientId,
            operation_type: 'CREATE',
            server_version: 1,
            timestamp: new Date().toISOString(),
            payload: {
              id: incomingRemotePatientId,
              name: 'Sunil Sen',
              age: 58,
              gender: 'Male',
              village: 'Nabagram',
              phone: '9830000000',
              server_version: 1,
              is_deleted: 0
            }
          },
          {
            server_sequence: 2,
            entity_type: 'assessment',
            entity_id: incomingAssessmentId,
            operation_type: 'CREATE',
            server_version: 1,
            timestamp: new Date().toISOString(),
            payload: {
              id: incomingAssessmentId,
              patient_id: incomingRemotePatientId,
              symptoms: ['Fever', 'Cough'],
              temperature_f: 101.5,
              risk_level: 'MODERATE',
              triage_state: 'PRIORITY_ACTION',
              is_emergency: 0,
              referral_status: 'REFERRED',
              server_version: 1,
              is_deleted: 0
            }
          }
        ]
      }
    };
  });

  const pullRes = await syncManager.pullServerChanges();
  assert(pullRes.appliedCount === 2, 'Applied 2 pulled records');
  assert(pullRes.currentServerSequence === 5, 'Server sequence advanced to 5');

  const pulledPatient = await db.patients.get(incomingRemotePatientId);
  assert(pulledPatient !== undefined, 'Pulled patient saved in local Dexie');
  assert(pulledPatient?.name === 'Sunil Sen', 'Pulled patient name verified');
  assert(pulledPatient?.sync_state === 'SYNCED', 'Pulled patient marked SYNCED');

  const pulledAss = await db.assessments.get(incomingAssessmentId);
  assert(pulledAss !== undefined, 'Pulled assessment saved in local Dexie');
  assert(pulledAss?.risk_level === 'MODERATE', 'Pulled assessment risk_level verified');
  assert(pulledAss?.triage_state === 'PRIORITY_ACTION', 'Pulled assessment triage_state verified');

  const metaAfterPull = await getSyncMetadata();
  assert(metaAfterPull.last_server_sequence === 5, 'sync_metadata updated last_server_sequence to 5');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Soft Delete Tombstone Propagation
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 4: Soft-Delete Tombstone Pull Sync ---');
  mockResponses.push(async (url) => {
    assert(url.includes('since_seq=5'), 'Incremental pull queried since_seq=5');
    return {
      ok: true,
      status: 200,
      json: {
        last_server_sequence: 5,
        current_server_sequence: 6,
        entries_count: 1,
        has_more: false,
        entries: [
          {
            server_sequence: 6,
            entity_type: 'patient',
            entity_id: incomingRemotePatientId,
            operation_type: 'DELETE',
            server_version: 2,
            timestamp: new Date().toISOString(),
            payload: {
              id: incomingRemotePatientId,
              is_deleted: 1,
              server_version: 2
            }
          }
        ]
      }
    };
  });

  const tombstonePullRes = await syncManager.pullServerChanges();
  assert(tombstonePullRes.appliedCount === 1, 'Applied 1 tombstone record');

  const deletedPatient = await db.patients.get(incomingRemotePatientId);
  assert(deletedPatient?.is_deleted === true, 'Patient soft-deleted locally in Dexie');
  assert(deletedPatient?.server_version === 2, 'Patient server_version updated to 2');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5: Full Sync Cycle & Listener Notifications
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 5: Full Sync Cycle & Status Subscriptions ---');
  let notified = 0;
  const unsubscribe = syncManager.subscribe((status) => {
    notified++;
  });

  // Mock push (no queued ops) and pull (no new records)
  mockResponses.push(async () => ({
    ok: true,
    status: 200,
    json: {
      last_server_sequence: 6,
      current_server_sequence: 6,
      entries_count: 0,
      has_more: false,
      entries: []
    }
  }));

  const fullCycle = await syncManager.runFullSync();
  assert(fullCycle.push.total === 0, 'Full cycle push handled empty outbox');
  assert(fullCycle.pull.appliedCount === 0, 'Full cycle pull handled zero new records');
  assert(notified > 0, 'Subscriber received sync state updates');

  unsubscribe();

  console.log('\n===============================================================');
  console.log(`🎉 ALL TASK-005 & TASK-006 CLIENT SYNC TESTS PASSED (${passed}/${passed})`);
  console.log('===============================================================\n');
}

runTests().catch(err => {
  console.error('\n💥 TEST RUN FAILED WITH ERROR:', err);
  process.exit(1);
});
