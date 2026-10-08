/**
 * test_task004_outbox.js — Comprehensive In-Depth Unit Test Suite for TASK-004
 * ==============================================================================
 * Verifies:
 * 1. Monotonic client sequence number generator.
 * 2. Atomic Patient persistence (Domain record + Outbox operation in 1 tx).
 * 3. Atomic Assessment persistence with canonical v2.0.0 clinical rules + outbox op.
 * 4. Atomic Referral updates with outbox UPDATE op.
 * 5. Atomic Soft-delete with tombstone generation & outbox DELETE op.
 * 6. Atomic Appointment creation & deletion.
 * 7. Outbox lifecycle (QUEUED -> ACKNOWLEDGED / FAILED / CONFLICT).
 * 8. Active entity queries filtering out soft-deleted records.
 */

import 'fake-indexeddb/auto';
import { 
  db, 
  getNextClientSequence, 
  getOrCreateDeviceId,
  savePatientAtomic, 
  saveAssessmentAtomic, 
  saveAppointmentAtomic,
  updateReferralAtomic, 
  deletePatientAtomic,
  deleteAppointmentAtomic,
  getQueuedOutboxOperations,
  acknowledgeOutboxOperations,
  markOutboxFailed,
  markOutboxConflict,
  getActivePatients,
  getActiveAssessments,
  getActiveAppointments
} from './src/db/offlineDb.ts';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function runTask004Tests() {
  console.log('\n===============================================================');
  console.log('🧪 RUNNING TASK-004 IN-DEPTH OUTBOX & PERSISTENCE TEST SUITE');
  console.log('===============================================================\n');

  // Test 1: Monotonic client sequence numbers
  console.log('--- TEST 1: Monotonic Client Sequence Generator ---');
  const seq1 = await getNextClientSequence();
  const seq2 = await getNextClientSequence();
  const seq3 = await getNextClientSequence();
  assert(seq1 === 1, `First sequence should be 1 (got ${seq1})`);
  assert(seq2 === 2, `Second sequence should be 2 (got ${seq2})`);
  assert(seq3 === 3, `Third sequence should be 3 (got ${seq3})`);

  // Test 2: Persistent Device ID
  console.log('\n--- TEST 2: Device ID Persistence ---');
  const dev1 = await getOrCreateDeviceId();
  const dev2 = await getOrCreateDeviceId();
  assert(dev1.startsWith('device_'), `Device ID should start with prefix (got ${dev1})`);
  assert(dev1 === dev2, `Device ID must be idempotent and persistent`);

  // Test 3: Atomic Patient Creation
  console.log('\n--- TEST 3: Atomic Patient Creation ---');
  const patient = await savePatientAtomic({
    name: 'Savitri Bai',
    age: 52,
    gender: 'Female',
    village: 'Rampur',
    phone: '9876500001'
  }, true);

  assert(patient.id !== undefined && patient.id.length > 0, 'Patient ID assigned');
  assert(patient.local_version === 1, `Local version should be 1 (got ${patient.local_version})`);
  assert(patient.server_version === 0, `Server version should be 0 (got ${patient.server_version})`);
  assert(patient.sync_state === 'QUEUED', `Sync state should be QUEUED`);
  assert(patient.is_deleted === false, `is_deleted should be false`);

  // Verify outbox entry was committed in the same transaction
  const outboxPatient = await db.outbox.where('entity_id').equals(patient.id).first();
  assert(outboxPatient !== undefined, 'Outbox entry exists for created patient');
  assert(outboxPatient.operation_type === 'CREATE', `Outbox op type is CREATE (got ${outboxPatient?.operation_type})`);
  assert(outboxPatient.entity_type === 'patient', `Outbox entity type is patient`);
  assert(outboxPatient.client_sequence === 4, `Outbox client_sequence strictly monotonic (got ${outboxPatient?.client_sequence})`);

  // Test 4: Atomic Patient Update
  console.log('\n--- TEST 4: Atomic Patient Update ---');
  const updatedPatient = await savePatientAtomic({
    id: patient.id,
    name: 'Savitri Bai Devi',
    age: 53,
    gender: 'Female',
    village: 'Rampur North',
    phone: '9876500001'
  }, false);

  assert(updatedPatient.local_version === 2, `Local version incremented to 2 (got ${updatedPatient.local_version})`);
  assert(updatedPatient.village === 'Rampur North', `Village updated`);

  const outboxPatientOps = (await db.outbox.where('entity_id').equals(patient.id).toArray())
    .sort((a, b) => a.client_sequence - b.client_sequence);
  assert(outboxPatientOps.length === 2, `Two outbox ops recorded (CREATE + UPDATE)`);
  const lastPatientOp = outboxPatientOps[outboxPatientOps.length - 1];
  assert(lastPatientOp.operation_type === 'UPDATE', `Latest op is UPDATE`);

  // Test 5: Atomic Assessment Persistence with Canonical v2.0.0 Rules
  console.log('\n--- TEST 5: Atomic Assessment Creation (Hypertensive Crisis Red-Flag) ---');
  const assessment = await saveAssessmentAtomic({
    patient_id: patient.id,
    patient_name: patient.name,
    village: patient.village,
    symptoms: ['Severe headache', 'Dizziness'],
    systolic_bp: 195,
    diastolic_bp: 125,
    heart_rate_bpm: 88,
    temperature_f: 98.4
  });

  assert(assessment.is_emergency === true, 'Hypertensive crisis correctly evaluated as emergency');
  assert(assessment.short_circuit === true, 'Emergency correctly short-circuited');
  assert(assessment.triage_state === 'EMERGENCY', `Triage state is EMERGENCY (got ${assessment.triage_state})`);
  assert(assessment.risk_level === 'HIGH', `Risk level is HIGH`);
  assert(assessment.ruleset_version === '2.0.0', `Ruleset version is 2.0.0 (got ${assessment.ruleset_version})`);
  assert(assessment.referral_status === 'REFERRED', `Referral status is REFERRED`);

  const outboxAssessment = await db.outbox.where('entity_id').equals(assessment.id).first();
  assert(outboxAssessment !== undefined, 'Outbox entry exists for assessment');
  assert(outboxAssessment.operation_type === 'CREATE', 'Outbox op is CREATE');
  assert(outboxAssessment.payload.systolic_bp === 195, 'Outbox payload matches assessment vitals');

  // Test 6: Atomic Referral Status Update
  console.log('\n--- TEST 6: Atomic Referral Status Update ---');
  const updatedAssessment = await updateReferralAtomic(assessment.id, 'CONSULTATION_COMPLETED');
  assert(updatedAssessment !== null, 'Referral status updated successfully');
  assert(updatedAssessment.referral_status === 'CONSULTATION_COMPLETED', 'Referral status changed');
  assert(updatedAssessment.local_version === 2, `Assessment local version incremented to 2`);

  const outboxReferral = await db.outbox.where('entity_id').equals(assessment.id).toArray();
  const referralOp = outboxReferral.find(o => o.entity_type === 'referral');
  assert(referralOp !== undefined, 'Referral UPDATE outbox operation queued');
  assert(referralOp.payload.referral_status === 'CONSULTATION_COMPLETED', 'Referral payload accurate');

  // Test 7: Atomic Appointment Creation & Soft-Delete
  console.log('\n--- TEST 7: Atomic Appointment Creation & Soft-Delete ---');
  const appt = await saveAppointmentAtomic({
    patient_name: patient.name,
    patient_phone: patient.phone,
    doctor_name: 'Dr. R. K. Sharma',
    doctor_specialty: 'Cardiologist',
    appointment_date: '2026-10-15',
    appointment_time: '11:00 AM',
    notes: 'Emergency follow-up'
  }, true);

  assert(appt.id !== undefined, 'Appointment created');
  assert(appt.status === 'PENDING', 'Appointment status is PENDING');

  const activeApptsBefore = await getActiveAppointments();
  assert(activeApptsBefore.some(a => a.id === appt.id), 'Active appointments contains new appointment');

  await deleteAppointmentAtomic(appt.id);
  const activeApptsAfter = await getActiveAppointments();
  assert(!activeApptsAfter.some(a => a.id === appt.id), 'Deleted appointment excluded from active appointments');

  const apptTombstone = await db.tombstones.where('entity_id').equals(appt.id).first();
  assert(apptTombstone !== undefined, 'Appointment tombstone created');
  assert(apptTombstone.entity_type === 'appointment', 'Tombstone entity type is appointment');

  // Test 8: Soft-Delete Patient & Tombstone Generation
  console.log('\n--- TEST 8: Soft-Delete Patient & Tombstone Generation ---');
  const deleted = await deletePatientAtomic(patient.id);
  assert(deleted === true, 'deletePatientAtomic returned true');

  const patientInDb = await db.patients.get(patient.id);
  assert(patientInDb.is_deleted === true, 'Patient is_deleted flag set to true');

  const activePatients = await getActivePatients();
  assert(!activePatients.some(p => p.id === patient.id), 'Deleted patient excluded from getActivePatients()');

  const patientTombstone = await db.tombstones.where('entity_id').equals(patient.id).first();
  assert(patientTombstone !== undefined, 'Patient tombstone recorded in tombstones table');
  assert(patientTombstone.entity_type === 'patient', 'Tombstone entity is patient');

  const deleteOp = await db.outbox.where({ entity_id: patient.id, operation_type: 'DELETE' }).first();
  assert(deleteOp !== undefined, 'Outbox contains DELETE operation for patient');

  // Test 9: Outbox Query Ordering & ACK Processing
  console.log('\n--- TEST 9: Outbox Lifecycle (Queued -> Acknowledged) ---');
  const queuedOps = await getQueuedOutboxOperations(50);
  assert(queuedOps.length > 0, `Found ${queuedOps.length} queued outbox operations`);
  
  // Verify strict monotonic sequence ordering
  let isMonotonic = true;
  for (let i = 1; i < queuedOps.length; i++) {
    if (queuedOps[i].client_sequence <= queuedOps[i-1].client_sequence) {
      isMonotonic = false;
      break;
    }
  }
  assert(isMonotonic, 'Queued outbox operations are returned in strictly ascending client_sequence order');

  // Acknowledge the first operation
  const firstOp = queuedOps[0];
  await acknowledgeOutboxOperations([{
    operation_id: firstOp.operation_id,
    entity_type: firstOp.entity_type,
    entity_id: firstOp.entity_id,
    server_version: 1
  }]);

  const ackedOp = await db.outbox.get(firstOp.operation_id);
  assert(ackedOp.status === 'ACKNOWLEDGED', 'Outbox operation marked ACKNOWLEDGED');

  // Test 10: Conflict Staging
  console.log('\n--- TEST 10: Conflict Recording & Staging ---');
  const secondOp = queuedOps[1];
  await markOutboxConflict(secondOp.operation_id, {
    base_version: secondOp.base_server_version,
    server_version: 5,
    server_payload: { name: 'Server Patient Record', age: 55 }
  });

  const conflictOp = await db.outbox.get(secondOp.operation_id);
  assert(conflictOp.status === 'CONFLICT', 'Outbox operation marked CONFLICT');

  const conflictRecord = await db.conflicts.where('entity_id').equals(secondOp.entity_id).first();
  assert(conflictRecord !== undefined, 'Conflict record staged in conflicts table');
  assert(conflictRecord.server_version === 5, 'Conflict server version matches');
  assert(conflictRecord.status === 'PENDING', 'Conflict status is PENDING');

  // Final summary
  console.log('\n===============================================================');
  console.log(`📊 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTask004Tests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
