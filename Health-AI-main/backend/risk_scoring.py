"""
risk_scoring.py — Centralized Clinical Risk Prediction & Scoring System
========================================================================
Centralizes risk-level thresholds, clinical condition severity weights,
and deterministic scoring formulas across the RuralHealth AI platform.

Thresholds:
  0–30   -> Low
  31–50  -> Moderate
  51–70  -> High
  71–100 -> Critical
"""

from typing import Dict, Any, List, Optional, Tuple

# ─── CENTRALIZED CONFIGURABLE RISK THRESHOLDS ─────────────────────────────────
RISK_THRESHOLDS: Dict[str, Tuple[int, int]] = {
    "LOW": (0, 30),
    "MODERATE": (31, 50),
    "HIGH": (51, 70),
    "CRITICAL": (71, 100),
}

# ─── CONDITION TO SPECIALTY & BASE CLINICAL SEVERITY ───────────────────────────
# Base severity multiplier reflects inherent clinical acuity (0.3 = benign, 1.0 = emergency)
CONDITION_CLINICAL_PROFILES: Dict[str, Dict[str, Any]] = {
    # Emergency / Critical conditions (Base acuity 0.85 - 1.0)
    "acute respiratory distress syndrome (ards)": {
        "specialty": "Pulmonology / Critical Care",
        "base_acuity": 0.95,
        "is_emergency": True,
        "required_capabilities": ["ICU", "Ventilator", "24/7 Emergency"]
    },
    "abdominal aortic aneurysm": {
        "specialty": "Vascular Surgery / Cardiology",
        "base_acuity": 0.95,
        "is_emergency": True,
        "required_capabilities": ["Emergency Surgery", "ICU", "Blood Bank"]
    },
    "angina": {
        "specialty": "Cardiology",
        "base_acuity": 0.85,
        "is_emergency": True,
        "required_capabilities": ["24/7 Emergency", "Cath Lab / Cardiac Care", "ECG"]
    },
    "arrhythmia": {
        "specialty": "Cardiology",
        "base_acuity": 0.80,
        "is_emergency": True,
        "required_capabilities": ["Cardiac Care", "ECG", "ICU"]
    },
    "atrial fibrillation": {
        "specialty": "Cardiology",
        "base_acuity": 0.82,
        "is_emergency": True,
        "required_capabilities": ["Cardiology", "ECG", "ICU"]
    },
    "acute kidney injury": {
        "specialty": "Nephrology / Critical Care",
        "base_acuity": 0.88,
        "is_emergency": True,
        "required_capabilities": ["Dialysis", "ICU", "Diagnostics"]
    },
    "acute pancreatitis": {
        "specialty": "Gastroenterology / General Surgery",
        "base_acuity": 0.85,
        "is_emergency": True,
        "required_capabilities": ["Inpatient Surgery", "ICU", "Diagnostics"]
    },
    "appendicitis": {
        "specialty": "General Surgery",
        "base_acuity": 0.82,
        "is_emergency": True,
        "required_capabilities": ["Emergency Surgery", "Diagnostics", "Inpatient Beds"]
    },
    "acute glaucoma": {
        "specialty": "Ophthalmology",
        "base_acuity": 0.78,
        "is_emergency": True,
        "required_capabilities": ["Ophthalmology Emergency", "Diagnostics"]
    },

    # High / Serious Conditions (Base acuity 0.65 - 0.79)
    "pneumonia": {
        "specialty": "Pulmonology / Internal Medicine",
        "base_acuity": 0.75,
        "is_emergency": False,
        "required_capabilities": ["Oxygen Support", "X-Ray", "Diagnostics"]
    },
    "acute bronchitis": {
        "specialty": "Pulmonology",
        "base_acuity": 0.65,
        "is_emergency": False,
        "required_capabilities": ["Nebulization", "X-Ray"]
    },
    "acute bronchiolitis": {
        "specialty": "Pediatrics / Pulmonology",
        "base_acuity": 0.70,
        "is_emergency": False,
        "required_capabilities": ["Pediatric Care", "Oxygen Support"]
    },
    "asthma": {
        "specialty": "Pulmonology",
        "base_acuity": 0.68,
        "is_emergency": False,
        "required_capabilities": ["Nebulization", "Oxygen Support"]
    },
    "diabetes": {
        "specialty": "Endocrinology / Diabetology",
        "base_acuity": 0.65,
        "is_emergency": False,
        "required_capabilities": ["HbA1c Lab", "Dietary Clinic"]
    },
    "hypertension": {
        "specialty": "Cardiology / Internal Medicine",
        "base_acuity": 0.65,
        "is_emergency": False,
        "required_capabilities": ["ECG", "Vascular Doppler"]
    },
    "tuberculosis": {
        "specialty": "Pulmonology / Infectious Disease (NTEP)",
        "base_acuity": 0.75,
        "is_emergency": False,
        "required_capabilities": ["Sputum Microscopy / CBNAAT", "Chest X-Ray", "DOTS Center"]
    },
    "aplastic anemia": {
        "specialty": "Hematology",
        "base_acuity": 0.75,
        "is_emergency": False,
        "required_capabilities": ["Blood Bank", "Diagnostics", "Hematology"]
    },

    # Moderate conditions (Base acuity 0.40 - 0.60)
    "anemia": {
        "specialty": "General Medicine / Hematology",
        "base_acuity": 0.45,
        "is_emergency": False,
        "required_capabilities": ["Diagnostics", "CBC Lab"]
    },
    "acute sinusitis": {
        "specialty": "ENT / Otorhinolaryngology",
        "base_acuity": 0.40,
        "is_emergency": False,
        "required_capabilities": ["Outpatient Clinic"]
    },
    "acute otitis media": {
        "specialty": "ENT / Pediatrics",
        "base_acuity": 0.42,
        "is_emergency": False,
        "required_capabilities": ["Outpatient Clinic"]
    },
    "alcoholic liver disease": {
        "specialty": "Gastroenterology / Hepatology",
        "base_acuity": 0.60,
        "is_emergency": False,
        "required_capabilities": ["Ultrasound", "Liver Function Lab"]
    },

    # Low / Mild conditions (Base acuity 0.20 - 0.35)
    "acne": {
        "specialty": "Dermatology",
        "base_acuity": 0.20,
        "is_emergency": False,
        "required_capabilities": ["Outpatient Dermatology"]
    },
    "allergy": {
        "specialty": "Allergy / Immunology / General Medicine",
        "base_acuity": 0.30,
        "is_emergency": False,
        "required_capabilities": ["Outpatient Clinic"]
    },
    "alopecia": {
        "specialty": "Dermatology",
        "base_acuity": 0.20,
        "is_emergency": False,
        "required_capabilities": ["Outpatient Dermatology"]
    },
    "aphthous ulcer": {
        "specialty": "Dental / General Medicine",
        "base_acuity": 0.22,
        "is_emergency": False,
        "required_capabilities": ["Outpatient Clinic"]
    },
    "athlete's foot": {
        "specialty": "Dermatology",
        "base_acuity": 0.20,
        "is_emergency": False,
        "required_capabilities": ["Outpatient Dermatology"]
    },
}

# Red-flag symptom keywords that escalate risk towards critical
CRITICAL_SYMPTOM_TRIGGERS = [
    "chest pain", "angina", "shortness of breath", "breathlessness",
    "difficulty breathing", "unconscious", "hemoptysis", "coughing blood",
    "hypertensive crisis", "severe abdominal pain", "cyanosis", "respiratory distress"
]


def classify_risk_level(score: float) -> str:
    """
    Classifies a risk score (0-100) into Low, Moderate, High, or Critical
    based on centralized thresholds.
    """
    s = float(score)
    if s > RISK_THRESHOLDS["HIGH"][1]:  # > 70
        return "CRITICAL"
    elif s > RISK_THRESHOLDS["MODERATE"][1]:  # 51-70
        return "HIGH"
    elif s > RISK_THRESHOLDS["LOW"][1]:  # 31-50
        return "MODERATE"
    else:  # 0-30
        return "LOW"


def get_condition_profile(condition_name: str) -> Dict[str, Any]:
    """
    Looks up clinical profile for a condition by normalized name or keyword matching.
    """
    cond_norm = condition_name.lower().strip()
    if cond_norm in CONDITION_CLINICAL_PROFILES:
        return CONDITION_CLINICAL_PROFILES[cond_norm]

    # Keyword fallback matching
    for key, prof in CONDITION_CLINICAL_PROFILES.items():
        if key in cond_norm or cond_norm in key:
            return prof

    if any(k in cond_norm for k in ["cardio", "heart", "infarct", "coronary"]):
        return {
            "specialty": "Cardiology",
            "base_acuity": 0.85,
            "is_emergency": True,
            "required_capabilities": ["24/7 Emergency", "Cardiology", "ICU"]
        }
    elif any(k in cond_norm for k in ["respir", "lung", "breath", "pulmon", "tb"]):
        return {
            "specialty": "Pulmonology",
            "base_acuity": 0.72,
            "is_emergency": False,
            "required_capabilities": ["Oxygen Support", "X-Ray", "Diagnostics"]
        }
    elif any(k in cond_norm for k in ["diabet", "sugar", "endocrin"]):
        return {
            "specialty": "Endocrinology / Diabetology",
            "base_acuity": 0.65,
            "is_emergency": False,
            "required_capabilities": ["HbA1c Lab", "Diagnostics"]
        }
    elif any(k in cond_norm for k in ["kidney", "renal", "nephro"]):
        return {
            "specialty": "Nephrology",
            "base_acuity": 0.78,
            "is_emergency": False,
            "required_capabilities": ["Dialysis", "Diagnostics"]
        }
    elif any(k in cond_norm for k in ["skin", "derma", "rash"]):
        return {
            "specialty": "Dermatology",
            "base_acuity": 0.25,
            "is_emergency": False,
            "required_capabilities": ["Outpatient Dermatology"]
        }

    return {
        "specialty": "General Medicine",
        "base_acuity": 0.50,
        "is_emergency": False,
        "required_capabilities": ["General Outpatient", "Diagnostics"]
    }


def calculate_item_risk(
    model_score: float,
    condition_name: str,
    contributing_symptoms: Optional[List[str]] = None,
    item_index: int = 1
) -> Dict[str, Any]:
    """
    Assigns a deterministic, explainable risk score (0-100) and risk level
    to an individual predicted item.

    Formula:
      - Raw probability / confidence normalized to 0-100
      - Weighted by clinical condition acuity profile
      - Modulated by presence of red-flag symptoms
    """
    profile = get_condition_profile(condition_name)
    base_acuity = profile.get("base_acuity", 0.5)

    # Normalize input probability / score
    p = float(model_score)
    if p > 1.0:
        p = p / 100.0  # Already on 0-100 scale
    p = max(0.01, min(0.99, p))

    # Calculate blend: 60% clinical acuity of condition, 40% model probability confidence
    raw_calc = (base_acuity * 60.0) + (p * 40.0)

    # Check for critical symptom escalation
    symptoms = contributing_symptoms or []
    has_critical_symptom = any(
        any(trig in s.lower() for trig in CRITICAL_SYMPTOM_TRIGGERS)
        for s in symptoms
    )
    if has_critical_symptom and profile.get("is_emergency", False):
        raw_calc = max(raw_calc, 75.0)  # Guarantee Critical for emergency + critical symptom
    elif has_critical_symptom:
        raw_calc += 10.0

    # Ensure rank decay for secondary items if model confidence is low
    if item_index > 1 and p < 0.25:
        raw_calc = raw_calc * 0.85

    # For mild outpatient conditions (base_acuity <= 0.30) with no critical symptoms,
    # clinical risk stays in the Low band (<= 30)
    if base_acuity <= 0.30 and not has_critical_symptom:
        raw_calc = min(raw_calc, 28.0)

    risk_score = round(max(5.0, min(99.0, raw_calc)), 1)
    risk_level = classify_risk_level(risk_score)

    return {
        "item_id": f"item_{condition_name.lower().replace(' ', '_')[:24]}_{int(risk_score)}",
        "risk_score": risk_score,
        "risk_level": risk_level,
        "required_specialty": profile.get("specialty", "General Medicine"),
        "is_emergency": profile.get("is_emergency", False),
        "required_capabilities": profile.get("required_capabilities", ["General Outpatient"]),
    }
