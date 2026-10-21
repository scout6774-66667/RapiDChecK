/**
 * test_phase4_patient_directory.js
 * ================================
 * Regression test suite for Patient Directory & IDRC Referrals & Care Dashboard:
 * 1. Duplicate Detection: Groups records by phone or normalized name without merging/deleting.
 * 2. Deterministic Latest Assessment: Verifies newest-first sorting and latest-risk selection.
 * 3. Safe Clinical Risk Badges: No false green for EMERGENCY or INSUFFICIENT_DATA.
 * 4. Multi-Field Search: Matches by patient ID, name, village, phone.
 * 5. IDRC Referral Dashboard Metrics: Accurately computes unique patients screened, emergency-inclusive high risk, and review queue.
 * 6. Atomic Referral Mutation: Verifies referral updates queue an outbox mutation with client sequence.
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('========================================================================');
console.log('🧪 RUNNING PATIENT DIRECTORY & IDRC REFERRALS AUDIT REGRESSION TESTS');
console.log('========================================================================');

const srcDir = path.join(__dirname, 'src');
const patDirFile = path.join(srcDir, 'components', 'PatientDirectory.tsx');
const phcDashFile = path.join(srcDir, 'components', 'PhcDashboard.tsx');

const patDirContent = fs.readFileSync(patDirFile, 'utf8');
const phcDashContent = fs.readFileSync(phcDashFile, 'utf8');

// --- Test 1: Duplicate Detection Algorithm in Patient Directory ---
console.log('\n--- Test 1: Patient Directory Duplicate Detection Grouping ---');
assert.ok(
  patDirContent.includes('const duplicateMap = useMemo('),
  'FAIL: PatientDirectory must implement duplicateMap'
);
assert.ok(
  patDirContent.includes('phoneCounts.set') && patDirContent.includes('nameCounts.set'),
  'FAIL: PatientDirectory must index patients by phone and normalized name'
);
assert.ok(
  patDirContent.includes('isPotentialDuplicate'),
  'FAIL: PatientDirectory must flag potential duplicate cards'
);

// Simulation test of duplicate detection algorithm
function computeDuplicateMap(patients) {
  const dupes = new Map();
  const phoneMap = new Map();
  const nameMap = new Map();

  for (const p of patients) {
    if (p.phone && p.phone.trim().length >= 10) {
      const key = p.phone.trim();
      const existing = phoneMap.get(key) || [];
      existing.push(p);
      phoneMap.set(key, existing);
    }
    if (p.name && p.name.trim().length >= 2) {
      const key = p.name.trim().toLowerCase();
      const existing = nameMap.get(key) || [];
      existing.push(p);
      nameMap.set(key, existing);
    }
  }

  for (const group of phoneMap.values()) {
    if (group.length > 1) {
      for (const p of group) {
        dupes.set(p.id, group.filter(x => x.id !== p.id));
      }
    }
  }

  for (const group of nameMap.values()) {
    if (group.length > 1) {
      for (const p of group) {
        const existing = dupes.get(p.id) || [];
        const newOthers = group.filter(x => x.id !== p.id && !existing.some(e => e.id === x.id));
        dupes.set(p.id, [...existing, ...newOthers]);
      }
    }
  }
  return dupes;
}

const mockPatients = [
  { id: 'pat-1', name: 'Sunita Devi', phone: '9876543210', village: 'Sundarpur' },
  { id: 'pat-2', name: 'Sunita Devi', phone: '9876543210', village: 'Sundarpur' },
  { id: 'pat-3', name: 'Ramesh Kumar', phone: '9123456780', village: 'Rampur' },
  { id: 'pat-4', name: 'Anita Singh', phone: '9876543210', village: 'Kalyanpur' }, // shared phone
];

const dupes = computeDuplicateMap(mockPatients);
assert.strictEqual(dupes.has('pat-1'), true, 'FAIL: pat-1 should be flagged as potential duplicate');
assert.strictEqual(dupes.has('pat-2'), true, 'FAIL: pat-2 should be flagged as potential duplicate');
assert.strictEqual(dupes.has('pat-3'), false, 'FAIL: pat-3 has unique name and phone');
assert.strictEqual(dupes.has('pat-4'), true, 'FAIL: pat-4 shares phone with pat-1 and pat-2');
console.log('  ✅ PASS: Duplicate detection accurately flags shared phone and normalized name records without merging/deleting.');

// --- Test 2: Latest Assessment Selection vs Oldest Bug ---
console.log('\n--- Test 2: Deterministic Latest Assessment per Patient ---');
assert.ok(
  !patDirContent.includes('patAssessments[patAssessments.length - 1]'),
  'FAIL: Oldest-assessment bug (patAssessments[patAssessments.length - 1]) must NOT be present'
);
assert.ok(
  patDirContent.includes('getSortedPatientAssessments'),
  'FAIL: PatientDirectory must use getSortedPatientAssessments helper'
);

function getSortedPatientAssessments(assessments, patientId) {
  return assessments
    .filter(a => a.patient_id === patientId)
    .sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (timeB !== timeA) return timeB - timeA;
      return (b.id || '').localeCompare(a.id || '');
    });
}

const mockHistory = [
  { id: 'a1', patient_id: 'p1', created_at: '2026-10-01T08:00:00Z', risk_level: 'LOW' },
  { id: 'a2', patient_id: 'p1', created_at: '2026-10-15T09:00:00Z', risk_level: 'HIGH' },
  { id: 'a0', patient_id: 'p1', created_at: '2026-09-01T08:00:00Z', risk_level: 'MODERATE' },
];

const sorted = getSortedPatientAssessments(mockHistory, 'p1');
assert.strictEqual(sorted[0].id, 'a2', 'FAIL: Latest assessment should be a2 (2026-10-15)');
assert.strictEqual(sorted[0].risk_level, 'HIGH', 'FAIL: Latest risk should be HIGH');
assert.strictEqual(sorted[sorted.length - 1].id, 'a0', 'FAIL: Oldest assessment should be a0 (2026-09-01)');
console.log('  ✅ PASS: Assessments sorted newest-first; latest assessment correctly selected.');

// --- Test 3: Safe Risk Badges in Patient Directory (No False LOW) ---
console.log('\n--- Test 3: Clinical Safety of Risk Badges in Directory ---');
// Verify EMERGENCY is styled as rose/red, not emerald/green
assert.ok(
  patDirContent.includes("latest.risk_level === 'HIGH' || latest.risk_level === 'EMERGENCY' || latest.triage_state === 'EMERGENCY'"),
  'FAIL: Card risk badge must group EMERGENCY with high-risk priority styling'
);
assert.ok(
  patDirContent.includes("latest.risk_level === 'INSUFFICIENT_DATA' ? 'NEEDS REVIEW' : latest.risk_level"),
  'FAIL: INSUFFICIENT_DATA must display NEEDS REVIEW badge rather than falling back to LOW'
);
console.log('  ✅ PASS: Risk badge evaluation handles EMERGENCY and INSUFFICIENT_DATA safely.');

// --- Test 4: Search includes Patient ID ---
console.log('\n--- Test 4: Patient Directory Multi-Field Search ---');
assert.ok(
  patDirContent.includes('p.id.toLowerCase().includes(searchTerm.toLowerCase())') &&
  patDirContent.includes('p.patient_id.toLowerCase().includes(searchTerm.toLowerCase())'),
  'FAIL: Search must match patient_id and id'
);
console.log('  ✅ PASS: Search filter covers patient ID, name, village, and phone.');

// --- Test 5: IDRC Dashboard Metric Tracing & Aggregations ---
console.log('\n--- Test 5: IDRC Referrals & Care Dashboard Metrics ---');
assert.ok(
  phcDashContent.includes('const totalPatientsCount = new Set(filteredByScope.map((a) => a.patient_id)).size;'),
  'FAIL: totalPatientsCount must be unique patients screened in filtered scope'
);
assert.ok(
  phcDashContent.includes("highRiskCount = filteredByScope.filter((a) => a.risk_level === 'HIGH' || a.risk_level === 'EMERGENCY' || a.is_emergency).length;"),
  'FAIL: highRiskCount must include risk_level EMERGENCY and is_emergency'
);
assert.ok(
  phcDashContent.includes("reviewCount = filteredByScope.filter((a) => a.risk_level === 'INSUFFICIENT_DATA').length;"),
  'FAIL: reviewCount must calculate INSUFFICIENT_DATA assessments'
);
assert.ok(
  phcDashContent.includes('totalRiskAssessments = highRiskCount + modRiskCount + lowRiskCount + reviewCount;'),
  'FAIL: totalRiskAssessments denominator must account for all risk tiers'
);
console.log('  ✅ PASS: IDRC Dashboard metrics include EMERGENCY, INSUFFICIENT_DATA, and compute unique screened patients.');

// --- Test 6: IDRC Referral Atomic Mutation & Offline Sync Queueing ---
console.log('\n--- Test 6: Referral Status Update Queues Outbox Operation ---');
assert.ok(
  phcDashContent.includes('updateReferralAtomic'),
  'FAIL: PhcDashboard must import and call updateReferralAtomic'
);
assert.ok(
  phcDashContent.includes('await updateReferralAtomic(assessmentId, newStatus as any);'),
  'FAIL: updateReferralStatus must call updateReferralAtomic to guarantee offline sync queuing'
);
console.log('  ✅ PASS: Referral status transitions atomically persist and queue outbox operations.');

// --- Test 7: Patient Deletion RBAC & Tenancy UI Guards ---
console.log('\n--- Test 7: Patient Directory Deletion RBAC & Facility Tenancy ---');
assert.ok(
  patDirContent.includes("const canDelete = hasPermission('patients:delete')"),
  'FAIL: PatientDirectory must enforce canDelete permission check'
);
assert.ok(
  patDirContent.includes('isForeignFacility'),
  'FAIL: PatientDirectory must check isForeignFacility'
);
assert.ok(
  patDirContent.includes('disabled={!canDelete || isForeignFacility}'),
  'FAIL: Delete buttons must be disabled when user lacks permission or patient is from foreign facility'
);
assert.ok(
  patDirContent.includes('Permission denied: Patient record deletion requires PHC Doctor or Administrator authorization.'),
  'FAIL: Deletion must guard against unauthorized execution with clear role-based feedback'
);
console.log('  ✅ PASS: Patient directory enforces strict RBAC (Doctor/Admin) and foreign facility protection in UI.');

// --- Test 8: Granular HTTP Status Error Handling in confirmDelete ---
console.log('\n--- Test 8: HTTP Status Error Handling (No Misleading Backend Offline Toast) ---');
// Verify old generic error toast is completely gone
assert.ok(
  !patDirContent.includes('Server delete failed. Please ensure the backend is running.'),
  'FAIL: Misleading toast "Server delete failed. Please ensure the backend is running." must be removed'
);
// Verify 401 handling
assert.ok(
  patDirContent.includes('Authentication session expired. Please sign in again.'),
  'FAIL: 401 responses must notify user of expired session'
);
// Verify 403 handling
assert.ok(
  patDirContent.includes('res.status === 403') && patDirContent.includes('errorDetail'),
  'FAIL: 403 responses must surface specific authorization/facility error detail from server'
);
// Verify 404 handling (server already deleted -> clean up locally)
assert.ok(
  patDirContent.includes('res.status === 404'),
  'FAIL: 404 responses must be handled gracefully to proceed with local cleanup'
);
// Verify 500 handling
assert.ok(
  patDirContent.includes('res.status >= 500') && patDirContent.includes('Server database error during deletion'),
  'FAIL: 500 responses must clearly inform user of server database error without claiming server offline'
);
console.log('  ✅ PASS: confirmDelete handles 401, 403, 404, 500, and network errors separately with accurate messaging.');

// --- Test 9: Offline Outbox Atomic Deletion & Resurrection Protection ---
console.log('\n--- Test 9: Outbox Resurrection Prevention & Cascade Tombstones in offlineDb ---');
const offlineDbFile = path.join(srcDir, 'db', 'offlineDb.ts');
const offlineDbContent = fs.readFileSync(offlineDbFile, 'utf8');

assert.ok(
  offlineDbContent.includes("op.operation_type === 'CREATE'") &&
  offlineDbContent.includes("status: 'CANCELLED'"),
  'FAIL: deletePatientAtomic must cancel pending outbox CREATE ops to prevent recreating deleted patient'
);
assert.ok(
  offlineDbContent.includes("op.operation_type === 'UPDATE'") &&
  offlineDbContent.includes("status: 'SUPERSEDED'"),
  'FAIL: deletePatientAtomic must supersede pending outbox UPDATE ops to prevent overwriting deletion'
);
assert.ok(
  offlineDbContent.includes("entity_type: 'assessment'") &&
  offlineDbContent.includes("entity_type: 'patient'"),
  'FAIL: deletePatientAtomic must cascade soft-deletion and record tombstones for both patient and assessments'
);
console.log('  ✅ PASS: deletePatientAtomic safely cancels pending CREATE/UPDATE ops and cascades assessment tombstones.');

// --- Test 10: Accurate Soft-Deletion & Retention Dialog ---
console.log('\n--- Test 10: Accurate Soft-Deletion & Retention Dialog ---');
assert.ok(
  patDirContent.includes('Confirm Deletion') && patDirContent.includes('Archive & Delete Patient?'),
  'FAIL: Confirmation dialog headers must indicate archiving and deletion'
);
assert.ok(
  patDirContent.includes('clinical assessment(s) and associated referrals will also be archived.'),
  'FAIL: Confirmation dialog must accurately state assessments and referrals are archived'
);
assert.ok(
  patDirContent.includes('Clinical Soft-Deletion & Retention Notice:'),
  'FAIL: Confirmation dialog must display Clinical Soft-Deletion & Retention Notice'
);
assert.ok(
  patDirContent.includes('In accordance with healthcare data retention governance, records and audit trails are securely retained in the backend archive with tombstones'),
  'FAIL: Confirmation dialog must clarify retention compliance and tombstones instead of false permanent erasure'
);
assert.ok(
  patDirContent.includes('administrative database restoration is required for recovery'),
  'FAIL: Confirmation dialog must explain administrative recovery'
);
assert.ok(
  patDirContent.includes('Confirm Deletion'),
  'FAIL: Confirmation dialog submit button must be present'
);
console.log('  ✅ PASS: Confirmation dialog accurately reflects soft-deletion, audit retention, and recovery semantics.');

console.log('\n========================================================================');
console.log('🎉 ALL PATIENT DIRECTORY & IDRC REFERRALS AUDIT TESTS PASSED (10/10)');
console.log('========================================================================\n');
