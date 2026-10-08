"""
population_data_quality.py — Population Health Data Quality Monitoring
========================================================================
Performs rigorous data quality checks on the curated population health dataset:
  - Missingness analysis (per-feature and per-domain)
  - Duplicate rows (year/district collisions)
  - Duplicate features
  - Invalid percentages (range 0.0% - 100.0%)
  - Negative count validation
  - Unit consistency across dictionary and dataset
  - Year gaps and continuity check
  - NFHS leakage / forward-fill / backward-fill detection

Outputs:
  backend/data/processed/population_data_quality_report.json
"""

import os
import sys
import json
import datetime
from typing import Dict, Any, List
import pandas as pd
import numpy as np

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_PATH = os.path.join(BASE_DIR, "data", "processed", "kolkata_population_health.csv")
DICT_PATH = os.path.join(BASE_DIR, "data", "processed", "feature_dictionary.csv")
REPORT_PATH = os.path.join(BASE_DIR, "data", "processed", "population_data_quality_report.json")


def run_data_quality_audit(
    data_path: str = DATA_PATH,
    dict_path: str = DICT_PATH,
    output_report_path: str = REPORT_PATH
) -> Dict[str, Any]:
    """Runs full data quality audit suite and writes the json report."""
    if not os.path.exists(data_path):
        raise FileNotFoundError(f"Population health dataset not found at {data_path}")
    if not os.path.exists(dict_path):
        raise FileNotFoundError(f"Feature dictionary not found at {dict_path}")

    df = pd.read_csv(data_path)
    fd = pd.read_csv(dict_path)

    report: Dict[str, Any] = {
        "report_id": f"PDQ-{int(datetime.datetime.now(datetime.timezone.utc).timestamp())}",
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "dataset_file": os.path.basename(data_path),
        "total_rows": int(len(df)),
        "total_columns": int(len(df.columns)),
        "year_range": [int(df["year"].min()), int(df["year"].max())],
        "districts_covered": df["district"].unique().tolist(),
        "checks": {},
        "summary": {
            "all_passed": True,
            "passed_checks": 0,
            "failed_checks": 0,
            "warnings": 0
        }
    }

    # Helper to record check
    def record_check(name: str, passed: Any, is_warning: bool, details: Dict[str, Any]):
        py_passed = bool(passed)
        status = "PASSED" if py_passed else ("WARNING" if is_warning else "FAILED")
        if not py_passed:
            if is_warning:
                report["summary"]["warnings"] += 1
            else:
                report["summary"]["failed_checks"] += 1
                report["summary"]["all_passed"] = False
        else:
            report["summary"]["passed_checks"] += 1

        report["checks"][name] = {
            "status": status,
            "passed": py_passed,
            "details": details
        }

    # 1. Check Duplicate Rows
    dup_rows = df.duplicated(subset=["year", "district"]).sum()
    record_check(
        "duplicate_rows",
        passed=(dup_rows == 0),
        is_warning=False,
        details={
            "duplicate_count": int(dup_rows),
            "description": "Checks if any year/district combination appears more than once."
        }
    )

    # 2. Check Duplicate Features
    dup_cols = pd.Series(df.columns).duplicated().sum()
    dup_dict_features = fd["feature_name"].duplicated().sum()
    record_check(
        "duplicate_features",
        passed=(dup_cols == 0 and dup_dict_features == 0),
        is_warning=False,
        details={
            "duplicate_column_names_in_dataset": int(dup_cols),
            "duplicate_features_in_dictionary": int(dup_dict_features),
            "description": "Checks for duplicate feature column names in dataset and dictionary."
        }
    )

    # 3. Check Year Gaps and Continuity
    years = sorted(df["year"].dropna().unique().astype(int).tolist())
    expected_years = list(range(years[0], years[-1] + 1))
    year_gaps = [y for y in expected_years if y not in years]
    record_check(
        "year_continuity",
        passed=(len(year_gaps) == 0),
        is_warning=False,
        details={
            "min_year": years[0],
            "max_year": years[-1],
            "actual_year_count": len(years),
            "missing_years": year_gaps,
            "description": "Verifies that the yearly time series has no missing calendar years."
        }
    )

    # 4. Check NFHS Leakage / Forward-Fill / Backward-Fill
    nfhs_cols = [c for c in df.columns if c.startswith("nfhs5_")]
    nfhs_leakage_detected = False
    nfhs_leakage_years = {}
    for y in years:
        if y != 2019:  # Survey is only 2019-20
            non_null_nfhs = int((~df[df["year"] == y][nfhs_cols].isnull()).sum().sum())
            if non_null_nfhs > 0:
                nfhs_leakage_detected = True
                nfhs_leakage_years[str(y)] = non_null_nfhs
        else:
            non_null_2019 = int((~df[df["year"] == 2019][nfhs_cols].isnull()).sum().sum())

    record_check(
        "nfhs_temporal_integrity",
        passed=(not nfhs_leakage_detected and len(nfhs_cols) > 0),
        is_warning=False,
        details={
            "nfhs_columns_count": len(nfhs_cols),
            "non_null_in_survey_year_2019": non_null_2019 if 2019 in years else 0,
            "non_null_in_non_survey_years": nfhs_leakage_years,
            "leakage_detected": nfhs_leakage_detected,
            "description": "Ensures NFHS-5 survey baseline data is retained ONLY for 2019-20 without forward/backward filling into other annual periods."
        }
    )

    # 5. Check Invalid Percentages
    pct_features = fd[fd["unit"] == "percentage"]["feature_name"].tolist()
    invalid_pcts = {}
    for pf in pct_features:
        if pf in df.columns:
            s = df[pf].dropna()
            out_of_bounds = s[(s < 0.0) | (s > 100.0)]
            if len(out_of_bounds) > 0:
                invalid_pcts[pf] = out_of_bounds.tolist()

    record_check(
        "valid_percentages",
        passed=(len(invalid_pcts) == 0),
        is_warning=False,
        details={
            "percentage_features_checked": len(pct_features),
            "features_with_out_of_bounds_values": invalid_pcts,
            "expected_range": "[0.0%, 100.0%]"
        }
    )

    # 6. Check Negative Counts
    count_features = fd[fd["unit"] == "absolute_count"]["feature_name"].tolist()
    negative_counts = {}
    for cf in count_features:
        if cf in df.columns:
            s = df[cf].dropna()
            negs = s[s < 0]
            if len(negs) > 0:
                negative_counts[cf] = negs.tolist()

    record_check(
        "non_negative_counts",
        passed=(len(negative_counts) == 0),
        is_warning=False,
        details={
            "count_features_checked": len(count_features),
            "features_with_negative_counts": negative_counts,
            "expected_range": ">= 0"
        }
    )

    # 7. Check Unit Consistency
    dict_feature_names = set(fd["feature_name"])
    df_feature_names = set(c for c in df.columns if c not in ["year", "fiscal_year", "district"])
    unmapped_in_df = list(df_feature_names - dict_feature_names)
    unmapped_in_dict = list(dict_feature_names - df_feature_names)
    valid_units = {"absolute_count", "percentage", "inr"}
    unknown_units = fd[~fd["unit"].isin(valid_units)]["feature_name"].tolist()

    record_check(
        "unit_and_dictionary_consistency",
        passed=(len(unmapped_in_df) == 0 and len(unknown_units) == 0),
        is_warning=False,
        details={
            "features_in_dataset_without_dictionary_entry": unmapped_in_df,
            "features_in_dictionary_not_in_dataset": unmapped_in_dict,
            "features_with_unrecognized_units": unknown_units,
            "valid_unit_standards": list(valid_units)
        }
    )

    # 8. Missingness Breakdown
    feat_cols = [c for c in df.columns if c not in ["year", "fiscal_year", "district"]]
    hmis_cols = [c for c in feat_cols if not c.startswith("nfhs5_")]
    
    missing_by_feature = {}
    for c in feat_cols:
        null_count = int(df[c].isnull().sum())
        missing_by_feature[c] = {
            "missing_years": null_count,
            "missing_pct": round((null_count / len(df)) * 100, 1),
            "available_years": int(len(df) - null_count)
        }

    # Domain-level summary
    domain_summary = {}
    for dom in fd["domain"].unique():
        dom_feats = fd[fd["domain"] == dom]["feature_name"].tolist()
        dom_df_feats = [f for f in dom_feats if f in df.columns]
        if dom_df_feats:
            dom_cells = len(df) * len(dom_df_feats)
            dom_nulls = int(df[dom_df_feats].isnull().sum().sum())
            domain_summary[dom] = {
                "feature_count": len(dom_df_feats),
                "total_cells": dom_cells,
                "missing_cells": dom_nulls,
                "missingness_rate_pct": round((dom_nulls / dom_cells) * 100, 1)
            }

    record_check(
        "missingness_documentation",
        passed=True,  # Missingness is documented transparently
        is_warning=False,
        details={
            "total_cells": int(df[feat_cols].size),
            "total_missing_cells": int(df[feat_cols].isnull().sum().sum()),
            "hmis_missing_rate_pct": round((df[hmis_cols].isnull().sum().sum() / (len(df) * len(hmis_cols))) * 100, 1) if hmis_cols else 0,
            "nfhs_expected_survey_missing_rate_pct": round((df[nfhs_cols].isnull().sum().sum() / (len(df) * len(nfhs_cols))) * 100, 1) if nfhs_cols else 0,
            "domains": domain_summary
        }
    )

    def _json_default(o):
        if isinstance(o, (np.bool_, bool)):
            return bool(o)
        if isinstance(o, (np.integer, int)):
            return int(o)
        if isinstance(o, (np.floating, float)):
            return float(o)
        if isinstance(o, (np.ndarray, list)):
            return list(o)
        return str(o)

    # Write report
    os.makedirs(os.path.dirname(output_report_path), exist_ok=True)
    with open(output_report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, default=_json_default)

    return report


if __name__ == "__main__":
    rep = run_data_quality_audit()
    print("=" * 60)
    print("POPULATION HEALTH DATA QUALITY AUDIT COMPLETED")
    print("=" * 60)
    print(f"Report ID: {rep['report_id']}")
    print(f"Status: {'PASSED (All checks passed)' if rep['summary']['all_passed'] else 'ISSUES FOUND'}")
    print(f"Passed Checks: {rep['summary']['passed_checks']}")
    print(f"Failed Checks: {rep['summary']['failed_checks']}")
    print(f"Warnings: {rep['summary']['warnings']}")
    for chk, details in rep["checks"].items():
        print(f"  [{details['status']}] {chk}")
    print(f"\nFull report written to: {REPORT_PATH}")
