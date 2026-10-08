import uuid
import os
from typing import List, Optional, Dict, Any
from datetime import datetime
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
from dotenv import load_dotenv

# Load .env from the same directory as this file
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '.env'))

from database import init_db, get_db, PatientModel, AssessmentModel, AppointmentModel
from schemas import (
    PatientCreate, PatientResponse,
    AssessmentCreate, AssessmentResponse,
    ReferralUpdate, SyncPayload, SyncResponse,
    AppointmentCreate, AppointmentResponse
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

# Import Population Health Intelligence engine (HMIS + NFHS-5 Context & Trends)
try:
    from ml.population_health import population_health_engine as _pop_health, SAFETY_DISCLAIMER as _POP_DISCLAIMER
    _POPULATION_HEALTH = _pop_health
except Exception as _pop_err:
    _POPULATION_HEALTH = None
    _POP_DISCLAIMER = "Population health intelligence layer"
    print(f"[main] Population health engine not loaded: {_pop_err}")

app = FastAPI(
    title="RuralHealth AI Backend",
    description="AI-Powered Early Disease Risk Prediction & Rural Health Access Platform API",
    version="1.0.0"
)

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
        name=patient.name,
        age=patient.age,
        gender=patient.gender,
        village=patient.village,
        phone=patient.phone,
        patient_id=patient.patient_id or f"RH-{p_id[:6].upper()}",
        created_at=datetime.utcnow().isoformat()
    )
    db.add(db_patient)
    db.commit()
    db.refresh(db_patient)
    return db_patient

@app.get("/api/patients", response_model=List[PatientResponse])
def get_patients(db: Session = Depends(get_db)):
    return db.query(PatientModel).order_by(PatientModel.created_at.desc()).all()


@app.put("/api/patients/{patient_id}", response_model=PatientResponse)
def update_patient(patient_id: str, patient: PatientCreate, db: Session = Depends(get_db)):
    """Edit patient demographic details (name, age, gender, village, phone)."""
    existing = db.query(PatientModel).filter(PatientModel.id == patient_id).first()
    if not existing:
        raise HTTPException(status_code=404, detail="Patient not found")
    existing.name    = patient.name
    existing.age     = patient.age
    existing.gender  = patient.gender
    existing.village = patient.village
    existing.phone   = patient.phone
    db.commit()
    db.refresh(existing)
    return existing


@app.delete("/api/patients/{patient_id}")
def delete_patient(patient_id: str, db: Session = Depends(get_db)):
    """Delete a patient and ALL their linked assessments (cascade)."""
    existing = db.query(PatientModel).filter(PatientModel.id == patient_id).first()
    if not existing:
        raise HTTPException(status_code=404, detail="Patient not found")
    db.delete(existing)   # cascade deletes assessments via relationship
    db.commit()
    return {"message": "Patient and linked assessments deleted", "id": patient_id}

# --- ASSESSMENTS & AI RISK ENDPOINTS ---

@app.post("/api/assess", response_model=AssessmentResponse)
def create_assessment(assessment: AssessmentCreate, db: Session = Depends(get_db)):
    # 1. Fetch or verify patient
    patient = db.query(PatientModel).filter(PatientModel.id == assessment.patient_id).first()
    patient_name = patient.name if patient else "Unknown Patient"
    village = patient.village if patient else "Unknown Village"

    # 2. Run AI Screening Engine
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
            risk_score=eval_result["risk_score"],
            recommended_action=eval_result["recommended_action"],
            referral_status="NOT_REFERRED" if eval_result["risk_level"] != "HIGH" else "REFERRED",
            created_at=datetime.utcnow().isoformat()
        )
        db_ass.symptoms = assessment.symptoms
        db_ass.family_history = assessment.family_history
        db_ass.likely_conditions = eval_result["likely_conditions"]
        db_ass.contributing_factors = eval_result["contributing_factors"]
        
        db.add(db_ass)
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
        risk_score=target_ass.risk_score,
        likely_conditions=target_ass.likely_conditions,
        contributing_factors=target_ass.contributing_factors,
        recommended_action=target_ass.recommended_action,
        referral_status=target_ass.referral_status,
        created_at=target_ass.created_at,
        disclaimer=MEDICAL_DISCLAIMER
    )

@app.get("/api/assessments", response_model=List[AssessmentResponse])
def list_assessments(db: Session = Depends(get_db)):
    assessments = db.query(AssessmentModel).order_by(AssessmentModel.created_at.desc()).all()
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
                risk_score=ass.risk_score,
                likely_conditions=ass.likely_conditions,
                contributing_factors=ass.contributing_factors,
                recommended_action=ass.recommended_action,
                referral_status=ass.referral_status,
                created_at=ass.created_at,
                disclaimer=MEDICAL_DISCLAIMER
            )
        )
    return results

@app.put("/api/assessments/{assessment_id}/referral")
def update_referral_status(assessment_id: str, body: ReferralUpdate, db: Session = Depends(get_db)):
    ass = db.query(AssessmentModel).filter(AssessmentModel.id == assessment_id).first()
    if not ass:
        raise HTTPException(status_code=404, detail="Assessment not found")
    
    valid_statuses = ["NOT_REFERRED", "REFERRED", "APPOINTMENT_REQUESTED", "CONSULTATION_COMPLETED"]
    if body.referral_status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid referral status. Must be one of {valid_statuses}")
    
    ass.referral_status = body.referral_status
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
                risk_score=eval_res["risk_score"],
                recommended_action=eval_res["recommended_action"],
                referral_status="REFERRED" if eval_res["risk_level"] == "HIGH" else "NOT_REFERRED",
                created_at=datetime.utcnow().isoformat()
            )
            new_a.symptoms = a.symptoms
            new_a.family_history = a.family_history
            new_a.likely_conditions = eval_res["likely_conditions"]
            new_a.contributing_factors = eval_res["contributing_factors"]
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


from fastapi.responses import StreamingResponse
from services.ollama_service import ollama_service
from services.kolkata_health_data_service import kolkata_data_service
from prompts.ruralhealth_ai import RURALHEALTH_SYSTEM_PROMPT, build_system_prompt_for_language, get_rule_based_fallback

# ─── HEALTH CHATBOT & OLLAMA LOCAL AI ENDPOINTS ─────────────────────────────

CHAT_SYSTEM_PROMPT = RURALHEALTH_SYSTEM_PROMPT

class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str

class ChatRequest(BaseModel):
    messages: Optional[List[ChatMessage]] = None
    message: Optional[str] = None
    language: Optional[str] = "en"  # "en", "hi", or "bn"
    conversation_id: Optional[str] = None

class ChatResponse(BaseModel):
    success: bool = True
    response: str
    reply: str  # For backwards compatibility with older clients
    model: str
    provider: str
    local: bool
    badge: Optional[str] = None
    source: Optional[str] = None
    category: Optional[str] = None
    data_points: Optional[List[Dict[str, Any]]] = None
    metadata: Optional[Dict[str, Any]] = None
    note: Optional[str] = None
    error: Optional[str] = None

class OllamaHealthResponse(BaseModel):
    available: bool = True
    status: str
    base_url: str
    model: str
    configured_model: Optional[str] = None
    models_available: List[str] = []
    model_ready: bool
    provider: str = "ollama"
    runtime: str
    local: bool
    message: str

@app.get("/api/ai/ollama/health", response_model=OllamaHealthResponse)
async def get_ollama_health():
    """
    Check the connection health, runtime status, and model availability of the local Ollama service.
    """
    health_data = await ollama_service.check_health()
    return OllamaHealthResponse(**health_data)

@app.get("/api/ai/ollama/models")
async def get_ollama_models():
    """
    List models currently installed in the local Ollama instance.
    """
    models = await ollama_service.get_available_models()
    return {"models": models, "count": len(models)}

# ─── KOLKATA HEALTH DATA ENGINE ENDPOINTS ────────────────────────────────────

@app.get("/api/ai/data/summary")
def get_data_summary():
    """
    Retrieve factual metadata summary of the Kolkata Health Dataset (HMIS + NFHS-5).
    """
    return kolkata_data_service.get_dataset_summary()

@app.get("/api/ai/data/features")
def get_data_features(category: Optional[str] = None, limit: int = 50):
    """
    Retrieve features from the catalog, optionally filtered by category.
    """
    if category:
        categories = kolkata_data_service.get_category_catalog()
        cat_data = categories.get(category)
        if cat_data:
            return {"category": category, "count": cat_data["count"], "sample_indicators": cat_data["sample_indicators"]}
        return {"category": category, "count": 0, "features": []}
    return {
        "total_features": len(kolkata_data_service.feature_catalog),
        "categories": kolkata_data_service.get_category_catalog(),
        "sample_features": list(kolkata_data_service.feature_catalog.values())[:limit]
    }

@app.get("/api/ai/data/features/search")
def search_data_features(q: str = "", limit: int = 10):
    """
    Fuzzy / semantic indicator search in the Kolkata Health Dataset feature dictionary.
    """
    results = kolkata_data_service.search_indicators(q, limit=limit)
    return {
        "query": q,
        "count": len(results),
        "results": results
    }

@app.get("/api/ai/data/indicator/{feature}")
def get_data_indicator(feature: str):
    """
    Retrieve metadata and annual time-series values for a specific indicator.
    """
    meta = kolkata_data_service.get_indicator_metadata(feature)
    if not meta:
        raise HTTPException(status_code=404, detail=f"Indicator '{feature}' not found in feature catalog.")
    values = kolkata_data_service.get_indicator_values(feature)
    return {
        "feature_name": feature,
        "metadata": meta,
        "values": values
    }

@app.get("/api/ai/data/trend/{feature}")
def get_data_trend(feature: str):
    """
    Deterministically compute trend statistics across available fiscal years for an indicator.
    """
    trend = kolkata_data_service.calculate_trend(feature)
    return trend

class CompareYearsRequest(BaseModel):
    feature: str
    year1: str
    year2: str

@app.post("/api/ai/data/compare")
def compare_data_years(req: CompareYearsRequest):
    """
    Deterministically compare indicator values between two fiscal years.
    """
    result = kolkata_data_service.compare_years(req.feature, req.year1, req.year2)
    return result

# ─── PRIMARY AI CHAT ENDPOINTS ───────────────────────────────────────────────

@app.post("/api/ai/chat", response_model=ChatResponse)
async def ai_chat(request: ChatRequest):
    """
    Primary AI assistant endpoint.
    Routes queries between:
    1. Clinical Safety Guardrails (non-prescribing, non-diagnostic, official risk separation)
    2. Kolkata Health Data Engine (exact deterministic calculations & metadata)
    3. Health Education / RAG & Workflow Knowledge Base
    4. Local Gemma 3 270M Inference
    """
    messages: List[dict] = []
    if request.messages:
        messages = [{"role": m.role, "content": m.content} for m in request.messages]
    elif request.message:
        messages = [{"role": "user", "content": request.message}]
    else:
        messages = [{"role": "user", "content": "Hello"}]

    lang = request.language or "en"

    # 1. Process via OllamaService (incorporates dataset context, safety overrides, and local Gemma)
    ollama_result = await ollama_service.chat(messages, language=lang)
    reply_text = ollama_result.get("response", "")
    
    return ChatResponse(
        success=True,
        response=reply_text,
        reply=reply_text,
        model=ollama_result.get("model", "gemma3:270m"),
        provider=ollama_result.get("provider", "ollama"),
        local=ollama_result.get("local", True),
        badge=ollama_result.get("badge"),
        source=ollama_result.get("source"),
        data_points=ollama_result.get("data_points"),
        note=ollama_result.get("note")
    )

@app.post("/api/ai/chat/stream")
async def ai_chat_stream(request: ChatRequest):
    """
    Streaming AI chat endpoint with real-time token delivery via Server-Sent Events.
    """
    messages: List[dict] = []
    if request.messages:
        messages = [{"role": m.role, "content": m.content} for m in request.messages]
    elif request.message:
        messages = [{"role": "user", "content": request.message}]
    else:
        messages = [{"role": "user", "content": "Hello"}]

    lang = request.language or "en"
    return StreamingResponse(
        ollama_service.chat_stream(messages, language=lang),
        media_type="text/event-stream"
    )

@app.post("/api/chat", response_model=ChatResponse)
async def health_chat_legacy(request: ChatRequest):
    """
    Legacy backwards-compatible endpoint aliased to ai_chat.
    """
    return await ai_chat(request)




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
        created_at=datetime.utcnow().isoformat()
    )
    db_appt.likely_conditions = appt.likely_conditions or []
    db.add(db_appt)
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
    appts = db.query(AppointmentModel).order_by(AppointmentModel.created_at.desc()).all()
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
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    valid = ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"]
    new_status = body.get("status", "")
    if new_status not in valid:
        raise HTTPException(status_code=400, detail=f"Status must be one of {valid}")
    appt.status = new_status
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
    if not appt:
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
    db.commit()
    return {"message": "Appointment updated", "id": appointment_id}


@app.delete("/api/appointments/{appointment_id}")
def delete_appointment(
    appointment_id: str,
    db: Session = Depends(get_db)
):
    """
    Delete an appointment by ID.
    """
    appt = db.query(AppointmentModel).filter(AppointmentModel.id == appointment_id).first()
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    db.delete(appt)
    db.commit()
    return {"message": "Appointment deleted", "id": appointment_id}


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
    Searches for real hospitals using open-source mapping data instead of Google Maps API.
    """
    # 1. First get the coordinates for the user's location
    geocode_url = f"https://nominatim.openstreetmap.org/search?format=json&q={urllib.parse.quote(location)}&limit=1"
    req = urllib.request.Request(geocode_url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    
    base_lat = 22.723
    base_lng = 88.483
    
    try:
        with urllib.request.urlopen(req) as response:
            geo_data = json.loads(response.read().decode())
            if geo_data:
                base_lat = float(geo_data[0]['lat'])
                base_lng = float(geo_data[0]['lon'])
    except Exception as e:
        print("Geocoding failed:", e)

    # 2. Search for hospitals in that location
    search_url = f"https://nominatim.openstreetmap.org/search?format=json&q=hospital+in+{urllib.parse.quote(location)}&limit=15"
    req_hosp = urllib.request.Request(search_url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    
    try:
        with urllib.request.urlopen(req_hosp) as response:
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
                    "distance": f"{dist:.1f} km"
                })
            # sort by distance
            results.sort(key=lambda x: float(x['distance'].split()[0]))
            return {"hospitals": results, "center": {"lat": base_lat, "lng": base_lng}}
    except Exception as e:
        print("Hospital search failed:", e)
        return {"hospitals": [], "center": {"lat": base_lat, "lng": base_lng}}


@app.get('/api/hospitals/search')
def search_hospitals(location: str):
    print(f'Fetching mock hospitals for {location}')
    # Return mock hospitals
    hospitals = [
        {'id': '1', 'name': 'City General Hospital', 'specialty': 'Multi-specialty', 'address': f'{location} Main Road', 'phone': '9876543210', 'rating': 4.5, 'distance': '2.5 km', 'isOpen': True, 'lat': 22.72, 'lng': 88.48, 'amenity': 'hospital'},
        {'id': '2', 'name': 'Rural Health Care Center', 'specialty': 'General Medicine', 'address': f'{location} Village Square', 'phone': '9876543211', 'rating': 4.2, 'distance': '5.0 km', 'isOpen': True, 'lat': 22.71, 'lng': 88.49, 'amenity': 'clinic'},
        {'id': '3', 'name': 'Sunrise Clinic', 'specialty': 'Primary Care', 'address': f'{location} East Side', 'phone': '9876543212', 'rating': 4.8, 'distance': '1.2 km', 'isOpen': True, 'lat': 22.73, 'lng': 88.47, 'amenity': 'clinic'}
    ]
    return {'center': {'lat': 22.723, 'lng': 88.483}, 'hospitals': hospitals}


# ==============================================================================
# POPULATION HEALTH INTELLIGENCE & RISK CONTEXT ENDPOINTS (HMIS + NFHS-5)
# ==============================================================================

@app.get("/api/ml/population-health")
def get_population_health(
    district: str = "Kolkata",
    year: Optional[int] = None
):
    """
    Returns population health domain summaries and context indicators for a district and year.
    Supported domains: maternal_health, child_health, nutrition, ncd, communicable, healthcare_access.
    """
    if _POPULATION_HEALTH is None:
        raise HTTPException(status_code=503, detail="Population health engine not initialized")
    
    summary = _POPULATION_HEALTH.get_domain_summary(district=district, year=year)
    if "error" in summary:
        raise HTTPException(status_code=404, detail=summary["error"])
    return summary


@app.get("/api/ml/population-health/trends")
def get_population_health_trends(
    district: str = "Kolkata",
    indicators: Optional[str] = None
):
    """
    Returns Recharts-ready annual time series of population health indicators.
    Indicators param can be comma-separated list of indicator names.
    NFHS-5 is included strictly as a 2019-20 survey baseline, not continuous annual data.
    """
    if _POPULATION_HEALTH is None:
        raise HTTPException(status_code=503, detail="Population health engine not initialized")
    
    ind_list = [i.strip() for i in indicators.split(",") if i.strip()] if indicators else None
    trends = _POPULATION_HEALTH.get_population_health_trends(district=district, indicator_keys=ind_list)
    if "error" in trends:
        raise HTTPException(status_code=404, detail=trends["error"])
    return trends


@app.get("/api/ml/population-health/indicator-trend")
def get_indicator_trend(
    indicator: str,
    district: str = "Kolkata"
):
    """
    Returns detailed trend, direction, and CAGR for a specific HMIS/NFHS indicator.
    """
    if _POPULATION_HEALTH is None:
        raise HTTPException(status_code=503, detail="Population health engine not initialized")
    
    trend = _POPULATION_HEALTH.get_indicator_trend(indicator_name=indicator, district=district)
    if "error" in trend and trend.get("status") != "not_available":
        raise HTTPException(status_code=404, detail=trend["error"])
    return trend


@app.get("/api/ml/population-health/ncd-context")
def get_ncd_context(
    district: str = "Kolkata",
    year: Optional[int] = 2021
):
    """
    Provides structured NCD population risk context response (Requirement 7).
    Includes blood pressure, blood sugar, overweight, and tobacco population burden signals.
    """
    if _POPULATION_HEALTH is None:
        raise HTTPException(status_code=503, detail="Population health engine not initialized")
    
    ctx = _POPULATION_HEALTH.get_ncd_context(district=district, year=year)
    if "error" in ctx:
        raise HTTPException(status_code=404, detail=ctx["error"])
    return ctx


@app.get("/api/ml/population-health/data-quality")
def get_population_data_quality():
    """
    Returns the latest population health data quality monitoring report (Requirement 15).
    """
    report_file = os.path.join(os.path.dirname(__file__), "data", "processed", "population_data_quality_report.json")
    if not os.path.exists(report_file):
        try:
            from ml.population_data_quality import run_data_quality_audit
            return run_data_quality_audit()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to generate quality report: {e}")
    
    with open(report_file, "r", encoding="utf-8") as f:
        return json.load(f)


@app.get("/api/ml/population-health/dictionary")
def get_feature_dictionary():
    """
    Returns the curated population feature dictionary with full data provenance (Requirement 14).
    """
    dict_file = os.path.join(os.path.dirname(__file__), "data", "processed", "feature_dictionary.csv")
    if not os.path.exists(dict_file):
        raise HTTPException(status_code=404, detail="Feature dictionary not found")
    
    import pandas as pd
    df_dict = pd.read_csv(dict_file)
    return {
        "total_curated_features": len(df_dict),
        "features": df_dict.to_dict(orient="records"),
        "disclaimer": _POP_DISCLAIMER
    }


class ScreeningEnrichmentPayload(BaseModel):
    vitals: Optional[Dict[str, Any]] = None
    symptoms: Optional[List[str]] = None
    risk_factors: Optional[List[str]] = None
    risk_level: Optional[str] = "Low"
    has_emergency_red_flags: Optional[bool] = False
    district: Optional[str] = "Kolkata"


@app.post("/api/ml/population-health/enrich-screening")
def enrich_screening(payload: ScreeningEnrichmentPayload):
    """
    Enriches individual patient screening with population risk context (Requirement 8 & 12).
    CLINICAL BOUNDARY: Population dataset never overrides patient vitals or reported symptoms.
    """
    if _POPULATION_HEALTH is None:
        raise HTTPException(status_code=503, detail="Population health engine not initialized")
    
    patient_data = {
        "vitals": payload.vitals or {},
        "symptoms": payload.symptoms or [],
        "risk_factors": payload.risk_factors or [],
        "risk_level": payload.risk_level or "Low",
        "has_emergency_red_flags": payload.has_emergency_red_flags or False
    }
    return _POPULATION_HEALTH.enrich_screening_context(
        patient_assessment=patient_data,
        district=payload.district or "Kolkata"
    )

