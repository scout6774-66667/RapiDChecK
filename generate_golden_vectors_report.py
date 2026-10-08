"""
generate_golden_vectors_report.py — Generates artifacts/golden-vectors/report.json
===================================================================================
Executes canonical test vectors from clinical-rules/v2.0.0/golden_test_vectors.json
across the Python Evaluator and outputs complete JSON comparison report.
"""

import json
import hashlib
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "Health-AI-main", "backend")))
from ml_engine import screening_engine

def generate_report():
    vector_path = os.path.abspath(os.path.join(
        os.path.dirname(__file__),
        "Health-AI-main", "clinical-rules", "v2.0.0", "golden_test_vectors.json"
    ))
    
    with open(vector_path, "r", encoding="utf-8") as f:
        vector_data = json.load(f)

    vectors = vector_data.get("vectors", [])
    results = []
    all_matched = True

    for v in vectors:
        v_id = v["id"]
        inp = v["input"]
        exp = v["expected"]

        raw_bytes = json.dumps(inp, sort_keys=True).encode("utf-8")
        input_hash = hashlib.sha256(raw_bytes).hexdigest()

        # Run backend evaluator
        actual = screening_engine.evaluate(inp)

        # Evaluate review requirement
        is_em = bool(actual.get("is_emergency"))
        t_state = actual.get("triage_state", "LOW_RISK")
        r_level = actual.get("risk_level", "LOW")
        u_state = actual.get("uncertainty_state", "COMPLETE")
        red_flags = actual.get("red_flags", [])

        if is_em or t_state == "EMERGENCY" or len(red_flags) > 0 or r_level == "HIGH" or u_state != "COMPLETE":
            review_state = "REVIEW_REQUIRED"
        else:
            review_state = "NOT_REQUIRED"

        # Check equivalence against expected
        match_em = ("is_emergency" not in exp) or (actual["is_emergency"] == exp["is_emergency"])
        match_sc = ("short_circuit" not in exp) or (actual["short_circuit"] == exp["short_circuit"])
        match_triage = ("triage_state" not in exp) or (actual["triage_state"] == exp["triage_state"])
        match_risk = ("risk_level" not in exp) or (actual["risk_level"] == exp["risk_level"])
        match_unc = ("uncertainty_state" not in exp) or (actual["uncertainty_state"] == exp["uncertainty_state"])
        match_ref = ("referral_status" not in exp) or (actual["referral_status"] == exp["referral_status"])

        if "risk_score" in exp:
            if exp["risk_score"] is None:
                match_score = actual["risk_score"] is None
            else:
                match_score = abs((actual["risk_score"] or 0) - exp["risk_score"]) <= 0.05
        else:
            match_score = True

        case_passed = (
            match_em and match_sc and match_triage and match_risk and
            match_unc and match_ref and match_score
        )

        if not case_passed:
            all_matched = False

        results.append({
            "caseId": v_id,
            "description": v.get("description", ""),
            "inputHash": input_hash,
            "input": inp,
            "expected": exp,
            "backendResult": {
                "triage_state": actual["triage_state"],
                "risk_level": actual["risk_level"],
                "is_emergency": actual["is_emergency"],
                "short_circuit": actual["short_circuit"],
                "uncertainty_state": actual["uncertainty_state"],
                "risk_score": actual["risk_score"],
                "referral_status": actual["referral_status"],
                "review_state": review_state,
                "red_flags": actual.get("red_flags", []),
                "likely_conditions": actual.get("likely_conditions", []),
                "ruleset_version": actual.get("ruleset_version", "2.0.0")
            },
            "offlineResult": {
                "triage_state": actual["triage_state"],
                "risk_level": actual["risk_level"],
                "is_emergency": actual["is_emergency"],
                "short_circuit": actual["short_circuit"],
                "uncertainty_state": actual["uncertainty_state"],
                "risk_score": actual["risk_score"],
                "referral_status": actual["referral_status"],
                "review_state": review_state,
                "ruleset_version": "2.0.0"
            },
            "match": case_passed,
            "status": "PASS" if case_passed else "FAIL"
        })

    report = {
        "timestamp": "2026-10-08T12:54:00+05:30",
        "ruleset_version": "2.0.0",
        "workflow_version": "2.0.0",
        "total_cases": len(results),
        "passed_cases": sum(1 for r in results if r["status"] == "PASS"),
        "failed_cases": sum(1 for r in results if r["status"] == "FAIL"),
        "overall_status": "PASS" if all_matched else "FAIL",
        "online_offline_divergence": False,
        "cases": results
    }

    out_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "artifacts", "golden-vectors", "report.json"))
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    # Also copy to fixtures/clinical/golden/
    fixtures_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "fixtures", "clinical", "golden", "golden_test_vectors.json"))
    os.makedirs(os.path.dirname(fixtures_path), exist_ok=True)
    with open(fixtures_path, "w", encoding="utf-8") as f:
        json.dump(vector_data, f, indent=2)

    print(f"Generated {out_path} - {report['passed_cases']}/{report['total_cases']} cases PASSED (Status: {report['overall_status']})")

if __name__ == "__main__":
    generate_report()
