"""
RuralHealth AI — Kolkata Health Data Engine
File: backend/services/kolkata_health_data_service.py

Authoritative Data Retrieval & Analytics Service for:
- kolkata_model_training_dataset.csv (14 rows, 1957 columns)
- feature_dictionary.csv (1955 metadata entries: 1882 HMIS, 73 NFHS-5)
- processing_summary.txt (8202 HMIS records processed)

Responsibilities:
- Deterministic Python statistical computations (Python calculates, Gemma explains).
- Exact feature search, time-series extraction, trend calculation, and year comparison.
- Strict data transparency (HMIS annual trends vs NFHS-5 2019-20 survey snapshot).
- Clear statistical limitation enforcement (p >> n, no causal over-interpretation).
"""

import os
import json
import logging
import pandas as pd
import numpy as np
from typing import List, Dict, Any, Optional, Tuple

logger = logging.getLogger("ruralhealth.data_engine")

class KolkataHealthDataService:
    def __init__(self):
        self.base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        self.catalog_dir = os.path.join(self.base_dir, "ai", "data_catalog")
        
        self.dataset_path = os.path.join(self.base_dir, "..", "kolkata_model_output", "kolkata_model_training_dataset.csv")
        self.dict_path = os.path.join(self.base_dir, "..", "kolkata_model_output", "feature_dictionary.csv")
        
        self.df_data: Optional[pd.DataFrame] = None
        self.df_dict: Optional[pd.DataFrame] = None
        self.metadata: Dict[str, Any] = {}
        self.feature_catalog: Dict[str, Any] = {}
        self.category_catalog: Dict[str, Any] = {}
        
        self._load_data()

    def _load_data(self):
        """Load datasets and pre-computed catalog metadata."""
        try:
            if os.path.exists(self.dataset_path):
                self.df_data = pd.read_csv(self.dataset_path)
            if os.path.exists(self.dict_path):
                self.df_dict = pd.read_csv(self.dict_path)

            meta_file = os.path.join(self.catalog_dir, "dataset_metadata.json")
            if os.path.exists(meta_file):
                with open(meta_file, "r") as f:
                    self.metadata = json.load(f)
            else:
                self.metadata = {
                    "dataset": "Kolkata Health Dataset",
                    "total_rows": 14,
                    "total_columns": 1957,
                    "total_features": 1955,
                    "hmis_features_count": 1882,
                    "nfhs5_features_count": 73,
                    "hmis_numeric_records_processed": 8202,
                    "nfhs5_reference_period": "2019-20",
                    "sources": ["HMIS", "NFHS-5"],
                }

            feat_file = os.path.join(self.catalog_dir, "feature_catalog.json")
            if os.path.exists(feat_file):
                with open(feat_file, "r") as f:
                    self.feature_catalog = json.load(f)

            cat_file = os.path.join(self.catalog_dir, "category_catalog.json")
            if os.path.exists(cat_file):
                with open(cat_file, "r") as f:
                    self.category_catalog = json.load(f)

            logger.info(f"Loaded Kolkata Dataset: {len(self.df_data) if self.df_data is not None else 0} rows, {len(self.feature_catalog)} catalog features.")
        except Exception as e:
            logger.error(f"Error loading Kolkata Health Dataset: {e}")

    def get_dataset_summary(self) -> Dict[str, Any]:
        """
        Return high-level factual dataset statistics and metadata.
        """
        years = self.df_data['fiscal_year'].dropna().tolist() if self.df_data is not None else []
        return {
            "dataset_name": "Kolkata Health Dataset",
            "total_rows": 14,
            "total_columns": 1957,
            "total_features": 1955,
            "hmis_records_processed": 8202,
            "hmis_features_count": 1882,
            "nfhs5_features_count": 73,
            "sources": ["HMIS (Health Management Information System)", "NFHS-5 (National Family Health Survey)"],
            "years_covered": years,
            "years_range": f"{years[0]} to {years[-1]}" if years else "2008-09 to 2021-22",
            "nfhs5_survey_period": "2019–20",
            "nfhs5_temporal_note": "NFHS-5 values are populated only for 2019–20 as it is a cross-sectional survey for that specific period.",
            "statistical_limitation": "High-dimensional dataset with 14 yearly observations and 1957 variables (p >> n). Trend and correlation analyses are exploratory and must not be interpreted as causal relationships.",
            "prediction_target": "Undefined. As specified in processing_summary.txt: Define the prediction target before training any ML model."
        }

    def search_indicators(self, query: str, limit: int = 8) -> List[Dict[str, Any]]:
        """
        Fuzzy / semantic keyword search for actual features in the dataset with domain synonym expansion.
        """
        if not query:
            return []
        
        q_raw = query.lower().replace("-", " ").replace("_", " ")
        q_tokens = set(q_raw.split())

        # Synonym and semantic expansions
        if any(w in q_raw for w in ['hypertension', 'blood pressure', 'high bp', 'bp', 'pressure']):
            q_tokens.update(['hypertension', 'blood_pressure', 'blood pressure', 'elevated'])
        if any(w in q_raw for w in ['malaria', 'mosquito']):
            q_tokens.update(['malaria', 'plasmodium', 'blood_smears', 'smears'])
        if any(w in q_raw for w in ['vaccin', 'immuniz', 'immunis', 'shot', 'child health']):
            q_tokens.update(['immunisation', 'immunization', 'bcg', 'dpt', 'polio', 'measles', 'pentavalent', 'vaccin'])
        if any(w in q_raw for w in ['maternal', 'mother', 'pregnan', 'delivery', 'anc', 'childbirth']):
            q_tokens.update(['maternal', 'anc', 'antenatal', 'delivery', 'pregnant', 'postnatal', 'trimester'])
        if any(w in q_raw for w in ['diabetes', 'sugar', 'glucose']):
            q_tokens.update(['diabetes', 'blood_sugar', 'glucose'])
        if any(w in q_raw for w in ['anemia', 'anaemia', 'iron', 'hemoglobin', 'hb']):
            q_tokens.update(['anemia', 'anaemia', 'haemoglobin', 'iron', 'folic'])

        results = []

        for fname, meta in self.feature_catalog.items():
            ind_text = (meta.get("indicator", "") + " " + meta.get("indicator_head", "") + " " + fname + " " + meta.get("category", "")).lower()
            
            # Compute match score
            score = 0
            for token in q_tokens:
                if len(token) >= 2 and token in ind_text:
                    score += 2 if token in meta.get("indicator", "").lower() else 1

            if score > 0:
                results.append((score, meta))

        # Sort by score descending and then non-null count
        results.sort(key=lambda x: (x[0], x[1].get("non_null_years_count", 0)), reverse=True)
        return [r[1] for r in results[:limit]]

    def get_indicator_metadata(self, feature_name: str) -> Optional[Dict[str, Any]]:
        """Retrieve authoritative metadata for a single feature."""
        return self.feature_catalog.get(feature_name)

    def get_indicator_values(self, feature_name: str) -> List[Dict[str, Any]]:
        """
        Retrieve all available time-series points for a feature.
        """
        if self.df_data is None or feature_name not in self.df_data.columns:
            return []

        series = self.df_data[['fiscal_year', feature_name]].dropna()
        points = []
        for _, row in series.iterrows():
            val = row[feature_name]
            if isinstance(val, (float, np.floating)) and val.is_integer():
                val = int(val)
            points.append({
                "year": str(row['fiscal_year']),
                "value": val
            })
        return points

    def calculate_trend(self, feature_name: str) -> Dict[str, Any]:
        """
        Calculate deterministic trend statistics for a given feature.
        If observations are insufficient (<3 points), clearly states limitation.
        """
        meta = self.get_indicator_metadata(feature_name)
        points = self.get_indicator_values(feature_name)

        if len(points) < 3:
            return {
                "feature_name": feature_name,
                "indicator": meta.get("indicator", feature_name) if meta else feature_name,
                "source": meta.get("source", "HMIS") if meta else "HMIS",
                "sufficient_data": False,
                "data_points_count": len(points),
                "data_points": points,
                "reason": f"Only {len(points)} observation(s) available. A minimum of 3 comparable annual observations is required for a reliable longitudinal trend."
            }

        start_pt = points[0]
        end_pt = points[-1]
        start_val = float(start_pt["value"])
        end_val = float(end_pt["value"])
        abs_change = end_val - start_val
        
        pct_change = None
        if start_val != 0:
            pct_change = round(((end_val - start_val) / abs(start_val)) * 100, 2)

        if abs_change > 0:
            direction = "Increasing"
        elif abs_change < 0:
            direction = "Decreasing"
        else:
            direction = "Stable"

        values = [float(p["value"]) for p in points]
        return {
            "feature_name": feature_name,
            "indicator": meta.get("indicator", feature_name) if meta else feature_name,
            "source": meta.get("source", "HMIS") if meta else "HMIS",
            "unit": meta.get("unit", "count") if meta else "count",
            "sufficient_data": True,
            "data_points_count": len(points),
            "start_year": start_pt["year"],
            "start_value": start_pt["value"],
            "end_year": end_pt["year"],
            "end_value": end_pt["value"],
            "min_value": min(values),
            "max_value": max(values),
            "mean_value": round(float(np.mean(values)), 2),
            "absolute_change": round(abs_change, 2),
            "percentage_change": pct_change,
            "direction": direction,
            "data_points": points
        }

    def compare_years(self, feature_name: str, year1: str, year2: str) -> Dict[str, Any]:
        """
        Deterministically compare an indicator between two specific fiscal years.
        """
        meta = self.get_indicator_metadata(feature_name)
        if self.df_data is None or feature_name not in self.df_data.columns:
            return {"error": f"Feature '{feature_name}' not found in dataset."}

        # Normalize fiscal year string if user passed simple 4-digit years like '2018' -> '2018-19'
        def normalize_year(y: str) -> str:
            y = str(y).strip()
            if len(y) == 4 and y.isdigit():
                nxt = str(int(y[2:]) + 1).zfill(2)
                cand = f"{y}-{nxt}"
                if self.df_data is not None and cand in self.df_data['fiscal_year'].values:
                    return cand
            return y

        y1_norm = normalize_year(year1)
        y2_norm = normalize_year(year2)

        df_y1 = self.df_data[self.df_data['fiscal_year'] == y1_norm]
        df_y2 = self.df_data[self.df_data['fiscal_year'] == y2_norm]

        if df_y1.empty or df_y2.empty:
            return {"error": f"One or both years ({year1} -> {y1_norm}, {year2} -> {y2_norm}) not found in dataset."}

        val1 = df_y1[feature_name].values[0]
        val2 = df_y2[feature_name].values[0]

        if pd.isna(val1) or pd.isna(val2):
            return {
                "feature_name": feature_name,
                "indicator": meta.get("indicator", feature_name) if meta else feature_name,
                "year1": y1_norm,
                "value1": None if pd.isna(val1) else val1,
                "year2": y2_norm,
                "value2": None if pd.isna(val2) else val2,
                "comparison_possible": False,
                "reason": "One or both years have missing (NaN) values in the dataset."
            }

        v1 = float(val1)
        v2 = float(val2)
        abs_diff = v2 - v1
        pct_change = round(((v2 - v1) / abs(v1)) * 100, 2) if v1 != 0 else None

        return {
            "feature_name": feature_name,
            "indicator": meta.get("indicator", feature_name) if meta else feature_name,
            "source": meta.get("source", "HMIS") if meta else "HMIS",
            "unit": meta.get("unit", "count") if meta else "count",
            "year1": y1_norm,
            "value1": int(v1) if v1.is_integer() else v1,
            "year2": y2_norm,
            "value2": int(v2) if v2.is_integer() else v2,
            "absolute_difference": round(abs_diff, 2),
            "percentage_change": pct_change,
            "direction": "Increase" if abs_diff > 0 else ("Decrease" if abs_diff < 0 else "Unchanged"),
            "comparison_possible": True
        }

    def get_category_catalog(self) -> Dict[str, Any]:
        """Retrieve categorized breakdown of available indicators."""
        return self.category_catalog.get("categories", {})

    def build_dataset_context_for_query(self, query: str) -> Optional[Dict[str, Any]]:
        """
        Analyze user query, retrieve relevant dataset features, and build
        a grounded, structured factual context block for Gemma and the chat response.
        """
        q = (query or "").lower().strip()

        # 1. Exact row / feature / record count questions
        if 'how many features' in q or 'number of features' in q or 'features count' in q:
            summary = self.get_dataset_summary()
            return {
                "type": "FEATURE_COUNT",
                "badge": "📊 Kolkata Dataset Statistics",
                "source": "HMIS & NFHS-5 Dataset Schema",
                "features_count": summary["total_features"],
                "total_columns": summary["total_columns"],
                "formatted_text": (
                    f"**Kolkata Health Dataset Features:**\n"
                    f"• **Total Columns:** {summary['total_columns']}\n"
                    f"• **Total Health Features:** **{summary['total_features']}**\n"
                    f"  - **HMIS Indicators:** {summary['hmis_features_count']}\n"
                    f"  - **NFHS-5 Survey Indicators:** {summary['nfhs5_features_count']}"
                )
            }

        if 'how many rows' in q or 'number of rows' in q or 'rows available' in q:
            summary = self.get_dataset_summary()
            return {
                "type": "ROW_COUNT",
                "badge": "📊 Kolkata Dataset Statistics",
                "source": "HMIS & NFHS-5 Time Series",
                "total_rows": summary["total_rows"],
                "years_range": summary["years_range"],
                "formatted_text": (
                    f"**Kolkata Health Dataset Rows:**\n"
                    f"• **Available Rows:** **{summary['total_rows']}** annual observations\n"
                    f"• **Fiscal Years Covered:** {summary['years_range']} ({', '.join(summary['years_covered'])})"
                )
            }

        if 'hmis record' in q or 'how many hmis' in q or 'records processed' in q:
            summary = self.get_dataset_summary()
            return {
                "type": "HMIS_RECORD_COUNT",
                "badge": "📊 HMIS Data Ingestion Statistics",
                "source": "HMIS Processing Summary",
                "hmis_records_processed": summary["hmis_records_processed"],
                "hmis_features_count": summary["hmis_features_count"],
                "formatted_text": (
                    f"**HMIS Data Ingestion Record Count:**\n"
                    f"• **HMIS Numeric Records Processed:** **{summary['hmis_records_processed']}** records\n"
                    f"• **Extracted Annual Features:** {summary['hmis_features_count']} indicators across 14 fiscal years (2008–09 to 2021–22)."
                )
            }

        if ('how many nfhs' in q or 'nfhs-5 features' in q or 'nfhs features' in q) and ('extracted' in q or 'count' in q or 'many' in q):
            summary = self.get_dataset_summary()
            return {
                "type": "NFHS_FEATURE_COUNT",
                "badge": "📊 NFHS-5 Feature Extraction",
                "source": "NFHS-5 Factsheet Integration",
                "nfhs5_features_count": summary["nfhs5_features_count"],
                "period": summary["nfhs5_survey_period"],
                "formatted_text": (
                    f"**NFHS-5 Extracted Features:**\n"
                    f"• **Extracted Features Count:** **{summary['nfhs5_features_count']}** survey indicators\n"
                    f"• **Survey Reference Period:** **{summary['nfhs5_survey_period']}** (Cross-sectional factsheet)."
                )
            }

        if any(k in q for k in ['period does the nfhs', 'nfhs-5 data represent', 'nfhs period', 'nfhs survey period', 'what period does nfhs']):
            summary = self.get_dataset_summary()
            return {
                "type": "NFHS_PERIOD",
                "badge": "📊 NFHS-5 Survey Period",
                "source": "National Family Health Survey (NFHS-5)",
                "period": summary["nfhs5_survey_period"],
                "formatted_text": (
                    f"**NFHS-5 Reference Period:**\n"
                    f"• The NFHS-5 survey data represents the **{summary['nfhs5_survey_period']}** period.\n"
                    f"• *Temporal Note:* In the Kolkata dataset, NFHS-5 values are attached exclusively to the **2019–20** row because NFHS-5 is a cross-sectional survey for that specific period."
                )
            }

        # 2. General dataset summary questions
        if any(k in q for k in ['what is the kolkata health dataset', 'what is in the kolkata', 'kolkata dataset', 'dataset summary', 'about the kolkata dataset', 'what is the kolkata dataset']):
            summary = self.get_dataset_summary()
            return {
                "type": "DATASET_SUMMARY",
                "badge": "📊 Kolkata Dataset Summary",
                "source": "HMIS (8202 records) & NFHS-5 (73 features)",
                "summary": summary,
                "formatted_text": (
                    f"**Kolkata Health Dataset Overview:**\n"
                    f"• **Dimensions:** **{summary['total_rows']}** rows (annual fiscal years) × **{summary['total_columns']}** columns (**{summary['total_features']}** health features).\n"
                    f"• **Data Sources:**\n"
                    f"  - **HMIS:** **{summary['hmis_features_count']}** indicators extracted from **{summary['hmis_records_processed']}** processed numeric records ({summary['years_range']}).\n"
                    f"  - **NFHS-5:** **{summary['nfhs5_features_count']}** features from the **{summary['nfhs5_survey_period']}** survey factsheet (attached to 2019–20).\n"
                    f"• **Statistical Limitation:** High-dimensional low-sample structure (14 rows, 1957 columns; p >> n). Trend and correlation analyses are exploratory and non-causal.\n"
                    f"• **Prediction Target:** Currently undefined as instructed in processing summary."
                )
            }

        # 3. Indicator discovery (general or by category)
        if any(k in q for k in ['what health indicators are available', 'what health indicators', 'available indicators', 'list indicators', 'indicator discovery']) and not any(w in q for w in ['hypertension', 'malaria', 'vaccin']):
            categories = self.get_category_catalog()
            lines = ["**Available Kolkata Health Indicators by Category:**\n"]
            for cat, data in categories.items():
                lines.append(f"• **{cat}** ({data['count']} indicators)")
                for sample in data.get("sample_indicators", [])[:2]:
                    lines.append(f"  - {sample}")
            return {
                "type": "CATEGORY_DISCOVERY",
                "badge": "📊 Kolkata Dataset Indicator Catalog",
                "source": "HMIS & NFHS-5",
                "categories": categories,
                "formatted_text": "\n".join(lines)
            }

        # 4. NFHS-5 specific query
        if ('nfhs' in q or 'nfhs-5' in q or 'national family health survey' in q) and not any(w in q for w in ['how many', 'period']):
            nfhs_feats = self.search_indicators("nfhs5", limit=6)
            lines = [
                f"**NFHS-5 (National Family Health Survey) in Kolkata Dataset:**\n",
                f"• **Features Extracted:** 73 survey indicators (e.g. blood pressure, blood sugar, anemia, institutional births, insurance).\n",
                f"• **Reference Period:** **2019–20** (Cross-sectional survey; attached to 2019–20 row).\n",
                f"• **Sample Indicators:**"
            ]
            for f in nfhs_feats[:5]:
                lines.append(f"  - {f['indicator']} ({f['unit']})")
            return {
                "type": "NFHS5_INSIGHT",
                "badge": "📊 NFHS-5 Dataset Insight",
                "source": "NFHS-5 (Survey Period: 2019–20)",
                "features_count": 73,
                "formatted_text": "\n".join(lines)
            }

        # 5. Year comparison query (e.g. 'compare 2018 and 2021', 'compare two years')
        if 'compare' in q:
            # Extract years
            found_years = [y for y in ['2008-09', '2009-10', '2010-11', '2011-12', '2012-13', '2013-14', '2014-15', '2015-16', '2016-17', '2017-18', '2018-19', '2019-20', '2020-21', '2021-22'] if y in q or y[:4] in q]
            if len(found_years) >= 2:
                y1, y2 = found_years[0], found_years[1]
            else:
                y1, y2 = "2018-19", "2020-21"  # Authoritative default comparison years

            matches = self.search_indicators(q, limit=10)
            if not matches:
                matches = self.search_indicators("hypertension", limit=6)

            valid_comp = None
            for m in matches:
                comp = self.compare_years(m['feature_name'], y1, y2)
                if comp.get("comparison_possible"):
                    valid_comp = comp
                    break

            if valid_comp:
                pct_str = f"{valid_comp.get('percentage_change')}%" if valid_comp.get("percentage_change") is not None else "N/A"
                return {
                    "type": "YEAR_COMPARISON",
                    "badge": "📊 Dataset Comparison Insight",
                    "source": f"{valid_comp.get('source', 'HMIS')} ({y1} vs {y2})",
                    "comparison": valid_comp,
                    "formatted_text": (
                        f"**Year Comparison for {valid_comp.get('indicator')}:**\n"
                        f"• **{valid_comp.get('year1')}:** {valid_comp.get('value1')} {valid_comp.get('unit', '')}\n"
                        f"• **{valid_comp.get('year2')}:** {valid_comp.get('value2')} {valid_comp.get('unit', '')}\n"
                        f"• **Absolute Difference:** **{valid_comp.get('absolute_difference')}** ({valid_comp.get('direction')})\n"
                        f"• **Percentage Change:** **{pct_str}**\n"
                        f"• *Deterministic calculation from Kolkata HMIS dataset.*"
                    )
                }
            elif matches:
                # All matches were single-period (e.g. NFHS-5 2019-20)
                m = matches[0]
                return {
                    "type": "COMPARISON_LIMITATION",
                    "badge": "📊 Dataset Observation",
                    "source": m.get("source", "NFHS-5"),
                    "formatted_text": (
                        f"**Comparison Limitation for {m.get('indicator')}:**\n"
                        f"• This indicator originates from **{m.get('source')}**, which is a cross-sectional survey populated only for **2019–20**.\n"
                        f"• Multi-year comparison is only available for annual HMIS time-series indicators."
                    )
                }

        # 6. Trend query (e.g. 'show malaria trends', 'malaria trend', 'trend of hypertension')
        if any(k in q for k in ['trend', 'trends', 'time series', 'over time']):
            matches = self.search_indicators(q, limit=4)
            if matches:
                best_trend = None
                for m in matches:
                    tr = self.calculate_trend(m['feature_name'])
                    if tr.get("sufficient_data"):
                        best_trend = tr
                        break
                if not best_trend:
                    best_trend = self.calculate_trend(matches[0]['feature_name'])

                if best_trend and best_trend.get("sufficient_data"):
                    pts_str = ", ".join([f"{p['year']}: {p['value']}" for p in best_trend['data_points']])
                    trend_pct_str = f"{best_trend.get('percentage_change')}%" if best_trend.get("percentage_change") is not None else "N/A"
                    return {
                        "type": "TREND_INSIGHT",
                        "badge": "📊 Trend Analysis Insight",
                        "source": f"{best_trend.get('source', 'HMIS')} ({best_trend.get('start_year')} to {best_trend.get('end_year')})",
                        "trend": best_trend,
                        "data_points": best_trend['data_points'],
                        "formatted_text": (
                            f"**Observed Trend for {best_trend.get('indicator')}:**\n"
                            f"• **Source:** {best_trend.get('source')} ({best_trend.get('data_points_count')} annual points from {best_trend.get('start_year')} to {best_trend.get('end_year')})\n"
                            f"• **Starting Value ({best_trend.get('start_year')}):** {best_trend.get('start_value')} {best_trend.get('unit')}\n"
                            f"• **Ending Value ({best_trend.get('end_year')}):** {best_trend.get('end_value')} {best_trend.get('unit')}\n"
                            f"• **Overall Direction:** **{best_trend.get('direction')}** (Net change: {best_trend.get('absolute_change')}, {trend_pct_str})\n"
                            f"• **Annual Values:** {pts_str}\n"
                            f"• *Note: Longitudinal trend is based on 14-year aggregated HMIS data.*"
                        )
                    }
                elif best_trend:
                    return {
                        "type": "TREND_LIMITATION",
                        "badge": "📊 Dataset Observation",
                        "source": best_trend.get("source", "HMIS"),
                        "formatted_text": f"**Indicator:** {best_trend.get('indicator')}\n• {best_trend.get('reason')}"
                    }

        # 7. Topic-specific indicator discovery (e.g. 'what hypertension-related indicators are available', 'what does the dataset contain about hypertension')
        if any(k in q for k in ['indicators are available', 'related indicators', 'kolkata dataset say about', 'dataset contain about', 'in the dataset', 'in kolkata dataset', 'dataset represent']):
            matches = self.search_indicators(q, limit=6)
            if matches:
                lines = [f"**Kolkata Dataset Features Found ({len(matches)} relevant indicators):**\n"]
                for m in matches:
                    pts = self.get_indicator_values(m['feature_name'])
                    val_str = f"Latest ({pts[-1]['year']}): {pts[-1]['value']} {m['unit']}" if pts else f"Survey {m['unit']} (NFHS-5 2019-20)"
                    lines.append(f"• **[{m['source']}] {m['indicator']}**\n  - {val_str} • Category: {m['category']}")
                return {
                    "type": "DATASET_TOPIC_INSIGHT",
                    "badge": "📊 Kolkata Dataset Insight",
                    "source": "HMIS & NFHS-5",
                    "matches_count": len(matches),
                    "matches": matches,
                    "formatted_text": "\n".join(lines)
                }

        # 8. If query explicitly mentions "kolkata" or "dataset"
        if 'kolkata' in q or 'dataset' in q:
            matches = self.search_indicators(q, limit=4)
            if matches:
                lines = [f"**Kolkata Dataset Insight ({len(matches)} indicators found):**\n"]
                for m in matches:
                    pts = self.get_indicator_values(m['feature_name'])
                    val_str = f"Latest value ({pts[-1]['year']}): {pts[-1]['value']} {m['unit']}" if pts else f"NFHS-5 Survey ({m['unit']})"
                    lines.append(f"• **[{m['source']}] {m['indicator']}** ({val_str})")
                return {
                    "type": "DATASET_TOPIC_INSIGHT",
                    "badge": "📊 Kolkata Dataset Insight",
                    "source": "HMIS & NFHS-5",
                    "matches_count": len(matches),
                    "formatted_text": "\n".join(lines)
                }

        return None


# Singleton instance
kolkata_data_service = KolkataHealthDataService()

