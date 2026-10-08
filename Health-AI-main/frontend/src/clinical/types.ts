/**
 * Clinical Engine Type Definitions
 * Ruleset Version: 2.0.0 | Workflow Version: 2.0.0
 */

export type TriageState =
  | 'LOW_RISK'
  | 'MODERATE_RISK'
  | 'HIGH_RISK'
  | 'EMERGENCY'
  | 'INSUFFICIENT_DATA'
  | 'CONFLICTING_DATA';

export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'EMERGENCY' | 'INSUFFICIENT_DATA';

export type UncertaintyState = 'COMPLETE' | 'INSUFFICIENT_DATA' | 'UNCERTAIN';

export type ReferralStatus =
  | 'NOT_REFERRED'
  | 'REFERRED'
  | 'APPOINTMENT_REQUESTED'
  | 'CONSULTATION_COMPLETED';

export interface ClinicalInputData {
  patient_id: string;
  symptoms?: string[];
  symptom_duration_days?: number | null;
  temperature_f?: number | null;
  systolic_bp?: number | null;
  diastolic_bp?: number | null;
  glucose_mg_dl?: number | null;
  heart_rate_bpm?: number | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  bmi?: number | null;
  smoking_status?: string | null;
  alcohol_status?: string | null;
  physical_activity?: string | null;
  family_history?: string[];
  notes?: string | null;
}

export interface ClinicalResult {
  risk_level: RiskLevel;
  triage_state: TriageState;
  is_emergency: boolean;
  short_circuit: boolean;
  red_flags: string[];
  uncertainty_state: UncertaintyState;
  risk_score: number | null;
  likely_conditions: string[];
  contributing_factors: string[];
  recommended_action: string;
  referral_status: ReferralStatus;
  workflow_version: string;
  ruleset_version: string;
  disclaimer: string;
}
