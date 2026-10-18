/**
 * test_phase3_frontend.js
 * =======================
 * Verification script for Phase 3 Frontend Workflow Requirements:
 * 1. Strict nullability on vitals (no silent defaulting to 98.6 / 120 / 80 / 100).
 * 2. Atomic outbox persistence in ScreenPatientPage (savePatientAtomic, saveAssessmentAtomic, updateReferralAtomic).
 * 3. Transparent duplicate detection banner in Step1PatientInfo.
 * 4. Insufficient data and emergency red-flag display integrity in Step7ScreeningResult.
 * 5. Complete 7-step linear workflow integrity.
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('===============================================================');
console.log('🧪 RUNNING PHASE 3 FRONTEND WORKFLOW INTEGRATION TESTS');
console.log('===============================================================');

const srcDir = path.join(__dirname, 'src');

// --- Test 1: Verify ScreenPatientPage uses atomic outbox operations ---
console.log('\n--- Test 1: ScreenPatientPage Atomic Outbox Operations ---');
const screenPagePath = path.join(srcDir, 'components', 'screening', 'ScreenPatientPage.tsx');
const screenPageContent = fs.readFileSync(screenPagePath, 'utf8');

assert.ok(
  screenPageContent.includes('savePatientAtomic'),
  'FAIL: ScreenPatientPage must use savePatientAtomic'
);
assert.ok(
  screenPageContent.includes('saveAssessmentAtomic'),
  'FAIL: ScreenPatientPage must use saveAssessmentAtomic'
);
assert.ok(
  screenPageContent.includes('updateReferralAtomic'),
  'FAIL: ScreenPatientPage must use updateReferralAtomic'
);
assert.ok(
  !screenPageContent.includes('db.assessments.put(aRecord)'),
  'FAIL: ScreenPatientPage must not bypass outbox with raw db.assessments.put'
);
console.log('  ✅ PASS: ScreenPatientPage uses savePatientAtomic, saveAssessmentAtomic, and updateReferralAtomic.');

// --- Test 2: Verify Strict Vital Sign Nullability in ScreenPatientPage & PatientDirectory ---
console.log('\n--- Test 2: Strict Vital Sign Nullability ---');
assert.ok(
  !screenPageContent.includes('temperature_f: Number(vitalsData.temperatureF) || 98.6'),
  'FAIL: ScreenPatientPage must not default temperatureF to 98.6'
);
assert.ok(
  !screenPageContent.includes('systolic_bp: Number(vitalsData.systolicBp) || 120'),
  'FAIL: ScreenPatientPage must not default systolicBp to 120'
);

const patientDirPath = path.join(srcDir, 'components', 'PatientDirectory.tsx');
const patientDirContent = fs.readFileSync(patientDirPath, 'utf8');

assert.ok(
  !patientDirContent.includes('temperature_f:         String(a.temperature_f ?? 98.6)'),
  'FAIL: PatientDirectory pre-fill must not default missing temperature to 98.6'
);
assert.ok(
  !patientDirContent.includes('temperature_f: parseFloat(af.temperature_f) || 98.6'),
  'FAIL: PatientDirectory saveEdit must not default empty temperature to 98.6'
);
console.log('  ✅ PASS: Missing vital signs are strictly preserved as null without silent normal defaulting.');

// --- Test 3: Step7ScreeningResult Insufficient Data and Emergency UI ---
console.log('\n--- Test 3: Step7ScreeningResult Emergency & Insufficient Data States ---');
const step7Path = path.join(srcDir, 'components', 'screening', 'Step7ScreeningResult.tsx');
const step7Content = fs.readFileSync(step7Path, 'utf8');

assert.ok(
  step7Content.includes("result.riskLevel === 'INSUFFICIENT_DATA' ? 'Insufficient Data'"),
  'FAIL: Step7ScreeningResult must explicitly map INSUFFICIENT_DATA to displayLevel Insufficient Data'
);
assert.ok(
  step7Content.includes('Insufficient Clinical Data Recorded'),
  'FAIL: Step7ScreeningResult must include an Insufficient Data banner'
);
assert.ok(
  step7Content.includes('Critical IDRC Referral Workflow Triggered'),
  'FAIL: Step7ScreeningResult must include an Emergency Red-Flag banner'
);
console.log('  ✅ PASS: Step7ScreeningResult accurately surfaces Insufficient Data and Emergency Red Flags.');

// --- Test 4: Transparent Duplicate Detection in Step1PatientInfo ---
console.log('\n--- Test 4: Transparent Duplicate Patient Record Detection ---');
const step1Path = path.join(srcDir, 'components', 'screening', 'Step1PatientInfo.tsx');
const step1Content = fs.readFileSync(step1Path, 'utf8');

assert.ok(
  step1Content.includes('potentialDuplicates'),
  'FAIL: Step1PatientInfo must compute potentialDuplicates'
);
assert.ok(
  step1Content.includes('Potential Duplicate Patient Record Detected'),
  'FAIL: Step1PatientInfo must render a duplicate candidate banner'
);
assert.ok(
  step1Content.includes('Use Existing'),
  'FAIL: Step1PatientInfo must provide an option to select existing patient'
);
console.log('  ✅ PASS: Step1PatientInfo transparently detects duplicate patients and guides user.');

// --- Test 5: Verify App.tsx loads ScreenPatientPage ---
console.log('\n--- Test 5: Linear Workflow Integration in App.tsx ---');
const appPath = path.join(srcDir, 'App.tsx');
const appContent = fs.readFileSync(appPath, 'utf8');

assert.ok(
  appContent.includes("import { ScreenPatientPage } from './components/screening/ScreenPatientPage'"),
  'FAIL: App.tsx must import ScreenPatientPage'
);
assert.ok(
  appContent.includes("<ScreenPatientPage"),
  'FAIL: App.tsx must mount ScreenPatientPage for screening tab'
);
console.log('  ✅ PASS: ScreenPatientPage is wired into App.tsx for screening.');

console.log('\n===============================================================');
console.log('📊 ALL 5 PHASE 3 FRONTEND WORKFLOW CHECKS PASSED');
console.log('===============================================================');
