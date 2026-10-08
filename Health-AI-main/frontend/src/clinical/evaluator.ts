/**
 * evaluator.ts — Canonical TypeScript Clinical Evaluator
 * =======================================================
 * Ruleset Version: 2.0.0 | Workflow Version: 2.0.0
 * Matches Python ml_engine.py 1:1 on all deterministic rules,
 * red-flag short-circuits, and uncertainty evaluation.
 */

import type {
  ClinicalInputData,
  ClinicalResult,
  TriageState,
  RiskLevel,
  UncertaintyState,
  ReferralStatus
} from './types';

export const WORKFLOW_VERSION = '2.0.0';
export const RULESET_VERSION = '2.0.0';

export const MEDICAL_DISCLAIMER =
  'DISCLAIMER: This tool is a screening and decision-support prototype. ' +
  'It does NOT provide a formal medical diagnosis or prescriptions, ' +
  'and does NOT replace evaluation by a qualified healthcare professional.';

export class RedFlagInterceptor {
  static evaluate(
    symptoms: string[],
    vitals: {
      systolic_bp?: number | null;
      diastolic_bp?: number | null;
      glucose_mg_dl?: number | null;
      temperature_f?: number | null;
      heart_rate_bpm?: number | null;
    }
  ): { is_emergency: boolean; red_flags: string[]; conditions: string[] } {
    const red_flags: string[] = [];
    const conditions: string[] = [];

    const { systolic_bp, diastolic_bp, glucose_mg_dl, temperature_f, heart_rate_bpm } = vitals;
    const symptomsLower = symptoms.map(s => s.toLowerCase().trim());
    const symptomsStr = symptomsLower.join(' ');

    // 1. Cardiovascular Emergency: Hypertensive Crisis
    if (
      (systolic_bp !== undefined && systolic_bp !== null && systolic_bp >= 180) ||
      (diastolic_bp !== undefined && diastolic_bp !== null && diastolic_bp >= 120)
    ) {
      red_flags.push(
        `Hypertensive Crisis Vitals (BP: ${systolic_bp ?? '?'}/${diastolic_bp ?? '?'} mmHg >= 180/120)`
      );
      conditions.push('Hypertensive Crisis — Immediate Emergency Care Required');
    }

    // 2. Acute Coronary Syndrome
    const hasChestPain = ['chest pain', 'chest discomfort', 'cardiac pain', 'pressure in chest'].some(k =>
      symptomsStr.includes(k)
    );
    const hasCardioDistress = [
      'shortness of breath',
      'breathlessness',
      'dizziness',
      'palpitations',
      'sweating',
      'cold sweat',
      'pain radiating to arm'
    ].some(k => symptomsStr.includes(k));

    if (hasChestPain && hasCardioDistress) {
      red_flags.push(
        'Acute Coronary Syndrome Presentation (Chest pain combined with acute distress / breathlessness)'
      );
      conditions.push('Suspected Acute Myocardial Infarction / Unstable Angina — Call 108 Immediately');
    } else if (hasChestPain) {
      red_flags.push('Unexplained Acute Chest Pain reported');
      conditions.push('Acute Chest Pain Evaluation Required — Emergency Referral');
    }

    // 3. Respiratory Emergency & Hemoptysis
    const hasHemoptysis = ['coughing blood', 'blood in sputum', 'hemoptysis', 'vomiting blood'].some(k =>
      symptomsStr.includes(k)
    );
    if (hasHemoptysis) {
      red_flags.push('Acute Hemoptysis / Bleeding (Coughing blood or blood in sputum)');
      conditions.push('Acute Hemoptysis / Severe Pulmonary Hemorrhage — Urgent Hospital Triage');
    }

    if (temperature_f !== undefined && temperature_f !== null && temperature_f >= 104.0) {
      red_flags.push(`Hyperpyrexia Recorded (Temperature: ${temperature_f}°F >= 104.0°F)`);
      conditions.push('Severe Hyperpyrexia / Central Fever Alert');
    }

    const hasSevereDyspnea = [
      'severe shortness of breath',
      'severe breathlessness',
      'gasping',
      'struggling to breathe'
    ].some(k => symptomsStr.includes(k));
    if (hasSevereDyspnea) {
      red_flags.push('Severe Acute Respiratory Distress (Inability to breathe adequately)');
      conditions.push('Acute Respiratory Failure / Severe Bronchospasm Alert');
    }

    // 4. Metabolic Crisis
    if (glucose_mg_dl !== undefined && glucose_mg_dl !== null) {
      if (glucose_mg_dl >= 400.0) {
        red_flags.push(`Critical Hyperglycemia (${glucose_mg_dl} mg/dL >= 400 mg/dL — DKA / HHS Risk)`);
        conditions.push(
          'Critical Diabetic Hyperglycemic Crisis — Immediate IV Hydration & PHC/CHC Transfer'
        );
      } else if (glucose_mg_dl < 54.0) {
        red_flags.push(`Severe Neuroglycopenic Hypoglycemia (${glucose_mg_dl} mg/dL < 54 mg/dL)`);
        conditions.push('Severe Acute Hypoglycemia — Administer Fast-Acting Glucose / Urgent Care');
      }
    }

    // 5. Hemodynamic Instability
    if (heart_rate_bpm !== undefined && heart_rate_bpm !== null) {
      if (heart_rate_bpm >= 150) {
        red_flags.push(`Severe Tachyarrhythmia (${heart_rate_bpm} bpm >= 150 bpm)`);
        conditions.push('Severe Tachycardia / Potential Hemodynamic Compromise');
      } else if (heart_rate_bpm <= 40) {
        red_flags.push(`Severe Symptomatic Bradycardia (${heart_rate_bpm} bpm <= 40 bpm)`);
        conditions.push('Severe Bradycardia / Potential Heart Block');
      }
    }

    if (systolic_bp !== undefined && systolic_bp !== null && systolic_bp < 80) {
      red_flags.push(`Critical Hypotension / Shock State (Systolic BP: ${systolic_bp} mmHg < 80 mmHg)`);
      conditions.push('Suspected Hemodynamic Shock / Severe Dehydration');
    }

    // 6. Neurological Red Flags
    if (
      ['unconscious', 'loss of consciousness', 'fainting with seizure', 'altered mental status', 'slurred speech'].some(
        k => symptomsStr.includes(k)
      )
    ) {
      red_flags.push('Altered Consciousness / Acute Neurological Deficit');
      conditions.push('Acute Neurological Emergency / Stroke / Encephalopathy Alert');
    }

    return {
      is_emergency: red_flags.length > 0,
      red_flags,
      conditions
    };
  }
}

export class UncertaintyEvaluator {
  static evaluate(
    symptoms: string[],
    vitals: {
      systolic_bp?: number | null;
      diastolic_bp?: number | null;
      glucose_mg_dl?: number | null;
      temperature_f?: number | null;
      heart_rate_bpm?: number | null;
    }
  ): { uncertainty_state: UncertaintyState; missing_warnings: string[] } {
    const missing_warnings: string[] = [];
    const hasBp = vitals.systolic_bp != null && vitals.diastolic_bp != null;
    const hasGlucose = vitals.glucose_mg_dl != null;
    const hasTemp = vitals.temperature_f != null;
    const hasHr = vitals.heart_rate_bpm != null;

    const vitalsPresentCount = [hasBp, hasGlucose, hasTemp, hasHr].filter(Boolean).length;

    if (!hasBp) missing_warnings.push('Blood Pressure (Systolic/Diastolic) not recorded');
    if (!hasGlucose) missing_warnings.push('Blood Glucose not measured');
    if (!hasTemp) missing_warnings.push('Body Temperature not recorded');

    if (vitalsPresentCount === 0) {
      return {
        uncertainty_state: 'INSUFFICIENT_DATA',
        missing_warnings: [
          'INSUFFICIENT DATA: Vital signs (Blood Pressure, Glucose, Temperature) are unrecorded. ' +
            'Risk score calculation suspended to prevent false reassurance.'
        ]
      };
    } else if (vitalsPresentCount === 1 && symptoms.length > 0) {
      return {
        uncertainty_state: 'UNCERTAIN',
        missing_warnings: [
          'PARTIAL VITALS: Incomplete physiological profile. Clinical risk score is approximate.'
        ]
      };
    }

    return {
      uncertainty_state: 'COMPLETE',
      missing_warnings: []
    };
  }
}

export function evaluateClinicalRisk(data: ClinicalInputData): ClinicalResult {
  const symptoms = (data.symptoms || []).map(s => s.trim()).filter(Boolean);
  const symptomDuration = data.symptom_duration_days ?? null;
  const tempF = data.temperature_f ?? null;
  const systolic = data.systolic_bp ?? null;
  const diastolic = data.diastolic_bp ?? null;
  const glucose = data.glucose_mg_dl ?? null;
  const hr = data.heart_rate_bpm ?? null;
  const heightCm = data.height_cm ?? null;
  const weightKg = data.weight_kg ?? null;

  let bmi = data.bmi ?? null;
  if (bmi == null && heightCm != null && weightKg != null && heightCm > 0) {
    bmi = Number((weightKg / ((heightCm / 100) ** 2)).toFixed(1));
  }

  const smoking = data.smoking_status || 'Never';
  const activity = data.physical_activity || 'Moderate';
  const familyHistory = (data.family_history || []).map(f => f.toLowerCase().trim()).filter(Boolean);

  const vitalsDict = {
    systolic_bp: systolic,
    diastolic_bp: diastolic,
    glucose_mg_dl: glucose,
    temperature_f: tempF,
    heart_rate_bpm: hr
  };

  // ─── STEP 1: RED-FLAG EMERGENCY INTERCEPTOR ─────────────────────────
  const { is_emergency, red_flags, conditions: emergencyConditions } = RedFlagInterceptor.evaluate(
    symptoms,
    vitalsDict
  );

  if (is_emergency) {
    return {
      risk_level: 'HIGH',
      triage_state: 'EMERGENCY',
      is_emergency: true,
      short_circuit: true,
      red_flags,
      uncertainty_state: 'COMPLETE',
      risk_score: 0.99,
      likely_conditions: emergencyConditions,
      contributing_factors: red_flags,
      recommended_action:
        '🚨 CRITICAL EMERGENCY RED FLAG: Immediate medical intervention required. ' +
        'Contact 108 Emergency Ambulance service or initiate immediate transfer to Community Health Centre (CHC) / District Hospital. ' +
        'Keep patient resting and monitor airway, breathing, and circulation.',
      referral_status: 'REFERRED',
      workflow_version: WORKFLOW_VERSION,
      ruleset_version: RULESET_VERSION,
      disclaimer: MEDICAL_DISCLAIMER
    };
  }

  // ─── STEP 2: UNCERTAINTY & DATA SUFFICIENCY EVALUATOR ───────────────
  const { uncertainty_state, missing_warnings } = UncertaintyEvaluator.evaluate(symptoms, vitalsDict);

  if (uncertainty_state === 'INSUFFICIENT_DATA') {
    return {
      risk_level: 'INSUFFICIENT_DATA',
      triage_state: 'INSUFFICIENT_DATA',
      is_emergency: false,
      short_circuit: false,
      red_flags: [],
      uncertainty_state: 'INSUFFICIENT_DATA',
      risk_score: null,
      likely_conditions: ['Incomplete Health Intake — Vital Signs Assessment Required'],
      contributing_factors: missing_warnings,
      recommended_action:
        'INSUFFICIENT CLINICAL DATA: Vital measurements (Blood Pressure, Blood Glucose, Temperature) ' +
        'were not recorded. A complete screening risk score cannot be safely computed. ' +
        'Please perform vital sign measurements at the Sub-Centre or PHC before finalizing risk stratification.',
      referral_status: 'NOT_REFERRED',
      workflow_version: WORKFLOW_VERSION,
      ruleset_version: RULESET_VERSION,
      disclaimer: MEDICAL_DISCLAIMER
    };
  }

  // ─── STEP 3: DETERMINISTIC CLINICAL RULES ───────────────────────────
  const factors: string[] = [...missing_warnings];
  const conditions: string[] = [];
  let rawRiskScore = 0.05;
  const symptomsLower = symptoms.map(s => s.toLowerCase());
  const symptomsStr = symptomsLower.join(' ');

  // 1. Diabetes / Metabolic Risk Check
  let glucoseRisk = false;
  if (glucose != null) {
    if (glucose >= 200) {
      factors.push(`Severely Elevated Blood Glucose (${glucose} mg/dL >= 200 mg/dL)`);
      rawRiskScore += 0.4;
      glucoseRisk = true;
    } else if (glucose >= 140) {
      factors.push(`Elevated Blood Glucose (${glucose} mg/dL >= 140 mg/dL)`);
      rawRiskScore += 0.25;
      glucoseRisk = true;
    } else if (glucose >= 126) {
      factors.push(`Fasting Blood Glucose in High Risk Range (${glucose} mg/dL)`);
      rawRiskScore += 0.2;
      glucoseRisk = true;
    }
  }

  const diabetesSymptoms = [
    'frequent urination',
    'increased thirst',
    'excessive thirst',
    'unexplained weight loss',
    'blurred vision',
    'extreme fatigue'
  ];
  const matchingDiab = symptomsLower.filter(s => diabetesSymptoms.some(ds => s.includes(ds)));
  if (matchingDiab.length > 0) {
    factors.push(`Reported diabetes-related symptoms: ${matchingDiab.join(', ')}`);
    rawRiskScore += 0.15 * matchingDiab.length;
    glucoseRisk = true;
  }

  if (familyHistory.some(fh => fh.includes('diabetes'))) {
    factors.push('Family history of Diabetes mellitus');
    rawRiskScore += 0.1;
  }

  if (glucoseRisk) {
    conditions.push('Elevated Diabetes Screening Risk — Further Evaluation Recommended');
  }

  // 2. Cardiovascular / Hypertension Risk Check
  let bpRisk = false;
  if (systolic != null && diastolic != null) {
    if (systolic >= 140 || diastolic >= 90) {
      factors.push(`Stage 2 Elevated Blood Pressure (BP: ${systolic}/${diastolic} mmHg)`);
      rawRiskScore += 0.3;
      bpRisk = true;
    } else if (systolic >= 130 || diastolic >= 80) {
      factors.push(`Stage 1 Borderline Blood Pressure (BP: ${systolic}/${diastolic} mmHg)`);
      rawRiskScore += 0.15;
      bpRisk = true;
    }
  }

  const cardioSymptoms = ['dizziness', 'palpitations', 'swelling', 'swelling in legs', 'breathlessness'];
  const matchingCardio = symptomsLower.filter(s => cardioSymptoms.some(cs => s.includes(cs)));
  if (matchingCardio.length > 0) {
    factors.push(`Cardiovascular warning signs: ${matchingCardio.join(', ')}`);
    rawRiskScore += 0.25;
    bpRisk = true;
  }

  if (smoking === 'Current') {
    factors.push('Current tobacco / smoking habit (elevated vascular risk)');
    rawRiskScore += 0.15;
  }

  if (activity === 'Sedentary') {
    factors.push('Sedentary lifestyle reported');
    rawRiskScore += 0.05;
  }

  if (bpRisk) {
    conditions.push('Possible Hypertension / Cardiovascular-Related Concern');
  }

  // 3. Respiratory / Infection / TB Triage
  let respRisk = false;
  if (tempF != null) {
    if (tempF >= 101.0) {
      factors.push(`High Fever Recorded (${tempF}°F)`);
      rawRiskScore += 0.25;
      respRisk = true;
    } else if (tempF >= 99.5) {
      factors.push(`Mild Low-Grade Fever (${tempF}°F)`);
      rawRiskScore += 0.1;
    }
  }

  const tbSymptoms = ['cough', 'persistent cough', 'night sweats', 'fever', 'weight loss'];
  const matchingTb = symptomsLower.filter(s => tbSymptoms.some(ts => s.includes(ts)));
  if (matchingTb.length > 0) {
    factors.push(`Respiratory symptoms: ${matchingTb.join(', ')}`);
    if (symptomDuration != null && symptomDuration >= 14 && matchingTb.some(s => s.includes('cough'))) {
      factors.push(
        `Persistent cough lasting ${symptomDuration} days (High priority TB screening criteria)`
      );
      rawRiskScore += 0.35;
      respRisk = true;
    } else {
      rawRiskScore += 0.15;
    }
  }

  if (respRisk) {
    if (symptomDuration != null && symptomDuration >= 14 && symptomsLower.some(s => s.includes('cough'))) {
      conditions.push('Possible TB-Related Concern — Urgent Sputum Screening Recommended');
    } else {
      conditions.push('Acute Respiratory Infection Screening Concern');
    }
  }

  // 4. Anemia / Weakness Risk
  const anemiaSymptoms = ['weakness', 'fatigue', 'dizziness', 'nausea', 'swelling', 'pale skin'];
  const matchingAnemia = symptomsLower.filter(s => anemiaSymptoms.some(ans => s.includes(ans)));
  if (matchingAnemia.length >= 2) {
    factors.push(`General constitutional symptoms: ${matchingAnemia.join(', ')}`);
    rawRiskScore += 0.15;
    conditions.push('General Nutritional / Anemia Evaluation Recommended');
  }

  // 5. Anthropometric & Vitals Check
  if (bmi != null) {
    if (bmi >= 30.0) {
      factors.push(`Obesity Category (BMI ${bmi} kg/m²)`);
      rawRiskScore += 0.1;
    } else if (bmi < 18.5) {
      factors.push(`Underweight Category (BMI ${bmi} kg/m²`);
      rawRiskScore += 0.1;
    }
  }

  if (hr != null && hr >= 100) {
    factors.push(`Elevated Heart Rate (${hr} bpm)`);
    rawRiskScore += 0.15;
  }

  // Cap risk score
  const riskScore = Number(Math.min(Math.max(rawRiskScore, 0.05), 0.98).toFixed(2));

  // Risk Level Categorization
  const durationCough = symptomDuration != null && symptomDuration >= 14 && symptomsStr.includes('cough');
  let riskLevel: RiskLevel = 'LOW';
  let triageState: TriageState = 'LOW_RISK';

  if (
    riskScore >= 0.55 ||
    (systolic != null && systolic >= 160) ||
    (glucose != null && glucose >= 200) ||
    durationCough
  ) {
    riskLevel = 'HIGH';
    triageState = 'HIGH_RISK';
  } else if (
    riskScore >= 0.25 ||
    (systolic != null && systolic >= 130) ||
    (glucose != null && glucose >= 140) ||
    (tempF != null && tempF >= 100.0) ||
    symptoms.length >= 2
  ) {
    riskLevel = 'MODERATE';
    triageState = 'MODERATE_RISK';
  } else {
    riskLevel = 'LOW';
    triageState = 'LOW_RISK';
  }

  if (conditions.length === 0) {
    conditions.push('Routine Baseline Health Screening — Low Immediate Concern');
  }

  if (factors.length === 0) {
    factors.push('Normal vitals within expected parameters');
    factors.push('No acute high-risk symptoms reported');
  }

  let recommendation = '';
  let referralStatus: ReferralStatus = 'NOT_REFERRED';

  if (riskLevel === 'HIGH') {
    recommendation =
      'PHC EVALUATION RECOMMENDED: High screening risk flagged. Refer patient to Primary Health Centre (PHC) Medical Officer within 24 hours. ' +
      'Order Fasting Blood Glucose, HbA1c, and Sputum Smear if chronic cough is present.';
    referralStatus = 'REFERRED';
  } else if (riskLevel === 'MODERATE') {
    recommendation =
      'ROUTINE PHC REFERRAL: Moderate screening risk. Schedule PHC visit within 3-5 days. ' +
      'Advise lifestyle modifications, dietary control, and re-check vitals in 1 week.';
    referralStatus = 'NOT_REFERRED';
  } else {
    recommendation =
      'COMMUNITY CARE: Patient baseline vitals are low risk. Provide standard wellness and preventive health guidance.';
    referralStatus = 'NOT_REFERRED';
  }

  return {
    risk_level: riskLevel,
    triage_state: triageState,
    is_emergency: false,
    short_circuit: false,
    red_flags: [],
    uncertainty_state: uncertainty_state,
    risk_score: riskScore,
    likely_conditions: conditions,
    contributing_factors: factors,
    recommended_action: recommendation,
    referral_status: referralStatus,
    workflow_version: WORKFLOW_VERSION,
    ruleset_version: RULESET_VERSION,
    disclaimer: MEDICAL_DISCLAIMER
  };
}
