import json
from datetime import datetime
from sqlalchemy import create_engine, Column, String, Integer, Float, Boolean, Text, ForeignKey, CheckConstraint, UniqueConstraint, Index, text
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from config import DATABASE_URL, ENVIRONMENT

# Configure SQLAlchemy Engine with PostgreSQL production pooling or SQLite dev connection
if "postgresql" in DATABASE_URL.lower():
    engine = create_engine(
        DATABASE_URL,
        pool_size=10,
        max_overflow=20,
        pool_pre_ping=True,
        pool_recycle=3600
    )
else:
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False}
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class PatientModel(Base):
    __tablename__ = "patients"

    id = Column(String, primary_key=True, index=True)
    national_health_id = Column(String, nullable=True)
    name = Column(String, nullable=False)
    age = Column(Integer, nullable=False)
    gender = Column(String, nullable=False)
    village = Column(String, nullable=False)
    phone = Column(String, nullable=False)
    patient_id = Column(String, nullable=True)
    facility_id = Column(String, nullable=True, default=None, index=True)
    server_version = Column(Integer, default=1, nullable=False)
    is_deleted = Column(Integer, default=0, nullable=False)
    created_at = Column(String, default=lambda: datetime.utcnow().isoformat())
    updated_at = Column(String, default=lambda: datetime.utcnow().isoformat(), onupdate=lambda: datetime.utcnow().isoformat())

    assessments = relationship("AssessmentModel", back_populates="patient", cascade="all, delete-orphan")


class AssessmentModel(Base):
    __tablename__ = "assessments"

    id = Column(String, primary_key=True, index=True)
    patient_id = Column(String, ForeignKey("patients.id"), nullable=False)
    facility_id = Column(String, nullable=True, default=None, index=True)
    client_operation_id = Column(String, nullable=True, index=True)
    symptoms_json = Column(Text, default="[]")
    symptom_duration_days = Column(Integer, nullable=True, default=None)
    temperature_f = Column(Float, nullable=True, default=None)
    systolic_bp = Column(Integer, nullable=True, default=None)
    diastolic_bp = Column(Integer, nullable=True, default=None)
    glucose_mg_dl = Column(Float, nullable=True, default=None)
    heart_rate_bpm = Column(Integer, nullable=True, default=None)
    height_cm = Column(Float, nullable=True, default=None)
    weight_kg = Column(Float, nullable=True, default=None)
    bmi = Column(Float, nullable=True, default=None)
    smoking_status = Column(String, default="Never")
    alcohol_status = Column(String, default="Never")
    physical_activity = Column(String, default="Moderate")
    family_history_json = Column(Text, default="[]")
    
    risk_level = Column(String, default="LOW")
    triage_state = Column(String, default="LOW_RISK")
    is_emergency = Column(Integer, default=0)
    red_flags_json = Column(Text, default="[]")
    uncertainty_state = Column(String, default="COMPLETE")
    risk_score = Column(Float, nullable=True, default=None)
    likely_conditions_json = Column(Text, default="[]")
    contributing_factors_json = Column(Text, default="[]")
    recommended_action = Column(Text, default="")
    referral_status = Column(String, default="NOT_REFERRED")
    workflow_version = Column(String, default="2.0.0")
    ruleset_version = Column(String, default="2.0.0")
    review_state = Column(String, default="NOT_REQUIRED", index=True) # NOT_REQUIRED, REVIEW_REQUIRED, ASSIGNED, IN_REVIEW, APPROVED, MODIFIED, REJECTED
    reviewed_by = Column(String, nullable=True)
    reviewed_at = Column(String, nullable=True)
    server_version = Column(Integer, default=1, nullable=False)
    is_deleted = Column(Integer, default=0, nullable=False)
    created_at = Column(String, default=lambda: datetime.utcnow().isoformat())
    updated_at = Column(String, default=lambda: datetime.utcnow().isoformat(), onupdate=lambda: datetime.utcnow().isoformat())

    patient = relationship("PatientModel", back_populates="assessments")
    reviews = relationship("ClinicalReviewModel", back_populates="assessment", cascade="all, delete-orphan")

    @property
    def symptoms(self):
        try:
            return json.loads(self.symptoms_json or "[]")
        except:
            return []

    @symptoms.setter
    def symptoms(self, value):
        self.symptoms_json = json.dumps(value or [])

    @property
    def family_history(self):
        try:
            return json.loads(self.family_history_json or "[]")
        except:
            return []

    @family_history.setter
    def family_history(self, value):
        self.family_history_json = json.dumps(value or [])

    @property
    def likely_conditions(self):
        try:
            return json.loads(self.likely_conditions_json or "[]")
        except:
            return []

    @likely_conditions.setter
    def likely_conditions(self, value):
        self.likely_conditions_json = json.dumps(value or [])

    @property
    def contributing_factors(self):
        try:
            return json.loads(self.contributing_factors_json or "[]")
        except:
            return []

    @contributing_factors.setter
    def contributing_factors(self, value):
        self.contributing_factors_json = json.dumps(value or [])

    @property
    def red_flags(self):
        try:
            return json.loads(self.red_flags_json or "[]")
        except:
            return []

    @red_flags.setter
    def red_flags(self, value):
        self.red_flags_json = json.dumps(value or [])


class AppointmentModel(Base):
    """Stores teleconsultation bookings."""
    __tablename__ = "appointments"

    id = Column(String, primary_key=True, index=True)
    patient_name = Column(String, nullable=False)
    patient_phone = Column(String, nullable=True, default="")
    doctor_name = Column(String, nullable=False)
    doctor_specialty = Column(String, nullable=True, default="General Physician")
    doctor_address = Column(String, nullable=True, default="")
    appointment_date = Column(String, nullable=False)   # e.g. "2026-08-12"
    appointment_time = Column(String, nullable=False)   # e.g. "10:00 AM"
    notes = Column(Text, default="")
    status = Column(String, default="PENDING")          # PENDING, CONFIRMED, CANCELLED, COMPLETED
    risk_level = Column(String, nullable=True)
    likely_conditions_json = Column(Text, default="[]")
    server_version = Column(Integer, default=1, nullable=False)
    is_deleted = Column(Integer, default=0, nullable=False)
    created_at = Column(String, default=lambda: datetime.utcnow().isoformat())
    updated_at = Column(String, default=lambda: datetime.utcnow().isoformat(), onupdate=lambda: datetime.utcnow().isoformat())

    @property
    def likely_conditions(self):
        try:
            return json.loads(self.likely_conditions_json or "[]")
        except:
            return []

    @likely_conditions.setter
    def likely_conditions(self, value):
        self.likely_conditions_json = json.dumps(value or [])


class SyncJournalModel(Base):
    """
    Immutable monotonic journal of all mutation events applied on the server.
    Used by TASK-006 cursor-based pull sync.
    """
    __tablename__ = "sync_journal"

    server_sequence = Column(Integer, primary_key=True, autoincrement=True, index=True)
    device_id = Column(String, nullable=True, index=True)
    entity_type = Column(String, nullable=False)   # patient, assessment, appointment, referral
    entity_id = Column(String, nullable=False, index=True)
    operation_type = Column(String, nullable=False) # CREATE, UPDATE, DELETE
    payload_json = Column(Text, nullable=False)
    server_version = Column(Integer, nullable=False)
    created_at = Column(String, default=lambda: datetime.utcnow().isoformat())

    @property
    def payload(self):
        try:
            return json.loads(self.payload_json or "{}")
        except:
            return {}

    @payload.setter
    def payload(self, value):
        self.payload_json = json.dumps(value or {})


class IdempotencyModel(Base):
    """
    Tracks all processed client operation UUIDs to guarantee idempotent execution.
    Used by TASK-005 push sync.
    """
    __tablename__ = "idempotency_log"

    operation_id = Column(String, primary_key=True, index=True)
    device_id = Column(String, nullable=False, index=True)
    client_sequence = Column(Integer, nullable=False)
    entity_type = Column(String, nullable=False)
    entity_id = Column(String, nullable=False)
    status = Column(String, nullable=False) # APPLIED, DUPLICATE, CONFLICT, REJECTED
    server_version = Column(Integer, nullable=False)
    response_json = Column(Text, nullable=True)
    created_at = Column(String, default=lambda: datetime.utcnow().isoformat())


class UserModel(Base):
    """
    User accounts for Frontline ASHA Workers, PHC Doctors, District Officers, and Admins.
    Supports JWT Authentication and Role-Based Access Control (RBAC).
    """
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    role = Column(String, nullable=False, default="ASHA_WORKER") # ASHA_WORKER, PHC_DOCTOR, DISTRICT_OFFICER, SYSTEM_ADMIN
    license_number = Column(String, nullable=True) # Medical council registration number for doctors
    facility_id = Column(String, nullable=True, default="PHC_MAIN")
    assigned_villages_json = Column(Text, default="[]")
    is_active = Column(Integer, default=1, nullable=False)
    created_at = Column(String, default=lambda: datetime.utcnow().isoformat())
    last_login_at = Column(String, nullable=True)

    reviews = relationship("ClinicalReviewModel", back_populates="reviewer")

    @property
    def assigned_villages(self):
        try:
            return json.loads(self.assigned_villages_json or "[]")
        except:
            return []

    @assigned_villages.setter
    def assigned_villages(self, value):
        self.assigned_villages_json = json.dumps(value or [])


class ClinicalReviewModel(Base):
    """
    Clinician review records with mandatory override justification, clinical notes,
    and cryptographic attestation / digital signature.
    """
    __tablename__ = "clinical_reviews"

    id = Column(String, primary_key=True, index=True)
    assessment_id = Column(String, ForeignKey("assessments.id"), nullable=False, index=True)
    reviewer_user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    reviewer_name = Column(String, nullable=False)
    reviewer_role = Column(String, default="PHC_DOCTOR", nullable=False)
    decision = Column(String, nullable=False) # APPROVED, MODIFIED, REJECTED
    override_reason = Column(Text, nullable=True)
    clinical_notes = Column(Text, nullable=False)
    previous_result_json = Column(Text, nullable=False)
    new_result_json = Column(Text, nullable=False)
    attestation_statement = Column(Text, nullable=False)
    signature_hash = Column(String, nullable=False) # Cryptographic signature hash
    created_at = Column(String, default=lambda: datetime.utcnow().isoformat())
    updated_at = Column(String, default=lambda: datetime.utcnow().isoformat(), onupdate=lambda: datetime.utcnow().isoformat())

    assessment = relationship("AssessmentModel", back_populates="reviews")
    reviewer = relationship("UserModel", back_populates="reviews")


class AuditEventModel(Base):
    """
    Immutable audit ledger for clinical provenance, security events, and sync operations.
    """
    __tablename__ = "audit_events"

    event_id = Column(String, primary_key=True, index=True)
    event_type = Column(String, nullable=False, index=True) # e.g. PATIENT_CREATED, ASSESSMENT_CREATED, REVIEW_COMPLETED, CLINICIAN_OVERRIDE, RESOURCE_PUBLISHED
    entity_type = Column(String, nullable=False)
    entity_id = Column(String, nullable=False, index=True)
    user_id = Column(String, nullable=True, index=True)
    user_role = Column(String, nullable=True)
    device_id = Column(String, nullable=True)
    action = Column(String, nullable=False)
    previous_state_json = Column(Text, nullable=True)
    new_state_json = Column(Text, nullable=True)
    workflow_version = Column(String, default="2.0.0")
    ruleset_version = Column(String, default="2.0.0")
    timestamp = Column(String, default=lambda: datetime.utcnow().isoformat())


# ─── HEALTH RESOURCE ONTOLOGY & GOVERNANCE MODELS ──────────────────────────

class HealthResourceCategoryModel(Base):
    """
    Structured taxonomy hierarchy for clinical health resources.
    """
    __tablename__ = "health_resource_categories"

    id = Column(String, primary_key=True, index=True)
    code = Column(String, unique=True, nullable=False, index=True) # MATERNAL, CHILD_HEALTH, COMMUNICABLE, NCD, REFERRAL, GENERAL
    name = Column(String, nullable=False)
    parent_code = Column(String, nullable=True, index=True)
    description = Column(Text, default="")
    icon = Column(String, default="FileText")
    sort_order = Column(Integer, default=0)


class HealthResourceModel(Base):
    """
    Canonical clinical health resources with governance, versioning, and provenance.
    """
    __tablename__ = "health_resources"

    id = Column(String, primary_key=True, index=True) # e.g. HR-DENGUE-001 or UUID
    resource_code = Column(String, nullable=False, index=True) # e.g. HR-DENGUE-001
    title = Column(String, nullable=False, index=True)
    summary = Column(Text, nullable=False)
    content = Column(Text, nullable=False)
    resource_type = Column(String, nullable=False, index=True) # PATIENT_EDUCATION, CLINICAL_GUIDELINE, ASHA_ACTION_CHECKLIST, REFERRAL_SOP, SURVEILLANCE_PROTOCOL
    category_code = Column(String, ForeignKey("health_resource_categories.code"), nullable=False, index=True)
    status = Column(String, default="DRAFT", nullable=False, index=True) # DRAFT, CLINICAL_REVIEW, APPROVED, PUBLISHED, SUPERSEDED, REVOKED, ARCHIVED
    version = Column(String, default="1.0.0", nullable=False)

    source_name = Column(String, nullable=False) # e.g. MoHFW Government of India, WHO
    source_url = Column(String, nullable=True)
    source_document = Column(String, nullable=True)
    source_version = Column(String, nullable=True)

    language = Column(String, default="en", nullable=False, index=True)
    is_emergency = Column(Integer, default=0, nullable=False, index=True)
    urgency_level = Column(String, default="ROUTINE", nullable=False, index=True) # ROUTINE, MODERATE, URGENT, EMERGENCY

    created_by = Column(String, nullable=False)
    updated_by = Column(String, nullable=True)
    reviewed_by = Column(String, nullable=True)
    reviewed_at = Column(String, nullable=True)
    published_at = Column(String, nullable=True)
    expires_at = Column(String, nullable=True)
    last_verified_at = Column(String, nullable=True)
    change_reason = Column(Text, nullable=True)

    is_deleted = Column(Integer, default=0, nullable=False)
    server_version = Column(Integer, default=1, nullable=False)
    created_at = Column(String, default=lambda: datetime.utcnow().isoformat())
    updated_at = Column(String, default=lambda: datetime.utcnow().isoformat(), onupdate=lambda: datetime.utcnow().isoformat())

    tags = relationship("HealthResourceTagModel", back_populates="resource", cascade="all, delete-orphan")
    scopes = relationship("HealthResourceScopeModel", back_populates="resource", cascade="all, delete-orphan")
    versions = relationship("HealthResourceVersionModel", back_populates="resource", cascade="all, delete-orphan")


class HealthResourceTagModel(Base):
    """
    Multidimensional clinical and demographic tags for context-driven matching.
    """
    __tablename__ = "health_resource_tags"

    id = Column(Integer, primary_key=True, autoincrement=True)
    resource_id = Column(String, ForeignKey("health_resources.id"), nullable=False, index=True)
    tag_type = Column(String, nullable=False, index=True) # condition, symptom, age_group, sex, pregnancy_stage, role, facility_type, clinical_state, urgency
    tag_value = Column(String, nullable=False, index=True)

    resource = relationship("HealthResourceModel", back_populates="tags")


class HealthResourceScopeModel(Base):
    """
    Access scopes (GLOBAL, STATE, DISTRICT, FACILITY, ROLE).
    """
    __tablename__ = "health_resource_scopes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    resource_id = Column(String, ForeignKey("health_resources.id"), nullable=False, index=True)
    scope_type = Column(String, nullable=False, index=True) # GLOBAL, STATE, DISTRICT, FACILITY, ROLE
    scope_value = Column(String, nullable=False, index=True) # e.g. GLOBAL, ASHA_WORKER, PHC_DOCTOR, PHC-KASGANJ-01

    resource = relationship("HealthResourceModel", back_populates="scopes")


class HealthResourceVersionModel(Base):
    """
    Immutable audit history of published resource versions with cryptographic attestation.
    """
    __tablename__ = "health_resource_versions"

    id = Column(String, primary_key=True, index=True)
    resource_id = Column(String, ForeignKey("health_resources.id"), nullable=False, index=True)
    version = Column(String, nullable=False)
    title = Column(String, nullable=False)
    summary = Column(Text, nullable=False)
    content = Column(Text, nullable=False)
    status = Column(String, nullable=False)
    reviewed_by = Column(String, nullable=True)
    reviewed_at = Column(String, nullable=True)
    attestation_hash = Column(String, nullable=True)
    change_reason = Column(Text, nullable=True)
    created_at = Column(String, default=lambda: datetime.utcnow().isoformat())

    resource = relationship("HealthResourceModel", back_populates="versions")


# ─── POPULATION HEALTH SNOWFLAKE SCHEMA MODELS ──────────────────────────────

class DimState(Base):
    """
    State dimension for health indicators.
    """
    __tablename__ = "dim_state"

    state_id = Column(Integer, primary_key=True, autoincrement=True)
    state_name = Column(String(100), nullable=False, unique=True, index=True)
    state_code = Column(String(10), nullable=True, unique=True)
    created_at = Column(String, default=lambda: datetime.utcnow().isoformat())

    districts = relationship("DimDistrict", back_populates="state")


class DimDistrict(Base):
    """
    District dimension with Snowflake hierarchy linking to DimState.
    """
    __tablename__ = "dim_district"

    district_id = Column(Integer, primary_key=True, autoincrement=True)
    state_id = Column(Integer, ForeignKey("dim_state.state_id"), nullable=False, index=True)
    district_name = Column(String(100), nullable=False, index=True)
    district_code = Column(String(20), nullable=True)
    created_at = Column(String, default=lambda: datetime.utcnow().isoformat())

    __table_args__ = (
        UniqueConstraint("state_id", "district_name", name="uq_district_state_name"),
    )

    state = relationship("DimState", back_populates="districts")
    facts = relationship("FactHealthIndicator", back_populates="district")


class DimTime(Base):
    """
    Time dimension supporting annual HMIS reporting and NFHS-5 survey baseline period.
    """
    __tablename__ = "dim_time"

    time_id = Column(Integer, primary_key=True, autoincrement=True)
    year = Column(Integer, nullable=False, index=True)
    fiscal_year = Column(String(20), nullable=False, unique=True, index=True)
    period_type = Column(String(30), nullable=False, default="fiscal_year")
    is_survey_period = Column(Boolean, nullable=False, default=False)
    survey_period = Column(String(30), nullable=True)
    created_at = Column(String, default=lambda: datetime.utcnow().isoformat())

    facts = relationship("FactHealthIndicator", back_populates="time_period")


class DimSource(Base):
    """
    Source dimension capturing provenance (HMIS administrative vs NFHS-5 sample survey).
    """
    __tablename__ = "dim_source"

    source_id = Column(Integer, primary_key=True, autoincrement=True)
    source_name = Column(String(50), nullable=False, unique=True, index=True)
    dataset_name = Column(String(150), nullable=False)
    source_type = Column(String(50), nullable=False)
    cadence = Column(String(50), nullable=False)
    provenance_notes = Column(Text, nullable=True)
    created_at = Column(String, default=lambda: datetime.utcnow().isoformat())

    indicators = relationship("DimIndicator", back_populates="source")
    facts = relationship("FactHealthIndicator", back_populates="source")


class DimUnit(Base):
    """
    Unit of measurement dimension.
    """
    __tablename__ = "dim_unit"

    unit_id = Column(Integer, primary_key=True, autoincrement=True)
    unit_name = Column(String(50), nullable=False, unique=True, index=True)
    raw_unit_label = Column(String(50), nullable=False)
    unit_symbol = Column(String(10), nullable=True)
    created_at = Column(String, default=lambda: datetime.utcnow().isoformat())

    indicators = relationship("DimIndicator", back_populates="unit")
    facts = relationship("FactHealthIndicator", back_populates="unit")


class DimFacility(Base):
    """
    Facility category dimension (Rural, Urban, Public, Private, Combined, or Not Applicable).
    """
    __tablename__ = "dim_facility"

    facility_id = Column(Integer, primary_key=True, autoincrement=True)
    facility_category = Column(String(100), nullable=False, unique=True, index=True)
    facility_level = Column(String(50), nullable=True)
    area_type = Column(String(50), nullable=True)
    ownership_type = Column(String(50), nullable=True)
    created_at = Column(String, default=lambda: datetime.utcnow().isoformat())

    facts = relationship("FactHealthIndicator", back_populates="facility")


class DimCategory(Base):
    """
    Demographic / reporting category dimension (Total, Age groups, Tested, Positive, etc.).
    """
    __tablename__ = "dim_category"

    category_id = Column(Integer, primary_key=True, autoincrement=True)
    category_name = Column(String(100), nullable=False, unique=True, index=True)
    demographic_group = Column(String(50), nullable=True)
    created_at = Column(String, default=lambda: datetime.utcnow().isoformat())

    facts = relationship("FactHealthIndicator", back_populates="category")


class DimIndicatorHead(Base):
    """
    Indicator section/head dimension.
    Snowflake relationship: dim_indicator -> dim_indicator_head
    """
    __tablename__ = "dim_indicator_head"

    head_id = Column(Integer, primary_key=True, autoincrement=True)
    indicator_head_name = Column(String(200), nullable=False, unique=True, index=True)
    section_code = Column(String(20), nullable=True)
    created_at = Column(String, default=lambda: datetime.utcnow().isoformat())

    indicators = relationship("DimIndicator", back_populates="indicator_head")


class DimIndicator(Base):
    """
    Health indicator dimension with full provenance and clinical domain mapping.
    Links to dim_indicator_head, dim_source, and dim_unit.
    """
    __tablename__ = "dim_indicator"

    indicator_id = Column(Integer, primary_key=True, autoincrement=True)
    indicator_code = Column(String(250), nullable=False, unique=True, index=True)
    indicator_name = Column(Text, nullable=False)
    head_id = Column(Integer, ForeignKey("dim_indicator_head.head_id"), nullable=True, index=True)
    domain = Column(String(50), nullable=True, index=True)
    source_id = Column(Integer, ForeignKey("dim_source.source_id"), nullable=False, index=True)
    unit_id = Column(Integer, ForeignKey("dim_unit.unit_id"), nullable=False, index=True)
    is_curated = Column(Boolean, nullable=False, default=False, index=True)
    curated_feature_name = Column(String(150), nullable=True, index=True)
    indicator_number = Column(Integer, nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(String, default=lambda: datetime.utcnow().isoformat())

    indicator_head = relationship("DimIndicatorHead", back_populates="indicators")
    source = relationship("DimSource", back_populates="indicators")
    unit = relationship("DimUnit", back_populates="indicators")
    facts = relationship("FactHealthIndicator", back_populates="indicator")


class FactHealthIndicator(Base):
    """
    Fact table for aggregate health indicator observations.
    Grain: Exactly one aggregate health indicator observation for a specific indicator,
    geography (district/state), time period (fiscal year or survey period), facility category,
    demographic category, and source.
    """
    __tablename__ = "fact_health_indicator"

    fact_id = Column(Integer, primary_key=True, autoincrement=True)
    time_id = Column(Integer, ForeignKey("dim_time.time_id"), nullable=False, index=True)
    district_id = Column(Integer, ForeignKey("dim_district.district_id"), nullable=False, index=True)
    indicator_id = Column(Integer, ForeignKey("dim_indicator.indicator_id"), nullable=False, index=True)
    facility_id = Column(Integer, ForeignKey("dim_facility.facility_id"), nullable=False, index=True)
    category_id = Column(Integer, ForeignKey("dim_category.category_id"), nullable=False, index=True)
    unit_id = Column(Integer, ForeignKey("dim_unit.unit_id"), nullable=False, index=True)
    source_id = Column(Integer, ForeignKey("dim_source.source_id"), nullable=False, index=True)

    value = Column(Float, nullable=True)
    data_status = Column(String(30), nullable=False, default="reported")
    note = Column(Text, nullable=True)
    raw_feature_name = Column(String(250), nullable=False, index=True)
    created_at = Column(String, default=lambda: datetime.utcnow().isoformat())

    __table_args__ = (
        UniqueConstraint(
            "time_id", "district_id", "indicator_id", "facility_id", "category_id", "source_id",
            name="uq_fact_health_indicator_grain"
        ),
        Index("idx_fact_indicator_time", "indicator_id", "time_id"),
        Index("idx_fact_district_time", "district_id", "time_id"),
        Index("idx_fact_source_time", "source_id", "time_id"),
    )

    time_period = relationship("DimTime", back_populates="facts")
    district = relationship("DimDistrict", back_populates="facts")
    indicator = relationship("DimIndicator", back_populates="facts")
    facility = relationship("DimFacility", back_populates="facts")
    category = relationship("DimCategory", back_populates="facts")
    unit = relationship("DimUnit", back_populates="facts")
    source = relationship("DimSource", back_populates="facts")


def init_db():
    """
    Initializes database schema and validates database connectivity.
    Fails fast with RuntimeError if database is unreachable in production.
    """
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        Base.metadata.create_all(bind=engine)
    except Exception as err:
        if ENVIRONMENT == "production":
            raise RuntimeError(f"FATAL: Production PostgreSQL connection failed: {err}")
        else:
            print(f"[database] Warning during init_db: {err}")
            Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

