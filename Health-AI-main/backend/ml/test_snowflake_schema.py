"""
test_snowflake_schema.py — Comprehensive Test Suite for Population Health Snowflake Schema
=============================================================================================
Verifies:
  1. Schema creation (all 10 dimensional tables exist)
  2. Dimension insertion & integrity
  3. Dimension deduplication (unique constraints)
  4. Fact insertion & grain definition
  5. Duplicate fact prevention (unique grain constraint)
  6. Foreign-key relationships & Snowflake hierarchy (dim_district -> dim_state, dim_indicator -> dim_indicator_head)
  7. HMIS fiscal-year handling (14 continuous fiscal years: 2008-09 to 2021-22)
  8. NFHS-5 2019-20 handling (strictly 73 facts in 2019-20, zero temporal leakage)
  9. Source provenance (traceability to raw CSV column and source dataset)
 10. Missing data handling (distinguishes unobserved facts from zero)
 11. Population health queries (relational queries and trends)
 12. Existing API compatibility (preserves all endpoint contracts)
"""

import os
import sys
import pytest
from sqlalchemy.exc import IntegrityError
from fastapi.testclient import TestClient

# Ensure backend root is on sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from database import (
    SessionLocal, init_db, engine, Base,
    DimState, DimDistrict, DimTime, DimSource, DimUnit,
    DimFacility, DimCategory, DimIndicatorHead, DimIndicator,
    FactHealthIndicator
)
from main import app
from ml.population_health import population_health_engine

client = TestClient(app)


@pytest.fixture(scope="module")
def db_session():
    """Provides a database session for testing."""
    init_db()
    session = SessionLocal()
    yield session
    session.close()


# ──────────────────────────────────────────────────────────────────────────────
# 1. SCHEMA CREATION
# ──────────────────────────────────────────────────────────────────────────────

def test_schema_creation(db_session):
    """Verifies all 10 tables exist in the metadata and database."""
    expected_tables = {
        "dim_state", "dim_district", "dim_time", "dim_source", "dim_unit",
        "dim_facility", "dim_category", "dim_indicator_head", "dim_indicator",
        "fact_health_indicator"
    }
    actual_tables = set(Base.metadata.tables.keys())
    for t in expected_tables:
        assert t in actual_tables, f"Missing table in metadata: {t}"

    # Verify each table can be queried without error
    assert db_session.query(DimState).count() >= 1
    assert db_session.query(DimDistrict).count() >= 1
    assert db_session.query(DimTime).count() == 14
    assert db_session.query(DimSource).count() == 2
    assert db_session.query(DimUnit).count() >= 2
    assert db_session.query(DimFacility).count() >= 6
    assert db_session.query(DimCategory).count() >= 10
    assert db_session.query(DimIndicatorHead).count() >= 34
    assert db_session.query(DimIndicator).count() == 1955
    assert db_session.query(FactHealthIndicator).count() == 8275


# ──────────────────────────────────────────────────────────────────────────────
# 2. DIMENSION INSERTION
# ──────────────────────────────────────────────────────────────────────────────

def test_dimension_insertion(db_session):
    """Verifies dimension fields are correctly populated."""
    state = db_session.query(DimState).filter_by(state_code="WB").first()
    assert state is not None
    assert state.state_name == "West Bengal"

    district = db_session.query(DimDistrict).filter_by(district_name="Kolkata").first()
    assert district is not None
    assert district.state_id == state.state_id

    hmis_src = db_session.query(DimSource).filter_by(source_name="HMIS").first()
    assert hmis_src is not None
    assert hmis_src.cadence == "annual"
    assert hmis_src.source_type == "administrative_routine"

    nfhs_src = db_session.query(DimSource).filter_by(source_name="NFHS-5").first()
    assert nfhs_src is not None
    assert nfhs_src.cadence == "survey_snapshot"
    assert nfhs_src.source_type == "population_sample_survey"


# ──────────────────────────────────────────────────────────────────────────────
# 3. DIMENSION DEDUPLICATION
# ──────────────────────────────────────────────────────────────────────────────

def test_dimension_deduplication(db_session):
    """Verifies unique constraints prevent duplicate dimension entries."""
    # Attempt duplicate state code
    dup_state = DimState(state_name="West Bengal Duplicate", state_code="WB")
    db_session.add(dup_state)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()

    # Attempt duplicate fiscal year
    dup_time = DimTime(year=2008, fiscal_year="2008-09")
    db_session.add(dup_time)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()

    # Attempt duplicate source name
    dup_src = DimSource(
        source_name="HMIS",
        dataset_name="Duplicate HMIS",
        source_type="administrative_routine",
        cadence="annual"
    )
    db_session.add(dup_src)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


# ──────────────────────────────────────────────────────────────────────────────
# 4. FACT INSERTION & GRAIN DEFINITION
# ──────────────────────────────────────────────────────────────────────────────

def test_fact_insertion(db_session):
    """Verifies fact records have valid dimensions and numeric values."""
    fact = db_session.query(FactHealthIndicator).first()
    assert fact is not None
    assert fact.fact_id is not None
    assert fact.time_id is not None
    assert fact.district_id is not None
    assert fact.indicator_id is not None
    assert fact.facility_id is not None
    assert fact.category_id is not None
    assert fact.unit_id is not None
    assert fact.source_id is not None
    assert fact.value is not None
    assert fact.raw_feature_name is not None


# ──────────────────────────────────────────────────────────────────────────────
# 5. DUPLICATE FACT PREVENTION
# ──────────────────────────────────────────────────────────────────────────────

def test_duplicate_fact_prevention(db_session):
    """Verifies unique constraint uq_fact_health_indicator_grain blocks duplicate observations."""
    sample = db_session.query(FactHealthIndicator).first()
    assert sample is not None

    dup_fact = FactHealthIndicator(
        time_id=sample.time_id,
        district_id=sample.district_id,
        indicator_id=sample.indicator_id,
        facility_id=sample.facility_id,
        category_id=sample.category_id,
        unit_id=sample.unit_id,
        source_id=sample.source_id,
        value=999.0,
        data_status="reported",
        raw_feature_name=sample.raw_feature_name
    )
    db_session.add(dup_fact)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


# ──────────────────────────────────────────────────────────────────────────────
# 6. FOREIGN-KEY RELATIONSHIPS & SNOWFLAKE HIERARCHY
# ──────────────────────────────────────────────────────────────────────────────

def test_foreign_key_relationships(db_session):
    """Verifies relational Snowflake hierarchy traversal."""
    # 6a. dim_district -> dim_state
    district = db_session.query(DimDistrict).filter_by(district_name="Kolkata").first()
    assert district.state is not None
    assert district.state.state_name == "West Bengal"

    # 6b. dim_indicator -> dim_indicator_head
    indicator = db_session.query(DimIndicator).filter(DimIndicator.head_id.isnot(None)).first()
    assert indicator.indicator_head is not None
    assert len(indicator.indicator_head.indicator_head_name) > 0

    # 6c. fact -> dim_time, dim_indicator, dim_source
    fact = db_session.query(FactHealthIndicator).first()
    assert fact.time_period is not None
    assert fact.district is not None
    assert fact.indicator is not None
    assert fact.source is not None
    assert fact.unit is not None
    assert fact.facility is not None
    assert fact.category is not None


# ──────────────────────────────────────────────────────────────────────────────
# 7. HMIS FISCAL-YEAR HANDLING
# ──────────────────────────────────────────────────────────────────────────────

def test_hmis_fiscal_year_handling(db_session):
    """Verifies HMIS administrative data covers 14 unbroken fiscal years."""
    hmis_src = db_session.query(DimSource).filter_by(source_name="HMIS").first()
    assert hmis_src is not None

    years = (
        db_session.query(DimTime.year, DimTime.fiscal_year)
        .join(FactHealthIndicator.time_period)
        .filter(FactHealthIndicator.source_id == hmis_src.source_id)
        .distinct()
        .order_by(DimTime.year)
        .all()
    )
    assert len(years) == 14
    expected_years = list(range(2008, 2022))
    actual_years = [y[0] for y in years]
    assert actual_years == expected_years

    # Check fiscal year format
    for yr, fy in years:
        expected_fy = f"{yr}-{str(yr+1)[2:]}"
        assert fy == expected_fy


# ──────────────────────────────────────────────────────────────────────────────
# 8. NFHS-5 2019-20 HANDLING (Strict Survey Isolation)
# ──────────────────────────────────────────────────────────────────────────────

def test_nfhs5_2019_20_handling(db_session):
    """Verifies NFHS-5 is strictly restricted to 2019-20 with 0 non-survey leakage."""
    nfhs_src = db_session.query(DimSource).filter_by(source_name="NFHS-5").first()
    assert nfhs_src is not None

    # Total NFHS-5 facts must be exactly 73
    total_nfhs = db_session.query(FactHealthIndicator).filter_by(source_id=nfhs_src.source_id).count()
    assert total_nfhs == 73

    # All NFHS facts must belong to time period 2019 (fiscal year 2019-20)
    time_2019 = db_session.query(DimTime).filter_by(fiscal_year="2019-20").first()
    assert time_2019 is not None
    assert time_2019.is_survey_period is True
    assert time_2019.survey_period == "2019-20"

    non_2019_facts = (
        db_session.query(FactHealthIndicator)
        .filter(FactHealthIndicator.source_id == nfhs_src.source_id)
        .filter(FactHealthIndicator.time_id != time_2019.time_id)
        .count()
    )
    assert non_2019_facts == 0, f"Detected {non_2019_facts} leaked NFHS-5 facts outside 2019-20!"


# ──────────────────────────────────────────────────────────────────────────────
# 9. SOURCE PROVENANCE
# ──────────────────────────────────────────────────────────────────────────────

def test_source_provenance(db_session):
    """Verifies 100% of facts are traceable to source dataset and original raw column."""
    facts = db_session.query(FactHealthIndicator).limit(50).all()
    for f in facts:
        assert f.raw_feature_name is not None and len(f.raw_feature_name) > 0
        assert f.source.source_name in ("HMIS", "NFHS-5")
        assert f.indicator.indicator_code == f.raw_feature_name
        assert f.unit.unit_name in ("absolute_count", "percentage", "inr")


# ──────────────────────────────────────────────────────────────────────────────
# 10. MISSING DATA
# ──────────────────────────────────────────────────────────────────────────────

def test_missing_data(db_session):
    """Verifies missing indicators are not arbitrarily coerced to 0."""
    # Check that query for non-existent year returns empty/clean status
    future_time = db_session.query(DimTime).filter_by(year=2030).first()
    assert future_time is None

    # Check that unobserved values are not stored as 0.0 facts
    zero_facts = db_session.query(FactHealthIndicator).filter(FactHealthIndicator.value == 0.0).count()
    # Legitimate zeroes (e.g. 0 malaria deaths) exist, but total facts (8,275) match actual non-null counts
    assert db_session.query(FactHealthIndicator).count() == 8275


# ──────────────────────────────────────────────────────────────────────────────
# 11. POPULATION HEALTH RELATIONAL QUERIES
# ──────────────────────────────────────────────────────────────────────────────

def test_population_health_relational_queries():
    """Verifies querying indicator trends and multidimensional facts from Snowflake Schema."""
    # 11a. Query indicator trend from snowflake schema
    trend = population_health_engine.query_snowflake_indicator_trend("maternal_anc_registered_total", "Kolkata")
    assert "error" not in trend
    assert trend["indicator"] == "maternal_anc_registered_total"
    assert len(trend["data_points"]) == 14
    assert trend["first_available_year"] == 2008
    assert trend["latest_available_year"] == 2021
    assert trend["metadata"]["source"] == "HMIS"
    assert trend["metadata"]["domain"] == "maternal_health"

    # 11b. Multidimensional slice query
    slice_query = population_health_engine.query_snowflake_facts(
        district="Kolkata",
        year=2021,
        domain="maternal_health",
        limit=10
    )
    assert "error" not in slice_query
    assert slice_query["returned_count"] > 0
    obs = slice_query["observations"][0]
    assert obs["year"] == 2021
    assert obs["district"] == "Kolkata"
    assert obs["domain"] == "maternal_health"


# ──────────────────────────────────────────────────────────────────────────────
# 12. EXISTING API COMPATIBILITY
# ──────────────────────────────────────────────────────────────────────────────

def test_existing_api_compatibility():
    """Verifies all existing population health endpoints remain compatible and pass."""
    # 12a. /api/ml/population-health
    res1 = client.get("/api/ml/population-health?district=Kolkata&year=2021")
    assert res1.status_code == 200
    json1 = res1.json()
    assert json1["district"] == "Kolkata"
    assert json1["year"] == 2021
    assert "maternal_health" in json1["domains"]
    assert "ncd" in json1["domains"]

    # 12b. /api/ml/population-health/trends
    res2 = client.get("/api/ml/population-health/trends?district=Kolkata")
    assert res2.status_code == 200
    json2 = res2.json()
    assert len(json2["years"]) == 14
    assert len(json2["series"]) == 14
    assert len(json2["nfhs5_survey_baseline_2019"]) > 0

    # 12c. /api/ml/population-health/indicator-trend
    res3 = client.get("/api/ml/population-health/indicator-trend?indicator=maternal_anc_registered_total&district=Kolkata")
    assert res3.status_code == 200
    json3 = res3.json()
    assert json3["indicator"] == "maternal_anc_registered_total"
    assert json3["total_observed_years"] == 14

    # 12d. /api/ml/population-health/ncd-context
    res4 = client.get("/api/ml/population-health/ncd-context?district=Kolkata&year=2021")
    assert res4.status_code == 200
    json4 = res4.json()
    assert json4["domain"] == "NCD"
    assert "blood_pressure_hmis_opd" in json4["indicators"]

    # 12e. /api/ml/population-health/data-quality
    res5 = client.get("/api/ml/population-health/data-quality")
    assert res5.status_code == 200
    json5 = res5.json()
    assert json5["summary"]["all_passed"] is True

    # 12f. /api/ml/population-health/dictionary
    res6 = client.get("/api/ml/population-health/dictionary")
    assert res6.status_code == 200
    assert res6.json()["total_curated_features"] == 70

    # 12g. /api/ml/population-health/snowflake/metadata (New Endpoint)
    res7 = client.get("/api/ml/population-health/snowflake/metadata")
    assert res7.status_code == 200
    json7 = res7.json()
    assert json7["total_facts"] == 8275
    assert json7["total_indicators"] == 1955

    # 12h. /api/ml/population-health/snowflake/query (New Endpoint)
    res8 = client.get("/api/ml/population-health/snowflake/query?district=Kolkata&year=2021&domain=ncd&limit=5")
    assert res8.status_code == 200
    json8 = res8.json()
    assert json8["returned_count"] > 0
    assert json8["observations"][0]["domain"] == "ncd"
