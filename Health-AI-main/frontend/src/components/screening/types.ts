export type ScreeningStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type RiskLevel = 'HIGH' | 'MODERATE' | 'LOW' | 'NEEDS_REVIEW' | 'INSUFFICIENT_DATA';

export interface PatientFormData {
  id: string;
  customId?: string;
  name: string;
  age: number | '';
  dob?: string;
  gender: 'Male' | 'Female' | 'Other' | '';
  phone: string;
  village: string;
  preferredLanguage: string;
  emergencyContact: string;
  isExisting: boolean;
}

export interface SymptomsFormData {
  symptoms: string[];
  duration: string; // 'Today' | '1–3 days' | '4–7 days' | '1–2 weeks' | 'More than 2 weeks' | 'Unknown' | custom
  severity: 'Mild' | 'Moderate' | 'Severe';
  voiceTranscript: string;
  customSymptom: string;
  notes?: string;
}

export interface VitalsFormData {
  systolicBp: number | '';
  diastolicBp: number | '';
  temperatureF: number | '';
  heartRateBpm: number | '';
  glucoseMgDl: number | '';
  glucoseMeasured: boolean;
  heightCm: number | '';
  weightKg: number | '';
  bmi?: number;
  bmiCategory?: string;
}

export interface RiskFactorsFormData {
  medicalHistory: {
    diabetes: 'Yes' | 'No' | 'Unknown';
    hypertension: 'Yes' | 'No' | 'Unknown';
    previousTb: 'Yes' | 'No' | 'Unknown';
    heartDisease: 'Yes' | 'No' | 'Unknown';
    asthma: 'Yes' | 'No' | 'Unknown';
    other: string;
  };
  familyHistory: {
    diabetes: 'Yes' | 'No' | 'Unknown';
    hypertension: 'Yes' | 'No' | 'Unknown';
    heartDisease: 'Yes' | 'No' | 'Unknown';
    other: string;
  };
  lifestyle: {
    smoking: 'Never' | 'Former' | 'Current' | 'Unknown';
    alcohol: 'Never' | 'Occasional' | 'Regular' | 'Unknown';
    physicalActivity: 'Sedentary' | 'Moderate' | 'Active' | 'Unknown';
  };
}

export interface ScreeningResultData {
  assessmentId: string;
  patientId: string;
  patientName: string;
  riskLevel: RiskLevel;
  riskScore: number;
  likelyConditions: string[];
  contributingFactors: string[];
  recommendedAction: string;
  potentialRiskIndicators: string[];
  completenessScore: number;
  missingFields: string[];
  isOffline: boolean;
  timestamp: string;
  rulesVersion: string;
  modelVersion: string;
}
