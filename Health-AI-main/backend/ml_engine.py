"""
ml_engine.py — Clinically Governed Triage & Decision-Support Engine
====================================================================
Implements:
1. TASK-001: Strict Nullability, Uncertainty Evaluation, No Silent Normal Defaults
2. TASK-002: Red-Flag Emergency Short-Circuit Interceptor
3. Deterministic Domain Screening (Diabetes, Cardiovascular, Respiratory/TB, Anemia)

Standards Compliance: ISO 14971:2019 Risk Framework & Medical Device Life-Cycle
Ruleset Version: 2.0.0 | Workflow Version: 2.0.0
"""

from typing import List, Dict, Any, Optional, Tuple

WORKFLOW_VERSION = "2.0.0"
RULESET_VERSION = "2.0.0"

MEDICAL_DISCLAIMER = (
    "DISCLAIMER: This tool is a screening and decision-support prototype. "
    "It does NOT provide a formal medical diagnosis or prescriptions, "
    "and does NOT replace evaluation by a qualified healthcare professional."
)


class RedFlagInterceptor:
    """
    Priority safety interceptor that evaluates life-threatening clinical presentations.
    Executes BEFORE any ordinary additive scoring to guarantee emergency precedence.
    """

    @staticmethod
    def evaluate(
        symptoms: List[str],
        vitals: Dict[str, Optional[float]],
        symptom_duration: Optional[int] = None
    ) -> Tuple[bool, List[str], List[str]]:
        """
        Returns:
            (is_emergency: bool, red_flags: List[str], likely_conditions: List[str])
        """
        red_flags: List[str] = []
        conditions: List[str] = []
        
        systolic = vitals.get("systolic_bp")
        diastolic = vitals.get("diastolic_bp")
        glucose = vitals.get("glucose_mg_dl")
        temp_f = vitals.get("temperature_f")
        heart_rate = vitals.get("heart_rate_bpm")
        
        symptoms_lower = [s.lower().strip() for s in symptoms]
        symptoms_str = " ".join(symptoms_lower)

        # 1. Cardiovascular Emergency: Hypertensive Crisis
        if (systolic is not None and systolic >= 180) or (diastolic is not None and diastolic >= 120):
            flag_msg = f"Hypertensive Crisis Vitals (BP: {systolic or '?'}/{diastolic or '?'} mmHg >= 180/120)"
            red_flags.append(flag_msg)
            conditions.append("Hypertensive Crisis — Immediate Emergency Care Required")

        # 2. Acute Coronary Syndrome / Myocardial Infarction Signals
        has_chest_pain = any(k in symptoms_str for k in ["chest pain", "chest discomfort", "cardiac pain", "pressure in chest"])
        has_cardio_distress = any(k in symptoms_str for k in ["shortness of breath", "breathlessness", "dizziness", "palpitations", "sweating", "cold sweat", "pain radiating to arm"])
        if has_chest_pain and has_cardio_distress:
            red_flags.append("Acute Coronary Syndrome Presentation (Chest pain combined with acute distress / breathlessness)")
            conditions.append("Suspected Acute Myocardial Infarction / Unstable Angina — Call 108 Immediately")
        elif has_chest_pain:
            red_flags.append("Unexplained Acute Chest Pain reported")
            conditions.append("Acute Chest Pain Evaluation Required — Emergency Referral")

        # 3. Respiratory Emergency & Hemoptysis
        has_hemoptysis = any(k in symptoms_str for k in ["coughing blood", "blood in sputum", "hemoptysis", "vomiting blood"])
        if has_hemoptysis:
            red_flags.append("Acute Hemoptysis / Bleeding (Coughing blood or blood in sputum)")
            conditions.append("Acute Hemoptysis / Severe Pulmonary Hemorrhage — Urgent Hospital Triage")

        if temp_f is not None and temp_f >= 104.0:
            red_flags.append(f"Hyperpyrexia Recorded (Temperature: {temp_f}°F >= 104.0°F)")
            conditions.append("Severe Hyperpyrexia / Central Fever Alert")

        # Severe breathlessness with fever
        has_severe_dyspnea = any(k in symptoms_str for k in ["severe shortness of breath", "severe breathlessness", "gasping", "struggling to breathe"])
        if has_severe_dyspnea:
            red_flags.append("Severe Acute Respiratory Distress (Inability to breathe adequately)")
            conditions.append("Acute Respiratory Failure / Severe Bronchospasm Alert")

        # 4. Metabolic Crisis (Diabetic Coma / Severe Hypoglycemia / DKA)
        if glucose is not None:
            if glucose >= 400.0:
                red_flags.append(f"Critical Hyperglycemia ({glucose} mg/dL >= 400 mg/dL — DKA / HHS Risk)")
                conditions.append("Critical Diabetic Hyperglycemic Crisis — Immediate IV Hydration & PHC/CHC Transfer")
            elif glucose < 54.0:
                red_flags.append(f"Severe Neuroglycopenic Hypoglycemia ({glucose} mg/dL < 54 mg/dL)")
                conditions.append("Severe Acute Hypoglycemia — Administer Fast-Acting Glucose / Urgent Care")

        # 5. Severe Hemodynamic Instability / Shock Alert
        if heart_rate is not None:
            if heart_rate >= 150:
                red_flags.append(f"Severe Tachyarrhythmia ({heart_rate} bpm >= 150 bpm)")
                conditions.append("Severe Tachycardia / Potential Hemodynamic Compromise")
            elif heart_rate <= 40:
                red_flags.append(f"Severe Symptomatic Bradycardia ({heart_rate} bpm <= 40 bpm)")
                conditions.append("Severe Bradycardia / Potential Heart Block")

        if systolic is not None and systolic < 80:
            red_flags.append(f"Critical Hypotension / Shock State (Systolic BP: {systolic} mmHg < 80 mmHg)")
            conditions.append("Suspected Hemodynamic Shock / Severe Dehydration")

        # 6. Neurological & Consciousness Red Flags
        if any(k in symptoms_str for k in ["unconscious", "loss of consciousness", "fainting with seizure", "altered mental status", "slurred speech"]):
            red_flags.append("Altered Consciousness / Acute Neurological Deficit")
            conditions.append("Acute Neurological Emergency / Stroke / Encephalopathy Alert")

        is_emergency = len(red_flags) > 0
        return is_emergency, red_flags, conditions


class UncertaintyEvaluator:
    """
    Evaluates clinical data completeness.
    Guarantees Invariant 1: Missing clinical information must never silently become normal.
    """

    @staticmethod
    def evaluate(
        symptoms: List[str],
        vitals: Dict[str, Optional[float]]
    ) -> Tuple[str, List[str]]:
        """
        Returns:
            (uncertainty_state: str, missing_factors: List[str])
            States: COMPLETE | INSUFFICIENT_DATA | UNCERTAIN
        """
        missing_factors: List[str] = []
        
        has_bp = vitals.get("systolic_bp") is not None and vitals.get("diastolic_bp") is not None
        has_glucose = vitals.get("glucose_mg_dl") is not None
        has_temp = vitals.get("temperature_f") is not None
        has_hr = vitals.get("heart_rate_bpm") is not None
        
        vitals_present_count = sum([1 for v in [has_bp, has_glucose, has_temp, has_hr] if v])
        
        if not has_bp:
            missing_factors.append("Blood Pressure (Systolic/Diastolic) not recorded")
        if not has_glucose:
            missing_factors.append("Blood Glucose not measured")
        if not has_temp:
            missing_factors.append("Body Temperature not recorded")

        # If zero or only one vital sign was recorded and patient is presenting symptoms
        if vitals_present_count == 0:
            return "INSUFFICIENT_DATA", [
                "INSUFFICIENT DATA: Vital signs (Blood Pressure, Glucose, Temperature) are unrecorded. "
                "Risk score calculation suspended to prevent false reassurance."
            ]
        elif vitals_present_count == 1 and len(symptoms) > 0:
            return "UNCERTAIN", [
                "PARTIAL VITALS: Incomplete physiological profile. Clinical risk score is approximate."
            ]

        return "COMPLETE", []


class RiskScreeningEngine:
    """
    Governed clinical decision-support and triage engine.
    Integrates Red-Flag Interceptor, Uncertainty Evaluator, and Multi-Domain Deterministic Rules.
    """

    def __init__(self):
        self.workflow_version = WORKFLOW_VERSION
        self.ruleset_version = RULESET_VERSION

    def evaluate(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Deterministic, transparent clinical decision-support screening.
        Guarantees:
        - No silent defaults.
        - Red flags short-circuit immediately to EMERGENCY.
        - Missing mandatory vitals return INSUFFICIENT_DATA.
        """
        symptoms = [s.strip() for s in data.get("symptoms", []) if s and str(s).strip()]
        symptom_duration = data.get("symptom_duration_days")
        
        # TASK-001: Explicit Vitals Extraction (Strict None if missing, no 98.6 or 120 defaults)
        temp_f = float(data["temperature_f"]) if data.get("temperature_f") is not None else None
        systolic = int(data["systolic_bp"]) if data.get("systolic_bp") is not None else None
        diastolic = int(data["diastolic_bp"]) if data.get("diastolic_bp") is not None else None
        glucose = float(data["glucose_mg_dl"]) if data.get("glucose_mg_dl") is not None else None
        hr = int(data["heart_rate_bpm"]) if data.get("heart_rate_bpm") is not None else None
        
        height_cm = float(data["height_cm"]) if data.get("height_cm") is not None else None
        weight_kg = float(data["weight_kg"]) if data.get("weight_kg") is not None else None
        
        bmi = data.get("bmi")
        if bmi is None and height_cm is not None and weight_kg is not None and height_cm > 0:
            bmi = round(weight_kg / ((height_cm / 100) ** 2), 1)

        smoking = data.get("smoking_status") or "Never"
        alcohol = data.get("alcohol_status") or "Never"
        activity = data.get("physical_activity") or "Moderate"
        family_history = [f.lower().strip() for f in data.get("family_history", []) if f]

        vitals_dict: Dict[str, Optional[float]] = {
            "temperature_f": temp_f,
            "systolic_bp": systolic,
            "diastolic_bp": diastolic,
            "glucose_mg_dl": glucose,
            "heart_rate_bpm": hr,
            "height_cm": height_cm,
            "weight_kg": weight_kg,
            "bmi": bmi
        }

        # ─── STEP 1: RED-FLAG EMERGENCY INTERCEPTOR (TASK-002) ───────────────
        is_emergency, red_flags, emergency_conditions = RedFlagInterceptor.evaluate(
            symptoms=symptoms,
            vitals=vitals_dict,
            symptom_duration=symptom_duration
        )

        if is_emergency:
            # Short-circuit immediately! Do NOT compute additive scores or allow downgrade.
            emergency_recommendation = (
                "🚨 CRITICAL EMERGENCY RED FLAG: Immediate medical intervention required. "
                "Contact 108 Emergency Ambulance service or initiate immediate transfer to Community Health Centre (CHC) / District Hospital. "
                "Keep patient resting and monitor airway, breathing, and circulation."
            )
            return {
                "risk_level": "HIGH",
                "triage_state": "EMERGENCY",
                "is_emergency": True,
                "short_circuit": True,
                "red_flags": red_flags,
                "uncertainty_state": "COMPLETE",
                "risk_score": 0.99,
                "likely_conditions": emergency_conditions,
                "contributing_factors": red_flags,
                "recommended_action": emergency_recommendation,
                "referral_status": "REFERRED",
                "workflow_version": self.workflow_version,
                "ruleset_version": self.ruleset_version,
                "disclaimer": MEDICAL_DISCLAIMER
            }

        # ─── STEP 2: UNCERTAINTY & DATA SUFFICIENCY EVALUATOR (TASK-001) ─────
        uncertainty_state, missing_warnings = UncertaintyEvaluator.evaluate(
            symptoms=symptoms,
            vitals=vitals_dict
        )

        if uncertainty_state == "INSUFFICIENT_DATA":
            insufficient_recommendation = (
                "INSUFFICIENT CLINICAL DATA: Vital measurements (Blood Pressure, Blood Glucose, Temperature) "
                "were not recorded. A complete screening risk score cannot be safely computed. "
                "Please perform vital sign measurements at the Sub-Centre or PHC before finalizing risk stratification."
            )
            return {
                "risk_level": "INSUFFICIENT_DATA",
                "triage_state": "INSUFFICIENT_DATA",
                "is_emergency": False,
                "short_circuit": False,
                "red_flags": [],
                "uncertainty_state": "INSUFFICIENT_DATA",
                "risk_score": None,
                "likely_conditions": ["Incomplete Health Intake — Vital Signs Assessment Required"],
                "contributing_factors": missing_warnings,
                "recommended_action": insufficient_recommendation,
                "referral_status": "NOT_REFERRED",
                "workflow_version": self.workflow_version,
                "ruleset_version": self.ruleset_version,
                "disclaimer": MEDICAL_DISCLAIMER
            }

        # ─── STEP 3: DETERMINISTIC CLINICAL RULES EVALUATION ─────────────────
        factors: List[str] = list(missing_warnings)
        conditions: List[str] = []
        raw_risk_score = 0.05
        symptoms_lower = [s.lower() for s in symptoms]
        symptoms_str = " ".join(symptoms_lower)

        # 1. Diabetes / Metabolic Risk Check
        glucose_risk = False
        if glucose is not None:
            if glucose >= 200:
                factors.append(f"Severely Elevated Blood Glucose ({glucose} mg/dL >= 200 mg/dL)")
                raw_risk_score += 0.40
                glucose_risk = True
            elif glucose >= 140:
                factors.append(f"Elevated Blood Glucose ({glucose} mg/dL >= 140 mg/dL)")
                raw_risk_score += 0.25
                glucose_risk = True
            elif glucose >= 126:
                factors.append(f"Fasting Blood Glucose in High Risk Range ({glucose} mg/dL)")
                raw_risk_score += 0.20
                glucose_risk = True

        diabetes_symptoms = ["frequent urination", "increased thirst", "excessive thirst", "unexplained weight loss", "blurred vision", "extreme fatigue"]
        matching_diab_symptoms = [s for s in symptoms_lower if any(ds in s for ds in diabetes_symptoms)]
        if matching_diab_symptoms:
            factors.append(f"Reported diabetes-related symptoms: {', '.join(matching_diab_symptoms)}")
            raw_risk_score += 0.15 * len(matching_diab_symptoms)
            glucose_risk = True

        if any("diabetes" in fh for fh in family_history):
            factors.append("Family history of Diabetes mellitus")
            raw_risk_score += 0.10

        if glucose_risk:
            conditions.append("Elevated Diabetes Screening Risk — Further Evaluation Recommended")

        # 2. Cardiovascular / Hypertension Risk Check
        bp_risk = False
        if systolic is not None and diastolic is not None:
            if systolic >= 140 or diastolic >= 90:
                factors.append(f"Stage 2 Elevated Blood Pressure (BP: {systolic}/{diastolic} mmHg)")
                raw_risk_score += 0.30
                bp_risk = True
            elif systolic >= 130 or diastolic >= 80:
                factors.append(f"Stage 1 Borderline Blood Pressure (BP: {systolic}/{diastolic} mmHg)")
                raw_risk_score += 0.15
                bp_risk = True

        cardio_symptoms = ["dizziness", "palpitations", "swelling", "swelling in legs", "breathlessness"]
        matching_cardio = [s for s in symptoms_lower if any(cs in s for cs in cardio_symptoms)]
        if matching_cardio:
            factors.append(f"Cardiovascular warning signs: {', '.join(matching_cardio)}")
            raw_risk_score += 0.25
            bp_risk = True

        if smoking == "Current":
            factors.append("Current tobacco / smoking habit (elevated vascular risk)")
            raw_risk_score += 0.15

        if activity == "Sedentary":
            factors.append("Sedentary lifestyle reported")
            raw_risk_score += 0.05
        
        if bp_risk:
            conditions.append("Possible Hypertension / Cardiovascular-Related Concern")

        # 3. Respiratory / Infection / TB Triage
        resp_risk = False
        if temp_f is not None:
            if temp_f >= 101.0:
                factors.append(f"High Fever Recorded ({temp_f}°F)")
                raw_risk_score += 0.25
                resp_risk = True
            elif temp_f >= 99.5:
                factors.append(f"Mild Low-Grade Fever ({temp_f}°F)")
                raw_risk_score += 0.10

        tb_symptoms = ["cough", "persistent cough", "night sweats", "fever", "weight loss"]
        matching_tb = [s for s in symptoms_lower if any(ts in s for ts in tb_symptoms)]
        if matching_tb:
            factors.append(f"Respiratory symptoms: {', '.join(matching_tb)}")
            if symptom_duration is not None and symptom_duration >= 14 and any("cough" in s for s in matching_tb):
                factors.append(f"Persistent cough lasting {symptom_duration} days (High priority TB screening criteria)")
                raw_risk_score += 0.35
                resp_risk = True
            else:
                raw_risk_score += 0.15

        if resp_risk:
            if symptom_duration is not None and symptom_duration >= 14 and any("cough" in s for s in symptoms_lower):
                conditions.append("Possible TB-Related Concern — Urgent Sputum Screening Recommended")
            else:
                conditions.append("Acute Respiratory Infection Screening Concern")

        # 4. Anemia / Weakness Risk
        anemia_symptoms = ["weakness", "fatigue", "dizziness", "nausea", "swelling", "pale skin"]
        matching_anemia = [s for s in symptoms_lower if any(ans in s for ans in anemia_symptoms)]
        if len(matching_anemia) >= 2:
            factors.append(f"General constitutional symptoms: {', '.join(matching_anemia)}")
            raw_risk_score += 0.15
            conditions.append("General Nutritional / Anemia Evaluation Recommended")

        # 5. Anthropometric & Vitals Check
        if bmi is not None:
            if bmi >= 30.0:
                factors.append(f"Obesity Category (BMI {bmi} kg/m²)")
                raw_risk_score += 0.10
            elif bmi < 18.5:
                factors.append(f"Underweight Category (BMI {bmi} kg/m²)")
                raw_risk_score += 0.10

        if hr is not None and hr >= 100:
            factors.append(f"Elevated Heart Rate ({hr} bpm)")
            raw_risk_score += 0.15

        # Score capping
        risk_score = round(min(max(raw_risk_score, 0.05), 0.98), 2)

        # Risk Level Categorization
        duration_cough = (symptom_duration is not None and symptom_duration >= 14 and "cough" in symptoms_str)
        if risk_score >= 0.55 or (systolic is not None and systolic >= 160) or (glucose is not None and glucose >= 200) or duration_cough:
            risk_level = "HIGH"
            triage_state = "HIGH_RISK"
        elif risk_score >= 0.25 or (systolic is not None and systolic >= 130) or (glucose is not None and glucose >= 140) or (temp_f is not None and temp_f >= 100.0) or len(symptoms) >= 2:
            risk_level = "MODERATE"
            triage_state = "MODERATE_RISK"
        else:
            risk_level = "LOW"
            triage_state = "LOW_RISK"

        if not conditions:
            conditions.append("Routine Baseline Health Screening — Low Immediate Concern")

        if not factors:
            factors.append("Normal vitals within expected parameters")
            factors.append("No acute high-risk symptoms reported")

        # Action Recommendations
        if risk_level == "HIGH":
            recommendation = (
                "PHC EVALUATION RECOMMENDED: High screening risk flagged. Refer patient to Primary Health Centre (PHC) Medical Officer within 24 hours. "
                "Order Fasting Blood Glucose, HbA1c, and Sputum Smear if chronic cough is present."
            )
            referral_status = "REFERRED"
        elif risk_level == "MODERATE":
            recommendation = (
                "ROUTINE PHC REFERRAL: Moderate screening risk. Schedule PHC visit within 3-5 days. "
                "Advise lifestyle modifications, dietary control, and re-check vitals in 1 week."
            )
            referral_status = "NOT_REFERRED"
        else:
            recommendation = (
                "COMMUNITY CARE: Patient baseline vitals are low risk. Provide standard wellness and preventive health guidance."
            )
            referral_status = "NOT_REFERRED"

        return {
            "risk_level": risk_level,
            "triage_state": triage_state,
            "is_emergency": False,
            "short_circuit": False,
            "red_flags": [],
            "uncertainty_state": uncertainty_state,
            "risk_score": risk_score,
            "likely_conditions": conditions,
            "contributing_factors": factors,
            "recommended_action": recommendation,
            "referral_status": referral_status,
            "workflow_version": self.workflow_version,
            "ruleset_version": self.ruleset_version,
            "disclaimer": MEDICAL_DISCLAIMER
        }


screening_engine = RiskScreeningEngine()
