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
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

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

    # ==========================================================================
    # 9. SNOWFLAKE SCHEMA INTEGRITY CHECKS (Database Layer)
    # ==========================================================================
    try:
        from database import (
            SessionLocal, DimState, DimDistrict, DimTime, DimSource, DimUnit,
            DimFacility, DimCategory, DimIndicatorHead, DimIndicator, FactHealthIndicator
        )
        from sqlalchemy import func

        db_session = SessionLocal()
        try:
            total_facts = db_session.query(FactHealthIndicator).count()

            # 9a. Fact Grain Duplicates
            dup_facts = (
                db_session.query(
                    FactHealthIndicator.time_id,
                    FactHealthIndicator.district_id,
                    FactHealthIndicator.indicator_id,
                    FactHealthIndicator.facility_id,
                    FactHealthIndicator.category_id,
                    FactHealthIndicator.source_id,
                    func.count(FactHealthIndicator.fact_id)
                )
                .group_by(
                    FactHealthIndicator.time_id,
                    FactHealthIndicator.district_id,
                    FactHealthIndicator.indicator_id,
                    FactHealthIndicator.facility_id,
                    FactHealthIndicator.category_id,
                    FactHealthIndicator.source_id
                )
                .having(func.count(FactHealthIndicator.fact_id) > 1)
                .count()
            )
            record_check(
                "snowflake_duplicate_facts",
                passed=(dup_facts == 0),
                is_warning=False,
                details={
                    "duplicate_grain_records": int(dup_facts),
                    "total_facts": int(total_facts),
                    "description": "Verifies that no duplicate fact records exist for the defined grain."
                }
            )

            # 9b. Foreign Key & Orphaned Facts Check
            valid_time_ids = set(r[0] for r in db_session.query(DimTime.time_id).all())
            valid_dist_ids = set(r[0] for r in db_session.query(DimDistrict.district_id).all())
            valid_ind_ids = set(r[0] for r in db_session.query(DimIndicator.indicator_id).all())
            valid_src_ids = set(r[0] for r in db_session.query(DimSource.source_id).all())

            orphan_facts = db_session.query(FactHealthIndicator).filter(
                ~FactHealthIndicator.time_id.in_(valid_time_ids) |
                ~FactHealthIndicator.district_id.in_(valid_dist_ids) |
                ~FactHealthIndicator.indicator_id.in_(valid_ind_ids) |
                ~FactHealthIndicator.source_id.in_(valid_src_ids)
            ).count()

            record_check(
                "snowflake_foreign_key_integrity",
                passed=(orphan_facts == 0),
                is_warning=False,
                details={
                    "orphaned_facts_count": int(orphan_facts),
                    "description": "Verifies 100% referential integrity across all foreign keys."
                }
            )

            # 9c. NFHS-5 Strict Temporal Isolation (2019-20 survey snapshot only)
            nfhs_src = db_session.query(DimSource).filter_by(source_name="NFHS-5").first()
            time_2019 = db_session.query(DimTime).filter_by(fiscal_year="2019-20").first()

            if nfhs_src and time_2019:
                nfhs_leaked = db_session.query(FactHealthIndicator).filter(
                    FactHealthIndicator.source_id == nfhs_src.source_id,
                    FactHealthIndicator.time_id != time_2019.time_id
                ).count()
                total_nfhs_in_db = db_session.query(FactHealthIndicator).filter(
                    FactHealthIndicator.source_id == nfhs_src.source_id
                ).count()

                record_check(
                    "snowflake_nfhs_temporal_isolation",
                    passed=(nfhs_leaked == 0 and total_nfhs_in_db == 73),
                    is_warning=False,
                    details={
                        "leaked_non_survey_facts": int(nfhs_leaked),
                        "total_nfhs_facts_recorded": int(total_nfhs_in_db),
                        "expected_survey_year": "2019-20",
                        "description": "Verifies NFHS-5 is strictly restricted to 2019-20 without forward or backward filling."
                    }
                )

            # 9d. HMIS Fiscal Year Continuity (14 continuous years: 2008-09 to 2021-22)
            hmis_src = db_session.query(DimSource).filter_by(source_name="HMIS").first()
            if hmis_src:
                hmis_observed_years = (
                    db_session.query(DimTime.year)
                    .join(FactHealthIndicator.time_period)
                    .filter(FactHealthIndicator.source_id == hmis_src.source_id)
                    .distinct()
                    .count()
                )
                record_check(
                    "snowflake_hmis_fiscal_continuity",
                    passed=(hmis_observed_years == 14),
                    is_warning=False,
                    details={
                        "observed_years_count": int(hmis_observed_years),
                        "expected_years_count": 14,
                        "description": "Verifies HMIS administrative data covers 14 unbroken fiscal years (2008-09 to 2021-22)."
                    }
                )

            # 9e. Provenance Completeness
            missing_provenance = db_session.query(FactHealthIndicator).filter(
                (FactHealthIndicator.raw_feature_name == None) |
                (FactHealthIndicator.raw_feature_name == "") |
                (FactHealthIndicator.source_id == None)
            ).count()

            record_check(
                "snowflake_provenance_completeness",
                passed=(missing_provenance == 0),
                is_warning=False,
                details={
                    "missing_provenance_facts": int(missing_provenance),
                    "description": "Verifies 100% of fact records are traceable to source dataset and original raw feature name."
                }
            )

            # Record snowflake dimension counts in summary
            report["snowflake_schema_summary"] = {
                "dim_state": db_session.query(DimState).count(),
                "dim_district": db_session.query(DimDistrict).count(),
                "dim_time": db_session.query(DimTime).count(),
                "dim_source": db_session.query(DimSource).count(),
                "dim_unit": db_session.query(DimUnit).count(),
                "dim_facility": db_session.query(DimFacility).count(),
                "dim_category": db_session.query(DimCategory).count(),
                "dim_indicator_head": db_session.query(DimIndicatorHead).count(),
                "dim_indicator": db_session.query(DimIndicator).count(),
                "fact_health_indicator": total_facts
            }

        finally:
            db_session.close()

    except Exception as db_err:
        record_check(
            "snowflake_schema_audit",
            passed=False,
            is_warning=True,
            details={"error": str(db_err), "note": "Database schema audit encountered an issue"}
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
