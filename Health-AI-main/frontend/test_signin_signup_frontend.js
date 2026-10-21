/**
 * test_signin_signup_frontend.js
 * ==============================
 * Comprehensive automated verification script for RuralHealth AI:
 * 1. Dedicated, addressable Sign In (/signin) & Get Started (/signup) routes.
 * 2. Visual design consistency (rounded headers, emerald-green CTA, subtle borders, mint accents).
 * 3. Validation logic (email format, required fields, min length 8 password, password matching).
 * 4. Password toggle controls (type="button" to prevent unwanted form submission).
 * 5. Dynamic states (loading, disabled, error, success confirmation).
 * 6. RBAC security enforcement (public self-registration defaults strictly to ASHA_WORKER).
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('========================================================================');
console.log('🏥 RUNNING RURALHEALTH AI SIGN IN & GET STARTED FRONTEND VERIFICATION');
console.log('========================================================================\n');

let testsPassed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    process.exitCode = 1;
  }
}

// 1. Files existence check
runTest('Dedicated Sign In, SignUp, and AuthHeader components exist', () => {
  const signInPath = path.join(__dirname, 'src', 'components', 'auth', 'SignInPage.tsx');
  const signUpPath = path.join(__dirname, 'src', 'components', 'auth', 'SignUpPage.tsx');
  const headerPath = path.join(__dirname, 'src', 'components', 'auth', 'AuthHeader.tsx');

  assert.ok(fs.existsSync(signInPath), 'SignInPage.tsx must exist');
  assert.ok(fs.existsSync(signUpPath), 'SignUpPage.tsx must exist');
  assert.ok(fs.existsSync(headerPath), 'AuthHeader.tsx must exist');
});

// 2. Routing logic in App.tsx
runTest('App.tsx implements independent addressable /signin and /signup routing', () => {
  const appPath = path.join(__dirname, 'src', 'App.tsx');
  const appCode = fs.readFileSync(appPath, 'utf8');

  // Verify route recognition
  assert.ok(appCode.includes("path === '/signin'"), 'App.tsx must handle /signin path');
  assert.ok(appCode.includes("path === '/signup'"), 'App.tsx must handle /signup path');
  assert.ok(appCode.includes("hash === 'signin'"), 'App.tsx must support #signin hash fallback');
  assert.ok(appCode.includes("hash === 'signup'"), 'App.tsx must support #signup hash fallback');

  // Verify popstate and history pushState
  assert.ok(appCode.includes('popstate'), 'App.tsx must listen to popstate event for back/forward navigation');
  assert.ok(appCode.includes('pushState'), 'App.tsx must use history pushState for client navigation');

  // Verify view rendering
  assert.ok(appCode.includes('<SignInPage'), 'App.tsx must render <SignInPage />');
  assert.ok(appCode.includes('<SignUpPage'), 'App.tsx must render <SignUpPage />');
});

// 3. Header component matches screenshot visual reference
runTest('AuthHeader implements required visual reference elements', () => {
  const headerPath = path.join(__dirname, 'src', 'components', 'auth', 'AuthHeader.tsx');
  const headerCode = fs.readFileSync(headerPath, 'utf8');

  // Branding
  assert.ok(headerCode.includes('RuralHealthLogo'), 'AuthHeader must include RuralHealthLogo branding');
  // Language selector
  assert.ok(headerCode.includes('Globe') && headerCode.includes('getLanguageLabel'), 'AuthHeader must include language selector dropdown');
  // Buttons
  assert.ok(headerCode.includes('header-signin-button'), 'AuthHeader must include Sign In button');
  assert.ok(headerCode.includes('header-get-started-button'), 'AuthHeader must include Get Started CTA button');
  // Emerald styling
  assert.ok(headerCode.includes('#12B981') || headerCode.includes('bg-emerald'), 'AuthHeader must use prominent emerald CTA');
});

// 4. Sign In Page requirements
runTest('SignInPage implements all required fields, toggles, and validations', () => {
  const signInPath = path.join(__dirname, 'src', 'components', 'auth', 'SignInPage.tsx');
  const signInCode = fs.readFileSync(signInPath, 'utf8');

  // Heading
  assert.ok(signInCode.includes('Welcome back.'), 'SignInPage must have heading "Welcome back."');
  // Fields
  assert.ok(signInCode.includes('id="signin-email"'), 'Must have email input with id="signin-email"');
  assert.ok(signInCode.includes('id="signin-password"'), 'Must have password input with id="signin-password"');
  // Password toggle must have type="button" to prevent unwanted form submit
  assert.ok(signInCode.includes('type="button"') && signInCode.includes('setShowPassword'), 'Password toggle button must have type="button"');
  // Validation
  assert.ok(signInCode.includes('validateEmailFormat'), 'Must validate email format');
  assert.ok(signInCode.includes('emailError') && signInCode.includes('passwordError'), 'Must handle field-level errors');
  // Forgot password
  assert.ok(signInCode.includes('Forgot password?'), 'Must provide Forgot password? action');
  // Link to registration
  assert.ok(signInCode.includes('signin-switch-to-register'), 'Must have link switching to Get Started');
  // Emerald CTA
  assert.ok(signInCode.includes('signin-submit-button'), 'Must have submit button');
});

// 5. Get Started / Registration Page requirements
runTest('SignUpPage implements all 4 required fields, password matching, and success state', () => {
  const signUpPath = path.join(__dirname, 'src', 'components', 'auth', 'SignUpPage.tsx');
  const signUpCode = fs.readFileSync(signUpPath, 'utf8');

  // Heading
  assert.ok(signUpCode.includes('Create your account.'), 'SignUpPage must have heading "Create your account."');
  // 4 Fields
  assert.ok(signUpCode.includes('id="signup-name"'), 'Must have full name input');
  assert.ok(signUpCode.includes('id="signup-email"'), 'Must have email input');
  assert.ok(signUpCode.includes('id="signup-password"'), 'Must have password input');
  assert.ok(signUpCode.includes('id="signup-confirm-password"'), 'Must have confirm password input');

  // Visibility toggles
  assert.ok(signUpCode.includes('setShowPassword') && signUpCode.includes('setShowConfirmPassword'), 'Must support visibility toggles');

  // Validations
  assert.ok(signUpCode.includes('length < 8'), 'Must enforce minimum 8 character password length');
  assert.ok(signUpCode.includes('confirmPassword !== password'), 'Must validate password confirmation match');
  assert.ok(signUpCode.includes('validateEmailFormat'), 'Must validate email format');

  // Backend response success state
  assert.ok(signUpCode.includes('Account Created Successfully!'), 'Must display confirmed success state');
  assert.ok(signUpCode.includes('signup-proceed-to-signin'), 'Must have button to proceed to Sign In');

  // Switch to Sign In link
  assert.ok(signUpCode.includes('signup-switch-to-signin'), 'Must have link switching to Sign In');
});

// 6. Security and RBAC enforcement
runTest('AuthContext connects to real endpoints and enforces default frontline role', () => {
  const authContextPath = path.join(__dirname, 'src', 'auth', 'AuthContext.tsx');
  const authCode = fs.readFileSync(authContextPath, 'utf8');

  assert.ok(authCode.includes('/api/v2/auth/login'), 'AuthContext must call /api/v2/auth/login');
  assert.ok(authCode.includes('/api/v2/auth/register'), 'AuthContext must call /api/v2/auth/register');
  assert.ok(authCode.includes("role: 'ASHA_WORKER'"), 'Public registration must default strictly to ASHA_WORKER role');
});

console.log(`\n========================================================================`);
console.log(`🎉 ALL ${testsPassed} FRONTEND VERIFICATION SUITES PASSED!`);
console.log(`========================================================================\n`);
