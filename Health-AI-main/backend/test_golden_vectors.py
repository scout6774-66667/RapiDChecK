"""
test_golden_vectors.py — Canonical Golden Vector Verification (TASK-003)
========================================================================
Executes all golden test vectors from clinical-rules/v2.0.0/golden_test_vectors.json
against the Python clinical screening engine to guarantee 100% ruleset fidelity.
"""

import os
import json
import pytest
from ml_engine import screening_engine


def load_golden_vectors():
    """Load canonical test vectors from clinical-rules/v2.0.0/"""
    base_dir = os.path.dirname(__file__)
    vector_path = os.path.join(base_dir, "..", "clinical-rules", "v2.0.0", "golden_test_vectors.json")
    if not os.path.exists(vector_path):
        # Fallback to current dir if relative path shifted
        vector_path = os.path.join(base_dir, "clinical-rules", "v2.0.0", "golden_test_vectors.json")
    
    with open(vector_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("vectors", [])


@pytest.mark.parametrize("vector", load_golden_vectors(), ids=lambda v: v["id"])
def test_golden_vector(vector):
    """Assert Python engine reproduces the exact expected triage state and risk outputs."""
    v_id = vector["id"]
    inp = vector["input"]
    expected = vector["expected"]

    result = screening_engine.evaluate(inp)

    # 1. Emergency & Short Circuit
    if "is_emergency" in expected:
        assert result["is_emergency"] == expected["is_emergency"], f"[{v_id}] is_emergency mismatch"
    if "short_circuit" in expected:
        assert result["short_circuit"] == expected["short_circuit"], f"[{v_id}] short_circuit mismatch"

    # 2. Triage State & Risk Level
    if "triage_state" in expected:
        assert result["triage_state"] == expected["triage_state"], f"[{v_id}] triage_state mismatch"
    if "risk_level" in expected:
        assert result["risk_level"] == expected["risk_level"], f"[{v_id}] risk_level mismatch"

    # 3. Uncertainty State
    if "uncertainty_state" in expected:
        assert result["uncertainty_state"] == expected["uncertainty_state"], f"[{v_id}] uncertainty_state mismatch"

    # 4. Referral Status
    if "referral_status" in expected:
        assert result["referral_status"] == expected["referral_status"], f"[{v_id}] referral_status mismatch"

    # 5. Risk Score
    if "risk_score" in expected:
        if expected["risk_score"] is None:
            assert result["risk_score"] is None, f"[{v_id}] risk_score must be None"
        else:
            assert result["risk_score"] == pytest.approx(expected["risk_score"], abs=0.05), f"[{v_id}] risk_score mismatch"
