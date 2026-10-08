"""
test_health_resources.py — Tests for Health Resources Retrieval, Category Taxonomy & Multi-Filter Search
"""

import pytest
from fastapi.testclient import TestClient
from main import app
from database import SessionLocal, init_db
from health_resources_service import seed_default_health_resources

client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def setup_database():
    init_db()
    db = SessionLocal()
    seed_default_health_resources(db)
    db.close()


def test_001_get_categories_list():
    """Verify standard clinical categories are returned with published resource counts."""
    response = client.get("/api/v2/health-resources/categories")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 5
    codes = [c["code"] for c in data]
    assert "MATERNAL" in codes
    assert "CHILD_HEALTH" in codes
    assert "COMMUNICABLE" in codes
    assert "NCD" in codes
    assert "REFERRAL" in codes


def test_002_list_health_resources_default():
    """Verify published health resources can be listed."""
    response = client.get("/api/v2/health-resources")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 5
    assert len(data["resources"]) >= 5
    for r in data["resources"]:
        assert r["status"] == "PUBLISHED"
        assert r["version"] is not None
        assert r["freshness_status"] in ["FRESH", "STALE"]


def test_003_get_single_resource_detail():
    """Verify individual resource can be fetched with full metadata, tags, and provenance."""
    response = client.get("/api/v2/health-resources/hr_sop_htn_crisis")
    assert response.status_code == 200
    res = response.json()
    assert res["resource_code"] == "HR-EMERG-HTN-001"
    assert res["is_emergency"] is True
    assert res["urgency_level"] == "EMERGENCY"
    assert "MoHFW" in res["source_name"]
    assert len(res["tags"]) > 0


def test_004_search_by_keyword():
    """Verify free-text search returns matched clinical guidelines."""
    response = client.get("/api/v2/health-resources?query=tuberculosis")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1
    assert any("TB" in r["resource_code"] or "Tuberculosis" in r["title"] for r in data["resources"])


def test_005_search_by_category_filter():
    """Verify filtering by category code."""
    response = client.get("/api/v2/health-resources?category_code=NCD")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1
    for r in data["resources"]:
        assert r["category_code"] == "NCD"


def test_006_search_by_condition_and_symptom():
    """Verify multidimensional tag filtering."""
    response = client.get("/api/v2/health-resources?condition=dengue")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1
    assert any("DENGUE" in r["resource_code"] for r in data["resources"])


def test_007_search_nonexistent_returns_empty():
    """Verify non-matching query returns clean empty result."""
    response = client.get("/api/v2/health-resources?query=NonExistentSuperIllnessXYZ")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 0
    assert len(data["resources"]) == 0
