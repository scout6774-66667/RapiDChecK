"""
resource_context_service.py — Clinical Context Extraction Engine
=================================================================
Implements Section 3 & Algorithm 1 of the Health Resources Implementation Plan:
1. Normalizes raw user, patient, and clinical assessment inputs into canonical ResourceContext.
2. Preserves INSUFFICIENT_DATA, INVALID_DATA, and CONFLICTING_DATA states.
3. Consumes clinical context strictly in read-only mode without mutating clinical assessments.
"""

from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from database import PatientModel, AssessmentModel, UserModel
from health_resource_schemas import ResourceContext


def extract_resource_context(
    db: Optional[Session] = None,
    user: Optional[UserModel] = None,
    user_role: str = "ASHA_WORKER",
    facility_id: Optional[str] = "PHC_MAIN",
    patient_id: Optional[str] = None,
    assessment_id: Optional[str] = None,
    requested_topic: Optional[str] = None,
    language: str = "en",
    raw_context: Optional[ResourceContext] = None,
    online_status: bool = True
) -> ResourceContext:
    """
    Extracts and validates a canonical ResourceContext from:
    1. Authenticated user JWT/UserModel (user_id, role, facility_id)
    2. Patient demographic record (age, sex, pregnancy status)
    3. Clinical assessment record (vitals, symptoms, triage state, red flags, uncertainty)
    4. Explicit user search / question query.
    """
    # If caller supplied a pre-built or offline ResourceContext, use as base
    if raw_context:
        ctx = raw_context.model_copy()
        if user:
            ctx.user_id = user.id
            ctx.user_role = user.role
            ctx.facility_id = user.facility_id or "PHC_MAIN"
        elif user_role:
            ctx.user_role = user_role
        if requested_topic:
            ctx.requested_topic = requested_topic
        if language:
            ctx.language = language
        ctx.online_status = online_status
        return ctx

    effective_user_id = user.id if user else None
    effective_role = user.role if user else user_role
    effective_facility_id = (user.facility_id if user else facility_id) or "PHC_MAIN"

    patient_record: Optional[PatientModel] = None
    assessment_record: Optional[AssessmentModel] = None

    if db:
        if assessment_id:
            assessment_record = db.query(AssessmentModel).filter(
                AssessmentModel.id == assessment_id,
                AssessmentModel.is_deleted == 0
            ).first()
            if assessment_record and not patient_id:
                patient_id = assessment_record.patient_id

        if patient_id:
            patient_record = db.query(PatientModel).filter(
                PatientModel.id == patient_id,
                PatientModel.is_deleted == 0
            ).first()

    # Extract demographic parameters
    age: Optional[int] = None
    sex: Optional[str] = None
    pregnancy_status = "NOT_PREGNANT"

    if patient_record:
        age = patient_record.age
        gender_raw = (patient_record.gender or "").strip().upper()
        if gender_raw in ["FEMALE", "F", "WOMAN"]:
            sex = "FEMALE"
        elif gender_raw in ["MALE", "M", "MAN"]:
            sex = "MALE"
        else:
            sex = "OTHER"

    # Extract clinical parameters from assessment (preserving uncertainty states)
    symptoms: List[str] = []
    diagnoses: List[str] = []
    risk_flags: List[str] = []
    risk_level = "LOW"
    triage_state = "LOW_RISK"
    is_emergency = False
    uncertainty_state = "COMPLETE"

    systolic_bp: Optional[int] = None
    diastolic_bp: Optional[int] = None
    glucose_mg_dl: Optional[float] = None
    heart_rate_bpm: Optional[int] = None
    temperature_f: Optional[float] = None

    if assessment_record:
        symptoms = list(assessment_record.symptoms or [])
        diagnoses = list(assessment_record.likely_conditions or [])
        risk_flags = list(assessment_record.red_flags or [])
        risk_level = assessment_record.risk_level or "LOW"
        triage_state = assessment_record.triage_state or "LOW_RISK"
        is_emergency = bool(assessment_record.is_emergency)
        uncertainty_state = assessment_record.uncertainty_state or "COMPLETE"

        systolic_bp = assessment_record.systolic_bp
        diastolic_bp = assessment_record.diastolic_bp
        glucose_mg_dl = assessment_record.glucose_mg_dl
        heart_rate_bpm = assessment_record.heart_rate_bpm
        temperature_f = assessment_record.temperature_f

        # Check if pregnancy is indicated in symptoms/family history or symptoms contain pregnancy indicators
        lower_symptoms = [s.lower() for s in symptoms]
        if any("pregnant" in s or "anc" in s or "trimester" in s or "labor" in s for s in lower_symptoms):
            if any("high risk" in s or "eclampsia" in s or "bleeding" in s for s in lower_symptoms):
                pregnancy_status = "HIGH_RISK_PREGNANCY"
            elif any("third trimester" in s or "3rd trimester" in s for s in lower_symptoms):
                pregnancy_status = "THIRD_TRIMESTER"
            elif any("second trimester" in s or "2nd trimester" in s for s in lower_symptoms):
                pregnancy_status = "SECOND_TRIMESTER"
            elif any("first trimester" in s or "1st trimester" in s for s in lower_symptoms):
                pregnancy_status = "FIRST_TRIMESTER"
            else:
                pregnancy_status = "PREGNANT"

    return ResourceContext(
        user_id=effective_user_id,
        user_role=effective_role,
        facility_id=effective_facility_id,
        patient_id=patient_id,
        assessment_id=assessment_id,
        age=age,
        sex=sex,
        pregnancy_status=pregnancy_status,
        symptoms=symptoms,
        diagnoses=diagnoses,
        risk_flags=risk_flags,
        risk_level=risk_level,
        triage_state=triage_state,
        is_emergency=is_emergency,
        uncertainty_state=uncertainty_state,
        systolic_bp=systolic_bp,
        diastolic_bp=diastolic_bp,
        glucose_mg_dl=glucose_mg_dl,
        heart_rate_bpm=heart_rate_bpm,
        temperature_f=temperature_f,
        requested_topic=requested_topic,
        language=language or "en",
        online_status=online_status
    )
