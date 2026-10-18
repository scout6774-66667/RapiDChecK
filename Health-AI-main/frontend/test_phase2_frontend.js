/**
 * test_phase2_frontend.js
 * =======================
 * Verification script for Phase 2:
 * 1. Centralized API Config (no hardcoded localhost in frontend source files)
 * 2. Service Worker runtimeCaching (no /api/ generic caching)
 * 3. Homepage impact statements (no unsupported numbers)
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('===============================================================');
console.log('🧪 RUNNING PHASE 2 FRONTEND INTEGRATION & PRIVACY VERIFICATION');
console.log('===============================================================');

// --- Test 1: Service Worker runtimeCaching Check ---
console.log('\n--- Test 1: Verify Service Worker does not cache /api/ ---');
const viteConfigPath = path.join(__dirname, 'vite.config.ts');
const viteConfigContent = fs.readFileSync(viteConfigPath, 'utf8');

assert.ok(
  !viteConfigContent.includes("urlPattern: new RegExp('/api/')"),
  'FAIL: vite.config.ts must not contain generic /api/ runtimeCaching!'
);
assert.ok(
  !viteConfigContent.includes("cacheName: 'api-cache'"),
  'FAIL: vite.config.ts must not contain api-cache!'
);
console.log('  ✅ PASS: vite.config.ts has no /api/ runtimeCaching or api-cache.');

const swPath = path.join(__dirname, 'dist', 'sw.js');
if (fs.existsSync(swPath)) {
  const swContent = fs.readFileSync(swPath, 'utf8');
  assert.ok(!swContent.includes('api-cache'), 'FAIL: dist/sw.js must not contain api-cache');
  console.log('  ✅ PASS: dist/sw.js contains no api-cache registration.');
}

// --- Test 2: Audit Frontend Source Files for Hardcoded Localhost ---
console.log('\n--- Test 2: Audit Source Files for Hardcoded Localhost API calls ---');
const srcDir = path.join(__dirname, 'src');

function getFiles(dir, filter) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFiles(file, filter));
    } else if (filter(file)) {
      results.push(file);
    }
  });
  return results;
}

const tsxFiles = getFiles(srcDir, f => f.endsWith('.ts') || f.endsWith('.tsx'));
const forbiddenPatterns = [
  /fetch\(['"]http:\/\/127\.0\.0\.1:8000/i,
  /fetch\(['"]http:\/\/localhost:8000/i,
];

let hardcodedCount = 0;
for (const file of tsxFiles) {
  const content = fs.readFileSync(file, 'utf8');
  for (const pat of forbiddenPatterns) {
    if (pat.test(content)) {
      console.error(`  ❌ Found hardcoded URL match ${pat} in: ${path.relative(__dirname, file)}`);
      hardcodedCount++;
    }
  }
}
assert.strictEqual(hardcodedCount, 0, 'FAIL: Hardcoded localhost API calls found in frontend source files!');
console.log(`  ✅ PASS: All ${tsxFiles.length} source files checked; zero hardcoded localhost API calls found.`);

// --- Test 3: Homepage Impact Statement Truthfulness ---
console.log('\n--- Test 3: Homepage Impact Figures Replaced With Truthful Statements ---');
const translationsDir = path.join(srcDir, 'i18n', 'translations');
const langs = ['en.ts', 'hi.ts', 'bn.ts'];
const unsupportedNumbers = ['100+', '5,000+', '800+', '1,200+'];

for (const lang of langs) {
  const langPath = path.join(translationsDir, lang);
  const langContent = fs.readFileSync(langPath, 'utf8');
  for (const num of unsupportedNumbers) {
    assert.ok(
      !langContent.includes(`'${num}'`),
      `FAIL: Translation file ${lang} still contains unsupported impact number ${num}!`
    );
  }
  console.log(`  ✅ PASS: ${lang} contains no unsupported impact numbers.`);
}

console.log('\n===============================================================');
console.log('🎉 ALL PHASE 2 FRONTEND CHECKS PASSED');
console.log('===============================================================');
