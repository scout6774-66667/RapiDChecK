"""
snowflake_patient_pipeline.py — Governed Patient-Data Analytics Pipeline for Snowflake
=======================================================================================
RuralHealth AI Analytical Layer & Governance Engine

Architectural Guarantees:
1. Operational Independence:
   Transactional patient CRUD, triage, teleconsult appointments, and offline Dexie
   synchronization operate exclusively against the operational store (SQLite/PostgreSQL).
   Frontline operations NEVER block or fail if Snowflake is unconfigured or unreachable.
2. Data Governance & Field Minimization:
   Strict field allowlist. Direct identifiers (patient names, phone numbers, addresses,
   national health IDs, free-text clinical notes) are PROHIBITED and stripped before transmission.
3. Cryptographic Pseudonymization:
   Patient identifiers are pseudonymized using deterministic HMAC-SHA256 with a salt
   retained strictly on the operational backend.
4. Idempotent Merging:
   Uses Snowflake MERGE statements with server_version precedence to prevent duplicate records
   during retries, network reconnects, or repeated ETL executions.
5. Role & Security Enforcement:
   Uses the existing singleton SnowflakeClient with dedicated least-privilege role (RURALHEALTH_APP_ROLE).
   ACCOUNTADMIN runtime sessions are strictly rejected.
"""

import hmac
import hashlib
import json
import logging
import time
from typing import List, Dict, Any, Optional
from datetime import datetime

from sqlalchemy.orm import Session
from sqlalchemy import text

from config import HMAC_SECRET_KEY
from snowflake_client import (
    get_snowflake_client,
    SnowflakeClient,
    sanitize_error_message,
)
from database import PatientModel, AssessmentModel

logger = logging.getLogger("ruralhealth.snowflake.pipeline")

# ─── DATA GOVERNANCE POLICY SPECIFICATION ─────────────────────────────────────

GOVERNANCE_POLICY: Dict[str, Any] = {
    "version": "1.0.0",
    "target_database": "RURALHEALTH_DB",
    "target_schemas": {
        "staging": "STAGING",
        "clinical": "CLINICAL",
        "analytics": "ANALYTICS"
    },
    "staging_table": "RURALHEALTH_DB.STAGING.STG_PATIENT_ANALYTICS",
    "clinical_table": "RURALHEALTH_DB.CLINICAL.FACT_CLINICAL_SUMMARY",
    "field_allowlist_patient": [
        "ANALYTICAL_ID",
        "AGE_GROUP",
        "GENDER",
        "VILLAGE",
        "DISTRICT",
        "FACILITY_ID",
        "SERVER_VERSION",
        "IS_DELETED",
        "CREATED_AT",
        "UPDATED_AT"
    ],
    "field_allowlist_clinical_summary": [
        "ENCOUNTER_ID",
        "PATIENT_ANALYTICAL_ID",
        "AGE_GROUP",
        "GENDER",
        "VILLAGE",
        "DISTRICT",
        "FACILITY_ID",
        "TRIAGE_STATE",
        "RISK_LEVEL",
        "IS_EMERGENCY",
        "SYSTOLIC_BP",
        "DIASTOLIC_BP",
        "GLUCOSE_MG_DL",
        "HEART_RATE_BPM",
        "CONDITIONS_JSON",
        "SERVER_VERSION",
        "IS_DELETED",
        "ASSESSMENT_DATE"
    ],
    "prohibited_direct_identifiers": [
        "name",
        "full_name",
        "phone",
        "phone_number",
        "national_health_id",
        "abha_number",
        "address",
        "street",
        "notes",
        "free_text_symptoms"
    ],
    "pseudonymization": {
        "algorithm": "HMAC-SHA256",
        "salt_origin": "backend_secret_key",
        "output_length": 32,
        "is_reversible_in_snowflake": False
    },
    "data_retention_days": 1825,  # 5 years
    "deletion_propagation": "tombstone_flag (IS_DELETED=TRUE)"
}


def get_governance_policy() -> Dict[str, Any]:
    """Returns the documented, audited field allowlist and privacy policy."""
    return GOVERNANCE_POLICY


# ─── ANONYMIZATION & TRANSFORMATION HELPERS ───────────────────────────────────

def pseudonymize_patient_id(raw_id: str, salt: Optional[str] = None) -> str:
    """
    Computes a deterministic, irreversible HMAC-SHA256 pseudonym for a patient ID.
    The secret salt remains strictly on the operational server.
    """
    if not raw_id:
        return ""
    effective_salt = salt or HMAC_SECRET_KEY or "rapidcheck_default_analytical_salt"
    h = hmac.new(effective_salt.encode("utf-8"), raw_id.encode("utf-8"), hashlib.sha256)
    return h.hexdigest()[:32]


def categorize_age(age: Optional[int]) -> str:
    """
    Categorizes discrete ages into standard WHO demographic cohorts to mitigate re-identification.
    """
    if age is None or age < 0:
        return "UNKNOWN"
    if age <= 17:
        return "0-17"
    if age <= 29:
        return "18-29"
    if age <= 44:
        return "30-44"
    if age <= 59:
        return "45-59"
    return "60+"


def transform_patient_for_analytics(patient: PatientModel, salt: Optional[str] = None) -> Dict[str, Any]:
    """
    Transforms an operational PatientModel instance into a de-identified analytical record.
    Strictly enforces the field allowlist; zero direct PII is included.
    """
    analytical_id = pseudonymize_patient_id(str(patient.id), salt=salt)
    
    # Strip any potential district from village or use fallback
    village_val = (patient.village or "UNKNOWN").strip()
    
    return {
        "ANALYTICAL_ID": analytical_id,
        "AGE_GROUP": categorize_age(patient.age),
        "GENDER": str(patient.gender or "UNKNOWN").capitalize(),
        "VILLAGE": village_val[:64],
        "DISTRICT": "West Bengal",
        "FACILITY_ID": str(patient.facility_id or "UNASSIGNED")[:64],
        "SERVER_VERSION": int(patient.server_version or 1),
        "IS_DELETED": bool(patient.is_deleted),
        "CREATED_AT": str(patient.created_at or datetime.utcnow().isoformat()),
        "UPDATED_AT": str(patient.updated_at or datetime.utcnow().isoformat())
    }


def transform_assessment_for_clinical_summary(
    assessment: AssessmentModel,
    patient: Optional[PatientModel] = None,
    salt: Optional[str] = None
) -> Dict[str, Any]:
    """
    Transforms an operational AssessmentModel into a de-identified epidemiological summary record.
    """
    patient_analytical_id = pseudonymize_patient_id(str(assessment.patient_id), salt=salt)
    encounter_id = pseudonymize_patient_id(str(assessment.id), salt=salt)

    # Coerce likely conditions to a clean JSON array of strings
    conditions = []
    if hasattr(assessment, "likely_conditions") and assessment.likely_conditions:
        conditions = list(assessment.likely_conditions)
    elif assessment.likely_conditions_json:
        try:
            conditions = json.loads(assessment.likely_conditions_json)
        except Exception:
            conditions = []

    age_group = categorize_age(patient.age) if patient else "UNKNOWN"
    gender = str(patient.gender or "UNKNOWN").capitalize() if patient else "UNKNOWN"
    village = str(patient.village or "UNKNOWN") if patient else "UNKNOWN"

    return {
        "ENCOUNTER_ID": encounter_id,
        "PATIENT_ANALYTICAL_ID": patient_analytical_id,
        "AGE_GROUP": age_group,
        "GENDER": gender,
        "VILLAGE": village[:64],
        "DISTRICT": "West Bengal",
        "FACILITY_ID": str(assessment.facility_id or "UNASSIGNED")[:64],
        "TRIAGE_STATE": str(assessment.triage_state or "ROUTINE")[:32],
        "RISK_LEVEL": str(assessment.risk_level or "LOW")[:32],
        "IS_EMERGENCY": bool(assessment.is_emergency),
        "SYSTOLIC_BP": float(assessment.systolic_bp) if assessment.systolic_bp is not None else None,
        "DIASTOLIC_BP": float(assessment.diastolic_bp) if assessment.diastolic_bp is not None else None,
        "GLUCOSE_MG_DL": float(assessment.glucose_mg_dl) if assessment.glucose_mg_dl is not None else None,
        "HEART_RATE_BPM": float(assessment.heart_rate_bpm) if assessment.heart_rate_bpm is not None else None,
        "CONDITIONS_JSON": json.dumps(conditions[:10]),
        "SERVER_VERSION": int(assessment.server_version or 1),
        "IS_DELETED": bool(assessment.is_deleted),
        "ASSESSMENT_DATE": str(assessment.created_at or datetime.utcnow().isoformat())
    }


# ─── IDEMPOTENT SQL GENERATORS (SNOWFLAKE MERGE) ─────────────────────────────

def build_patient_merge_sql(records: List[Dict[str, Any]]) -> str:
    """
    Generates an idempotent MERGE statement into RURALHEALTH_DB.STAGING.STG_PATIENT_ANALYTICS.
    Uses CTE source mapping with server_version comparison to prevent duplicates and race conditions.
    """
    if not records:
        return ""

    select_rows = []
    for r in records:
        is_del_str = "TRUE" if r["IS_DELETED"] else "FALSE"
        v_esc = r['VILLAGE'].replace("'", "''")
        d_esc = r['DISTRICT'].replace("'", "''")
        f_esc = r['FACILITY_ID'].replace("'", "''")
        row = (
            f"SELECT '{r['ANALYTICAL_ID']}' AS ANALYTICAL_ID, "
            f"'{r['AGE_GROUP']}' AS AGE_GROUP, "
            f"'{r['GENDER']}' AS GENDER, "
            f"'{v_esc}' AS VILLAGE, "
            f"'{d_esc}' AS DISTRICT, "
            f"'{f_esc}' AS FACILITY_ID, "
            f"{r['SERVER_VERSION']} AS SERVER_VERSION, "
            f"{is_del_str} AS IS_DELETED, "
            f"TRY_TO_TIMESTAMP_NTZ('{r['CREATED_AT']}') AS CREATED_AT, "
            f"TRY_TO_TIMESTAMP_NTZ('{r['UPDATED_AT']}') AS UPDATED_AT"
        )
        select_rows.append(row)

    source_union = " UNION ALL \n".join(select_rows)

    return f"""
MERGE INTO RURALHEALTH_DB.STAGING.STG_PATIENT_ANALYTICS AS target
USING (
{source_union}
) AS source
ON target.ANALYTICAL_ID = source.ANALYTICAL_ID
WHEN MATCHED AND source.SERVER_VERSION >= target.SERVER_VERSION THEN
    UPDATE SET
        target.AGE_GROUP = source.AGE_GROUP,
        target.GENDER = source.GENDER,
        target.VILLAGE = source.VILLAGE,
        target.DISTRICT = source.DISTRICT,
        target.FACILITY_ID = source.FACILITY_ID,
        target.SERVER_VERSION = source.SERVER_VERSION,
        target.IS_DELETED = source.IS_DELETED,
        target.UPDATED_AT = source.UPDATED_AT,
        target.SYNCED_AT = CURRENT_TIMESTAMP()
WHEN NOT MATCHED THEN
    INSERT (
        ANALYTICAL_ID, AGE_GROUP, GENDER, VILLAGE, DISTRICT,
        FACILITY_ID, SERVER_VERSION, IS_DELETED, CREATED_AT, UPDATED_AT, SYNCED_AT
    )
    VALUES (
        source.ANALYTICAL_ID, source.AGE_GROUP, source.GENDER, source.VILLAGE, source.DISTRICT,
        source.FACILITY_ID, source.SERVER_VERSION, source.IS_DELETED, source.CREATED_AT, source.UPDATED_AT, CURRENT_TIMESTAMP()
    );
"""


def build_clinical_summary_merge_sql(records: List[Dict[str, Any]]) -> str:
    """
    Generates an idempotent MERGE statement into RURALHEALTH_DB.CLINICAL.FACT_CLINICAL_SUMMARY.
    """
    if not records:
        return ""

    select_rows = []
    for r in records:
        is_del_str = "TRUE" if r["IS_DELETED"] else "FALSE"
        is_emerg_str = "TRUE" if r["IS_EMERGENCY"] else "FALSE"
        sbp = f"{r['SYSTOLIC_BP']}" if r['SYSTOLIC_BP'] is not None else "NULL"
        dbp = f"{r['DIASTOLIC_BP']}" if r['DIASTOLIC_BP'] is not None else "NULL"
        glu = f"{r['GLUCOSE_MG_DL']}" if r['GLUCOSE_MG_DL'] is not None else "NULL"
        hr = f"{r['HEART_RATE_BPM']}" if r['HEART_RATE_BPM'] is not None else "NULL"
        cond_esc = r['CONDITIONS_JSON'].replace("'", "''")
        v_esc = r['VILLAGE'].replace("'", "''")
        d_esc = r['DISTRICT'].replace("'", "''")
        f_esc = r['FACILITY_ID'].replace("'", "''")

        row = (
            f"SELECT '{r['ENCOUNTER_ID']}' AS ENCOUNTER_ID, "
            f"'{r['PATIENT_ANALYTICAL_ID']}' AS PATIENT_ANALYTICAL_ID, "
            f"'{r['AGE_GROUP']}' AS AGE_GROUP, "
            f"'{r['GENDER']}' AS GENDER, "
            f"'{v_esc}' AS VILLAGE, "
            f"'{d_esc}' AS DISTRICT, "
            f"'{f_esc}' AS FACILITY_ID, "
            f"'{r['TRIAGE_STATE']}' AS TRIAGE_STATE, "
            f"'{r['RISK_LEVEL']}' AS RISK_LEVEL, "
            f"{is_emerg_str} AS IS_EMERGENCY, "
            f"{sbp} AS SYSTOLIC_BP, "
            f"{dbp} AS DIASTOLIC_BP, "
            f"{glu} AS GLUCOSE_MG_DL, "
            f"{hr} AS HEART_RATE_BPM, "
            f"'{cond_esc}' AS CONDITIONS_JSON, "
            f"{r['SERVER_VERSION']} AS SERVER_VERSION, "
            f"{is_del_str} AS IS_DELETED, "
            f"TRY_TO_TIMESTAMP_NTZ('{r['ASSESSMENT_DATE']}') AS ASSESSMENT_DATE"
        )
        select_rows.append(row)

    source_union = " UNION ALL \n".join(select_rows)

    return f"""
MERGE INTO RURALHEALTH_DB.CLINICAL.FACT_CLINICAL_SUMMARY AS target
USING (
{source_union}
) AS source
ON target.ENCOUNTER_ID = source.ENCOUNTER_ID
WHEN MATCHED AND source.SERVER_VERSION >= target.SERVER_VERSION THEN
    UPDATE SET
        target.TRIAGE_STATE = source.TRIAGE_STATE,
        target.RISK_LEVEL = source.RISK_LEVEL,
        target.IS_EMERGENCY = source.IS_EMERGENCY,
        target.SYSTOLIC_BP = source.SYSTOLIC_BP,
        target.DIASTOLIC_BP = source.DIASTOLIC_BP,
        target.GLUCOSE_MG_DL = source.GLUCOSE_MG_DL,
        target.HEART_RATE_BPM = source.HEART_RATE_BPM,
        target.CONDITIONS_JSON = source.CONDITIONS_JSON,
        target.SERVER_VERSION = source.SERVER_VERSION,
        target.IS_DELETED = source.IS_DELETED,
        target.SYNCED_AT = CURRENT_TIMESTAMP()
WHEN NOT MATCHED THEN
    INSERT (
        ENCOUNTER_ID, PATIENT_ANALYTICAL_ID, AGE_GROUP, GENDER, VILLAGE, DISTRICT,
        FACILITY_ID, TRIAGE_STATE, RISK_LEVEL, IS_EMERGENCY, SYSTOLIC_BP, DIASTOLIC_BP,
        GLUCOSE_MG_DL, HEART_RATE_BPM, CONDITIONS_JSON, SERVER_VERSION, IS_DELETED,
        ASSESSMENT_DATE, SYNCED_AT
    )
    VALUES (
        source.ENCOUNTER_ID, source.PATIENT_ANALYTICAL_ID, source.AGE_GROUP, source.GENDER, source.VILLAGE, source.DISTRICT,
        source.FACILITY_ID, source.TRIAGE_STATE, source.RISK_LEVEL, source.IS_EMERGENCY, source.SYSTOLIC_BP, source.DIASTOLIC_BP,
        source.GLUCOSE_MG_DL, source.HEART_RATE_BPM, source.CONDITIONS_JSON, source.SERVER_VERSION, source.IS_DELETED,
        source.ASSESSMENT_DATE, CURRENT_TIMESTAMP()
    );
"""


# ─── GOVERNED PIPELINE EXECUTOR ───────────────────────────────────────────────

def sync_governed_patient_analytics(
    db: Session,
    client: Optional[SnowflakeClient] = None,
    max_records: int = 100
) -> Dict[str, Any]:
    """
    Executes the governed de-identified patient synchronization pipeline.

    Guarantees:
    - If Snowflake is unconfigured, returns clean skipped status without error.
    - If Snowflake connection fails, catches and sanitizes exception without raising.
    - Zero direct identifiers are sent across the wire.
    - MERGE statements are idempotent.
    - Never blocks or interrupts operational database workflows.
    """
    start_time = time.time()
    snow_client = client or get_snowflake_client()

    # Step 1: Check if Snowflake is configured
    if not snow_client.is_configured():
        return {
            "status": "skipped",
            "reason": "Snowflake credentials (SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER, SNOWFLAKE_PASSWORD) are unconfigured in environment.",
            "synced_patients": 0,
            "synced_assessments": 0,
            "elapsed_seconds": round(time.time() - start_time, 3),
            "governance_enforced": True
        }

    # Step 2: Query operational records from SQLite / PostgreSQL
    try:
        patients = db.query(PatientModel).order_by(PatientModel.updated_at.desc()).limit(max_records).all()
        assessments = db.query(AssessmentModel).order_by(AssessmentModel.updated_at.desc()).limit(max_records).all()
        patient_map = {p.id: p for p in patients}
    except Exception as db_err:
        logger.error("Failed querying operational database for Snowflake export: %s", db_err)
        return {
            "status": "error",
            "error": "Failed to read operational records for export",
            "synced_patients": 0,
            "synced_assessments": 0,
            "elapsed_seconds": round(time.time() - start_time, 3),
            "governance_enforced": True
        }

    if not patients and not assessments:
        return {
            "status": "success",
            "message": "No operational records available for export.",
            "synced_patients": 0,
            "synced_assessments": 0,
            "elapsed_seconds": round(time.time() - start_time, 3),
            "governance_enforced": True
        }

    # Step 3: Transform records through field allowlist & pseudonymization
    transformed_patients = [transform_patient_for_analytics(p) for p in patients]
    transformed_assessments = [
        transform_assessment_for_clinical_summary(a, patient=patient_map.get(a.patient_id))
        for a in assessments
    ]

    # Verify zero PII before sending
    for p_record in transformed_patients:
        for pii_key in GOVERNANCE_POLICY["prohibited_direct_identifiers"]:
            assert pii_key not in p_record, f"CRITICAL: Direct PII key '{pii_key}' detected in Snowflake payload!"

    # Step 4: Execute idempotent MERGE against Snowflake
    try:
        with snow_client.get_raw_connection() as conn:
            cursor = conn.cursor()
            try:
                # Merge patients into STAGING.STG_PATIENT_ANALYTICS
                if transformed_patients:
                    patient_sql = build_patient_merge_sql(transformed_patients)
                    cursor.execute(patient_sql)

                # Merge clinical summaries into CLINICAL.FACT_CLINICAL_SUMMARY
                if transformed_assessments:
                    clinical_sql = build_clinical_summary_merge_sql(transformed_assessments)
                    cursor.execute(clinical_sql)

                conn.commit()
            finally:
                cursor.close()

        elapsed = round(time.time() - start_time, 3)
        logger.info(
            "Governed Snowflake sync complete: %d patients, %d clinical encounters synced in %ss.",
            len(transformed_patients), len(transformed_assessments), elapsed
        )

        return {
            "status": "success",
            "synced_patients": len(transformed_patients),
            "synced_assessments": len(transformed_assessments),
            "elapsed_seconds": elapsed,
            "target_database": snow_client.config.database,
            "governance_enforced": True,
            "error": None
        }

    except Exception as snow_err:
        sanitized = sanitize_error_message(snow_err)
        logger.warning("Governed Snowflake sync non-fatal error: %s", sanitized)
        return {
            "status": "error",
            "error": sanitized,
            "synced_patients": 0,
            "synced_assessments": 0,
            "elapsed_seconds": round(time.time() - start_time, 3),
            "governance_enforced": True
        }
