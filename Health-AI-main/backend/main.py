import uuid
import os
from typing import List, Optional
from datetime import datetime
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
from dotenv import load_dotenv

# Load .env from the same directory as this file
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '.env'))

from database import init_db, get_db, PatientModel, AssessmentModel, AppointmentModel, SyncJournalModel, IdempotencyModel, UserModel, ClinicalReviewModel, AuditEventModel
from schemas import (
    PatientCreate, PatientResponse,
    AssessmentCreate, AssessmentResponse,
    ReferralUpdate, SyncPayload, SyncResponse,
    AppointmentCreate, AppointmentResponse,
    SyncPushRequest, SyncPushResponse,
    SyncPullRequest, SyncPullResponse,
    UserLoginRequest, UserRegisterRequest, UserResponse, TokenResponse, UserProfileResponse,
    ClinicalReviewSubmitRequest, ClinicalReviewResponse, PendingReviewItem, ReviewHistoryItem
)
from sync_service import process_push_batch, process_pull_request, record_journal_entry
from auth_service import (
    hash_password, verify_password, create_access_token, decode_access_token,
    get_current_user, require_roles, require_permissions, seed_default_users, ROLE_PERMISSIONS
)
from review_service import (
    evaluate_review_requirement, list_pending_reviews, assign_review_to_doctor,
    submit_clinician_review, get_review_history
)
from ml_engine import screening_engine, MEDICAL_DISCLAIMER
try:
    from ml.predictor import disease_predictor as _dp
    _ML_PREDICTOR = _dp
except Exception as _ml_err:
    _ML_PREDICTOR = None
    print(f"[main] ML predictor not loaded: {_ml_err}")

# Import consensus engine for hybrid predictions (ML + Google Search)
try:
    from ml.consensus_engine import consensus_engine as _consensus
    _CONSENSUS_ENGINE = _consensus
except Exception as _consensus_err:
    _CONSENSUS_ENGINE = None
    print(f"[main] Consensus engine not loaded: {_consensus_err}")

# Import Gemini client for ML + Gemini predictions
try:
    from ml.gemini_client import gemini_analyzer as _gemini
    _GEMINI = _gemini
except Exception as _gemini_err:
    _GEMINI = None
    print(f"[main] Gemini client not loaded: {_gemini_err}")

from health_resources_service import seed_default_health_resources
from health_resource_routes import router as health_resource_router

app = FastAPI(
    title="RuralHealth AI Backend",
    description="AI-Powered Early Disease Risk Prediction & Rural Health Access Platform API",
    version="2.0.0"
)

# Mount Health Resources Router (v2)
app.include_router(health_resource_router)

# Enable CORS for local Vite dev server and mobile devices
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup_event():
    init_db()
    # Seed default frontline & clinician accounts
    from database import SessionLocal
    db = SessionLocal()
    try:
        seed_default_users(db)
        seed_default_health_resources(db)
    finally:
        db.close()

@app.get("/api/health")
def health_check():
    return {"status": "online", "system": "RuralHealth AI Backend", "version": "1.0.0"}

# --- PATIENTS ENDPOINTS ---

@app.post("/api/patients", response_model=PatientResponse)
def create_patient(patient: PatientCreate, db: Session = Depends(get_db)):
    p_id = patient.id or str(uuid.uuid4())
    existing = db.query(PatientModel).filter(PatientModel.id == p_id).first()
    if existing:
        return existing

    db_patient = PatientModel(
        id=p_id,
        national_health_id=patient.national_health_id,
        name=patient.name,
        age=patient.age,
        gender=patient.gender,
        village=patient.village,
        phone=patient.phone,
        patient_id=patient.patient_id or f"RH-{p_id[:6].upper()}",
        server_version=1,
        is_deleted=0,
        created_at=datetime.utcnow().isoformat(),
        updated_at=datetime.utcnow().isoformat()
    )
    db.add(db_patient)
    db.flush()

    record_journal_entry(
        db=db,
        device_id=None,
        entity_type='patient',
        entity_id=db_patient.id,
        operation_type='CREATE',
        payload={
            "id": db_patient.id,
            "national_health_id": db_patient.national_health_id,
            "name": db_patient.name,
            "age": db_patient.age,
            "gender": db_patient.gender,
            "village": db_patient.village,
            "phone": db_patient.phone,
            "patient_id": db_patient.patient_id,
            "server_version": 1,
            "is_deleted": 0,
            "created_at": db_patient.created_at
        },
        server_version=1
    )

    db.commit()
    db.refresh(db_patient)
    return db_patient

@app.get("/api/patients", response_model=List[PatientResponse])
def get_patients(db: Session = Depends(get_db)):
    return db.query(PatientModel).filter(PatientModel.is_deleted == 0).order_by(PatientModel.created_at.desc()).all()


@app.put("/api/patients/{patient_id}", response_model=PatientResponse)
def update_patient(patient_id: str, patient: PatientCreate, db: Session = Depends(get_db)):
    """Edit patient demographic details (name, age, gender, village, phone)."""
    existing = db.query(PatientModel).filter(PatientModel.id == patient_id).first()
    if not existing or existing.is_deleted:
        raise HTTPException(status_code=404, detail="Patient not found")
    existing.name    = patient.name
    existing.age     = patient.age
    existing.gender  = patient.gender
    existing.village = patient.village
    existing.phone   = patient.phone
    if patient.national_health_id:
        existing.national_health_id = patient.national_health_id
    existing.server_version += 1
    existing.updated_at = datetime.utcnow().isoformat()

    record_journal_entry(
        db=db,
        device_id=None,
        entity_type='patient',
        entity_id=existing.id,
        operation_type='UPDATE',
        payload={
            "id": existing.id,
            "name": existing.name,
            "age": existing.age,
            "gender": existing.gender,
            "village": existing.village,
            "phone": existing.phone,
            "server_version": existing.server_version
        },
        server_version=existing.server_version
    )

    db.commit()
    db.refresh(existing)
    return existing


@app.delete("/api/patients/{patient_id}")
def delete_patient(patient_id: str, db: Session = Depends(get_db)):
    """Soft delete a patient and record tombstone in sync journal."""
    existing = db.query(PatientModel).filter(PatientModel.id == patient_id).first()
    if not existing or existing.is_deleted:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    existing.is_deleted = 1
    existing.server_version += 1
    existing.updated_at = datetime.utcnow().isoformat()

    record_journal_entry(
        db=db,
        device_id=None,
        entity_type='patient',
        entity_id=existing.id,
        operation_type='DELETE',
        payload={"id": existing.id, "is_deleted": 1, "server_version": existing.server_version},
        server_version=existing.server_version
    )

    db.commit()
    return {"message": "Patient soft deleted and tombstone recorded", "id": patient_id}

# --- ASSESSMENTS & AI RISK ENDPOINTS ---

@app.post("/api/assess", response_model=AssessmentResponse)
def create_assessment(assessment: AssessmentCreate, db: Session = Depends(get_db)):
    # 1. Fetch or verify patient
    patient = db.query(PatientModel).filter(PatientModel.id == assessment.patient_id).first()
    patient_name = patient.name if patient else "Unknown Patient"
    village = patient.village if patient else "Unknown Village"

    # 2. Run Governed Clinical Screening Engine (TASK-001 & TASK-002)
    eval_result = screening_engine.evaluate(assessment.model_dump())

    # 3. Store in DB
    ass_id = assessment.id or str(uuid.uuid4())
    existing = db.query(AssessmentModel).filter(AssessmentModel.id == ass_id).first()
    
    if not existing:
        db_ass = AssessmentModel(
            id=ass_id,
            patient_id=assessment.patient_id,
            symptom_duration_days=assessment.symptom_duration_days,
            temperature_f=assessment.temperature_f,
            systolic_bp=assessment.systolic_bp,
            diastolic_bp=assessment.diastolic_bp,
            glucose_mg_dl=assessment.glucose_mg_dl,
            heart_rate_bpm=assessment.heart_rate_bpm,
            height_cm=assessment.height_cm,
            weight_kg=assessment.weight_kg,
            bmi=assessment.bmi,
            smoking_status=assessment.smoking_status,
            alcohol_status=assessment.alcohol_status,
            physical_activity=assessment.physical_activity,
            risk_level=eval_result["risk_level"],
            triage_state=eval_result.get("triage_state", "LOW_RISK"),
            is_emergency=1 if eval_result.get("is_emergency") else 0,
            uncertainty_state=eval_result.get("uncertainty_state", "COMPLETE"),
            risk_score=eval_result["risk_score"],
            recommended_action=eval_result["recommended_action"],
            referral_status=eval_result.get("referral_status", "NOT_REFERRED"),
            workflow_version=eval_result.get("workflow_version", "2.0.0"),
            ruleset_version=eval_result.get("ruleset_version", "2.0.0"),
            review_state=evaluate_review_requirement(
                triage_state=eval_result.get("triage_state", "LOW_RISK"),
                risk_level=eval_result.get("risk_level", "LOW"),
                is_emergency=bool(eval_result.get("is_emergency")),
                uncertainty_state=eval_result.get("uncertainty_state", "COMPLETE"),
                red_flags=eval_result.get("red_flags", [])
            ),
            server_version=1,
            is_deleted=0,
            created_at=datetime.utcnow().isoformat(),
            updated_at=datetime.utcnow().isoformat()
        )
        db_ass.symptoms = assessment.symptoms
        db_ass.family_history = assessment.family_history
        db_ass.likely_conditions = eval_result["likely_conditions"]
        db_ass.contributing_factors = eval_result["contributing_factors"]
        db_ass.red_flags = eval_result.get("red_flags", [])
        
        db.add(db_ass)
        db.flush()

        record_journal_entry(
            db=db,
            device_id=None,
            entity_type='assessment',
            entity_id=db_ass.id,
            operation_type='CREATE',
            payload={
                "id": db_ass.id,
                "patient_id": db_ass.patient_id,
                "risk_level": db_ass.risk_level,
                "triage_state": db_ass.triage_state,
                "is_emergency": db_ass.is_emergency,
                "uncertainty_state": db_ass.uncertainty_state,
                "risk_score": db_ass.risk_score,
                "recommended_action": db_ass.recommended_action,
                "referral_status": db_ass.referral_status,
                "symptoms": db_ass.symptoms,
                "likely_conditions": db_ass.likely_conditions,
                "server_version": 1,
                "is_deleted": 0,
                "created_at": db_ass.created_at
            },
            server_version=1
        )

        db.commit()
        db.refresh(db_ass)
        target_ass = db_ass
    else:
        target_ass = existing

    return AssessmentResponse(
        id=target_ass.id,
        patient_id=target_ass.patient_id,
        patient_name=patient_name,
        village=village,
        symptoms=target_ass.symptoms,
        symptom_duration_days=target_ass.symptom_duration_days,
        temperature_f=target_ass.temperature_f,
        systolic_bp=target_ass.systolic_bp,
        diastolic_bp=target_ass.diastolic_bp,
        glucose_mg_dl=target_ass.glucose_mg_dl,
        heart_rate_bpm=target_ass.heart_rate_bpm,
        height_cm=target_ass.height_cm,
        weight_kg=target_ass.weight_kg,
        bmi=target_ass.bmi,
        smoking_status=target_ass.smoking_status,
        alcohol_status=target_ass.alcohol_status,
        physical_activity=target_ass.physical_activity or "Moderate",
        family_history=target_ass.family_history,
        risk_level=target_ass.risk_level,
        triage_state=getattr(target_ass, 'triage_state', 'LOW_RISK') or 'LOW_RISK',
        is_emergency=bool(getattr(target_ass, 'is_emergency', 0)),
        short_circuit=bool(getattr(target_ass, 'is_emergency', 0)),
        red_flags=getattr(target_ass, 'red_flags', []) or [],
        uncertainty_state=getattr(target_ass, 'uncertainty_state', 'COMPLETE') or 'COMPLETE',
        risk_score=target_ass.risk_score,
        likely_conditions=target_ass.likely_conditions,
        contributing_factors=target_ass.contributing_factors,
        recommended_action=target_ass.recommended_action,
        referral_status=target_ass.referral_status,
        workflow_version=getattr(target_ass, 'workflow_version', '2.0.0') or '2.0.0',
        ruleset_version=getattr(target_ass, 'ruleset_version', '2.0.0') or '2.0.0',
        review_state=getattr(target_ass, 'review_state', 'NOT_REQUIRED') or 'NOT_REQUIRED',
        reviewed_by=target_ass.reviewed_by,
        reviewed_at=target_ass.reviewed_at,
        created_at=target_ass.created_at,
        disclaimer=MEDICAL_DISCLAIMER
    )

@app.get("/api/assessments", response_model=List[AssessmentResponse])
def list_assessments(db: Session = Depends(get_db)):
    assessments = db.query(AssessmentModel).filter(AssessmentModel.is_deleted == 0).order_by(AssessmentModel.created_at.desc()).all()
    results = []
    for ass in assessments:
        patient = db.query(PatientModel).filter(PatientModel.id == ass.patient_id).first()
        p_name = patient.name if patient else "Unknown Patient"
        p_village = patient.village if patient else "Unknown Village"
        results.append(
            AssessmentResponse(
                id=ass.id,
                patient_id=ass.patient_id,
                patient_name=p_name,
                village=p_village,
                symptoms=ass.symptoms,
                symptom_duration_days=ass.symptom_duration_days,
                temperature_f=ass.temperature_f,
                systolic_bp=ass.systolic_bp,
                diastolic_bp=ass.diastolic_bp,
                glucose_mg_dl=ass.glucose_mg_dl,
                heart_rate_bpm=ass.heart_rate_bpm,
                height_cm=ass.height_cm,
                weight_kg=ass.weight_kg,
                bmi=ass.bmi,
                smoking_status=ass.smoking_status,
                alcohol_status=ass.alcohol_status,
                physical_activity=ass.physical_activity or "Moderate",
                family_history=ass.family_history,
                risk_level=ass.risk_level,
                triage_state=getattr(ass, 'triage_state', 'LOW_RISK') or 'LOW_RISK',
                is_emergency=bool(getattr(ass, 'is_emergency', 0)),
                short_circuit=bool(getattr(ass, 'is_emergency', 0)),
                red_flags=getattr(ass, 'red_flags', []) or [],
                uncertainty_state=getattr(ass, 'uncertainty_state', 'COMPLETE') or 'COMPLETE',
                risk_score=ass.risk_score,
                likely_conditions=ass.likely_conditions,
                contributing_factors=ass.contributing_factors,
                recommended_action=ass.recommended_action,
                referral_status=ass.referral_status,
                workflow_version=getattr(ass, 'workflow_version', '2.0.0') or '2.0.0',
                ruleset_version=getattr(ass, 'ruleset_version', '2.0.0') or '2.0.0',
                review_state=getattr(ass, 'review_state', 'NOT_REQUIRED') or 'NOT_REQUIRED',
                reviewed_by=ass.reviewed_by,
                reviewed_at=ass.reviewed_at,
                created_at=ass.created_at,
                disclaimer=MEDICAL_DISCLAIMER
            )
        )
    return results

@app.put("/api/assessments/{assessment_id}/referral")
def update_referral_status(assessment_id: str, body: ReferralUpdate, db: Session = Depends(get_db)):
    ass = db.query(AssessmentModel).filter(AssessmentModel.id == assessment_id).first()
    if not ass or ass.is_deleted:
        raise HTTPException(status_code=404, detail="Assessment not found")
    
    valid_statuses = ["NOT_REFERRED", "REFERRED", "APPOINTMENT_REQUESTED", "CONSULTATION_COMPLETED"]
    if body.referral_status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid referral status. Must be one of {valid_statuses}")
    
    ass.referral_status = body.referral_status
    ass.server_version += 1
    ass.updated_at = datetime.utcnow().isoformat()

    record_journal_entry(
        db=db,
        device_id=None,
        entity_type='assessment',
        entity_id=ass.id,
        operation_type='UPDATE',
        payload={
            "id": ass.id,
            "referral_status": ass.referral_status,
            "server_version": ass.server_version,
            "updated_at": ass.updated_at
        },
        server_version=ass.server_version
    )

    db.commit()
    return {"message": "Referral status updated successfully", "assessment_id": assessment_id, "referral_status": ass.referral_status}

# --- OFFLINE SYNC ENDPOINT ---

@app.post("/api/sync", response_model=SyncResponse)
def batch_sync(payload: SyncPayload, db: Session = Depends(get_db)):
    p_synced = 0
    a_synced = 0

    # 1. Sync Patients
    for p in payload.patients:
        p_id = p.id or str(uuid.uuid4())
        existing_p = db.query(PatientModel).filter(PatientModel.id == p_id).first()
        if not existing_p:
            new_p = PatientModel(
                id=p_id,
                name=p.name,
                age=p.age,
                gender=p.gender,
                village=p.village,
                phone=p.phone,
                patient_id=p.patient_id or f"RH-{p_id[:6].upper()}",
                created_at=datetime.utcnow().isoformat()
            )
            db.add(new_p)
            p_synced += 1

    db.commit()

    # 2. Sync Assessments
    for a in payload.assessments:
        ass_id = a.id or str(uuid.uuid4())
        existing_a = db.query(AssessmentModel).filter(AssessmentModel.id == ass_id).first()
        if not existing_a:
            eval_res = screening_engine.evaluate(a.model_dump())
            new_a = AssessmentModel(
                id=ass_id,
                patient_id=a.patient_id,
                symptom_duration_days=a.symptom_duration_days,
                temperature_f=a.temperature_f,
                systolic_bp=a.systolic_bp,
                diastolic_bp=a.diastolic_bp,
                glucose_mg_dl=a.glucose_mg_dl,
                heart_rate_bpm=a.heart_rate_bpm,
                height_cm=a.height_cm,
                weight_kg=a.weight_kg,
                bmi=a.bmi,
                smoking_status=a.smoking_status,
                alcohol_status=a.alcohol_status,
                physical_activity=a.physical_activity,
                risk_level=eval_res["risk_level"],
                triage_state=eval_res.get("triage_state", "LOW_RISK"),
                is_emergency=1 if eval_res.get("is_emergency") else 0,
                uncertainty_state=eval_res.get("uncertainty_state", "COMPLETE"),
                risk_score=eval_res["risk_score"],
                recommended_action=eval_res["recommended_action"],
                referral_status=eval_res.get("referral_status", "NOT_REFERRED"),
                workflow_version=eval_res.get("workflow_version", "2.0.0"),
                ruleset_version=eval_res.get("ruleset_version", "2.0.0"),
                created_at=datetime.utcnow().isoformat()
            )
            new_a.symptoms = a.symptoms
            new_a.family_history = a.family_history
            new_a.likely_conditions = eval_res["likely_conditions"]
            new_a.contributing_factors = eval_res["contributing_factors"]
            new_a.red_flags = eval_res.get("red_flags", [])
            db.add(new_a)
            a_synced += 1

    db.commit()

    return SyncResponse(
        synced_patients_count=p_synced,
        synced_assessments_count=a_synced,
        message=f"Sync completed. Processed {p_synced} patients and {a_synced} health assessments."
    )

# --- PHC DASHBOARD STATS ---

@app.get("/api/dashboard/stats")
def get_dashboard_stats(db: Session = Depends(get_db)):
    total_patients = db.query(PatientModel).count()
    assessments = db.query(AssessmentModel).all()
    
    total_assessments = len(assessments)
    high_risk_count = sum(1 for a in assessments if a.risk_level == "HIGH")
    moderate_risk_count = sum(1 for a in assessments if a.risk_level == "MODERATE")
    low_risk_count = sum(1 for a in assessments if a.risk_level == "LOW")

    pending_referrals = sum(1 for a in assessments if a.referral_status in ["REFERRED", "APPOINTMENT_REQUESTED"])
    completed_consultations = sum(1 for a in assessments if a.referral_status == "CONSULTATION_COMPLETED")

    # Risk Distribution for charts
    risk_distribution = [
        {"name": "High Risk", "value": high_risk_count, "color": "#f43f5e"},
        {"name": "Moderate Risk", "value": moderate_risk_count, "color": "#f59e0b"},
        {"name": "Low Risk", "value": low_risk_count, "color": "#10b981"}
    ]

    # Village distribution
    village_counts: dict = {}
    for a in assessments:
        patient = db.query(PatientModel).filter(PatientModel.id == a.patient_id).first()
        v = patient.village if patient else "Unknown"
        village_counts[v] = village_counts.get(v, 0) + 1
    
    village_data = [{"village": k, "count": v} for k, v in village_counts.items()]

    return {
        "total_patients": total_patients,
        "total_assessments": total_assessments,
        "high_risk_count": high_risk_count,
        "pending_referrals": pending_referrals,
        "completed_consultations": completed_consultations,
        "risk_distribution": risk_distribution,
        "village_distribution": village_data
    }


# ─── HEALTH CHATBOT ENDPOINT ─────────────────────────────────────────────────

CHAT_SYSTEM_PROMPT = """
You are a rural health assistant AI integrated into the RuralHealth AI platform used by ASHA 
(Accredited Social Health Activist) workers and patients in rural India.

Your role:
- Help users understand their symptoms and what they might indicate
- Provide practical, actionable home-care tips for mild conditions
- Clearly tell users when symptoms are serious and require IMMEDIATE medical attention or hospital visit
- Be warm, simple, and easy to understand — many users are rural health workers or patients with limited medical knowledge
- Support responses in English, Hindi, or Bengali based on the user's language

Common conditions to be aware of in rural India:
Fever, Malaria, Dengue, Typhoid, TB (Tuberculosis), Diabetes, Hypertension, Anaemia,
Diarrhoea, Respiratory infections, Snake bite, Malnutrition, Maternal health issues.

STRICT RULES:
1. NEVER prescribe specific medicines or dosages
2. ALWAYS recommend consulting a qualified doctor or PHC (Primary Health Centre) for any concerning symptom
3. For emergency symptoms (chest pain, breathing difficulty, unconsciousness, severe bleeding, high fever >104°F), 
   IMMEDIATELY tell the user to call 108 (India emergency) or go to the nearest hospital
4. Always end your response with: "\n\n⚕️ *This is AI guidance only — not a medical diagnosis. Please consult a doctor for proper evaluation.*"
5. Keep responses concise and structured (use bullet points)

Remember: Your guidance could impact the health of vulnerable rural populations. Be responsible.
"""

class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    language: Optional[str] = "en"  # "en", "hi", or "bn"

class ChatResponse(BaseModel):
    reply: str
    error: Optional[str] = None

@app.post("/api/chat", response_model=ChatResponse)
async def health_chat(request: ChatRequest):
    """
    Health chatbot endpoint powered by OpenAI GPT.
    The API key is read server-side from .env — never exposed to the browser.
    """
    api_key = os.getenv("OPENAI_API_KEY", "")
    
    if not api_key or api_key == "your_openai_api_key_here":
        raise HTTPException(
            status_code=503,
            detail="OpenAI API key not configured. Please add OPENAI_API_KEY to backend/.env"
        )
    
    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        
        # Build message list: system prompt + conversation history
        lang_hint = {
            "hi": "Please respond in Hindi (हिंदी).",
            "bn": "Please respond in Bengali (বাংলা).",
            "en": "Please respond in English."
        }.get(request.language or "en", "Please respond in English.")
        
        openai_messages = [
            {"role": "system", "content": CHAT_SYSTEM_PROMPT + f"\n\nLanguage instruction: {lang_hint}"}
        ]
        
        # Add conversation history (last 20 messages max to stay within token limits)
        for msg in request.messages[-20:]:
            openai_messages.append({"role": msg.role, "content": msg.content})
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",   # Fast and cost-effective
            messages=openai_messages,
            max_tokens=600,
            temperature=0.4,        # More deterministic for medical guidance
        )
        
        reply = response.choices[0].message.content or "I could not generate a response. Please try again."
        return ChatResponse(reply=reply)
    
    except HTTPException:
        raise
    except Exception as e:
        err_str = str(e)
        if "insufficient_quota" in err_str or "credit_balance_exhausted" in err_str or "429" in err_str:
            # Fallback response for offline / credit-exhausted state
            user_msg = (request.messages[-1].content if request.messages else "").lower()
            
            # Simple rule-based guidance for hackathon demo resilience
            advice = []
            if "fever" in user_msg or "बुखार" in user_msg or "জ্বর" in user_msg:
                advice.append("• **Fever Management:** Stay hydrated with clean water/ORS, take adequate rest, and use a cool damp cloth on forehead to reduce temp.")
                advice.append("• **Red Flags:** If fever >102°F lasts more than 2 days or is accompanied by severe headache, rash, or vomiting, visit the nearest PHC immediately.")
            elif "cough" in user_msg or "cold" in user_msg or "खांसी" in user_msg:
                advice.append("• **Cough & Cold Care:** Drink warm water or herbal tea (tulsi/ginger), practice steam inhalation, and rest.")
                advice.append("• **Warning:** If cough persists >2 weeks or produces blood/chest pain, get tested for TB/respiratory infection at PHC.")
            elif "sugar" in user_msg or "diabetes" in user_msg or "शुगर" in user_msg:
                advice.append("• **Blood Sugar Management:** Avoid direct sweets, sugary tea, and refined flour. Eat whole grains, green leafy vegetables, and stay active.")
                advice.append("• **Screening:** Regular glucose monitoring at PHC is recommended.")
            elif "bp" in user_msg or "blood pressure" in user_msg or "बीपी" in user_msg:
                advice.append("• **Blood Pressure Guidance:** Reduce daily salt intake, manage stress, avoid tobacco/alcohol, and exercise daily.")
                advice.append("• **Critical:** If BP >160/100 or experiencing severe dizziness/blurred vision, seek emergency care.")
            else:
                advice.append("• **General Health Care:** Ensure clean drinking water, proper nutrition, adequate sleep, and hygiene.")
                advice.append("• **Consultation:** Please visit your local ASHA worker or Primary Health Centre (PHC) for a clinical evaluation.")

            fallback_reply = (
                "⚠️ *Note: OpenAI API quota exhausted. Operating in Rule-Based Medical Decision Support Mode.*\n\n"
                + "\n".join(advice)
                + "\n\n⚕️ *This is AI guidance only — not a medical diagnosis. Please consult a doctor for proper evaluation.*"
            )
            return ChatResponse(reply=fallback_reply)

        raise HTTPException(status_code=500, detail=f"Chat error: {err_str}")


# ─── ML DISEASE PREDICTION ENDPOINT ───────────────────────────────────────────

class MLPredictRequest(BaseModel):
    symptoms: List[str]

class MLPredictionItem(BaseModel):
    rank: int
    condition: str
    score: float
    contributingSymptoms: List[str]

class MLPredictResponse(BaseModel):
    predictions: List[MLPredictionItem]
    model: dict
    unknownSymptoms: List[str]
    disclaimer: str

@app.post("/api/ml/predict", response_model=MLPredictResponse)
def ml_predict(request: MLPredictRequest):
    """
    Symptom-based disease classification using the trained Logistic Regression model.
    
    INPUT:  list of symptom strings
    OUTPUT: Top-3 predicted conditions with model confidence scores and
            model contributing features (NOT clinical probabilities or diagnoses).
    
    IMPORTANT:
    - Scores are model softmax outputs, NOT clinical probabilities.
    - Predictions are for decision-support only, NOT medical diagnosis.
    - Unknown symptoms are silently dropped from the feature vector.
    """
    if _ML_PREDICTOR is None or not _ML_PREDICTOR.is_ready:
        raise HTTPException(
            status_code=503,
            detail=(
                "ML model not loaded. "
                "Run 'python backend/ml/train_model.py' to train and save the model."
            )
        )

    if not request.symptoms:
        raise HTTPException(
            status_code=400,
            detail="Request must include at least one symptom in the 'symptoms' list."
        )

    # Validate: at least one symptom must match a known feature
    # (predictor handles this gracefully and returns empty predictions)
    result = _ML_PREDICTOR.predict_disease(request.symptoms)

    if not result["predictions"] and result.get("unknownSymptoms"):
        raise HTTPException(
            status_code=400,
            detail=(
                f"None of the provided symptoms are in the model's known feature set. "
                f"Unknown: {result['unknownSymptoms']}. "
                "Please use standard symptom names (e.g. 'fever', 'cough', 'fatigue')."
            )
        )

    return MLPredictResponse(
        predictions=[
            MLPredictionItem(**pred) for pred in result["predictions"]
        ],
        model=result["modelInfo"],
        unknownSymptoms=result.get("unknownSymptoms", []),
        disclaimer=(
            "These are model contributing features, not medical causal explanations. "
            "This is a decision-support prototype, not a clinically validated diagnostic system."
        )
    )


# ─── HYBRID ML + GOOGLE SEARCH CONSENSUS ENDPOINT ──────────────────────────────

class HybridPredictRequest(BaseModel):
    symptoms: List[str]
    use_google: Optional[bool] = True

class HybridPredictionItem(BaseModel):
    rank: int
    condition: str
    consensus_score: float
    ml_score: Optional[float]
    google_score: Optional[float]
    ml_rank: Optional[int]
    google_rank: Optional[int]
    reasoning: Optional[str]
    source: Optional[str]
    sources_agree: bool

class HybridPredictResponse(BaseModel):
    predictions: List[HybridPredictionItem]
    ml_predictions: List[MLPredictionItem]
    google_predictions: List[dict]
    consensus_info: dict
    systems_status: dict
    fallback_mode: bool
    disclaimer: str

@app.post("/api/ml/hybrid-predict", response_model=HybridPredictResponse)
def hybrid_predict(request: HybridPredictRequest):
    """
    Hybrid disease prediction combining ML model + Google Search.
    
    Uses consensus engine to:
    1. Get predictions from Logistic Regression ML model
    2. Search Google for medical information about symptoms
    3. Combine using weighted voting with consensus bonus
    4. Return unified top-3 predictions
    
    This provides more robust and explainable predictions than either system alone.
    """
    if _CONSENSUS_ENGINE is None:
        raise HTTPException(
            status_code=503,
            detail="Consensus engine not available. Check backend logs."
        )
    
    if not request.symptoms:
        raise HTTPException(
            status_code=400,
            detail="Request must include at least one symptom."
        )
    
    # Get system status
    systems_status = _CONSENSUS_ENGINE.is_ready
    
    # Run consensus prediction
    result = _CONSENSUS_ENGINE.predict(
        symptoms=request.symptoms,
        use_google=request.use_google
    )
    
    # Format ML predictions for response
    ml_predictions = []
    for pred in result.get("ml_predictions", []):
        ml_predictions.append(MLPredictionItem(
            rank=pred.get("rank", 0),
            condition=pred.get("condition", ""),
            score=pred.get("score", 0),
            contributingSymptoms=pred.get("contributingSymptoms", [])
        ))
    
    # Format consensus predictions
    consensus_predictions = []
    for pred in result.get("predictions", []):
        consensus_predictions.append(HybridPredictionItem(
            rank=pred.get("rank", 0),
            condition=pred.get("condition", ""),
            consensus_score=pred.get("consensus_score", 0),
            ml_score=pred.get("ml_score"),
            google_score=pred.get("google_score"),
            ml_rank=pred.get("ml_rank"),
            google_rank=pred.get("google_rank"),
            reasoning=pred.get("reasoning"),
            source=pred.get("source"),
            sources_agree=pred.get("sources_agree", False)
        ))
    
    return HybridPredictResponse(
        predictions=consensus_predictions,
        ml_predictions=ml_predictions,
        google_predictions=result.get("google_predictions", []),
        consensus_info=result.get("consensus_info", {}),
        systems_status=systems_status,
        fallback_mode=result.get("fallback_mode", False),
        disclaimer=(
            "This is a hybrid prediction combining ML pattern recognition and medical knowledge. "
            "It is for screening purposes only, NOT a medical diagnosis. "
            "Always consult a qualified healthcare professional."
        )
    )


# ─── UNIFIED 3-SOURCE DISEASE PREDICTION (ML + Gemini + Google Search) ──────────

class UnifiedPredictRequest(BaseModel):
    symptoms: List[str]

@app.post("/api/ml/gemini-predict")
def unified_predict(request: UnifiedPredictRequest):
    """
    Unified Top-3 Disease Prediction combining ALL 3 sources:
    1. ML Model: Logistic Regression on 246K+ symptom-disease records
    2. Gemini AI: Google's medical reasoning
    3. Google Search: Medical knowledge base + web search
    
    Tally: Weighted consensus (ML 40%, Gemini 30%, Search 30%) with agreement boost.
    Returns top-3 diseases with per-source scores and combined consensus.
    """
    if not request.symptoms:
        raise HTTPException(status_code=400, detail="At least one symptom required.")
    
    CONFIDENCE_MAP = {"high": 0.9, "medium": 0.6, "low": 0.3}
    ML_W = 0.40
    GEMINI_W = 0.30
    SEARCH_W = 0.30
    
    ml_preds = []
    gemini_preds = []
    search_preds = []
    gemini_urgency = None
    gemini_advice = None
    
    # ── 1. ML Model ────────────────────────────────────────────────────────
    if _ML_PREDICTOR and _ML_PREDICTOR.is_ready:
        try:
            ml_result = _ML_PREDICTOR.predict_disease(request.symptoms)
            ml_preds = ml_result.get("predictions", [])
        except Exception as e:
            print(f"[unified] ML error: {e}")
    
    # ── 2. Gemini AI ───────────────────────────────────────────────────────
    if _GEMINI and _GEMINI.is_ready:
        try:
            gemini_result = _GEMINI.analyze_symptoms(request.symptoms)
            if not gemini_result.get("error"):
                gemini_preds = gemini_result.get("predictions", [])
                gemini_urgency = gemini_result.get("urgency", None)
                gemini_advice = gemini_result.get("general_advice", None)
            else:
                print(f"[unified] Gemini warning: {gemini_result['error']}")
        except Exception as e:
            print(f"[unified] Gemini error: {e}")
    
    # ── 3. Google Search / Knowledge Base (works without API key) ──────────
    try:
        from ml.google_search import google_search as _gs
        if _gs.is_ready:
            search_result = _gs.search_symptoms(request.symptoms)
            if not search_result.get("error"):
                search_preds = search_result.get("predictions", [])
            else:
                print(f"[unified] Search warning: {search_result.get('error')}")
    except Exception as e:
        print(f"[unified] Search error: {e}")
    
    # ── TALLY ALL 3 SOURCES ────────────────────────────────────────────────
    condition_scores = {}
    condition_details = {}
    
    def _norm(cond: str) -> str:
        import re
        return re.sub(r'[^\w\s]', '', cond.lower().strip())
    
    def _add_or_merge(cond_key: str, display: str, source: str, score: float, rank: int, reasoning: str):
        if cond_key not in condition_details:
            condition_details[cond_key] = {
                "condition": display,
                "ml_score": None, "gemini_score": None, "search_score": None,
                "ml_rank": None, "gemini_rank": None, "search_rank": None,
                "reasoning": reasoning, "source_count": 0
            }
        d = condition_details[cond_key]
        d[f"{source}_score"] = score
        d[f"{source}_rank"] = rank
        if reasoning and not d["reasoning"]:
            d["reasoning"] = reasoning
    
    # Process ML
    for pred in ml_preds:
        ck = _norm(pred["condition"])
        sc = pred.get("score", 0.5) * ML_W
        condition_scores[ck] = condition_scores.get(ck, 0) + sc
        _add_or_merge(ck, pred["condition"], "ml", pred.get("score", 0), pred.get("rank"), ", ".join(pred.get("contributingSymptoms", [])))
    
    # Process Gemini
    for rank, pred in enumerate(gemini_preds):
        ck = _norm(pred.get("condition", ""))
        conf = CONFIDENCE_MAP.get(pred.get("confidence", "medium").lower(), 0.5)
        sc = conf * GEMINI_W
        condition_scores[ck] = condition_scores.get(ck, 0) + sc
        _add_or_merge(ck, pred.get("condition", ck), "gemini", conf, rank + 1, pred.get("reasoning", ""))
    
    # Process Search
    for rank, pred in enumerate(search_preds):
        ck = _norm(pred.get("condition", ""))
        conf = CONFIDENCE_MAP.get(pred.get("confidence", "medium").lower(), 0.5)
        sc = conf * SEARCH_W
        condition_scores[ck] = condition_scores.get(ck, 0) + sc
        _add_or_merge(ck, pred.get("condition", ck), "search", conf, rank + 1, pred.get("reasoning", ""))
    
    # Boost: sources_agree bonus
    for ck in condition_scores:
        d = condition_details[ck]
        sources_present = sum(1 for s in ["ml", "gemini", "search"] if d[f"{s}_score"] is not None)
        d["source_count"] = sources_present
        if sources_present >= 2:
            condition_scores[ck] *= (1 + 0.15 * sources_present)  # 30% boost for 2, 45% for 3
    
    # Sort and take top 3
    sorted_conds = sorted(condition_scores.items(), key=lambda x: x[1], reverse=True)[:3]
    
    combined = []
    for rank, (ck, score) in enumerate(sorted_conds):
        d = condition_details[ck]
        combined.append({
            "rank": rank + 1,
            "condition": d["condition"],
            "combined_score": round(score, 4),
            "ml_score": round(d["ml_score"], 4) if d["ml_score"] is not None else None,
            "gemini_score": round(d["gemini_score"], 4) if d["gemini_score"] is not None else None,
            "search_score": round(d["search_score"], 4) if d["search_score"] is not None else None,
            "ml_rank": d["ml_rank"],
            "gemini_rank": d["gemini_rank"],
            "search_rank": d["search_rank"],
            "reasoning": d["reasoning"],
            "source_count": d["source_count"],
            "sources_agree": d["source_count"] >= 2
        })
    
    return {
        "ml_predictions": [{"rank": p.get("rank"), "condition": p["condition"], "score": p.get("score", 0)} for p in ml_preds],
        "gemini_predictions": gemini_preds,
        "search_predictions": search_preds,
        "combined_top3": combined,
        "systems_status": {
            "ml_model": _ML_PREDICTOR is not None and _ML_PREDICTOR.is_ready if _ML_PREDICTOR else False,
            "gemini_ai": _GEMINI is not None and _GEMINI.is_ready if _GEMINI else False,
            "search": _CONSENSUS_ENGINE is not None and _CONSENSUS_ENGINE.is_ready.get("google_search", False) if _CONSENSUS_ENGINE else False
        },
        "gemini_urgency": gemini_urgency,
        "gemini_advice": gemini_advice,
        "disclaimer": "AI-assisted screening only. Not a medical diagnosis. Consult a healthcare professional."
    }


# ─── TELECONSULTATION APPOINTMENTS ENDPOINTS ───────────────────────────────────────

@app.post("/api/appointments", response_model=AppointmentResponse)
def create_appointment(appt: AppointmentCreate, db: Session = Depends(get_db)):
    """
    Save a teleconsultation / doctor appointment booking.
    """
    appt_id = appt.id or str(uuid.uuid4())
    existing = db.query(AppointmentModel).filter(AppointmentModel.id == appt_id).first()
    if existing:
        return AppointmentResponse(
            id=existing.id,
            patient_name=existing.patient_name,
            patient_phone=existing.patient_phone,
            doctor_name=existing.doctor_name,
            doctor_specialty=existing.doctor_specialty,
            doctor_address=existing.doctor_address,
            appointment_date=existing.appointment_date,
            appointment_time=existing.appointment_time,
            notes=existing.notes,
            status=existing.status,
            risk_level=existing.risk_level,
            likely_conditions=existing.likely_conditions,
            created_at=existing.created_at
        )

    db_appt = AppointmentModel(
        id=appt_id,
        patient_name=appt.patient_name,
        patient_phone=appt.patient_phone or "",
        doctor_name=appt.doctor_name,
        doctor_specialty=appt.doctor_specialty or "General Physician",
        doctor_address=appt.doctor_address or "",
        appointment_date=appt.appointment_date,
        appointment_time=appt.appointment_time,
        notes=appt.notes or "",
        status=appt.status or "PENDING",
        risk_level=appt.risk_level,
        server_version=1,
        is_deleted=0,
        created_at=datetime.utcnow().isoformat(),
        updated_at=datetime.utcnow().isoformat()
    )
    db_appt.likely_conditions = appt.likely_conditions or []
    db.add(db_appt)
    db.flush()

    record_journal_entry(
        db=db,
        device_id=None,
        entity_type='appointment',
        entity_id=db_appt.id,
        operation_type='CREATE',
        payload={
            "id": db_appt.id,
            "patient_name": db_appt.patient_name,
            "patient_phone": db_appt.patient_phone,
            "doctor_name": db_appt.doctor_name,
            "doctor_specialty": db_appt.doctor_specialty,
            "doctor_address": db_appt.doctor_address,
            "appointment_date": db_appt.appointment_date,
            "appointment_time": db_appt.appointment_time,
            "notes": db_appt.notes,
            "status": db_appt.status,
            "risk_level": db_appt.risk_level,
            "likely_conditions": db_appt.likely_conditions,
            "server_version": 1,
            "is_deleted": 0,
            "created_at": db_appt.created_at
        },
        server_version=1
    )

    db.commit()
    db.refresh(db_appt)

    return AppointmentResponse(
        id=db_appt.id,
        patient_name=db_appt.patient_name,
        patient_phone=db_appt.patient_phone,
        doctor_name=db_appt.doctor_name,
        doctor_specialty=db_appt.doctor_specialty,
        doctor_address=db_appt.doctor_address,
        appointment_date=db_appt.appointment_date,
        appointment_time=db_appt.appointment_time,
        notes=db_appt.notes,
        status=db_appt.status,
        risk_level=db_appt.risk_level,
        likely_conditions=db_appt.likely_conditions,
        created_at=db_appt.created_at
    )


@app.get("/api/appointments", response_model=List[AppointmentResponse])
def list_appointments(db: Session = Depends(get_db)):
    """
    Retrieve all teleconsultation appointments ordered by date desc.
    """
    appts = db.query(AppointmentModel).filter(AppointmentModel.is_deleted == 0).order_by(AppointmentModel.created_at.desc()).all()
    return [
        AppointmentResponse(
            id=a.id,
            patient_name=a.patient_name,
            patient_phone=a.patient_phone,
            doctor_name=a.doctor_name,
            doctor_specialty=a.doctor_specialty,
            doctor_address=a.doctor_address,
            appointment_date=a.appointment_date,
            appointment_time=a.appointment_time,
            notes=a.notes,
            status=a.status,
            risk_level=a.risk_level,
            likely_conditions=a.likely_conditions,
            created_at=a.created_at
        )
        for a in appts
    ]


@app.patch("/api/appointments/{appointment_id}/status")
def update_appointment_status(
    appointment_id: str,
    body: dict,
    db: Session = Depends(get_db)
):
    """
    Update appointment status (PENDING → CONFIRMED → COMPLETED / CANCELLED).
    """
    appt = db.query(AppointmentModel).filter(AppointmentModel.id == appointment_id).first()
    if not appt or appt.is_deleted:
        raise HTTPException(status_code=404, detail="Appointment not found")
    valid = ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"]
    new_status = body.get("status", "")
    if new_status not in valid:
        raise HTTPException(status_code=400, detail=f"Status must be one of {valid}")
    appt.status = new_status
    appt.server_version += 1
    appt.updated_at = datetime.utcnow().isoformat()

    record_journal_entry(
        db=db,
        device_id=None,
        entity_type='appointment',
        entity_id=appt.id,
        operation_type='UPDATE',
        payload={
            "id": appt.id,
            "status": appt.status,
            "server_version": appt.server_version,
            "updated_at": appt.updated_at
        },
        server_version=appt.server_version
    )

    db.commit()
    return {"message": "Status updated", "id": appointment_id, "status": new_status}


@app.patch("/api/appointments/{appointment_id}")
def update_appointment(
    appointment_id: str,
    body: dict,
    db: Session = Depends(get_db)
):
    """
    Update appointment details (name, phone, date, time, notes, status).
    """
    appt = db.query(AppointmentModel).filter(AppointmentModel.id == appointment_id).first()
    if not appt or appt.is_deleted:
        raise HTTPException(status_code=404, detail="Appointment not found")
    if "patient_name" in body:
        appt.patient_name = body["patient_name"]
    if "patient_phone" in body:
        appt.patient_phone = body["patient_phone"]
    if "appointment_date" in body:
        appt.appointment_date = body["appointment_date"]
    if "appointment_time" in body:
        appt.appointment_time = body["appointment_time"]
    if "notes" in body:
        appt.notes = body["notes"]
    if "status" in body:
        appt.status = body["status"]
    
    appt.server_version += 1
    appt.updated_at = datetime.utcnow().isoformat()

    record_journal_entry(
        db=db,
        device_id=None,
        entity_type='appointment',
        entity_id=appt.id,
        operation_type='UPDATE',
        payload={
            "id": appt.id,
            "patient_name": appt.patient_name,
            "patient_phone": appt.patient_phone,
            "doctor_name": appt.doctor_name,
            "appointment_date": appt.appointment_date,
            "appointment_time": appt.appointment_time,
            "status": appt.status,
            "server_version": appt.server_version,
            "updated_at": appt.updated_at
        },
        server_version=appt.server_version
    )

    db.commit()
    return {"message": "Appointment updated", "id": appointment_id}


@app.delete("/api/appointments/{appointment_id}")
def delete_appointment(
    appointment_id: str,
    db: Session = Depends(get_db)
):
    """
    Soft delete an appointment by ID and record tombstone in sync journal.
    """
    appt = db.query(AppointmentModel).filter(AppointmentModel.id == appointment_id).first()
    if not appt or appt.is_deleted:
        raise HTTPException(status_code=404, detail="Appointment not found")
    
    appt.is_deleted = 1
    appt.server_version += 1
    appt.updated_at = datetime.utcnow().isoformat()

    record_journal_entry(
        db=db,
        device_id=None,
        entity_type='appointment',
        entity_id=appt.id,
        operation_type='DELETE',
        payload={"id": appt.id, "is_deleted": 1, "server_version": appt.server_version},
        server_version=appt.server_version
    )

    db.commit()
    return {"message": "Appointment soft deleted and tombstone recorded", "id": appointment_id}


# ─── V2 RELIABLE OFFLINE SYNC ENDPOINTS (TASK-005 & TASK-006) ──────────────────────

@app.post("/api/v2/sync/push", response_model=SyncPushResponse)
def sync_push(request: SyncPushRequest, db: Session = Depends(get_db)):
    """
    Idempotent batch push API for frontline workers.
    Processes queued mutations with OCC conflict detection and records sync journal entries.
    """
    return process_push_batch(db, request)


@app.post("/api/v2/sync/pull", response_model=SyncPullResponse)
def sync_pull_post(request: SyncPullRequest, db: Session = Depends(get_db)):
    """
    Cursor-based pull API. Returns changes after last_server_sequence.
    """
    return process_pull_request(db, request)


@app.get("/api/v2/sync/pull", response_model=SyncPullResponse)
def sync_pull_get(
    since_seq: int = 0,
    limit: int = 100,
    device_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    GET convenience wrapper for cursor-based pull synchronization.
    """
    request = SyncPullRequest(
        device_id=device_id or "unknown",
        last_server_sequence=since_seq,
        limit=limit
    )
    return process_pull_request(db, request)


import math
import urllib.request
import urllib.parse
import json

def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

@app.get("/api/hospitals/search")
def search_hospitals(location: str):
    """
    Searches for real hospitals using open-source mapping data or fallback mock data.
    """
    geocode_url = f"https://nominatim.openstreetmap.org/search?format=json&q={urllib.parse.quote(location)}&limit=1"
    req = urllib.request.Request(geocode_url, headers={'User-Agent': 'RuralHealthAI/2.0'})
    
    base_lat = 22.723
    base_lng = 88.483
    
    try:
        with urllib.request.urlopen(req, timeout=3) as response:
            geo_data = json.loads(response.read().decode())
            if geo_data:
                base_lat = float(geo_data[0]['lat'])
                base_lng = float(geo_data[0]['lon'])
    except Exception as e:
        pass

    search_url = f"https://nominatim.openstreetmap.org/search?format=json&q=hospital+in+{urllib.parse.quote(location)}&limit=15"
    req_hosp = urllib.request.Request(search_url, headers={'User-Agent': 'RuralHealthAI/2.0'})
    
    try:
        with urllib.request.urlopen(req_hosp, timeout=3) as response:
            hosp_data = json.loads(response.read().decode())
            results = []
            for idx, item in enumerate(hosp_data):
                hlat = float(item['lat'])
                hlng = float(item['lon'])
                dist = haversine_km(base_lat, base_lng, hlat, hlng)
                results.append({
                    "id": str(item.get('place_id', f"h_{idx}")),
                    "name": item.get('name', 'Hospital / Clinic'),
                    "specialty": "General Hospital",
                    "address": item.get('display_name', ''),
                    "lat": hlat,
                    "lng": hlng,
                    "distance": f"{dist:.1f} km",
                    "isOpen": True
                })
            if results:
                results.sort(key=lambda x: float(x['distance'].split()[0]))
                return {"hospitals": results, "center": {"lat": base_lat, "lng": base_lng}}
    except Exception as e:
        pass

    # Fallback hospitals
    hospitals = [
        {'id': '1', 'name': 'City General Hospital', 'specialty': 'Multi-specialty', 'address': f'{location} Main Road', 'phone': '9876543210', 'rating': 4.5, 'distance': '2.5 km', 'isOpen': True, 'lat': base_lat + 0.003, 'lng': base_lng - 0.003, 'amenity': 'hospital'},
        {'id': '2', 'name': 'Rural Health Care Center', 'specialty': 'General Medicine', 'address': f'{location} Village Square', 'phone': '9876543211', 'rating': 4.2, 'distance': '5.0 km', 'isOpen': True, 'lat': base_lat - 0.01, 'lng': base_lng + 0.007, 'amenity': 'clinic'},
        {'id': '3', 'name': 'Sunrise Primary Health Clinic', 'specialty': 'Primary Care', 'address': f'{location} East Side', 'phone': '9876543212', 'rating': 4.8, 'distance': '1.2 km', 'isOpen': True, 'lat': base_lat + 0.007, 'lng': base_lng - 0.013, 'amenity': 'clinic'}
    ]
    return {'center': {'lat': base_lat, 'lng': base_lng}, 'hospitals': hospitals}


# ─── AUTHENTICATION & RBAC ENDPOINTS (TASK-010 & TASK-011) ─────────────────────

@app.post("/api/v2/auth/login", response_model=TokenResponse)
def login_user(login_data: UserLoginRequest, db: Session = Depends(get_db)):
    """
    Authenticates a user (ASHA worker, doctor, officer, admin) and issues a JWT token.
    """
    user = db.query(UserModel).filter(UserModel.username == login_data.username).first()
    if not user or not verify_password(login_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated. Contact system administrator."
        )

    user.last_login_at = datetime.utcnow().isoformat()
    db.commit()

    permissions = list(ROLE_PERMISSIONS.get(user.role, set()))
    token_payload = {
        "sub": user.id,
        "username": user.username,
        "role": user.role,
        "full_name": user.full_name,
        "facility_id": user.facility_id
    }
    access_token = create_access_token(data=token_payload)

    user_resp = UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        license_number=user.license_number,
        facility_id=user.facility_id,
        assigned_villages=user.assigned_villages,
        is_active=user.is_active,
        created_at=user.created_at,
        last_login_at=user.last_login_at
    )

    return TokenResponse(
        access_token=access_token,
        token_type="Bearer",
        expires_in_minutes=1440,
        user=user_resp,
        permissions=permissions
    )


@app.post("/api/v2/auth/register", response_model=UserResponse)
def register_user(
    reg_data: UserRegisterRequest,
    current_user: UserModel = Depends(require_roles("SYSTEM_ADMIN", "PHC_DOCTOR")),
    db: Session = Depends(get_db)
):
    """
    Registers a new user account (Requires SYSTEM_ADMIN or PHC_DOCTOR role).
    """
    existing = db.query(UserModel).filter(
        (UserModel.username == reg_data.username) | (UserModel.email == reg_data.email)
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username or email is already registered."
        )

    new_user = UserModel(
        id=f"usr_{uuid.uuid4()}",
        username=reg_data.username,
        email=reg_data.email,
        password_hash=hash_password(reg_data.password),
        full_name=reg_data.full_name,
        role=reg_data.role,
        license_number=reg_data.license_number,
        facility_id=reg_data.facility_id,
        assigned_villages_json=json.dumps(reg_data.assigned_villages or []),
        is_active=1,
        created_at=datetime.utcnow().isoformat()
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@app.get("/api/v2/auth/me", response_model=UserProfileResponse)
def get_current_user_profile(current_user: UserModel = Depends(get_current_user)):
    """
    Returns the authenticated user profile and active permissions.
    """
    permissions = list(ROLE_PERMISSIONS.get(current_user.role, set()))
    user_resp = UserResponse(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role,
        license_number=current_user.license_number,
        facility_id=current_user.facility_id,
        assigned_villages=current_user.assigned_villages,
        is_active=current_user.is_active,
        created_at=current_user.created_at,
        last_login_at=current_user.last_login_at
    )
    return UserProfileResponse(user=user_resp, permissions=permissions)


@app.get("/api/v2/auth/users", response_model=List[UserResponse])
def get_all_users(
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns all active system accounts (available for quick switching during field & clinic pilot).
    """
    users = db.query(UserModel).filter(UserModel.is_active == 1).all()
    results = []
    for u in users:
        results.append(UserResponse(
            id=u.id,
            username=u.username,
            email=u.email,
            full_name=u.full_name,
            role=u.role,
            license_number=u.license_number,
            facility_id=u.facility_id,
            assigned_villages=u.assigned_villages,
            is_active=u.is_active,
            created_at=u.created_at,
            last_login_at=u.last_login_at
        ))
    return results


# ─── CLINICIAN REVIEW & ATTESTATION ENDPOINTS (TASK-012) ──────────────────────

@app.get("/api/v2/reviews/pending", response_model=List[PendingReviewItem])
def get_pending_clinical_reviews(
    current_user: UserModel = Depends(require_permissions("reviews:view_queue")),
    db: Session = Depends(get_db)
):
    """
    Lists all assessments in REVIEW_REQUIRED or ASSIGNED state,
    ordered by emergency urgency (EMERGENCY red flags first, then HIGH risk).
    """
    return list_pending_reviews(db=db, facility_id=current_user.facility_id)


@app.post("/api/v2/reviews/{assessment_id}/assign")
def assign_review(
    assessment_id: str,
    current_user: UserModel = Depends(require_permissions("reviews:perform")),
    db: Session = Depends(get_db)
):
    """
    Assigns an assessment to the currently logged in doctor.
    """
    assigned = assign_review_to_doctor(db=db, assessment_id=assessment_id, doctor_user=current_user)
    return {
        "message": f"Assessment {assessment_id} assigned to Dr. {current_user.full_name}",
        "assessment_id": assigned.id,
        "review_state": assigned.review_state,
        "reviewed_by": assigned.reviewed_by
    }


@app.post("/api/v2/reviews/{assessment_id}/submit", response_model=ClinicalReviewResponse)
def submit_review_decision(
    assessment_id: str,
    review_data: ClinicalReviewSubmitRequest,
    current_user: UserModel = Depends(require_permissions("reviews:perform")),
    db: Session = Depends(get_db)
):
    """
    Submits doctor's clinical review decision (APPROVED, MODIFIED, REJECTED),
    enforces mandatory notes and override justification, seals digital signature hash,
    and updates assessment state and sync journal.
    """
    result = submit_clinician_review(
        db=db,
        assessment_id=assessment_id,
        reviewer=current_user,
        decision=review_data.decision,
        clinical_notes=review_data.clinical_notes,
        override_reason=review_data.override_reason,
        modified_risk_level=review_data.modified_risk_level,
        modified_triage_state=review_data.modified_triage_state,
        modified_action=review_data.modified_action,
        modified_referral_status=review_data.modified_referral_status,
        device_id=f"doc_{current_user.id}"
    )
    return result


@app.get("/api/v2/reviews/{assessment_id}/history", response_model=List[ReviewHistoryItem])
def get_assessment_review_history(
    assessment_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Retrieves the complete immutable audit trail of clinical reviews and attestations for an assessment.
    """
    return get_review_history(db=db, assessment_id=assessment_id)
