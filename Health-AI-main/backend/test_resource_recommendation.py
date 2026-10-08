"""
test_resource_recommendation.py — Tests for Deterministic Recommendation Engine, Safety Gate & Context Extraction
"""

import pytest
from fastapi.testclient import TestClient
from main import app
from database import SessionLocal, init_db
from health_resources_service import seed_default_health_resources
from health_resource_schemas import ResourceContext
from resource_recommendation_service import generate_recommendations, evaluate_emergency_safety_gate

client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def setup_database():
    init_db()
    db = SessionLocal()
    seed_default_health_resources(db)
    db.close()


def test_rec_001_emergency_safety_override_hypertensive_crisis():
    """Verify SBP >= 180 activates safety override and prioritizes emergency protocol at rank 1."""
    db = SessionLocal()
    try:
        ctx = ResourceContext(
            user_role="ASHA_WORKER",
            facility_id="PHC_MAIN",
            systolic_bp=190,
            diastolic_bp=125,
            symptoms=["Severe headache", "Dizziness"],
            triage_state="EMERGENCY",
            is_emergency=True
        )
        is_emerg, triggers = evaluate_emergency_safety_gate(ctx)
        assert is_emerg is True
        assert len(triggers) >= 1

        bundle = generate_recommendations(db, ctx)
        assert bundle.emergency_override is True
        assert len(bundle.warnings) > 0
        assert len(bundle.recommendations) > 0
        top_rec = bundle.recommendations[0]
        assert top_rec.is_emergency is True
        assert top_rec.urgency == "EMERGENCY"
        assert "HR-EMERG-HTN-001" in top_rec.resource_code or "EMERG" in top_rec.resource_code
    finally:
        db.close()


def test_rec_002_cardiopulmonary_red_flag_safety_gate():
    """Verify severe chest pain + dyspnea triggers acute cardiopulmonary emergency protocol."""
    db = SessionLocal()
    try:
        ctx = ResourceContext(
            user_role="ASHA_WORKER",
            symptoms=["Severe chest pain", "Dyspnea", "Cold sweats"],
            risk_flags=["Chest pain with shortness of breath"],
            triage_state="EMERGENCY"
        )
        bundle = generate_recommendations(db, ctx)
        assert bundle.emergency_override is True
        top_rec = bundle.recommendations[0]
        assert top_rec.is_emergency is True
        assert "ACS" in top_rec.resource_code or "EMERG" in top_rec.resource_code
    finally:
        db.close()


def test_rec_003_clinical_diagnosis_matching():
    """Verify likely condition from clinical engine boosts matched clinical guideline."""
    db = SessionLocal()
    try:
        ctx = ResourceContext(
            user_role="PHC_DOCTOR",
            diagnoses=["Tuberculosis", "Presumptive Pulmonary TB"],
            symptoms=["Cough for 3 weeks", "Evening fever", "Weight loss"],
            triage_state="REVIEW_REQUIRED"
        )
        bundle = generate_recommendations(db, ctx)
        assert len(bundle.recommendations) > 0
        tb_rec = next((r for r in bundle.recommendations if "TB" in r.resource_code), None)
        assert tb_rec is not None
        assert tb_rec.score_breakdown.get("clinical_match", 0) > 0
    finally:
        db.close()


def test_rec_004_maternal_pregnancy_matching():
    """Verify pregnancy status activates maternal care and pre-eclampsia guidance."""
    db = SessionLocal()
    try:
        ctx = ResourceContext(
            user_role="ASHA_WORKER",
            pregnancy_status="THIRD_TRIMESTER",
            systolic_bp=145,
            diastolic_bp=95,
            symptoms=["Pedal edema", "Headache"]
        )
        bundle = generate_recommendations(db, ctx)
        assert len(bundle.recommendations) > 0
        mat_rec = next((r for r in bundle.recommendations if r.category_code == "MATERNAL"), None)
        assert mat_rec is not None
        assert mat_rec.score_breakdown.get("pregnancy_match", 0) > 0
    finally:
        db.close()


def test_rec_005_explicit_topic_search_recommendation():
    """Verify explicit topic query scores top relevance."""
    db = SessionLocal()
    try:
        ctx = ResourceContext(
            user_role="ASHA_WORKER",
            requested_topic="What is the dosage of ORS and zinc for child diarrhea?"
        )
        bundle = generate_recommendations(db, ctx)
        assert len(bundle.recommendations) > 0
        top_rec = bundle.recommendations[0]
        assert "DIARR" in top_rec.resource_code or "CHILD" in top_rec.category_code
        assert top_rec.score_breakdown.get("explicit_topic", 0) > 0
    finally:
        db.close()


def test_rec_006_preserves_uncertainty_state():
    """Verify INSUFFICIENT_DATA uncertainty state is preserved and surfaces cautionary warning."""
    db = SessionLocal()
    try:
        ctx = ResourceContext(
            user_role="ASHA_WORKER",
            uncertainty_state="INSUFFICIENT_DATA",
            triage_state="INSUFFICIENT_DATA",
            symptoms=[]
        )
        bundle = generate_recommendations(db, ctx)
        assert bundle.context["uncertainty_state"] == "INSUFFICIENT_DATA"
        assert any("uncertainty state 'INSUFFICIENT_DATA'" in w for w in bundle.warnings)
    finally:
        db.close()


def test_rec_007_api_recommend_endpoint():
    """Verify POST /api/v2/health-resources/recommend HTTP endpoint."""
    payload = {
        "requested_topic": "Hypertension screening and stepped care",
        "language": "en"
    }
    response = client.post("/api/v2/health-resources/recommend", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "recommendations" in data
    assert len(data["recommendations"]) > 0
    assert data["engine_version"] is not None
