"""
test_population_api.py — Comprehensive Tests for Population Health Intelligence API
=====================================================================================
Tests:
  - Valid year, invalid year, missing year (defaults to latest)
  - Kolkata district validation and non-existent district handling
  - NFHS-5 context is strictly survey baseline (NOT copied into other years)
  - Trend generation for Recharts chart format
  - Indicator trend analysis (CAGR / trend direction)
  - NCD context structured payload
  - Data quality report retrieval
  - Feature dictionary provenance retrieval
  - Screening decision-support enrichment (clinical safety boundary)
"""

import os
import sys
import pytest
from fastapi.testclient import TestClient

# Ensure backend root is on sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from main import app
from ml.population_health import population_health_engine

client = TestClient(app)


def test_health_endpoint():
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "online"


def test_population_health_valid_year():
    res = client.get("/api/ml/population-health?district=Kolkata&year=2021")
    assert res.status_code == 200
    data = res.json()
    assert data["district"] == "Kolkata"
    assert data["year"] == 2021
    assert "domains" in data
    assert "maternal_health" in data["domains"]
    assert "child_health" in data["domains"]
    assert "nutrition" in data["domains"]
    assert "ncd" in data["domains"]
    assert "communicable" in data["domains"]
    assert "healthcare_access" in data["domains"]


def test_population_health_default_latest_year():
    res = client.get("/api/ml/population-health?district=Kolkata")
    assert res.status_code == 200
    data = res.json()
    assert data["district"] == "Kolkata"
    assert data["year"] == 2021  # Latest year in HMIS dataset


def test_population_health_invalid_year():
    res = client.get("/api/ml/population-health?district=Kolkata&year=1995")
    # Returns 200 with not_available status or 404
    assert res.status_code in (200, 404)
    if res.status_code == 200:
        data = res.json()
        assert data.get("status") == "not_available"


def test_population_health_nonexistent_district():
    res = client.get("/api/ml/population-health?district=Atlantis&year=2021")
    assert res.status_code == 404


def test_population_health_trends():
    res = client.get("/api/ml/population-health/trends?district=Kolkata")
    assert res.status_code == 200
    data = res.json()
    assert data["district"] == "Kolkata"
    assert isinstance(data["years"], list)
    assert len(data["years"]) == 14
    assert 2008 in data["years"]
    assert 2021 in data["years"]
    assert "series" in data
    assert len(data["series"]) == 14
    assert "indicators" in data
    assert "maternal_anc_registered_total" in data["indicators"]


def test_nfhs_survey_context_strictly_non_leakage():
    """CRITICAL: NFHS-5 values must NOT be duplicated or forward/backward filled into other years."""
    trends = population_health_engine.get_population_health_trends("Kolkata")
    df = population_health_engine.df

    nfhs_cols = [c for c in df.columns if c.startswith("nfhs5_")]
    assert len(nfhs_cols) > 0, "NFHS-5 columns must exist"

    # Year 2019 must have values
    row_2019 = df[df["year"] == 2019][nfhs_cols]
    assert (~row_2019.isnull()).sum().sum() > 0, "Year 2019 must contain NFHS-5 survey baseline"

    # Every other year must be strictly null for NFHS-5 columns
    other_years = [y for y in df["year"].unique() if y != 2019]
    for oy in other_years:
        row_oy = df[df["year"] == oy][nfhs_cols]
        non_null_count = int((~row_oy.isnull()).sum().sum())
        assert non_null_count == 0, f"Year {oy} has {non_null_count} leaked NFHS-5 values! Must be 0."


def test_ncd_context_endpoint():
    res = client.get("/api/ml/population-health/ncd-context?district=Kolkata&year=2021")
    assert res.status_code == 200
    data = res.json()
    assert data["domain"] == "NCD"
    assert "Elevated" in data["context"]
    assert "indicators" in data
    assert "blood_pressure_hmis_opd" in data["indicators"]
    assert "blood_glucose_hmis_opd" in data["indicators"]
    assert "scoring_metadata" in data
    assert "clinical_safety_note" in data


def test_indicator_trend_endpoint():
    res = client.get("/api/ml/population-health/indicator-trend?indicator=maternal_anc_registered_total&district=Kolkata")
    assert res.status_code == 200
    data = res.json()
    assert data["indicator"] == "maternal_anc_registered_total"
    assert len(data["data_points"]) == 14
    assert "trend_direction" in data
    assert data["metadata"]["source"] == "HMIS"


def test_feature_dictionary_provenance():
    res = client.get("/api/ml/population-health/dictionary")
    assert res.status_code == 200
    data = res.json()
    assert data["total_curated_features"] >= 20
    assert len(data["features"]) == data["total_curated_features"]
    sample = data["features"][0]
    assert "feature_name" in sample
    assert "source" in sample
    assert "unit" in sample
    assert "year_coverage" in sample
    assert "domain" in sample


def test_data_quality_report():
    res = client.get("/api/ml/population-health/data-quality")
    assert res.status_code == 200
    data = res.json()
    assert data["summary"]["all_passed"] is True
    assert data["checks"]["nfhs_temporal_integrity"]["passed"] is True
    assert data["checks"]["duplicate_rows"]["passed"] is True


def test_screening_enrichment_clinical_boundary():
    payload = {
        "vitals": {
            "blood_pressure_systolic": 162,
            "blood_pressure_diastolic": 102,
            "blood_sugar_random": 185
        },
        "symptoms": ["headache", "chest tightness"],
        "risk_factors": ["smoker"],
        "risk_level": "High",
        "has_emergency_red_flags": False,
        "district": "Kolkata"
    }
    res = client.post("/api/ml/population-health/enrich-screening", json=payload)
    assert res.status_code == 200
    data = res.json()
    # Ensure patient clinical risk remains primary
    assert data["patient_primary_assessment"]["clinical_risk_governed"] == "High"
    assert data["patient_primary_assessment"]["vitals_analyzed"]["blood_pressure_systolic"] == 162
    # Ensure population layer provides context
    assert "population_context_layer" in data
    assert len(data["population_context_layer"]["advisory_notes"]) > 0
    # Ensure human oversight is preserved
    assert "Mandatory PHC Medical Officer Review" in data["decision_support"]["human_oversight"]
