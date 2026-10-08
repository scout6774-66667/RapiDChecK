from pydantic import BaseModel, Field
from typing import List, Optional

class PatientBase(BaseModel):
    id: Optional[str] = None
    name: str
    age: int
    gender: str
    village: str
    phone: str
    patient_id: Optional[str] = None

class PatientCreate(PatientBase):
    pass

class PatientResponse(PatientBase):
    created_at: str

    class Config:
        from_attributes = True

class AssessmentCreate(BaseModel):
    id: Optional[str] = None
    patient_id: str
    symptoms: List[str] = []
    symptom_duration_days: int = 1
    temperature_f: float = 98.6
    systolic_bp: int = 120
    diastolic_bp: int = 80
    glucose_mg_dl: float = 100.0
    heart_rate_bpm: int = 72
    height_cm: Optional[float] = 165.0
    weight_kg: Optional[float] = 65.0
    bmi: Optional[float] = 23.8
    smoking_status: str = "Never" # Never, Former, Current
    alcohol_status: str = "Never" # Never, Occasional, Regular
    physical_activity: str = "Moderate" # Sedentary, Moderate, Active
    family_history: List[str] = []
    notes: Optional[str] = ""

class AssessmentResponse(BaseModel):
    id: str
    patient_id: str
    patient_name: Optional[str] = None
    village: Optional[str] = None
    symptoms: List[str]
    symptom_duration_days: int
    temperature_f: float
    systolic_bp: int
    diastolic_bp: int
    glucose_mg_dl: float
    heart_rate_bpm: int
    height_cm: Optional[float]
    weight_kg: Optional[float]
    bmi: Optional[float]
    smoking_status: str
    alcohol_status: str
    physical_activity: str
    family_history: List[str]
    risk_level: str  # LOW, MODERATE, HIGH
    risk_score: float
    likely_conditions: List[str]
    contributing_factors: List[str]
    recommended_action: str
    referral_status: str  # NOT_REFERRED, REFERRED, APPOINTMENT_REQUESTED, CONSULTATION_COMPLETED
    created_at: str
    disclaimer: str

    class Config:
        from_attributes = True

class ReferralUpdate(BaseModel):
    referral_status: str

class SyncPayload(BaseModel):
    patients: List[PatientCreate] = []
    assessments: List[AssessmentCreate] = []

class SyncResponse(BaseModel):
    synced_patients_count: int
    synced_assessments_count: int
    message: str


# ─── APPOINTMENT SCHEMAS ───────────────────────────────────────────────────────

class AppointmentCreate(BaseModel):
    id: Optional[str] = None
    patient_name: str
    patient_phone: Optional[str] = ""
    doctor_name: str
    doctor_specialty: Optional[str] = "General Physician"
    doctor_address: Optional[str] = ""
    appointment_date: str          # "YYYY-MM-DD"
    appointment_time: str          # "HH:MM AM/PM"
    notes: Optional[str] = ""
    status: Optional[str] = "PENDING"
    risk_level: Optional[str] = None
    likely_conditions: Optional[List[str]] = []

class AppointmentResponse(BaseModel):
    id: str
    patient_name: str
    patient_phone: Optional[str]
    doctor_name: str
    doctor_specialty: Optional[str]
    doctor_address: Optional[str]
    appointment_date: str
    appointment_time: str
    notes: Optional[str]
    status: str
    risk_level: Optional[str]
    likely_conditions: List[str]
    created_at: str

    class Config:
        from_attributes = True


# ─── HOSPITAL RECOMMENDATION SCHEMAS ──────────────────────────────────────────

class HospitalRecommendationItem(BaseModel):
    id: str
    name: str
    category: str
    specialty: str
    all_specialties: List[str] = []
    distance_km: float
    distance: str
    travel_time_min: int
    travel_time: str
    specialty_match: str
    capability_match: List[str] = []
    all_capabilities: List[str] = []
    recommendation_priority: str  # CRITICAL, HIGH, STANDARD
    suitability_score: float
    reason: str
    icu_beds_available: int = 0
    general_beds_available: int = 0
    is_emergency_24x7: bool = False
    address: str = ""
    phone: str = ""
    rating: float = 4.0
    lat: float
    lng: float


class HospitalRecommendationRequest(BaseModel):
    item_id: Optional[str] = None
    condition: str
    risk_score: float
    risk_level: Optional[str] = None
    specialty: Optional[str] = None
    lat: Optional[float] = 22.723
    lng: Optional[float] = 88.483
    max_results: Optional[int] = 5


class HospitalRecommendationResponse(BaseModel):
    item_id: Optional[str] = None
    condition: str
    patient_risk_score: float
    patient_risk_level: str
    required_specialty: str
    is_critical: bool
    recommendation_banner: str
    hospitals: List[HospitalRecommendationItem]

