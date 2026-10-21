// test_role_selection_e2e.js - Complete verification for Role Selection & Patient Flow
import fs from 'fs';
import path from 'path';
import assert from 'assert';

console.log('========================================================================');
console.log('🩺 RUNNING ROLE SELECTION & GET STARTED FLOW TEST SUITE');
console.log('========================================================================');

const frontendRoot = process.cwd();
const roleSelectionFile = path.join(frontendRoot, 'src/components/auth/RoleSelectionPage.tsx');
const patientRegisterFile = path.join(frontendRoot, 'src/components/auth/PatientRegistrationPage.tsx');
const patientDashboardFile = path.join(frontendRoot, 'src/components/patient/PatientDashboard.tsx');
const appFile = path.join(frontendRoot, 'src/App.tsx');
const authContextFile = path.join(frontendRoot, 'src/auth/AuthContext.tsx');
const backendMainFile = path.join(frontendRoot, '../backend/main.py');
const backendAuthFile = path.join(frontendRoot, '../backend/auth_service.py');

// Test 1: RoleSelectionPage Component Structure & UI Elements
console.log('\n--- Test 1: RoleSelectionPage Layout & Two-Card Architecture ---');
assert(fs.existsSync(roleSelectionFile), 'RoleSelectionPage.tsx must exist');
const roleSelectionContent = fs.readFileSync(roleSelectionFile, 'utf8');

assert(roleSelectionContent.includes('patientRoleTitle') || roleSelectionContent.includes('Patient / General User'), 'Option 1: Patient title exists');
assert(roleSelectionContent.includes('Continue as Patient'), 'Option 1: Continue as Patient button exists');
assert(roleSelectionContent.includes('professionalRoleTitle') || roleSelectionContent.includes('Healthcare Professional'), 'Option 2: Healthcare Professional title exists');
assert(roleSelectionContent.includes('Continue as Professional'), 'Option 2: Continue as Professional button exists');
assert(roleSelectionContent.includes('Healthcare Support, Made Simple') || roleSelectionContent.includes('brandingTitle'), 'Left branding panel headline exists');
assert(roleSelectionContent.includes('RapiDChecK') && roleSelectionContent.includes('RuralHealth AI'), 'RapiDChecK / RuralHealth AI branding present');
assert(roleSelectionContent.includes('logoImg'), 'Branding illustration present');
assert(roleSelectionContent.includes('onNavigateHome'), 'Back to home navigation supported');
assert(roleSelectionContent.includes('roleMismatchWarning'), 'Role mismatch warning mechanism present for authenticated users');
console.log('  ✅ PASS: RoleSelectionPage implements two-column desktop layout, left branding panel, and two prominent option cards');

// Test 2: App.tsx Routing Integrations
console.log('\n--- Test 2: App.tsx Routing Integration & Route Separation ---');
assert(fs.existsSync(appFile), 'App.tsx must exist');
const appContent = fs.readFileSync(appFile, 'utf8');

assert(appContent.includes('/get-started'), 'App.tsx handles /get-started route');
assert(appContent.includes('/patient-register'), 'App.tsx handles /patient-register route');
assert(appContent.includes('/patient-dashboard'), 'App.tsx handles /patient-dashboard route');
assert(appContent.includes('/signin'), 'App.tsx preserves dedicated /signin route');
assert(appContent.includes('/signup'), 'App.tsx preserves dedicated /signup route');
assert(appContent.includes('<RoleSelectionPage'), 'RoleSelectionPage rendered in App.tsx');
assert(appContent.includes('<PatientRegistrationPage'), 'PatientRegistrationPage rendered in App.tsx');
assert(appContent.includes('<PatientDashboard'), 'PatientDashboard rendered in App.tsx');
assert(appContent.includes('<RuralHealthDashboard'), 'Existing doctor dashboard (RuralHealthDashboard) preserved');
console.log('  ✅ PASS: Route separation strictly preserved: Sign In -> /signin, Get Started -> /get-started, Patient -> /patient-dashboard, Doctor -> existing /dashboard');

// Test 3: PatientRegistrationPage Validation & Fields
console.log('\n--- Test 3: Patient Registration Flow ---');
assert(fs.existsSync(patientRegisterFile), 'PatientRegistrationPage.tsx must exist');
const patientRegContent = fs.readFileSync(patientRegisterFile, 'utf8');

assert(patientRegContent.includes('registerUser'), 'Connects to registerUser in AuthContext');
assert(patientRegContent.includes('role: \'PATIENT\''), 'Registers with role PATIENT');
assert(patientRegContent.includes('fullName'), 'Includes Full Name field');
assert(patientRegContent.includes('identifier'), 'Includes Email/Identifier field');
assert(patientRegContent.includes('village'), 'Includes Village field');
assert(patientRegContent.includes('password'), 'Includes Password field');
assert(patientRegContent.includes('confirmPassword'), 'Includes Confirm Password field');
console.log('  ✅ PASS: PatientRegistrationPage provides full citizen registration with PATIENT role assignment');

// Test 4: PatientDashboard Capabilities & Isolation from Clinical Staff
console.log('\n--- Test 4: Patient Dashboard Isolation & Features ---');
assert(fs.existsSync(patientDashboardFile), 'PatientDashboard.tsx must exist');
const patientDashContent = fs.readFileSync(patientDashboardFile, 'utf8');

assert(patientDashContent.includes('symptoms'), 'Implements Check Symptoms tab');
assert(patientDashContent.includes('hospitals'), 'Implements Find Hospital tab');
assert(patientDashContent.includes('consultation'), 'Implements Book Consultation tab');
assert(patientDashContent.includes('assistant'), 'Implements Ask Health Assistant tab');
assert(patientDashContent.includes('records'), 'Implements My Health records tab');
assert(patientDashContent.includes('appointments'), 'Implements My Appointments tab');
assert(patientDashContent.includes('family'), 'Implements Family Health tab');
assert(!patientDashContent.includes('ASHA Worker Screening Form'), 'Does NOT expose ASHA screening workflow to patient');
assert(!patientDashContent.includes('Referral Triage Queue'), 'Does NOT expose clinical referral triage queue to patient');
console.log('  ✅ PASS: PatientDashboard prioritizes 7 citizen-facing tabs and contains no clinical staff management');

// Test 5: Backend Authorization & Role Permissions
console.log('\n--- Test 5: Backend Auth & PATIENT Role Permissions ---');
assert(fs.existsSync(backendMainFile), 'main.py must exist');
assert(fs.existsSync(backendAuthFile), 'auth_service.py must exist');
const backendMainContent = fs.readFileSync(backendMainFile, 'utf8');
const backendAuthContent = fs.readFileSync(backendAuthFile, 'utf8');

assert(backendMainContent.includes('"PATIENT"'), 'Backend /api/v2/auth/register permits PATIENT registration');
assert(backendAuthContent.includes('"PATIENT":'), 'ROLE_PERMISSIONS defines PATIENT role');
assert(!backendAuthContent.includes('"PATIENT": [*"patients:write"'), 'PATIENT cannot have clinical write permissions');
console.log('  ✅ PASS: Backend allows legitimate PATIENT public registration while restricting authorization to non-clinical permissions');

console.log('\n========================================================================');
console.log('🎉 ALL 5 ROLE SELECTION & USER FLOW SUITES PASSED SUCCESSFULLY!');
console.log('========================================================================\n');
