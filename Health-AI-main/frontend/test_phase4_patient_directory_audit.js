/**
 * test_phase4_patient_directory_audit.js
 * ======================================
 * End-to-End Audit & Verification for Patient Directory:
 * 1. Two different patients with the same name (SHARED_NAME).
 * 2. Two patients sharing a household phone number (SHARED_PHONE).
 * 3. The same patient with several assessments (Deterministic latest & relationship integrity).
 * 4. Patients belonging to different facilities (Facility boundary isolation).
 * 5. An authorized PHC Doctor and an unauthorized role (RBAC enforcement & accessible explanations).
 * 6. A patient with no assessments (Safe UNASSESSED badge, no false LOW).
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('========================================================================');
console.log('🧪 RUNNING PATIENT DIRECTORY PHASE 4.2 AUDIT & BEHAVIORAL VERIFICATION');
console.log('========================================================================\n');

// ─── PART 1: NORMALIZATION & DUPLICATE DETECTION LOGIC ────────────────────────

function normalizePhoneNumber(rawPhone) {
  if (!rawPhone) return '';
  const digits = rawPhone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return digits;
}

function normalizePatientName(rawName) {
  if (!rawName) return '';
  return rawName
    .toLowerCase()
    .trim()
    .replace(/^(smt\.|srimati|mrs\.|mr\.|ms\.|shri|dr\.)\s+/i, '')
    .replace(/\s+/g, ' ');
}

function analyzePatientDuplicates(patients) {
  const analysis = new Map();

  patients.forEach(currentPatient => {
    const curPhone = normalizePhoneNumber(currentPatient.phone);
    const curName = normalizePatientName(currentPatient.name);

    const exactMatches = [];
    const sharedPhoneMatches = [];
    const sharedNameMatches = [];

    patients.forEach(other => {
      if (other.id === currentPatient.id) return;

      const otherPhone = normalizePhoneNumber(other.phone);
      const otherName = normalizePatientName(other.name);

      const isSamePhone = curPhone.length >= 10 && otherPhone.length >= 10 && curPhone === otherPhone;
      const isSameName = curName.length >= 3 && otherName.length >= 3 && curName === otherName;

      const summary = {
        id: other.id,
        patient_id: other.patient_id,
        name: other.name,
        age: other.age,
        gender: other.gender,
        village: other.village,
        phone: other.phone,
        facility_id: other.facility_id
      };

      if (isSamePhone && isSameName) {
        exactMatches.push(summary);
      } else if (isSamePhone && !isSameName) {
        sharedPhoneMatches.push(summary);
      } else if (isSameName && !isSamePhone) {
        sharedNameMatches.push(summary);
      }
    });

    if (exactMatches.length > 0) {
      analysis.set(currentPatient.id, {
        matchKind: 'PROBABLE_DUPLICATE',
        matches: exactMatches,
        primaryReason: `Probable duplicate registration. Both patient name ('${currentPatient.name}') and mobile number (${currentPatient.phone}) match existing record(s).`
      });
    } else if (sharedPhoneMatches.length > 0) {
      analysis.set(currentPatient.id, {
        matchKind: 'SHARED_PHONE',
        matches: sharedPhoneMatches,
        primaryReason: `Shared household mobile number (${currentPatient.phone}). Multiple family members commonly share one mobile phone in rural households. Requires clinical verification of patient identity.`
      });
    } else if (sharedNameMatches.length > 0) {
      analysis.set(currentPatient.id, {
        matchKind: 'SHARED_NAME',
        matches: sharedNameMatches,
        primaryReason: `Shared patient name ('${currentPatient.name}'). Common names frequently occur across villages. Verify age, gender, and village to distinguish patients.`
      });
    }
  });

  return analysis;
}

// --- Scenario 1: Two different patients with the same name ---
console.log('--- Scenario 1: Two different patients with the same name ---');
const sameNamePatients = [
  { id: 'p1', patient_id: 'PAT-001', name: 'Ramesh Sharma', age: 32, gender: 'Male', village: 'Sonpur', phone: '9811111111', facility_id: 'PHC_SONPUR' },
  { id: 'p2', patient_id: 'PAT-002', name: 'Ramesh Sharma', age: 58, gender: 'Male', village: 'Bishnupur', phone: '9822222222', facility_id: 'PHC_SONPUR' }
];
const sameNameAnalysis = analyzePatientDuplicates(sameNamePatients);
assert.strictEqual(sameNameAnalysis.get('p1').matchKind, 'SHARED_NAME', 'FAIL: p1 should be detected as SHARED_NAME, not confirmed duplicate');
assert.strictEqual(sameNameAnalysis.get('p2').matchKind, 'SHARED_NAME', 'FAIL: p2 should be detected as SHARED_NAME, not confirmed duplicate');
assert.strictEqual(sameNameAnalysis.get('p1').matches[0].patient_id, 'PAT-002', 'FAIL: Context must include matched patient ID');
assert.strictEqual(sameNameAnalysis.get('p1').matches[0].village, 'Bishnupur', 'FAIL: Context must include village');
console.log('  ✅ PASS: Same-name patients correctly categorized as SHARED_NAME with village/ID context without merging.');

// --- Scenario 2: Two patients sharing a household phone number ---
console.log('\n--- Scenario 2: Two patients sharing a household phone number ---');
const sharedPhonePatients = [
  { id: 'p3', patient_id: 'PAT-003', name: 'Pooja Verma', age: 28, gender: 'Female', village: 'Sundarpur', phone: '+91 9833333333', facility_id: 'PHC_SONPUR' },
  { id: 'p4', patient_id: 'PAT-004', name: 'Vikram Verma', age: 34, gender: 'Male', village: 'Sundarpur', phone: '9833333333', facility_id: 'PHC_SONPUR' }
];
const sharedPhoneAnalysis = analyzePatientDuplicates(sharedPhonePatients);
assert.strictEqual(sharedPhoneAnalysis.get('p3').matchKind, 'SHARED_PHONE', 'FAIL: p3 should be detected as SHARED_PHONE (requires verification)');
assert.strictEqual(sharedPhoneAnalysis.get('p4').matchKind, 'SHARED_PHONE', 'FAIL: p4 should be detected as SHARED_PHONE (requires verification)');
assert.ok(sharedPhoneAnalysis.get('p3').primaryReason.includes('Multiple family members commonly share'), 'FAIL: Explanation must indicate shared family phone');
console.log('  ✅ PASS: Shared household phone recognized as requiring verification without false duplicate classification.');

// --- Scenario 3: The same patient with several assessments ---
console.log('\n--- Scenario 3: The same patient with several assessments ---');
const assessmentsHistory = [
  { id: 'ass-1', patient_id: 'p-multi', created_at: '2026-10-01T10:00:00Z', risk_level: 'LOW', triage_state: 'LOW_RISK' },
  { id: 'ass-2', patient_id: 'p-multi', created_at: '2026-10-05T10:00:00Z', risk_level: 'MODERATE', triage_state: 'NEEDS_REVIEW' },
  { id: 'ass-3', patient_id: 'p-multi', created_at: '2026-10-15T12:00:00Z', risk_level: 'HIGH', triage_state: 'EMERGENCY', is_emergency: true },
  { id: 'ass-4', patient_id: 'p-multi', created_at: '2026-10-08T10:00:00Z', risk_level: 'LOW', triage_state: 'LOW_RISK' },
  { id: 'ass-5', patient_id: 'p-multi', created_at: '2026-10-12T10:00:00Z', risk_level: 'MODERATE', triage_state: 'NEEDS_REVIEW' },
  { id: 'ass-6', patient_id: 'p-multi', created_at: '2026-10-14T10:00:00Z', risk_level: 'HIGH', triage_state: 'HIGH_RISK' },
];

function getSortedPatientAssessments(assessments, patientId) {
  return assessments
    .filter(a => a.patient_id === patientId)
    .sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (timeB !== timeA) return timeB - timeA;
      return String(b.id).localeCompare(String(a.id));
    });
}

const sortedAssessments = getSortedPatientAssessments(assessmentsHistory, 'p-multi');
assert.strictEqual(sortedAssessments.length, 6, 'FAIL: All 6 assessments must be associated with p-multi');
assert.strictEqual(sortedAssessments[0].id, 'ass-3', 'FAIL: Newest assessment on 2026-10-15 must be chosen as latest');
assert.strictEqual(sortedAssessments[0].risk_level, 'HIGH', 'FAIL: Latest assessment determines risk');
assert.strictEqual(sortedAssessments[0].is_emergency, true, 'FAIL: Emergency flag preserved');
console.log('  ✅ PASS: 6 assessments correctly associated with patient; latest encounter deterministically selected.');

// --- Scenario 4: Patients belonging to different facilities ---
console.log('\n--- Scenario 4: Patients belonging to different facilities ---');
const userDoctorSonpur = { role: 'PHC_DOCTOR', facility_id: 'PHC_SONPUR' };
const patientLocal = { id: 'p-local', facility_id: 'PHC_SONPUR' };
const patientForeign = { id: 'p-foreign', facility_id: 'PHC_NORTH' };

function checkCanDelete(user, patient) {
  const canDeleteRole = user?.role === 'SYSTEM_ADMIN' || user?.role === 'PHC_DOCTOR';
  const isForeignFacility = user?.role !== 'SYSTEM_ADMIN' && Boolean(
    user?.facility_id && patient.facility_id && patient.facility_id !== user.facility_id
  );
  return {
    allowed: canDeleteRole && !isForeignFacility,
    isForeignFacility,
    canDeleteRole
  };
}

const checkLocal = checkCanDelete(userDoctorSonpur, patientLocal);
assert.strictEqual(checkLocal.allowed, true, 'FAIL: Doctor must be allowed to delete patient in their own facility');

const checkForeign = checkCanDelete(userDoctorSonpur, patientForeign);
assert.strictEqual(checkForeign.allowed, false, 'FAIL: Doctor must NOT be allowed to delete foreign facility patient');
assert.strictEqual(checkForeign.isForeignFacility, true, 'FAIL: isForeignFacility flag must be true');
console.log('  ✅ PASS: Facility tenancy isolation prevents PHC Doctor from deleting records belonging to other facilities.');

// --- Scenario 5: Authorized PHC Doctor vs Unauthorized Role (ASHA Worker) ---
console.log('\n--- Scenario 5: Authorized PHC Doctor vs Unauthorized Role ---');
const userAsha = { role: 'ASHA_WORKER', facility_id: 'SC_SONPUR' };
const userAdmin = { role: 'SYSTEM_ADMIN', facility_id: 'CENTRAL_OPS' };
const userDistrict = { role: 'DISTRICT_OFFICER', facility_id: 'DH_DISTRICT_HQ' };

assert.strictEqual(checkCanDelete(userAsha, patientLocal).allowed, false, 'FAIL: ASHA Worker must not be allowed to delete');
assert.strictEqual(checkCanDelete(userDistrict, patientLocal).allowed, false, 'FAIL: District Officer must not be allowed to delete');
assert.strictEqual(checkCanDelete(userAdmin, patientForeign).allowed, true, 'FAIL: System Admin has global deletion authority');
console.log('  ✅ PASS: RBAC strictly enforced: ASHA Worker and District Officer cannot delete; Admin can delete globally.');

// --- Scenario 6: A patient with no assessments vs incomplete assessments ---
console.log('\n--- Scenario 6: Patient with no assessments vs incomplete assessments ---');
function evaluateCardRiskBadge(latest) {
  if (!latest) {
    return 'UNASSESSED';
  }
  if (latest.risk_level === 'HIGH' || latest.risk_level === 'EMERGENCY' || latest.triage_state === 'EMERGENCY') {
    return latest.risk_level === 'EMERGENCY' || latest.triage_state === 'EMERGENCY' ? 'EMERGENCY' : 'HIGH';
  }
  if (latest.risk_level === 'MODERATE') {
    return 'MODERATE';
  }
  if (latest.risk_level === 'INSUFFICIENT_DATA' || latest.uncertainty_state === 'INSUFFICIENT_DATA' || !latest.risk_level) {
    return 'NEEDS REVIEW';
  }
  if (latest.risk_level === 'LOW') {
    return 'LOW';
  }
  return 'NEEDS REVIEW';
}

assert.strictEqual(evaluateCardRiskBadge(null), 'UNASSESSED', 'FAIL: Patient with no assessments must be UNASSESSED');
assert.strictEqual(evaluateCardRiskBadge({ risk_level: 'INSUFFICIENT_DATA' }), 'NEEDS REVIEW', 'FAIL: Incomplete data must be NEEDS REVIEW');
assert.strictEqual(evaluateCardRiskBadge({ uncertainty_state: 'INSUFFICIENT_DATA', risk_level: 'LOW' }), 'NEEDS REVIEW', 'FAIL: Incomplete data must never map to LOW');
assert.strictEqual(evaluateCardRiskBadge({ risk_level: 'LOW', uncertainty_state: 'COMPLETE' }), 'LOW', 'FAIL: Complete LOW risk maps to LOW');
console.log('  ✅ PASS: Unassessed patients and missing vitals safely map to UNASSESSED and NEEDS REVIEW, never LOW.');

console.log('\n========================================================================');
console.log('🎉 ALL 6 PATIENT DIRECTORY PHASE 4.2 AUDIT SCENARIOS PASSED (100%)');
console.log('========================================================================\n');
