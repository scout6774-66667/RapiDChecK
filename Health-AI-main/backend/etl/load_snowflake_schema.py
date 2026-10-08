"""
load_snowflake_schema.py — Idempotent ETL Pipeline for Snowflake Schema
========================================================================
Loads HMIS (West Bengal) and NFHS-5 (Kolkata) datasets into the normalized
Snowflake Schema in SQLite (ruralhealth.db) via SQLAlchemy.

Pipeline flow:
  1. Initialize database tables (Base.metadata.create_all).
  2. Load and deduplicate normalized dimensions:
     - dim_state
     - dim_district (links to dim_state)
     - dim_time (14 fiscal years; NFHS-5 tagged strictly to 2019-20 survey period)
     - dim_source (HMIS administrative vs NFHS-5 sample survey)
     - dim_unit (absolute_count, percentage, inr)
     - dim_facility (Public, Private, Rural, Urban, Combined, Not Applicable)
     - dim_category (Total, age groups, tested/positive, Not Applicable)
     - dim_indicator_head (34 HMIS sections + NFHS Survey Baseline)
     - dim_indicator (1,955 indicators with curated clinical domain mappings)
  3. Load fact table (fact_health_indicator):
     - Exactly one row per valid observation at the defined grain.
     - Enforces uniqueness via composite grain key (idempotent).
     - 8,202 HMIS administrative observations (2008–09 to 2021–22).
     - 73 NFHS-5 survey baseline observations (2019–20 strictly, no temporal leakage).
     - Full provenance tracked to original CSV column name.
  4. Run automated post-load integrity checks.
"""

import os
import sys
import pandas as pd
import numpy as np
from datetime import datetime
from typing import Dict, Any, Tuple

# Ensure backend root is on sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from database import (
    SessionLocal, init_db, engine,
    DimState, DimDistrict, DimTime, DimSource, DimUnit,
    DimFacility, DimCategory, DimIndicatorHead, DimIndicator,
    FactHealthIndicator
)

# Dataset paths
RAW_DICT_PATH = os.path.join(BASE_DIR, "data", "raw", "raw_feature_dictionary.csv")
CURATED_DICT_PATH = os.path.join(BASE_DIR, "data", "processed", "feature_dictionary.csv")
TRAIN_DATA_PATH = os.path.join(BASE_DIR, "data", "processed", "kolkata_model_training_dataset.csv")
CURATED_DATA_PATH = os.path.join(BASE_DIR, "data", "processed", "kolkata_population_health.csv")


def normalize_unit_name(unit_str: str) -> Tuple[str, str, str]:
    """Returns (unit_name, raw_unit_label, unit_symbol)."""
    if pd.isna(unit_str):
        return "unknown", "Unknown", ""
    u = str(unit_str).strip()
    if "%" in u or "percentage" in u.lower():
        return "percentage", "%", "%"
    if "rs" in u.lower() or "inr" in u.lower():
        return "inr", "Rs.", "₹"
    return "absolute_count", "value in Absolute Number", "#"


def run_etl(verbose: bool = True) -> Dict[str, Any]:
    """Executes the full idempotent Snowflake Schema ETL process."""
    if verbose:
        print("=" * 70)
        print("Starting Population Health Snowflake Schema ETL...")
        print("=" * 70)

    # 1. Ensure tables exist
    init_db()

    # Verify input files exist
    for p in [RAW_DICT_PATH, CURATED_DICT_PATH, TRAIN_DATA_PATH]:
        if not os.path.exists(p):
            raise FileNotFoundError(f"Required ETL dataset missing: {p}")

    df_raw_dict = pd.read_csv(RAW_DICT_PATH)
    df_curated_dict = pd.read_csv(CURATED_DICT_PATH)
    df_train = pd.read_csv(TRAIN_DATA_PATH)

    # Build mapping for curated indicators from curate_dataset.py
    from ml.curate_dataset import mappings
    raw_to_curated: Dict[str, Dict[str, Any]] = {}
    for m in mappings:
        c_name = m["curated_name"]
        domain = m["domain"]
        desc = m.get("desc", "")
        rc = m["raw_col"]
        cols = rc if isinstance(rc, list) else [rc]
        for col in cols:
            if col in raw_to_curated:
                raw_to_curated[col]["curated_names"].append(c_name)
            else:
                raw_to_curated[col] = {
                    "curated_names": [c_name],
                    "domain": domain,
                    "desc": desc
                }

    session = SessionLocal()
    stats = {}

    try:
        # ======================================================================
        # 2. LOAD DIMENSIONS (Idempotent)
        # ======================================================================

        # 2a. dim_state
        state_wb = session.query(DimState).filter_by(state_code="WB").first()
        if not state_wb:
            state_wb = DimState(state_name="West Bengal", state_code="WB")
            session.add(state_wb)
            session.commit()
            session.refresh(state_wb)
        state_id = state_wb.state_id
        stats["dim_state_count"] = session.query(DimState).count()

        # 2b. dim_district (links to dim_state)
        dist_kol = session.query(DimDistrict).filter_by(state_id=state_id, district_name="Kolkata").first()
        if not dist_kol:
            dist_kol = DimDistrict(
                state_id=state_id,
                district_name="Kolkata",
                district_code="KOL"
            )
            session.add(dist_kol)
            session.commit()
            session.refresh(dist_kol)
        district_id = dist_kol.district_id
        stats["dim_district_count"] = session.query(DimDistrict).count()

        # 2c. dim_time (14 fiscal years: 2008-09 through 2021-22)
        # NFHS-5 survey snapshot strictly in 2019-20
        time_lookup: Dict[int, int] = {}
        for _, row in df_train[["year", "fiscal_year"]].drop_duplicates().sort_values("year").iterrows():
            yr = int(row["year"])
            fy = str(row["fiscal_year"])
            is_survey = (yr == 2019)
            survey_period_val = "2019-20" if is_survey else None

            existing_time = session.query(DimTime).filter_by(fiscal_year=fy).first()
            if not existing_time:
                existing_time = DimTime(
                    year=yr,
                    fiscal_year=fy,
                    period_type="survey_period" if is_survey else "fiscal_year",
                    is_survey_period=is_survey,
                    survey_period=survey_period_val
                )
                session.add(existing_time)
                session.commit()
                session.refresh(existing_time)
            time_lookup[yr] = existing_time.time_id
        stats["dim_time_count"] = session.query(DimTime).count()

        # 2d. dim_source
        source_defs = [
            {
                "name": "HMIS",
                "dataset": "Health Management Information System",
                "type": "administrative_routine",
                "cadence": "annual",
                "notes": "MoHFW Government of India / West Bengal administrative facility reporting"
            },
            {
                "name": "NFHS-5",
                "dataset": "National Family Health Survey (Round 5)",
                "type": "population_sample_survey",
                "cadence": "survey_snapshot",
                "notes": "MoHFW/IIPS representative population sample survey baseline for Kolkata (2019-20)"
            }
        ]
        source_lookup: Dict[str, int] = {}
        for s in source_defs:
            src = session.query(DimSource).filter_by(source_name=s["name"]).first()
            if not src:
                src = DimSource(
                    source_name=s["name"],
                    dataset_name=s["dataset"],
                    source_type=s["type"],
                    cadence=s["cadence"],
                    provenance_notes=s["notes"]
                )
                session.add(src)
                session.commit()
                session.refresh(src)
            source_lookup[s["name"]] = src.source_id
        stats["dim_source_count"] = session.query(DimSource).count()

        # 2e. dim_unit
        unit_lookup: Dict[str, int] = {}
        raw_units = df_raw_dict["unit"].dropna().unique().tolist()
        for ru in raw_units:
            uname, rlabel, usym = normalize_unit_name(ru)
            u_obj = session.query(DimUnit).filter_by(unit_name=uname).first()
            if not u_obj:
                u_obj = DimUnit(
                    unit_name=uname,
                    raw_unit_label=rlabel,
                    unit_symbol=usym
                )
                session.add(u_obj)
                session.commit()
                session.refresh(u_obj)
            unit_lookup[uname] = u_obj.unit_id
            unit_lookup[ru] = u_obj.unit_id
        stats["dim_unit_count"] = session.query(DimUnit).count()

        # 2f. dim_facility
        facility_lookup: Dict[str, int] = {}
        # Distinct facility categories in HMIS + survey fallback
        raw_facilities = df_raw_dict["facility_category"].dropna().unique().tolist()
        raw_facilities.append("Not Applicable (Survey)")

        for fc in raw_facilities:
            f_norm = str(fc).strip()
            fac_obj = session.query(DimFacility).filter_by(facility_category=f_norm).first()
            if not fac_obj:
                # Classify level and area type
                level = "All Levels"
                area = "Combined"
                ownership = "Combined"
                if "public" in f_norm.lower() and "private" not in f_norm.lower():
                    ownership = "Public"
                    level = "Public Facility"
                elif "private" in f_norm.lower() and "public" not in f_norm.lower():
                    ownership = "Private"
                    level = "Private Facility"
                if "rural" in f_norm.lower() and "urban" not in f_norm.lower():
                    area = "Rural"
                elif "urban" in f_norm.lower() and "rural" not in f_norm.lower():
                    area = "Urban"
                if "survey" in f_norm.lower():
                    level = "Not Applicable"
                    area = "District Population Sample"
                    ownership = "Not Applicable"

                fac_obj = DimFacility(
                    facility_category=f_norm,
                    facility_level=level,
                    area_type=area,
                    ownership_type=ownership
                )
                session.add(fac_obj)
                session.commit()
                session.refresh(fac_obj)
            facility_lookup[f_norm] = fac_obj.facility_id
        stats["dim_facility_count"] = session.query(DimFacility).count()

        # 2g. dim_category
        category_lookup: Dict[str, int] = {}
        raw_cats = df_raw_dict["category"].dropna().unique().tolist()
        raw_cats.append("Not Applicable (Survey)")

        for cat in raw_cats:
            c_norm = str(cat).strip()
            cat_obj = session.query(DimCategory).filter_by(category_name=c_norm).first()
            if not cat_obj:
                cat_obj = DimCategory(
                    category_name=c_norm,
                    demographic_group="Age-Specific" if "yrs" in c_norm or "week" in c_norm else "General"
                )
                session.add(cat_obj)
                session.commit()
                session.refresh(cat_obj)
            category_lookup[c_norm] = cat_obj.category_id
        stats["dim_category_count"] = session.query(DimCategory).count()

        # 2h. dim_indicator_head
        head_lookup: Dict[str, int] = {}
        raw_heads = df_raw_dict["indicator_head"].dropna().unique().tolist()
        raw_heads.append("Survey Baseline (NFHS-5)")

        for ih in raw_heads:
            h_norm = str(ih).strip()
            head_obj = session.query(DimIndicatorHead).filter_by(indicator_head_name=h_norm).first()
            if not head_obj:
                sec_code = h_norm.split()[0] if h_norm.startswith("M") else "NFHS"
                head_obj = DimIndicatorHead(
                    indicator_head_name=h_norm,
                    section_code=sec_code
                )
                session.add(head_obj)
                session.commit()
                session.refresh(head_obj)
            head_lookup[h_norm] = head_obj.head_id
        stats["dim_indicator_head_count"] = session.query(DimIndicatorHead).count()

        # 2i. dim_indicator (1,955 indicators)
        indicator_lookup: Dict[str, int] = {}
        existing_indicators = {
            ind.indicator_code: ind
            for ind in session.query(DimIndicator).all()
        }

        indicators_to_add = []
        for _, row in df_raw_dict.iterrows():
            feat_code = str(row["feature_name"]).strip()
            if feat_code in existing_indicators:
                ind_obj = existing_indicators[feat_code]
                indicator_lookup[feat_code] = ind_obj.indicator_id
                if feat_code in raw_to_curated:
                    c_info = raw_to_curated[feat_code]
                    ind_obj.is_curated = True
                    ind_obj.curated_feature_name = ",".join(c_info["curated_names"])
                    ind_obj.domain = c_info["domain"]
                    ind_obj.description = c_info["desc"]
                continue

            src_name = str(row["source"]).strip()
            src_id = source_lookup.get(src_name, source_lookup["HMIS"])

            # Unit
            uname, _, _ = normalize_unit_name(row.get("unit"))
            u_id = unit_lookup.get(uname, unit_lookup["absolute_count"])

            # Indicator head
            raw_head = row.get("indicator_head")
            head_id = None
            if pd.notna(raw_head) and str(raw_head).strip() in head_lookup:
                head_id = head_lookup[str(raw_head).strip()]
            elif src_name == "NFHS-5":
                head_id = head_lookup.get("Survey Baseline (NFHS-5)")

            # Curated domain mapping
            is_curated = feat_code in raw_to_curated
            domain_val = None
            curated_name_val = None
            desc_val = None

            if is_curated:
                c_info = raw_to_curated[feat_code]
                domain_val = c_info["domain"]
                curated_name_val = ",".join(c_info["curated_names"])
                desc_val = c_info["desc"]
            else:
                # Infer domain from indicator text / head
                head_str = str(raw_head).lower() if pd.notna(raw_head) else ""
                ind_str = str(row.get("indicator", "")).lower()
                if "maternal" in ind_str or "anc" in ind_str or "pregnancy" in head_str or "m1 " in head_str:
                    domain_val = "maternal_health"
                elif "child" in ind_str or "immunisation" in head_str or "m9 " in head_str or "m10 " in head_str:
                    domain_val = "child_health"
                elif "nutrition" in ind_str or "weighed" in ind_str or "anaemia" in ind_str or "stunt" in ind_str:
                    domain_val = "nutrition"
                elif "hypertension" in ind_str or "diabetes" in ind_str or "heart" in ind_str or "cancer" in ind_str:
                    domain_val = "ncd"
                elif "malaria" in ind_str or "diarrhoeal" in ind_str or "tb" in ind_str or "dengue" in ind_str:
                    domain_val = "communicable"
                elif "outpatient" in ind_str or "inpatient" in ind_str or "patient services" in head_str:
                    domain_val = "healthcare_access"
                else:
                    domain_val = "general_health"

            ind_num = None
            if pd.notna(row.get("indicator_number")):
                try:
                    ind_num = int(row["indicator_number"])
                except:
                    ind_num = None

            ind_obj = DimIndicator(
                indicator_code=feat_code,
                indicator_name=str(row.get("indicator", feat_code)),
                head_id=head_id,
                domain=domain_val,
                source_id=src_id,
                unit_id=u_id,
                is_curated=is_curated,
                curated_feature_name=curated_name_val,
                indicator_number=ind_num,
                description=desc_val or str(row.get("indicator", ""))
            )
            indicators_to_add.append(ind_obj)

        if indicators_to_add:
            session.bulk_save_objects(indicators_to_add)
        session.commit()

        # Refresh indicator lookup
        for ind in session.query(DimIndicator.indicator_code, DimIndicator.indicator_id).all():
            indicator_lookup[ind.indicator_code] = ind.indicator_id

        stats["dim_indicator_count"] = session.query(DimIndicator).count()

        if verbose:
            print(f"[ETL] Dimensions loaded: State={stats['dim_state_count']}, "
                  f"District={stats['dim_district_count']}, Time={stats['dim_time_count']}, "
                  f"Source={stats['dim_source_count']}, Unit={stats['dim_unit_count']}, "
                  f"Facility={stats['dim_facility_count']}, Category={stats['dim_category_count']}, "
                  f"Head={stats['dim_indicator_head_count']}, Indicator={stats['dim_indicator_count']}")

        # ======================================================================
        # 3. LOAD FACT TABLE (fact_health_indicator)
        # ======================================================================

        # Map feature_name to its dimension IDs
        feat_meta_cache: Dict[str, Dict[str, Any]] = {}
        for _, row in df_raw_dict.iterrows():
            feat = str(row["feature_name"]).strip()
            src_str = str(row["source"]).strip()
            src_id = source_lookup[src_str]

            uname, _, _ = normalize_unit_name(row.get("unit"))
            u_id = unit_lookup.get(uname, unit_lookup["absolute_count"])

            raw_fac = str(row["facility_category"]).strip() if pd.notna(row.get("facility_category")) else "Not Applicable (Survey)"
            fac_id = facility_lookup.get(raw_fac, facility_lookup["Not Applicable (Survey)"])

            raw_cat = str(row["category"]).strip() if pd.notna(row.get("category")) else "Not Applicable (Survey)"
            cat_id = category_lookup.get(raw_cat, category_lookup["Not Applicable (Survey)"])

            ind_id = indicator_lookup.get(feat)

            feat_meta_cache[feat] = {
                "source_id": src_id,
                "source_name": src_str,
                "unit_id": u_id,
                "facility_id": fac_id,
                "category_id": cat_id,
                "indicator_id": ind_id
            }

        # Query existing fact grain keys for strict deduplication
        existing_facts = set(
            session.query(
                FactHealthIndicator.time_id,
                FactHealthIndicator.district_id,
                FactHealthIndicator.indicator_id,
                FactHealthIndicator.facility_id,
                FactHealthIndicator.category_id,
                FactHealthIndicator.source_id
            ).all()
        )

        facts_to_add = []
        hmis_count = 0
        nfhs_count = 0

        feature_cols = [c for c in df_train.columns if c not in ("year", "fiscal_year")]

        for _, row in df_train.iterrows():
            yr = int(row["year"])
            t_id = time_lookup[yr]

            for feat in feature_cols:
                val = row[feat]
                if pd.isna(val):
                    continue

                meta = feat_meta_cache.get(feat)
                if not meta or not meta["indicator_id"]:
                    continue

                src_name = meta["source_name"]

                # NFHS-5 Strict Temporal Boundary: Only year 2019 represents the 2019-20 survey
                if src_name == "NFHS-5" and yr != 2019:
                    # Guardrail: never load leaked survey values outside 2019
                    continue

                grain_key = (
                    t_id,
                    district_id,
                    meta["indicator_id"],
                    meta["facility_id"],
                    meta["category_id"],
                    meta["source_id"]
                )

                if grain_key in existing_facts:
                    continue

                existing_facts.add(grain_key)

                status = "survey_baseline" if src_name == "NFHS-5" else "reported"
                note_str = "NFHS-5 2019-20 Kolkata Survey Baseline" if src_name == "NFHS-5" else None

                facts_to_add.append(FactHealthIndicator(
                    time_id=t_id,
                    district_id=district_id,
                    indicator_id=meta["indicator_id"],
                    facility_id=meta["facility_id"],
                    category_id=meta["category_id"],
                    unit_id=meta["unit_id"],
                    source_id=meta["source_id"],
                    value=float(val),
                    data_status=status,
                    note=note_str,
                    raw_feature_name=feat
                ))

                if src_name == "NFHS-5":
                    nfhs_count += 1
                else:
                    hmis_count += 1

        if facts_to_add:
            session.bulk_save_objects(facts_to_add)
            session.commit()

        stats["new_facts_inserted"] = len(facts_to_add)
        stats["hmis_facts_inserted"] = hmis_count
        stats["nfhs_facts_inserted"] = nfhs_count
        stats["total_facts_in_table"] = session.query(FactHealthIndicator).count()

        if verbose:
            print(f"[ETL] Facts loaded: New={len(facts_to_add)} (HMIS={hmis_count}, NFHS-5={nfhs_count}), "
                  f"Total in table={stats['total_facts_in_table']}")

        # ======================================================================
        # 4. POST-LOAD DATA INTEGRITY VALIDATION
        # ======================================================================
        nfhs_src_id = source_lookup["NFHS-5"]
        nfhs_time_2019_id = time_lookup[2019]

        # Check: All NFHS facts strictly tied to 2019
        non_2019_nfhs = session.query(FactHealthIndicator).filter(
            FactHealthIndicator.source_id == nfhs_src_id,
            FactHealthIndicator.time_id != nfhs_time_2019_id
        ).count()
        stats["nfhs_non_survey_leakage_count"] = non_2019_nfhs

        # Check: Total NFHS facts exactly 73
        total_nfhs_facts = session.query(FactHealthIndicator).filter(
            FactHealthIndicator.source_id == nfhs_src_id
        ).count()
        stats["total_nfhs_facts"] = total_nfhs_facts

        # Check: Orphaned facts
        orphan_indicators = session.query(FactHealthIndicator).filter(
            ~FactHealthIndicator.indicator_id.in_(session.query(DimIndicator.indicator_id))
        ).count()
        stats["orphan_facts_count"] = orphan_indicators

        if verbose:
            print("=" * 70)
            print("ETL Integrity Check Results:")
            print(f"  - Total facts in fact_health_indicator: {stats['total_facts_in_table']}")
            print(f"  - NFHS-5 total facts: {total_nfhs_facts} (Expected: 73)")
            print(f"  - NFHS-5 non-survey temporal leakage: {non_2019_nfhs} (Expected: 0)")
            print(f"  - Orphaned fact records: {orphan_indicators} (Expected: 0)")
            print("ETL Completed Successfully!")
            print("=" * 70)

        return stats

    except Exception as e:
        session.rollback()
        raise e
    finally:
        session.close()


if __name__ == "__main__":
    run_etl(verbose=True)
