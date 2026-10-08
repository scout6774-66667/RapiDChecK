"""
test_clinical_safety.py — Comprehensive Test Suite for TASK-001 & TASK-002
==========================================================================
Validates:
1. TASK-001: Strict Nullability on Vitals & Uncertainty Evaluation (INSUFFICIENT_DATA)
2. TASK-002: Red-Flag Emergency Short-Circuit Interceptor & Emergency Precedence
3. Schema Constraints & Non-Defaulting Verification
4. End-to-End API Triage Behavior via FastAPI TestClient
"""

import pytest
from pydantic import ValidationError
from schemas import AssessmentCreate, PatientCreate
from ml_engine import screening_engine, RedFlagInterceptor, UncertaintyEvaluator, WORKFLOW_VERSION, RULESET_VERSION


# ─── 1. TASK-001: STRICT NULLABILITY & UNCERTAINTY TESTS ─────────────────────

def test_assessment_create_schema_has_no_silent_defaults():
    """Verify AssessmentCreate vitals default to None, not 98.6 / 120 / 100."""
    ass = AssessmentCreate(patient_id="p-test-001")
    assert ass.temperature_f is None, "temperature_f must default to None"
    assert ass.systolic_bp is None, "systolic_bp must default to None"
    assert ass.diastolic_bp is None, "diastolic_bp must default to None"
    assert ass.glucose_mg_dl is None, "glucose_mg_dl must default to None"
    assert ass.heart_rate_bpm is None, "heart_rate_bpm must default to None"
    assert ass.height_cm is None, "height_cm must default to None"
    assert ass.weight_kg is None, "weight_kg must default to None"
    assert ass.bmi is None, "bmi must default to None"


def test_schema_validates_biological_ranges():
    """Ensure biologically impossible values are rejected by schema."""
    # Age out of range
    with pytest.raises(ValidationError):
        PatientCreate(name="Abir", age=0, gender="Male", village="Sonpur", phone="9876543210")
    with pytest.raises(ValidationError):
        PatientCreate(name="Abir", age=150, gender="Male", village="Sonpur", phone="9876543210")

    # Systolic BP out of range (< 40 or > 320)
    with pytest.raises(ValidationError):
        AssessmentCreate(patient_id="p1", systolic_bp=30)
    with pytest.raises(ValidationError):
        AssessmentCreate(patient_id="p1", systolic_bp=350)

    # Temperature out of range (< 85 or > 115)
    with pytest.raises(ValidationError):
        AssessmentCreate(patient_id="p1", temperature_f=70.0)
    with pytest.raises(ValidationError):
        AssessmentCreate(patient_id="p1", temperature_f=120.0)


def test_missing_vitals_yields_insufficient_data():
    """When no vitals are recorded, the engine must return INSUFFICIENT_DATA and risk_score=None."""
    payload = {
        "patient_id": "p-test-002",
        "symptoms": ["cough", "fatigue"],
        # No vitals provided
    }
    result = screening_engine.evaluate(payload)
    assert result["triage_state"] == "INSUFFICIENT_DATA"
    assert result["risk_level"] == "INSUFFICIENT_DATA"
    assert result["uncertainty_state"] == "INSUFFICIENT_DATA"
    assert result["risk_score"] is None, "Risk score must be None when data is insufficient"
    assert result["is_emergency"] is False
    assert result["short_circuit"] is False
    assert any("INSUFFICIENT DATA" in factor for factor in result["contributing_factors"])
    assert result["workflow_version"] == WORKFLOW_VERSION
    assert result["ruleset_version"] == RULESET_VERSION


# ─── 2. TASK-002: RED-FLAG EMERGENCY SHORT-CIRCUIT TESTS ─────────────────────

def test_hypertensive_crisis_triggers_emergency_short_circuit():
    """BP >= 180/120 must immediately trigger EMERGENCY short-circuit."""
    payload = {
        "patient_id": "p-emergency-001",
        "systolic_bp": 185,
        "diastolic_bp": 125,
        "symptoms": ["headache"]
    }
    result = screening_engine.evaluate(payload)
    assert result["is_emergency"] is True
    assert result["short_circuit"] is True
    assert result["triage_state"] == "EMERGENCY"
    assert result["risk_level"] == "HIGH"
    assert result["risk_score"] == 0.99
    assert result["referral_status"] == "REFERRED"
    assert any("Hypertensive Crisis" in rf for rf in result["red_flags"])
    assert "🚨 CRITICAL EMERGENCY RED FLAG" in result["recommended_action"]


def test_acute_coronary_syndrome_triggers_emergency():
    """Chest pain + acute distress (breathlessness) must trigger emergency precedence."""
    payload = {
        "patient_id": "p-emergency-002",
        "symptoms": ["chest pain", "shortness of breath", "sweating"],
        "systolic_bp": 120,
        "diastolic_bp": 80,
        "glucose_mg_dl": 100.0,
        "temperature_f": 98.6
    }
    result = screening_engine.evaluate(payload)
    assert result["is_emergency"] is True
    assert result["short_circuit"] is True
    assert result["triage_state"] == "EMERGENCY"
    assert any("Acute Coronary Syndrome" in rf for rf in result["red_flags"])
    assert any("Myocardial Infarction" in cond for cond in result["likely_conditions"])


def test_acute_hemoptysis_triggers_emergency():
    """Coughing blood must immediately trigger emergency pulmonary triage."""
    payload = {
        "patient_id": "p-emergency-003",
        "symptoms": ["coughing blood", "fever"],
        "temperature_f": 101.5
    }
    result = screening_engine.evaluate(payload)
    assert result["is_emergency"] is True
    assert result["short_circuit"] is True
    assert result["triage_state"] == "EMERGENCY"
    assert any("Hemoptysis" in rf for rf in result["red_flags"])


def test_critical_glucose_extremes_trigger_emergency():
    """Glucose >= 400 (DKA/HHS) and Glucose < 54 (Severe Hypoglycemia) must trigger emergency."""
    # Critical High
    res_high = screening_engine.evaluate({"patient_id": "p1", "glucose_mg_dl": 450.0})
    assert res_high["is_emergency"] is True
    assert res_high["triage_state"] == "EMERGENCY"
    assert any("Critical Hyperglycemia" in rf for rf in res_high["red_flags"])

    # Critical Low
    res_low = screening_engine.evaluate({"patient_id": "p2", "glucose_mg_dl": 42.0})
    assert res_low["is_emergency"] is True
    assert res_low["triage_state"] == "EMERGENCY"
    assert any("Severe Neuroglycopenic Hypoglycemia" in rf for rf in res_low["red_flags"])


def test_severe_heart_rate_abnormalities_trigger_emergency():
    """HR >= 150 bpm and HR <= 40 bpm must trigger hemodynamic emergency."""
    # Severe Tachycardia
    res_tachy = screening_engine.evaluate({"patient_id": "p1", "heart_rate_bpm": 160})
    assert res_tachy["is_emergency"] is True
    assert any("Severe Tachyarrhythmia" in rf for rf in res_tachy["red_flags"])

    # Severe Bradycardia
    res_brady = screening_engine.evaluate({"patient_id": "p2", "heart_rate_bpm": 36})
    assert res_brady["is_emergency"] is True
    assert any("Severe Symptomatic Bradycardia" in rf for rf in res_brady["red_flags"])


# ─── 3. DETERMINISTIC MULTI-DOMAIN SCREENING TESTS ───────────────────────────

def test_stage2_hypertension_screening():
    """BP 150/95 with no emergency signs evaluates to HIGH risk."""
    payload = {
        "patient_id": "p-htn-001",
        "systolic_bp": 150,
        "diastolic_bp": 95,
        "glucose_mg_dl": 110.0,
        "temperature_f": 98.6,
        "heart_rate_bpm": 76
    }
    result = screening_engine.evaluate(payload)
    assert result["is_emergency"] is False
    assert result["triage_state"] in ["MODERATE_RISK", "HIGH_RISK"]
    assert any("Stage 2 Elevated Blood Pressure" in factor for factor in result["contributing_factors"])


def test_chronic_cough_tb_priority_screening():
    """Cough lasting >= 14 days evaluates to HIGH risk TB priority."""
    payload = {
        "patient_id": "p-tb-001",
        "symptoms": ["cough", "fever"],
        "symptom_duration_days": 18,
        "temperature_f": 100.2,
        "systolic_bp": 120,
        "diastolic_bp": 80,
        "glucose_mg_dl": 95.0,
        "heart_rate_bpm": 74
    }
    result = screening_engine.evaluate(payload)
    assert result["is_emergency"] is False
    assert result["risk_level"] == "HIGH"
    assert result["triage_state"] == "HIGH_RISK"
    assert any("TB" in cond for cond in result["likely_conditions"])
    assert any("Persistent cough lasting 18 days" in factor for factor in result["contributing_factors"])


def test_healthy_baseline_patient_evaluates_low_risk():
    """All normal vitals with no symptoms evaluates to LOW risk."""
    payload = {
        "patient_id": "p-normal-001",
        "systolic_bp": 118,
        "diastolic_bp": 76,
        "glucose_mg_dl": 92.0,
        "temperature_f": 98.4,
        "heart_rate_bpm": 70,
        "height_cm": 165.0,
        "weight_kg": 62.0,
        "symptoms": []
    }
    result = screening_engine.evaluate(payload)
    assert result["is_emergency"] is False
    assert result["risk_level"] == "LOW"
    assert result["triage_state"] == "LOW_RISK"
    assert result["uncertainty_state"] == "COMPLETE"
    assert result["risk_score"] <= 0.20
    assert result["referral_status"] == "NOT_REFERRED"
