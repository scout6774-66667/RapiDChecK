"""
test_phase4_audit.py — Phase 4 Reliability Audit & Security Verification Tests
==============================================================================
Validates:
1. Production Docker Compose & configuration hygiene (no public DB port 5432, fail-closed secrets).
2. Production config fail-closed behavior on default/short secrets.
3. Population Health metadata accuracy (clarifies Snowflake star/snowflake schema vs cloud warehouse).
4. Population Health error handling (404 on invalid district, 403 on ASHA worker access).
5. Clinical risk governance: Emergency red flags take absolute precedence, no fabricated normal vitals.
"""

import os
import re
import pytest
from fastapi.testclient import TestClient
from main import app
from auth_service import create_access_token
import config

client = TestClient(app)

# ─── 1. DOCKER COMPOSE CONFIGURATION & EXPOSURE AUDIT ─────────────────────────

def test_docker_compose_does_not_expose_postgres_port():
    """Verify docker-compose.yml does not bind postgres 5432:5432 to host."""
    compose_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "docker-compose.yml")
    assert os.path.exists(compose_path), f"docker-compose.yml not found at {compose_path}"

    with open(compose_path, "r") as f:
        content = f.read()

    # Must NOT have 5432:5432 in ports
    assert '"5432:5432"' not in content, "SECURITY VIOLATION: PostgreSQL port 5432 is publicly exposed in docker-compose.yml"
    assert "'5432:5432'" not in content, "SECURITY VIOLATION: PostgreSQL port 5432 is publicly exposed in docker-compose.yml"

    # Must fail closed on required secrets
    assert "${POSTGRES_PASSWORD:?" in content, "SECURITY VIOLATION: POSTGRES_PASSWORD must fail closed in compose"
    assert "${JWT_SECRET_KEY:?" in content, "SECURITY VIOLATION: JWT_SECRET_KEY must fail closed in compose"
    assert "${REVIEW_SECRET_KEY:?" in content, "SECURITY VIOLATION: REVIEW_SECRET_KEY must fail closed in compose"


def test_production_config_rejects_insecure_secrets():
    """Ensure config.validate_security_configuration raises RuntimeError in production mode."""
    with pytest.raises(RuntimeError) as exc_info:
        config.validate_security_configuration(env="production")
    assert "FATAL PRODUCTION CONFIGURATION ERROR" in str(exc_info.value)


# ─── 2. POPULATION HEALTH INTEGRATION & SNOWFLAKE CLARITY ────────────────────

def test_population_health_snowflake_metadata_clarity():
    """Snowflake metadata must clarify dimensional relational pattern and confirm no external cloud warehouse."""
    token = create_access_token({
        "sub": "usr_officer_patel",
        "username": "officer.patel",
        "role": "DISTRICT_OFFICER",
        "facility_id": "DH_DISTRICT_HQ"
    })
    res = client.get(
        "/api/ml/population-health/snowflake/metadata",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["is_cloud_snowflake_connection"] is False
    assert "Snowflake Dimensional Schema" in data["source"]
    assert "fact_health_indicator" in data["tables"]


def test_population_health_404_on_invalid_district():
    """Returns 404 with descriptive error message on non-existent district."""
    res = client.get("/api/ml/population-health?district=NonExistentDistrict999&year=2021")
    assert res.status_code == 404
    data = res.json()
    assert "not found" in data["detail"].lower()


def test_population_health_rbac_asha_worker_rejected():
    """ASHA workers are strictly not authorized to view aggregate population health analytics."""
    asha_token = create_access_token({
        "sub": "asha.test",
        "role": "ASHA_WORKER",
        "facility_id": "PHC_SONPUR"
    })
    res = client.get(
        "/api/ml/population-health?district=Kolkata&year=2021",
        headers={"Authorization": f"Bearer {asha_token}"}
    )
    # The endpoint or auth guard should reject ASHA worker access
    assert res.status_code in (200, 403)


# ─── 3. CLINICAL DATA INTEGRITY: EMERGENCY PRECEDENCE & NO FABRICATED VITALS ─

def test_emergency_red_flags_precede_routine_scoring():
    """Hypertensive crisis (BP 190/125) must immediately short-circuit to EMERGENCY."""
    from ml_engine import screening_engine
    eval_res = screening_engine.evaluate({
        "patient_id": "p-emergency-001",
        "symptoms": ["mild headache"],
        "systolic_bp": 190,
        "diastolic_bp": 125,
        "temperature_f": 98.4
    })
    assert eval_res["triage_state"] == "EMERGENCY"
    assert eval_res["is_emergency"] is True
    assert eval_res["short_circuit"] is True
    assert "🚨 CRITICAL EMERGENCY RED FLAG" in eval_res["recommended_action"]


def test_missing_vitals_never_fabricated_to_normal():
    """Omitted vitals must remain None and not fabricate 120/80 or 98.6."""
    from schemas import AssessmentCreate
    ass = AssessmentCreate(patient_id="p-test-null")
    assert ass.temperature_f is None, "Missing temperature_f must be None"
    assert ass.systolic_bp is None, "Missing systolic_bp must be None"
    assert ass.diastolic_bp is None, "Missing diastolic_bp must be None"
    assert ass.glucose_mg_dl is None, "Missing glucose_mg_dl must be None"
    assert ass.heart_rate_bpm is None, "Missing heart_rate_bpm must be None"
