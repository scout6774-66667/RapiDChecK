from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any, Literal

# ─── PATIENT SCHEMAS ─────────────────────────────────────────────────────────

class PatientBase(BaseModel):
    id: Optional[str] = None
    national_health_id: Optional[str] = None
    name: str = Field(..., min_length=1, max_length=120)
    age: int = Field(..., ge=1, le=125, description="Patient age in years (1-125)")
    gender: str = Field(..., description="Biological sex / gender")
    village: str = Field(..., min_length=1, max_length=100)
    phone: Optional[str] = Field(default="", max_length=20)
    patient_id: Optional[str] = None

class PatientCreate(PatientBase):
    pass

class PatientResponse(PatientBase):
    server_version: int = 1
    is_deleted: int = 0
    created_at: str
    updated_at: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


# ─── ASSESSMENT SCHEMAS (TASK-001 & TASK-002) ─────────────────────────────────

class AssessmentCreate(BaseModel):
    id: Optional[str] = None
    patient_id: str
    patient_name: Optional[str] = None
    village: Optional[str] = None
    symptoms: List[str] = Field(default_factory=list)
    symptom_duration_days: Optional[int] = Field(default=None, ge=0, le=365, description="Duration in days")
    
    # TASK-001: Strict Nullability on Vitals (NO silent normal defaults like 98.6, 120, 100)
    temperature_f: Optional[float] = Field(default=None, ge=85.0, le=115.0, description="Temperature in Fahrenheit")
    systolic_bp: Optional[int] = Field(default=None, ge=40, le=320, description="Systolic Blood Pressure (mmHg)")
    diastolic_bp: Optional[int] = Field(default=None, ge=20, le=220, description="Diastolic Blood Pressure (mmHg)")
    glucose_mg_dl: Optional[float] = Field(default=None, ge=10.0, le=1000.0, description="Blood Glucose in mg/dL")
    heart_rate_bpm: Optional[int] = Field(default=None, ge=20, le=300, description="Heart Rate in BPM")
    height_cm: Optional[float] = Field(default=None, ge=30.0, le=260.0, description="Height in cm")
    weight_kg: Optional[float] = Field(default=None, ge=1.0, le=400.0, description="Weight in kg")
    bmi: Optional[float] = Field(default=None, ge=5.0, le=100.0, description="Body Mass Index")
    
    smoking_status: Optional[str] = "Never" # Never, Former, Current
    alcohol_status: Optional[str] = "Never" # Never, Occasional, Regular
    physical_activity: Optional[str] = "Moderate" # Sedentary, Moderate, Active
    family_history: List[str] = Field(default_factory=list)
    notes: Optional[str] = ""
    client_operation_id: Optional[str] = None


class AssessmentResponse(BaseModel):
    id: str
    patient_id: str
    patient_name: Optional[str] = None
    village: Optional[str] = None
    client_operation_id: Optional[str] = None
    symptoms: List[str] = Field(default_factory=list)
    symptom_duration_days: Optional[int] = None
    temperature_f: Optional[float] = None
    systolic_bp: Optional[int] = None
    diastolic_bp: Optional[int] = None
    glucose_mg_dl: Optional[float] = None
    heart_rate_bpm: Optional[int] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    bmi: Optional[float] = None
    smoking_status: Optional[str] = "Never"
    alcohol_status: Optional[str] = "Never"
    physical_activity: Optional[str] = "Moderate"
    family_history: List[str] = Field(default_factory=list)
    
    # Governed Triage States & Emergency Flags
    risk_level: str  # LOW, MODERATE, HIGH, EMERGENCY, INSUFFICIENT_DATA
    triage_state: Optional[str] = "LOW_RISK" # LOW_RISK, MODERATE_RISK, HIGH_RISK, EMERGENCY, INSUFFICIENT_DATA, CONFLICTING_DATA
    is_emergency: bool = False
    short_circuit: bool = False
    red_flags: List[str] = Field(default_factory=list)
    uncertainty_state: str = "COMPLETE" # COMPLETE, INSUFFICIENT_DATA, UNCERTAIN
    
    risk_score: Optional[float] = None
    likely_conditions: List[str] = Field(default_factory=list)
    contributing_factors: List[str] = Field(default_factory=list)
    recommended_action: str
    referral_status: str  # NOT_REFERRED, REFERRED, APPOINTMENT_REQUESTED, CONSULTATION_COMPLETED
    
    # Versioning & Audit Metadata
    workflow_version: str = "2.0.0"
    ruleset_version: str = "2.0.0"
    review_state: str = "NOT_REQUIRED" # NOT_REQUIRED, REVIEW_REQUIRED, ASSIGNED, IN_REVIEW, APPROVED, MODIFIED, REJECTED
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None
    server_version: int = 1
    is_deleted: int = 0
    created_at: str
    updated_at: Optional[str] = None
    disclaimer: str

    model_config = ConfigDict(from_attributes=True)


class ReferralUpdate(BaseModel):
    referral_status: str


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
    server_version: int = 1
    is_deleted: int = 0
    created_at: str
    updated_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ─── LEGACY SYNC SCHEMAS (BACKWARD COMPATIBILITY) ──────────────────────────────

class SyncPayload(BaseModel):
    patients: List[PatientCreate] = []
    assessments: List[AssessmentCreate] = []


class SyncResponse(BaseModel):
    synced_patients_count: int
    synced_assessments_count: int
    message: str


# ─── V2 BIDIRECTIONAL SYNC SCHEMAS (TASK-005 & TASK-006) ───────────────────────

class SyncOperation(BaseModel):
    operation_id: str = Field(..., description="Client-generated unique UUIDv4")
    entity_type: Literal['patient', 'assessment', 'appointment', 'referral']
    entity_id: str
    operation_type: Literal['CREATE', 'UPDATE', 'DELETE']
    payload: Dict[str, Any] = Field(default_factory=dict)
    base_server_version: Optional[int] = Field(default=None, description="Base revision for OCC conflict checking")
    client_sequence: int = Field(default=0, description="Monotonic client sequence index")
    client_timestamp: Optional[str] = None


class SyncPushRequest(BaseModel):
    device_id: str = Field(..., description="Unique hardware/browser device identifier")
    client_sequence: int = Field(default=0, description="Highest client sequence in this push batch")
    operations: List[SyncOperation] = Field(default_factory=list)


class SyncConflictData(BaseModel):
    entity_id: Optional[str] = None
    entity_type: Optional[str] = None
    base_server_version: Optional[int] = None
    current_server_version: Optional[int] = None
    base_version: Optional[int] = None
    server_version: Optional[int] = None
    server_payload: Dict[str, Any] = Field(default_factory=dict)


class SyncOperationResult(BaseModel):
    operation_id: str
    entity_type: str
    entity_id: str
    operation_type: str
    status: Literal['APPLIED', 'DUPLICATE', 'CONFLICT', 'REJECTED']
    server_version: int
    server_sequence: Optional[int] = None
    conflict_data: Optional[SyncConflictData] = None
    error_message: Optional[str] = None


class SyncPushResponse(BaseModel):
    device_id: str
    processed_at: str
    applied_count: int = 0
    duplicate_count: int = 0
    conflict_count: int = 0
    rejected_count: int = 0
    current_server_sequence: Optional[int] = None
    results: List[SyncOperationResult]


class SyncPullRequest(BaseModel):
    device_id: Optional[str] = None
    last_server_sequence: int = Field(default=0, ge=0, description="Client sync cursor")
    limit: int = Field(default=100, ge=1, le=500, description="Max journal changes to return")


class SyncJournalEntry(BaseModel):
    server_sequence: int
    device_id: Optional[str] = None
    entity_type: str
    entity_id: str
    operation_type: str
    payload: Dict[str, Any]
    server_version: int
    created_at: str


class SyncPullResponse(BaseModel):
    last_server_sequence: int
    current_server_sequence: int
    entries_count: int = 0
    has_more: bool
    entries: List[SyncJournalEntry] = Field(default_factory=list)
    changes: List[SyncJournalEntry] = Field(default_factory=list)


# ─── AUTHENTICATION & RBAC SCHEMAS (TASK-010 & TASK-011) ─────────────────────

class UserLoginRequest(BaseModel):
    username: str
    password: str

class UserRegisterRequest(BaseModel):
    username: str
    password: str
    email: str
    full_name: str
    role: Literal['ASHA_WORKER', 'PHC_DOCTOR', 'DISTRICT_OFFICER', 'SYSTEM_ADMIN'] = 'ASHA_WORKER'
    license_number: Optional[str] = None
    facility_id: Optional[str] = 'PHC_MAIN'
    assigned_villages: Optional[List[str]] = Field(default_factory=list)

class UserResponse(BaseModel):
    id: str
    username: str
    email: str
    full_name: str
    role: str
    license_number: Optional[str] = None
    facility_id: Optional[str] = None
    assigned_villages: List[str] = Field(default_factory=list)
    is_active: int
    created_at: str
    last_login_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    expires_in_minutes: int
    user: UserResponse
    permissions: List[str]

class UserProfileResponse(BaseModel):
    user: UserResponse
    permissions: List[str]


# ─── CLINICIAN REVIEW & ATTESTATION SCHEMAS (TASK-012) ────────────────────────

class ClinicalReviewSubmitRequest(BaseModel):
    decision: Literal['APPROVED', 'MODIFIED', 'REJECTED']
    clinical_notes: str = Field(..., min_length=5, description="Mandatory doctor clinical notes")
    override_reason: Optional[str] = Field(None, description="Mandatory if modified/rejected or overriding emergency/high-risk")
    modified_risk_level: Optional[Literal['LOW', 'MODERATE', 'HIGH']] = None
    modified_triage_state: Optional[Literal['LOW_RISK', 'MODERATE_RISK', 'HIGH_RISK', 'EMERGENCY']] = None
    modified_action: Optional[str] = None
    modified_referral_status: Optional[Literal['NOT_REFERRED', 'REFERRED', 'APPOINTMENT_REQUESTED', 'CONSULTATION_COMPLETED']] = None

class ClinicalReviewResponse(BaseModel):
    review_id: str
    assessment_id: str
    reviewer_name: str
    decision: str
    override_reason: Optional[str] = None
    clinical_notes: str
    attestation_statement: str
    signature_hash: str
    review_state: str
    server_version: int
    created_at: str

class PendingReviewItem(BaseModel):
    assessment_id: str
    patient_id: str
    patient_name: str
    patient_age: Optional[int] = None
    patient_gender: Optional[str] = None
    village: Optional[str] = None
    triage_state: str
    risk_level: str
    is_emergency: bool
    red_flags: List[str]
    uncertainty_state: str
    symptoms: List[str]
    systolic_bp: Optional[int] = None
    diastolic_bp: Optional[int] = None
    glucose_mg_dl: Optional[float] = None
    temperature_f: Optional[float] = None
    heart_rate_bpm: Optional[int] = None
    recommended_action: str
    referral_status: str
    review_state: str
    reviewed_by: Optional[str] = None
    created_at: str

class ReviewHistoryItem(BaseModel):
    review_id: str
    assessment_id: str
    reviewer_user_id: str
    reviewer_name: str
    reviewer_role: str
    decision: str
    override_reason: Optional[str] = None
    clinical_notes: str
    previous_result: Dict[str, Any]
    new_result: Dict[str, Any]
    attestation_statement: str
    signature_hash: str
    created_at: str

