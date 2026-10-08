import type {
  PatientFormData,
  SymptomsFormData,
  VitalsFormData,
  RiskFactorsFormData,
  ScreeningResultData,
  RiskLevel,
} from './types';

// ─── BMI CALCULATION ──────────────────────────────────────────────────────────

export function calculateBmi(heightCm: number | '', weightKg: number | ''): {
  bmi: number | undefined;
  category: string;
} {
  if (!heightCm || !weightKg || heightCm <= 0 || weightKg <= 0) {
    return { bmi: undefined, category: 'Not Available' };
  }

  const heightM = Number(heightCm) / 100;
  const bmiVal = Number(weightKg) / (heightM * heightM);
  const rounded = Math.round(bmiVal * 10) / 10;

  let category = 'Normal';
  if (rounded < 18.5) category = 'Underweight';
  else if (rounded >= 18.5 && rounded < 25) category = 'Normal weight';
  else if (rounded >= 25 && rounded < 30) category = 'Overweight';
  else category = 'Obese';

  return { bmi: rounded, category };
}

// ─── MEASUREMENT PLAUSIBILITY VALIDATION ──────────────────────────────────────

export interface MeasurementWarning {
  field: string;
  message: string;
}

export function validateVitalsPlausibility(vitals: VitalsFormData): MeasurementWarning[] {
  const warnings: MeasurementWarning[] = [];

  // Systolic BP
  if (vitals.systolicBp !== '') {
    const sys = Number(vitals.systolicBp);
    if (sys < 70 || sys > 240) {
      warnings.push({
        field: 'systolicBp',
        message: 'The entered systolic BP appears outside expected physiological range (70–240 mmHg).',
      });
    }
  }

  // Diastolic BP
  if (vitals.diastolicBp !== '') {
    const dia = Number(vitals.diastolicBp);
    if (dia < 40 || dia > 140) {
      warnings.push({
        field: 'diastolicBp',
        message: 'The entered diastolic BP appears outside expected range (40–140 mmHg).',
      });
    }
  }

  // Systolic vs Diastolic
  if (vitals.systolicBp !== '' && vitals.diastolicBp !== '') {
    if (Number(vitals.systolicBp) <= Number(vitals.diastolicBp)) {
      warnings.push({
        field: 'systolicBp',
        message: 'Systolic BP should be greater than Diastolic BP.',
      });
    }
  }

  // Temperature
  if (vitals.temperatureF !== '') {
    const temp = Number(vitals.temperatureF);
    if (temp < 93 || temp > 108) {
      warnings.push({
        field: 'temperatureF',
        message: 'The entered temperature appears outside expected clinical range (93–108°F).',
      });
    }
  }

  // Heart Rate
  if (vitals.heartRateBpm !== '') {
    const hr = Number(vitals.heartRateBpm);
    if (hr < 40 || hr > 220) {
      warnings.push({
        field: 'heartRateBpm',
        message: 'The entered heart rate appears outside expected range (40–220 BPM).',
      });
    }
  }

  // Blood Glucose
  if (vitals.glucoseMeasured && vitals.glucoseMgDl !== '') {
    const gluc = Number(vitals.glucoseMgDl);
    if (gluc < 40 || gluc > 600) {
      warnings.push({
        field: 'glucoseMgDl',
        message: 'The entered blood glucose appears unusually high or low (40–600 mg/dL).',
      });
    }
  }

  return warnings;
}

// ─── ASSESSMENT COMPLETENESS CALCULATOR ──────────────────────────────────────

export function calculateCompleteness(
  patient: PatientFormData,
  symptoms: SymptomsFormData,
  vitals: VitalsFormData,
  riskFactors: RiskFactorsFormData
): { score: number; missingFields: string[]; isSufficient: boolean } {
  let filled = 0;
  let total = 0;
  const missing: string[] = [];

  // 1. Patient identity (Essential)
  total += 3;
  if (patient.name.trim()) filled += 1;
  else missing.push('Patient Name');

  if (patient.age !== '') filled += 1;
  else missing.push('Patient Age');

  if (patient.gender) filled += 1;
  else missing.push('Patient Gender');

  // 2. Symptoms
  total += 2;
  if (symptoms.symptoms.length > 0) filled += 1;
  else missing.push('Reported Symptoms');

  if (symptoms.duration && symptoms.duration !== 'Unknown') filled += 1;
  else missing.push('Symptom Duration');

  // 3. Vitals
  total += 4;
  if (vitals.systolicBp !== '' && vitals.diastolicBp !== '') filled += 1;
  else missing.push('Blood Pressure');

  if (vitals.temperatureF !== '') filled += 1;
  else missing.push('Body Temperature');

  if (vitals.heartRateBpm !== '') filled += 1;
  else missing.push('Heart Rate');

  if (vitals.glucoseMeasured && vitals.glucoseMgDl !== '') filled += 1;
  else if (!vitals.glucoseMeasured) filled += 0.5; // partial credit if recorded as unmeasured

  // 4. Risk Factors
  total += 2;
  if (riskFactors.lifestyle.smoking !== 'Unknown') filled += 1;
  if (riskFactors.medicalHistory.diabetes !== 'Unknown') filled += 1;

  const score = Math.min(100, Math.round((filled / total) * 100));
  const isSufficient = patient.name.trim() !== '' && patient.age !== '' && symptoms.symptoms.length > 0;

  return { score, missingFields: missing, isSufficient };
}

// ─── CENTRALIZED CONFIGURABLE RISK THRESHOLDS ─────────────────────────────────
export const RISK_THRESHOLDS = {
  LOW: [0, 30],
  MODERATE: [31, 50],
  HIGH: [51, 70],
  CRITICAL: [71, 100],
} as const;

export function getRiskLevelFromScore(score: number): RiskLevel {
  if (score > 70) return 'CRITICAL';
  if (score > 50) return 'HIGH';
  if (score > 30) return 'MODERATE';
  return 'LOW';
}

export function detectRequiredSpecialty(conditions: string[]): string {
  const text = conditions.join(' ').toLowerCase();
  if (text.includes('cardio') || text.includes('chest') || text.includes('ischemic')) return 'Cardiology';
  if (text.includes('tb') || text.includes('pulmon') || text.includes('respir') || text.includes('cough')) return 'Pulmonology';
  if (text.includes('diabet') || text.includes('glucose')) return 'Endocrinology / Diabetology';
  if (text.includes('hypertens')) return 'Cardiology / Internal Medicine';
  if (text.includes('kidney') || text.includes('renal')) return 'Nephrology';
  if (text.includes('anemia')) return 'Hematology / General Medicine';
  return 'General Medicine';
}

// ─── CLINICAL DECISION SUPPORT EVALUATION ─────────────────────────────────────

export function evaluateClinicalScreening(
  patient: PatientFormData,
  symptoms: SymptomsFormData,
  vitals: VitalsFormData,
  riskFactors: RiskFactorsFormData,
  isOffline = false
): ScreeningResultData {
  const { score: completenessScore, missingFields, isSufficient } = calculateCompleteness(
    patient,
    symptoms,
    vitals,
    riskFactors
  );

  const contributing: string[] = [];
  const potentialRisks: string[] = [];
  const likelyConditions: string[] = [];
  let calculatedScore = 0.05;

  // Check for insufficient data
  if (!isSufficient && symptoms.symptoms.length === 0) {
    return {
      assessmentId: `ASS-${Date.now().toString().slice(-6)}`,
      patientId: patient.id,
      patientName: patient.name || 'Unknown Patient',
      riskLevel: 'INSUFFICIENT_DATA',
      riskScore: 0.0,
      likelyConditions: ['Unable to determine due to missing clinical details'],
      contributingFactors: ['No symptoms or vitals were recorded for this screening session.'],
      recommendedAction: 'Complete symptom checklist and baseline vitals before running screening assessment.',
      potentialRiskIndicators: ['Incomplete Health Information'],
      completenessScore,
      missingFields,
      isOffline,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      rulesVersion: 'v2.4 (NHM Rural Decision Guidelines)',
      modelVersion: isOffline ? 'Offline Rule Engine v2.4' : 'Hybrid ML + Rule Engine v2.4',
    };
  }

  // ── 1. EMERGENCY & RED FLAG SAFETY RULES (HIGH RISK) ─────────────────────────
  const symLower = symptoms.symptoms.map((s) => s.toLowerCase());
  const hasChestPain = symLower.some((s) => s.includes('chest pain'));
  const hasBreathlessness = symLower.some((s) => s.includes('breathless') || s.includes('breathing'));
  const hasFever = symLower.some((s) => s.includes('fever'));
  const hasCough = symLower.some((s) => s.includes('cough'));
  const hasHeadache = symLower.some((s) => s.includes('headache'));

  const durationStr = symptoms.duration.toLowerCase();
  const isProlongedDuration =
    durationStr.includes('more than 2 weeks') || durationStr.includes('>2 weeks') || durationStr.includes('1–2 weeks');

  let hasHighRiskTrigger = false;

  // Severe BP
  const sys = vitals.systolicBp !== '' ? Number(vitals.systolicBp) : 120;
  const dia = vitals.diastolicBp !== '' ? Number(vitals.diastolicBp) : 80;
  if (sys >= 160 || dia >= 100) {
    hasHighRiskTrigger = true;
    calculatedScore += 0.45;
    contributing.push(`Severely elevated blood pressure (${sys}/${dia} mmHg)`);
    potentialRisks.push('Severe Hypertension Risk Pattern');
    likelyConditions.push('Hypertension Stage 2 — Physician evaluation required');
  } else if (sys >= 140 || dia >= 90) {
    calculatedScore += 0.25;
    contributing.push(`Elevated blood pressure (${sys}/${dia} mmHg)`);
    potentialRisks.push('Elevated Blood Pressure Pattern');
    likelyConditions.push('Hypertension Stage 1 Concern');
  }

  // Severe Glucose
  if (vitals.glucoseMeasured && vitals.glucoseMgDl !== '') {
    const gluc = Number(vitals.glucoseMgDl);
    if (gluc >= 220 || gluc < 60) {
      hasHighRiskTrigger = true;
      calculatedScore += 0.4;
      contributing.push(`High risk blood glucose level (${gluc} mg/dL)`);
      potentialRisks.push('Critical Blood Sugar Imbalance');
      likelyConditions.push('Diabetes Mellitus Screening Concern — Fasting blood test advised');
    } else if (gluc >= 140) {
      calculatedScore += 0.2;
      contributing.push(`Elevated blood glucose (${gluc} mg/dL)`);
      potentialRisks.push('Pre-Diabetes / Elevated Glucose Pattern');
      likelyConditions.push('Impaired Glucose Tolerance');
    }
  }

  // Chest pain or acute breathlessness
  if (hasChestPain) {
    hasHighRiskTrigger = true;
    calculatedScore += 0.5;
    contributing.push('Chest pain reported during screening visit');
    potentialRisks.push('Acute Cardiovascular / Thoracic Warning Indicator');
    likelyConditions.push('Cardiovascular / Ischemic Concern — Urgent evaluation advised');
  }

  if (hasBreathlessness) {
    calculatedScore += 0.3;
    contributing.push('Breathlessness / respiratory distress reported');
    potentialRisks.push('Respiratory Effort Concern');
    likelyConditions.push('Acute Respiratory / Bronchial Concern');
  }

  // Prolonged Cough (>14 days) -> TB screening priority
  if (hasCough && isProlongedDuration) {
    hasHighRiskTrigger = true;
    calculatedScore += 0.4;
    contributing.push('Persistent cough lasting more than 2 weeks');
    potentialRisks.push('National TB Elimination Program (NTEP) Triage Candidate');
    likelyConditions.push('Suspected Chronic Pulmonary / TB Concern — Sputum examination advised');
  }

  // High Fever
  if (vitals.temperatureF !== '') {
    const temp = Number(vitals.temperatureF);
    if (temp >= 102.5) {
      hasHighRiskTrigger = true;
      calculatedScore += 0.35;
      contributing.push(`High fever recorded (${temp}°F)`);
      potentialRisks.push('Acute Febrile Illness');
      likelyConditions.push('Acute Infection / Febrile Concern');
    } else if (temp >= 100.4) {
      calculatedScore += 0.2;
      contributing.push(`Mild to moderate fever recorded (${temp}°F)`);
      likelyConditions.push('Viral / Bacterial Infection Concern');
    }
  }

  // Lifestyle & Medical History additions
  if (riskFactors.lifestyle.smoking === 'Current') {
    calculatedScore += 0.1;
    contributing.push('Active tobacco/smoking habit');
    potentialRisks.push('Tobacco-related cardiovascular risk factor');
  }

  if (riskFactors.medicalHistory.diabetes === 'Yes') {
    calculatedScore += 0.15;
    contributing.push('Known history of Diabetes');
  }

  if (riskFactors.medicalHistory.hypertension === 'Yes') {
    calculatedScore += 0.15;
    contributing.push('Known history of Hypertension');
  }

  if (riskFactors.familyHistory.heartDisease === 'Yes' || riskFactors.familyHistory.diabetes === 'Yes') {
    contributing.push('Family history of chronic disease');
  }

  if (symptoms.severity === 'Severe') {
    calculatedScore += 0.2;
    contributing.push('High symptom severity reported by patient');
  }

  // Cap and scale score to 0–100
  let scoreOn100 = Math.round(calculatedScore * 100);

  // Severe emergency triggers -> Escalate to Critical (>70)
  const isEmergencyCrisis = (hasChestPain && sys >= 140) || sys >= 180 || dia >= 120 || (vitals.glucoseMeasured && Number(vitals.glucoseMgDl) >= 300);
  if (isEmergencyCrisis) {
    scoreOn100 = Math.max(scoreOn100, 85);
  } else if (hasHighRiskTrigger) {
    scoreOn100 = Math.max(scoreOn100, 56);
  } else if (sys >= 130 || hasFever || hasHeadache) {
    scoreOn100 = Math.max(scoreOn100, 35);
  }

  scoreOn100 = Math.min(Math.max(scoreOn100, 5), 98);

  // Determine Risk Level using centralized thresholds
  let riskLevel: RiskLevel = getRiskLevelFromScore(scoreOn100);
  let recommendedAction = 'Continue routine health monitoring and wellness counselling.';

  if (riskLevel === 'CRITICAL') {
    recommendedAction =
      'CRITICAL EMERGENCY ALERT: Risk score exceeds 70/100. Immediate IDRC referral & transfer to 24/7 Emergency facility required.';
  } else if (riskLevel === 'HIGH') {
    recommendedAction =
      'PHC clinical review recommended within 24–48 hours. Refer patient to Primary Health Centre.';
  } else if (riskLevel === 'MODERATE') {
    recommendedAction =
      'Routine PHC assessment recommended within 3–5 days. Advise rest, hydration, and monitoring.';
  } else if (completenessScore < 45) {
    riskLevel = 'NEEDS_REVIEW';
    recommendedAction =
      'Incomplete vitals recorded. Clinical review recommended to ensure all parameters are evaluated.';
  }

  if (contributing.length === 0) {
    contributing.push('Baseline vital signs and reported symptoms remain within normal parameters.');
  }

  if (potentialRisks.length === 0) {
    potentialRisks.push('No immediate acute risk patterns identified.');
  }

  if (likelyConditions.length === 0) {
    likelyConditions.push('General Baseline Health Screening — Low Immediate Concern');
  }

  const requiredSpecialty = detectRequiredSpecialty(likelyConditions);

  return {
    assessmentId: `ASS-${Date.now().toString().slice(-6)}`,
    itemId: `item_${patient.id}_${scoreOn100}`,
    patientId: patient.id,
    patientName: patient.name,
    riskLevel,
    riskScore: scoreOn100,
    requiredSpecialty,
    likelyConditions,
    contributingFactors: contributing,
    recommendedAction,
    potentialRiskIndicators: potentialRisks,
    completenessScore,
    missingFields,
    isOffline,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    rulesVersion: 'v2.4 (National Health Mission Triage Protocol)',
    modelVersion: isOffline ? 'Offline Rule Engine v2.4' : 'Hybrid ML + Rule Engine v2.4',
  };
}
