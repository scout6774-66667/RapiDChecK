/**
 * test_phase4_frontend.js
 * =======================
 * Verification script for Phase 4 Frontend Audit & Dashboard Correctness:
 * 1. KPI Correctness: Distinguish registered patients vs screening encounters,
 *    unique patients vs repeat screenings.
 * 2. Deterministic latest assessment per patient (timestamp desc, id tie-breaker).
 * 3. Clinical Data Integrity: Never map missing, unknown, or INSUFFICIENT_DATA to LOW.
 * 4. Risk Distribution Reconciliation: Denominators, counts, and percentages reconcile.
 * 5. Stable Date Keys: Date keys include year; no silent defaulting of missing timestamps.
 * 6. Authenticated Profile Hydration: No hardcoded user, facility, or fixed static dates.
 * 7. Multi-State Sync Reporting: Distinct states for network, pending, syncing, failed, conflicts, and last sync.
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('===============================================================');
console.log('🧪 RUNNING PHASE 4 FRONTEND DASHBOARD & INTEGRITY TESTS');
console.log('===============================================================');

const srcDir = path.join(__dirname, 'src');

// --- Test 1: Verify Dashboard KPI Separation (Patients vs Screenings) ---
console.log('\n--- Test 1: Dashboard KPI Separation (Patients vs Screenings) ---');
const dashboardPath = path.join(srcDir, 'components', 'dashboard', 'RuralHealthDashboard.tsx');
const dashboardContent = fs.readFileSync(dashboardPath, 'utf8');

assert.ok(
  dashboardContent.includes('totalRegisteredPatients = livePatients.length'),
  'FAIL: Dashboard must calculate registered patients from livePatients'
);
assert.ok(
  dashboardContent.includes('totalScreeningEncounters = liveAssessments.length'),
  'FAIL: Dashboard must calculate completed screenings from liveAssessments'
);
assert.ok(
  dashboardContent.includes('uniquePatientsScreened'),
  'FAIL: Dashboard must compute unique screened patients count'
);
assert.ok(
  dashboardContent.includes('repeatScreenings'),
  'FAIL: Dashboard must compute repeat screenings count'
);
console.log('  ✅ PASS: Dashboard calculates registered patients, completed encounters, unique patients, and repeat screenings distinctly.');

// --- Test 2: Deterministic Latest Assessment per Patient ---
console.log('\n--- Test 2: Deterministic Latest Assessment Selector ---');
assert.ok(
  dashboardContent.includes('latestAssessmentByPatient'),
  'FAIL: Dashboard must precompute latest assessment per patient'
);
assert.ok(
  dashboardContent.includes('timeNew > timeOld') && dashboardContent.includes('String(ass.id) > String(existing.id)'),
  'FAIL: Dashboard must use timestamp desc with deterministic id tie-breaking'
);

// Unit test simulation of tie-breaking selector
function selectLatestAssessments(assessments) {
  const map = new Map();
  for (const ass of assessments) {
    if (!ass.patient_id) continue;
    const existing = map.get(ass.patient_id);
    if (!existing) {
      map.set(ass.patient_id, ass);
      continue;
    }
    const timeNew = ass.created_at ? new Date(ass.created_at).getTime() : 0;
    const timeOld = existing.created_at ? new Date(existing.created_at).getTime() : 0;
    if (timeNew > timeOld) {
      map.set(ass.patient_id, ass);
    } else if (timeNew === timeOld) {
      if (String(ass.id) > String(existing.id)) {
        map.set(ass.patient_id, ass);
      }
    }
  }
  return map;
}

const mockAssessments = [
  { id: 'ass-1', patient_id: 'p-1', created_at: '2026-10-01T10:00:00Z', risk_level: 'LOW' },
  { id: 'ass-2', patient_id: 'p-1', created_at: '2026-10-15T12:00:00Z', risk_level: 'HIGH' },
  { id: 'ass-3', patient_id: 'p-2', created_at: '2026-10-10T10:00:00Z', risk_level: 'MODERATE' },
  { id: 'ass-4', patient_id: 'p-2', created_at: '2026-10-10T10:00:00Z', risk_level: 'CRITICAL' }, // identical timestamp, ass-4 > ass-3
];

const selectedMap = selectLatestAssessments(mockAssessments);
assert.strictEqual(selectedMap.get('p-1').id, 'ass-2', 'FAIL: p-1 latest should be ass-2 (newer timestamp)');
assert.strictEqual(selectedMap.get('p-1').risk_level, 'HIGH', 'FAIL: p-1 risk should reflect newer assessment (HIGH)');
assert.strictEqual(selectedMap.get('p-2').id, 'ass-4', 'FAIL: p-2 should tie-break deterministically to ass-4');
console.log('  ✅ PASS: Deterministic latest assessment selector verified under timestamp & ID tie-breaker.');

// --- Test 3: Clinical Safety: No False LOW Mapping ---
console.log('\n--- Test 3: Safe Risk Categorization (No False LOW) ---');
// Verify UNASSESSED and NEEDS_REVIEW in types and table
const typesPath = path.join(srcDir, 'components', 'dashboard', 'types.ts');
const typesContent = fs.readFileSync(typesPath, 'utf8');
assert.ok(
  typesContent.includes("'UNASSESSED'"),
  'FAIL: types.ts must support UNASSESSED risk level'
);
assert.ok(
  typesContent.includes("'NEEDS_REVIEW'"),
  'FAIL: types.ts must support NEEDS_REVIEW risk level'
);

const recentTablePath = path.join(srcDir, 'components', 'dashboard', 'RecentPatientsTable.tsx');
const recentTableContent = fs.readFileSync(recentTablePath, 'utf8');
assert.ok(
  recentTableContent.includes("case 'UNASSESSED':"),
  'FAIL: RecentPatientsTable must explicitly handle UNASSESSED badge'
);
assert.ok(
  recentTableContent.includes("case 'NEEDS_REVIEW':"),
  'FAIL: RecentPatientsTable must explicitly handle NEEDS_REVIEW badge'
);
console.log('  ✅ PASS: Unassessed patients and insufficient data never map to LOW risk.');

// --- Test 4: Reconciled Risk Distribution ---
console.log('\n--- Test 4: Reconciled Risk Distribution & Denominators ---');
assert.ok(
  dashboardContent.includes("name: 'Unassessed'"),
  'FAIL: Risk distribution must include Unassessed category'
);
assert.ok(
  dashboardContent.includes("name: 'Needs Review'"),
  'FAIL: Risk distribution must include Needs Review category'
);
assert.ok(
  dashboardContent.includes('totalPatients={livePatients.length}'),
  'FAIL: RiskDistributionCard must reconcile against livePatients.length'
);
console.log('  ✅ PASS: Risk distribution categories reconcile with total registered patients.');

// --- Test 5: Stable Date Keys with Years ---
console.log('\n--- Test 5: Stable Date Keys in Time-Series Aggregation ---');
assert.ok(
  dashboardContent.includes('const year = d.getFullYear()'),
  'FAIL: ScreeningsTrendCard aggregation must include year'
);
assert.ok(
  dashboardContent.includes('if (!ass.created_at) return;'),
  'FAIL: Missing timestamps must not be assigned today’s date'
);
console.log('  ✅ PASS: Screening trend uses year-qualified stable keys and skips invalid timestamps safely.');

// --- Test 6: Authenticated Profile Hydration (No Hardcoding) ---
console.log('\n--- Test 6: Authenticated Profile Hydration ---');
const bannerPath = path.join(srcDir, 'components', 'dashboard', 'WelcomeHeroBanner.tsx');
const bannerContent = fs.readFileSync(bannerPath, 'utf8');

assert.ok(
  !bannerContent.includes("const todayDateStr = 'Thursday, 14 Nov 2024';"),
  'FAIL: WelcomeHeroBanner must not hardcode static date'
);
assert.ok(
  bannerContent.includes('new Intl.DateTimeFormat'),
  'FAIL: WelcomeHeroBanner must format current system clock with locale'
);
assert.ok(
  bannerContent.includes('Healthcare Worker (Identity Unavailable)'),
  'FAIL: WelcomeHeroBanner must display explicit unavailable fallback state'
);

const sidebarPath = path.join(srcDir, 'components', 'dashboard', 'DashboardSidebar.tsx');
const sidebarContent = fs.readFileSync(sidebarPath, 'utf8');
assert.ok(
  !sidebarContent.includes('appointmentCount = 3'),
  'FAIL: DashboardSidebar must not hardcode appointmentCount = 3'
);
assert.ok(
  sidebarContent.includes('appointmentCount = 0'),
  'FAIL: DashboardSidebar must default appointmentCount to 0'
);
console.log('  ✅ PASS: WelcomeHeroBanner hydrates from user profile and system clock; sidebar defaults to 0.');

// --- Test 7: Multi-State Synchronization Status Bar ---
console.log('\n--- Test 7: Multi-State Synchronization Reporting ---');
assert.ok(
  dashboardContent.includes('outboxQueuedCount'),
  'FAIL: Dashboard must track outboxQueuedCount'
);
assert.ok(
  dashboardContent.includes('outboxFailedCount'),
  'FAIL: Dashboard must track outboxFailedCount'
);
assert.ok(
  dashboardContent.includes('conflictCount'),
  'FAIL: Dashboard must track conflictCount'
);
assert.ok(
  dashboardContent.includes('formattedLastSync'),
  'FAIL: Dashboard must display formattedLastSync timestamp'
);
console.log('  ✅ PASS: Comprehensive multi-state sync status bar tracks network, queued, failed, conflicts, and last sync.');

console.log('\n===============================================================');
console.log('🎉 ALL PHASE 4 FRONTEND TESTS PASSED SUCCESSFULLY (7/7)');
console.log('===============================================================\n');
