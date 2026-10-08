import json
from datetime import datetime
from sqlalchemy import create_engine, Column, String, Integer, Float, Text, ForeignKey, Boolean, Index, UniqueConstraint
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

DATABASE_URL = "sqlite:///./ruralhealth.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class PatientModel(Base):
    __tablename__ = "patients"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    age = Column(Integer, nullable=False)
    gender = Column(String, nullable=False)
    village = Column(String, nullable=False)
    phone = Column(String, nullable=False)
    patient_id = Column(String, nullable=True)
    created_at = Column(String, default=lambda: datetime.utcnow().isoformat())

    assessments = relationship("AssessmentModel", back_populates="patient", cascade="all, delete-orphan")

class AssessmentModel(Base):
    __tablename__ = "assessments"

    id = Column(String, primary_key=True, index=True)
    patient_id = Column(String, ForeignKey("patients.id"), nullable=False)
    symptoms_json = Column(Text, default="[]")
    symptom_duration_days = Column(Integer, default=1)
    temperature_f = Column(Float, default=98.6)
    systolic_bp = Column(Integer, default=120)
    diastolic_bp = Column(Integer, default=80)
    glucose_mg_dl = Column(Float, default=100.0)
    heart_rate_bpm = Column(Integer, default=72)
    height_cm = Column(Float, nullable=True)
    weight_kg = Column(Float, nullable=True)
    bmi = Column(Float, nullable=True)
    smoking_status = Column(String, default="Never")
    alcohol_status = Column(String, default="Never")
    physical_activity = Column(String, default="Moderate")
    family_history_json = Column(Text, default="[]")
    
    risk_level = Column(String, default="LOW")
    risk_score = Column(Float, default=0.1)
    likely_conditions_json = Column(Text, default="[]")
    contributing_factors_json = Column(Text, default="[]")
    recommended_action = Column(Text, default="")
    referral_status = Column(String, default="NOT_REFERRED")
    created_at = Column(String, default=lambda: datetime.utcnow().isoformat())

    patient = relationship("PatientModel", back_populates="assessments")

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
    created_at = Column(String, default=lambda: datetime.utcnow().isoformat())

    @property
    def likely_conditions(self):
        try:
            return json.loads(self.likely_conditions_json or "[]")
        except:
            return []

    @likely_conditions.setter
    def likely_conditions(self, value):
        self.likely_conditions_json = json.dumps(value or [])


# ==============================================================================
# SNOWFLAKE SCHEMA FOR POPULATION HEALTH INTELLIGENCE (HMIS + NFHS-5)
# ==============================================================================

class DimState(Base):
    """
    Normalized state dimension.
    Part of Snowflake hierarchy: dim_district -> dim_state
    """
    __tablename__ = "dim_state"

    state_id = Column(Integer, primary_key=True, autoincrement=True)
    state_name = Column(String(100), nullable=False, unique=True, index=True)
    state_code = Column(String(10), nullable=False, unique=True)
    created_at = Column(String, default=lambda: datetime.utcnow().isoformat())

    districts = relationship("DimDistrict", back_populates="state", cascade="all, delete-orphan")


class DimDistrict(Base):
    """
    Normalized district dimension linking to dim_state.
    Snowflake relationship: dim_district -> dim_state
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
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
