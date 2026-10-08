"""
health_resource_schemas.py — Pydantic Schemas for Governed Health Resources
=============================================================================
Defines data structures for:
1. ResourceContext: Canonical input for context-driven retrieval and ranking.
2. Resource CRUD, Categories, Tags, Scopes, and Version History.
3. Recommendation Request/Bundle & Search Payloads.
4. Governance Actions (Review, Publish, Revoke).
5. Ingestion Pipeline schemas.
"""

from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any, Literal


# ─── 1. CANONICAL RESOURCE CONTEXT SCHEMAS ───────────────────────────────────

class ResourceContext(BaseModel):
    """
    Canonical context extracted from User JWT, Patient Demographics, and Clinical Engine Assessment.
    Consumes clinical context without modifying clinical decisions.
    """
    user_id: Optional[str] = None
    user_role: str = Field(default="ASHA_WORKER", description="ASHA_WORKER, PHC_DOCTOR, DISTRICT_OFFICER, SYSTEM_ADMIN")
    facility_id: Optional[str] = "PHC_MAIN"
    patient_id: Optional[str] = None
    assessment_id: Optional[str] = None

    # Demographics
    age: Optional[int] = None
    sex: Optional[str] = None # MALE, FEMALE, OTHER
    pregnancy_status: Optional[str] = "NOT_PREGNANT" # NOT_PREGNANT, FIRST_TRIMESTER, SECOND_TRIMESTER, THIRD_TRIMESTER, POSTPARTUM, HIGH_RISK_PREGNANCY

    # Clinical findings from assessment
    symptoms: List[str] = Field(default_factory=list)
    diagnoses: List[str] = Field(default_factory=list) # Likely conditions from clinical engine
    risk_flags: List[str] = Field(default_factory=list) # Red flags
    risk_level: Optional[str] = "LOW" # LOW, MODERATE, HIGH, EMERGENCY, INSUFFICIENT_DATA
    triage_state: Optional[str] = "LOW_RISK" # LOW_RISK, MODERATE_RISK, HIGH_RISK, EMERGENCY, INSUFFICIENT_DATA, CONFLICTING_DATA
    is_emergency: bool = False
    uncertainty_state: str = "COMPLETE" # COMPLETE, INSUFFICIENT_DATA, UNCERTAIN, CONFLICTING_DATA

    # Vitals for safety gate verification
    systolic_bp: Optional[int] = None
    diastolic_bp: Optional[int] = None
    glucose_mg_dl: Optional[float] = None
    heart_rate_bpm: Optional[int] = None
    temperature_f: Optional[float] = None

    # Explicit user query
    requested_topic: Optional[str] = None
    language: str = "en" # en, hi, bn, te, ta, etc.
    online_status: bool = True

    model_config = ConfigDict(extra="ignore")


# ─── 2. RESOURCE DATA MODELS & CRUD ──────────────────────────────────────────

class HealthResourceTagSchema(BaseModel):
    tag_type: str = Field(..., description="condition, symptom, age_group, sex, pregnancy_stage, role, facility_type, clinical_state, urgency")
    tag_value: str

    model_config = ConfigDict(from_attributes=True)


class HealthResourceScopeSchema(BaseModel):
    scope_type: str = Field(..., description="GLOBAL, STATE, DISTRICT, FACILITY, ROLE")
    scope_value: str

    model_config = ConfigDict(from_attributes=True)


class HealthResourceCategoryResponse(BaseModel):
    id: str
    code: str
    name: str
    parent_code: Optional[str] = None
    description: Optional[str] = ""
    icon: Optional[str] = "FileText"
    sort_order: int = 0
    resource_count: Optional[int] = 0

    model_config = ConfigDict(from_attributes=True)


class HealthResourceVersionResponse(BaseModel):
    id: str
    resource_id: str
    version: str
    title: str
    summary: str
    content: str
    status: str
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None
    attestation_hash: Optional[str] = None
    change_reason: Optional[str] = None
    created_at: str

    model_config = ConfigDict(from_attributes=True)


class HealthResourceBase(BaseModel):
    resource_code: str = Field(..., min_length=2, max_length=64, description="Unique code e.g. HR-ANC-001")
    title: str = Field(..., min_length=3, max_length=255)
    summary: str = Field(..., min_length=5)
    content: str = Field(..., min_length=10)
    resource_type: Literal[
        'PATIENT_EDUCATION',
        'CLINICAL_GUIDELINE',
        'ASHA_ACTION_CHECKLIST',
        'REFERRAL_SOP',
        'SURVEILLANCE_PROTOCOL',
        'EMERGENCY_PROTOCOL'
    ] = 'PATIENT_EDUCATION'
    category_code: str = Field(..., description="Foreign key to health_resource_categories.code")
    language: str = "en"
    is_emergency: bool = False
    urgency_level: Literal['ROUTINE', 'MODERATE', 'URGENT', 'EMERGENCY'] = 'ROUTINE'

    # Provenance and source metadata
    source_name: str = Field(..., description="e.g. MoHFW Government of India, WHO, ICMR")
    source_url: Optional[str] = None
    source_document: Optional[str] = None
    source_version: Optional[str] = None

    tags: List[HealthResourceTagSchema] = Field(default_factory=list)
    scopes: List[HealthResourceScopeSchema] = Field(default_factory=list)


class HealthResourceCreate(HealthResourceBase):
    pass


class HealthResourceUpdate(BaseModel):
    title: Optional[str] = None
    summary: Optional[str] = None
    content: Optional[str] = None
    resource_type: Optional[str] = None
    category_code: Optional[str] = None
    language: Optional[str] = None
    is_emergency: Optional[bool] = None
    urgency_level: Optional[Literal['ROUTINE', 'MODERATE', 'URGENT', 'EMERGENCY']] = None
    source_name: Optional[str] = None
    source_url: Optional[str] = None
    source_document: Optional[str] = None
    source_version: Optional[str] = None
    change_reason: Optional[str] = Field(None, description="Clinical justification for update")
    tags: Optional[List[HealthResourceTagSchema]] = None
    scopes: Optional[List[HealthResourceScopeSchema]] = None


class HealthResourceResponse(HealthResourceBase):
    id: str
    status: Literal['DRAFT', 'CLINICAL_REVIEW', 'APPROVED', 'PUBLISHED', 'SUPERSEDED', 'REVOKED', 'ARCHIVED']
    version: str
    freshness_status: Literal['FRESH', 'STALE', 'EXPIRED', 'REVOKED'] = 'FRESH'
    created_by: str
    updated_by: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None
    published_at: Optional[str] = None
    expires_at: Optional[str] = None
    last_verified_at: Optional[str] = None
    change_reason: Optional[str] = None
    server_version: int = 1
    is_deleted: int = 0
    created_at: str
    updated_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ─── 3. RECOMMENDATION SCHEMAS ───────────────────────────────────────────────

class ResourceRecommendRequest(BaseModel):
    patient_id: Optional[str] = None
    assessment_id: Optional[str] = None
    requested_topic: Optional[str] = None
    language: Optional[str] = "en"
    # Optional raw context override if offline or testing
    raw_context: Optional[ResourceContext] = None


class ResourceRecommendationItem(BaseModel):
    resource_id: str
    resource_code: str
    title: str
    summary: str
    resource_type: str
    category_code: str
    category_name: Optional[str] = None
    reason: str
    priority: int = 0
    urgency: Literal['ROUTINE', 'MODERATE', 'URGENT', 'EMERGENCY'] = 'ROUTINE'
    is_emergency: bool = False
    offline_available: bool = True
    version: str
    freshness_status: str = "FRESH"
    source_name: str
    source_url: Optional[str] = None
    match_score: float = 0.0
    score_breakdown: Dict[str, float] = Field(default_factory=dict)


class ResourceRecommendationBundle(BaseModel):
    context: Dict[str, Any]
    recommendations: List[ResourceRecommendationItem] = Field(default_factory=list)
    emergency_override: bool = False
    warnings: List[str] = Field(default_factory=list)
    engine_version: str = "1.0.0"
    evaluated_at: str


# ─── 4. SEARCH & FILTER SCHEMAS ──────────────────────────────────────────────

class ResourceSearchRequest(BaseModel):
    query: Optional[str] = None
    category_code: Optional[str] = None
    resource_type: Optional[str] = None
    role: Optional[str] = None
    condition: Optional[str] = None
    symptom: Optional[str] = None
    urgency_level: Optional[str] = None
    language: Optional[str] = "en"
    include_all_statuses: bool = False # Admins only
    limit: int = Field(default=50, ge=1, le=200)
    offset: int = Field(default=0, ge=0)


class ResourceSearchResponse(BaseModel):
    total: int
    resources: List[HealthResourceResponse]
    query: Optional[str] = None
    applied_filters: Dict[str, Any] = Field(default_factory=dict)


# ─── 5. GOVERNANCE SCHEMAS ───────────────────────────────────────────────────

class ResourceReviewSubmitRequest(BaseModel):
    decision: Literal['APPROVED', 'MODIFICATIONS_NEEDED', 'REJECTED']
    clinical_notes: str = Field(..., min_length=5, description="Clinical governance commentary")


class ResourcePublishRequest(BaseModel):
    change_reason: str = Field(..., min_length=3, description="Audit reason for publication")
    expires_in_days: Optional[int] = Field(default=365, description="Resource validity window in days")


class ResourceRevokeRequest(BaseModel):
    revocation_reason: str = Field(..., min_length=5, description="Mandatory rationale for revoking clinical resource")


# ─── 6. INGESTION SCHEMAS ────────────────────────────────────────────────────

class ResourceIngestRequest(BaseModel):
    source_name: str
    source_document: Optional[str] = None
    source_url: Optional[str] = None
    raw_text: str = Field(..., min_length=20)
    target_category_code: Optional[str] = None
    suggested_resource_code: Optional[str] = None
    auto_classify: bool = True


class ResourceIngestResponse(BaseModel):
    draft_resource_id: str
    resource_code: str
    extracted_title: str
    extracted_summary: str
    detected_category: str
    extracted_tags: List[Dict[str, str]]
    status: str = "DRAFT"
    governance_warning: str = "AI ingestion generated DRAFT only. Content requires clinical review before publication."
