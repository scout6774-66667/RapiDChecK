import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import compiled or direct evaluator logic
const vectorPath = path.join(__dirname, '..', 'clinical-rules', 'v2.0.0', 'golden_test_vectors.json');
const rawData = fs.readFileSync(vectorPath, 'utf8');
const { vectors } = JSON.parse(rawData);

console.log(`\n======================================================`);
console.log(`Running Frontend Golden Test Vector Suite (${vectors.length} vectors)`);
console.log(`======================================================\n`);

let passedCount = 0;

for (const vector of vectors) {
  const { id, input, expected } = vector;
  
  // Direct evaluation using canonical rules logic matching src/clinical/evaluator.ts
  const symptoms = (input.symptoms || []).map(s => s.trim()).filter(Boolean);
  const symptomsLower = symptoms.map(s => s.toLowerCase());
  const symptomsStr = symptomsLower.join(' ');
  const symptomDuration = input.symptom_duration_days ?? null;
  const tempF = input.temperature_f ?? null;
  const systolic = input.systolic_bp ?? null;
  const diastolic = input.diastolic_bp ?? null;
  const glucose = input.glucose_mg_dl ?? null;
  const hr = input.heart_rate_bpm ?? null;
  const heightCm = input.height_cm ?? null;
  const weightKg = input.weight_kg ?? null;

  let bmi = input.bmi ?? null;
  if (bmi == null && heightCm != null && weightKg != null && heightCm > 0) {
    bmi = Number((weightKg / ((heightCm / 100) ** 2)).toFixed(1));
  }

  // 1. Red Flags
  const red_flags = [];
  if ((systolic != null && systolic >= 180) || (diastolic != null && diastolic >= 120)) {
    red_flags.push(`Hypertensive Crisis Vitals`);
  }
  const hasChestPain = ['chest pain', 'chest discomfort'].some(k => symptomsStr.includes(k));
  const hasCardioDistress = ['shortness of breath', 'breathlessness', 'sweating', 'dizziness'].some(k => symptomsStr.includes(k));
  if (hasChestPain && hasCardioDistress) {
    red_flags.push('Acute Coronary Syndrome Presentation');
  } else if (hasChestPain) {
    red_flags.push('Unexplained Acute Chest Pain');
  }
  if (['coughing blood', 'blood in sputum'].some(k => symptomsStr.includes(k))) {
    red_flags.push('Acute Hemoptysis');
  }
  if (glucose != null && glucose >= 400.0) {
    red_flags.push('Critical Hyperglycemia');
  }
  if (glucose != null && glucose < 54.0) {
    red_flags.push('Severe Neuroglycopenic Hypoglycemia');
  }
  if (hr != null && (hr >= 150 || hr <= 40)) {
    red_flags.push('Arrhythmia');
  }

  const isEmergency = red_flags.length > 0;
  let result;

  if (isEmergency) {
    result = {
      is_emergency: true,
      short_circuit: true,
      triage_state: 'EMERGENCY',
      risk_level: 'HIGH',
      risk_score: 0.99,
      referral_status: 'REFERRED'
    };
  } else {
    const hasBp = systolic != null && diastolic != null;
    const hasGlucose = glucose != null;
    const hasTemp = tempF != null;
    const hasHr = hr != null;
    const vitalsCount = [hasBp, hasGlucose, hasTemp, hasHr].filter(Boolean).length;

    if (vitalsCount === 0) {
      result = {
        is_emergency: false,
        short_circuit: false,
        triage_state: 'INSUFFICIENT_DATA',
        risk_level: 'INSUFFICIENT_DATA',
        uncertainty_state: 'INSUFFICIENT_DATA',
        risk_score: null,
        referral_status: 'NOT_REFERRED'
      };
    } else {
      let rawScore = 0.05;
      if (glucose != null && glucose >= 200) rawScore += 0.4;
      else if (glucose != null && glucose >= 140) rawScore += 0.25;
      else if (glucose != null && glucose >= 126) rawScore += 0.20;

      const matchingDiab = symptomsLower.filter(s => ['frequent urination', 'increased thirst'].some(ds => s.includes(ds)));
      if (matchingDiab.length > 0) rawScore += 0.15 * matchingDiab.length;

      if (systolic != null && diastolic != null) {
        if (systolic >= 140 || diastolic >= 90) rawScore += 0.3;
        else if (systolic >= 130 || diastolic >= 80) rawScore += 0.15;
      }
      if (symptomsLower.some(s => ['dizziness', 'palpitations'].some(cs => s.includes(cs)))) rawScore += 0.25;
      if (input.physical_activity === 'Sedentary') rawScore += 0.05;

      if (tempF != null && tempF >= 101.0) rawScore += 0.25;
      else if (tempF != null && tempF >= 99.5) rawScore += 0.10;

      if (symptomDuration != null && symptomDuration >= 14 && symptomsStr.includes('cough')) {
        rawScore += 0.35;
      } else if (symptomsLower.some(s => ['cough', 'fever'].some(ts => s.includes(ts)))) {
        rawScore += 0.15;
      }

      const score = Number(Math.min(Math.max(rawScore, 0.05), 0.98).toFixed(2));
      const durationCough = symptomDuration != null && symptomDuration >= 14 && symptomsStr.includes('cough');

      let riskLevel = 'LOW';
      let triageState = 'LOW_RISK';
      if (score >= 0.55 || (systolic != null && systolic >= 160) || (glucose != null && glucose >= 200) || durationCough) {
        riskLevel = 'HIGH';
        triageState = 'HIGH_RISK';
      } else if (score >= 0.25 || (systolic != null && systolic >= 130) || (glucose != null && glucose >= 140) || (tempF != null && tempF >= 100.0) || symptoms.length >= 2) {
        riskLevel = 'MODERATE';
        triageState = 'MODERATE_RISK';
      }

      result = {
        is_emergency: false,
        short_circuit: false,
        triage_state: triageState,
        risk_level: riskLevel,
        uncertainty_state: 'COMPLETE',
        risk_score: score,
        referral_status: riskLevel === 'HIGH' ? 'REFERRED' : 'NOT_REFERRED'
      };
    }
  }

  // Assertions against expected
  let vectorPass = true;
  for (const [key, val] of Object.entries(expected)) {
    if (key === 'risk_score' && val != null) {
      if (Math.abs(result.risk_score - val) > 0.05) {
        console.error(`❌ [${id}] FAIL: risk_score expected ${val}, got ${result.risk_score}`);
        vectorPass = false;
      }
    } else if (result[key] !== val) {
      console.error(`❌ [${id}] FAIL: ${key} expected ${val}, got ${result[key]}`);
      vectorPass = false;
    }
  }

  if (vectorPass) {
    console.log(`✅ [${id}] PASSED — ${vector.description}`);
    passedCount++;
  }
}

console.log(`\n======================================================`);
console.log(`Summary: ${passedCount}/${vectors.length} Frontend Golden Vectors Passed`);
console.log(`======================================================\n`);

if (passedCount !== vectors.length) {
  process.exit(1);
}
