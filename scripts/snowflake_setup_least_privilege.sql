-- ==============================================================================
-- RuralHealth AI (RapiDChecK) — Snowflake Least-Privilege Role & Security Setup
-- ==============================================================================
-- Script Purpose:
--   Configures the dedicated least-privilege role 'RURALHEALTH_APP_ROLE' and
--   associated application service user for the RuralHealth AI backend.
--
-- Target Objects:
--   - Database: RURALHEALTH_DB
--   - Schemas:  ANALYTICS (Initial Test & Verified Queries)
--               CLINICAL, STAGING (Documented for Future Analytical Phases)
--   - Warehouse: COMPUTE_WH (X-Small)
--   - Table:    RURALHEALTH_DB.ANALYTICS.CONNECTION_TEST
--
-- Execution Instructions:
--   1. Run Section 1 as ACCOUNTADMIN or SECURITYADMIN in the Snowflake Web Worksheet.
--   2. Replace '<SET_STRONG_PASSWORD_HERE>' with a cryptographically secure password
--      (or configure Key-Pair authentication via ALTER USER ... SET RSA_PUBLIC_KEY).
--   3. Do NOT execute Section 2 until ready to promote analytical reporting or ETL pipelines.
-- ==============================================================================

USE ROLE ACCOUNTADMIN;

-- ──────────────────────────────────────────────────────────────────────────────
-- SECTION 1: MANDATORY LEAST-PRIVILEGE ROLE & VERIFICATION PERMISSIONS
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Ensure target database and analytics schema exist
CREATE DATABASE IF NOT EXISTS RURALHEALTH_DB
  COMMENT = 'Authoritative cloud analytics database for RuralHealth AI';

CREATE SCHEMA IF NOT EXISTS RURALHEALTH_DB.ANALYTICS
  COMMENT = 'Analytical reporting and verification schema';

-- 2. Create the synthetic verification table and seed initial verification record
CREATE TABLE IF NOT EXISTS RURALHEALTH_DB.ANALYTICS.CONNECTION_TEST (
  TEST_ID VARCHAR(64) DEFAULT 'TEST-001',
  TEST_MESSAGE VARCHAR(256) DEFAULT 'Synthetic test record for RuralHealth AI connectivity',
  CREATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

INSERT INTO RURALHEALTH_DB.ANALYTICS.CONNECTION_TEST (TEST_ID, TEST_MESSAGE)
SELECT 'TEST-001', 'Synthetic test record for RuralHealth AI connectivity'
WHERE NOT EXISTS (SELECT 1 FROM RURALHEALTH_DB.ANALYTICS.CONNECTION_TEST);

-- 3. Create the dedicated least-privilege application role
CREATE ROLE IF NOT EXISTS RURALHEALTH_APP_ROLE
  COMMENT = 'Dedicated least-privilege application role for RuralHealth AI backend';

-- 4. Grant USAGE on the virtual warehouse (COMPUTE_WH)
--    Enables query execution without granting warehouse modification privileges
GRANT USAGE ON WAREHOUSE COMPUTE_WH TO ROLE RURALHEALTH_APP_ROLE;

-- 5. Grant USAGE on the database (RURALHEALTH_DB)
--    Enables resolution of schemas inside the database
GRANT USAGE ON DATABASE RURALHEALTH_DB TO ROLE RURALHEALTH_APP_ROLE;

-- 6. Grant USAGE on the ANALYTICS schema
GRANT USAGE ON SCHEMA RURALHEALTH_DB.ANALYTICS TO ROLE RURALHEALTH_APP_ROLE;

-- 7. Grant read-only SELECT privilege strictly on the verification table
--    This is sufficient for Phase 5 backend diagnostic connection testing
GRANT SELECT ON TABLE RURALHEALTH_DB.ANALYTICS.CONNECTION_TEST TO ROLE RURALHEALTH_APP_ROLE;


-- 8. Create dedicated service user for backend authentication
--    NOTE: Replace placeholder password before executing!
--    Never commit real passwords to Git or share in chat.
CREATE USER IF NOT EXISTS RURALHEALTH_APP_USER
  PASSWORD = '<SET_STRONG_PASSWORD_HERE>'
  DEFAULT_ROLE = RURALHEALTH_APP_ROLE
  DEFAULT_WAREHOUSE = COMPUTE_WH
  DEFAULT_NAMESPACE = RURALHEALTH_DB.ANALYTICS
  MUST_CHANGE_PASSWORD = FALSE
  COMMENT = 'Service account user for RuralHealth AI backend';

-- 9. Assign the least-privilege role to the application service user
GRANT ROLE RURALHEALTH_APP_ROLE TO USER RURALHEALTH_APP_USER;

-- 10. Verify the role and grant hierarchy

SHOW GRANTS TO ROLE RURALHEALTH_APP_ROLE;
SHOW GRANTS OF ROLE RURALHEALTH_APP_ROLE;


-- ──────────────────────────────────────────────────────────────────────────────
-- SECTION 2: GOVERNED ANALYTICS PIPELINE OBJECTS (STAGING & CLINICAL SCHEMAS)
-- ──────────────────────────────────────────────────────────────────────────────
-- Run Section 2 when enabling the de-identified patient-data pipeline.
--
-- Guarantees:
-- 1. All records in STAGING and CLINICAL schemas are pseudonymized and stripped of direct PII.
-- 2. Grants to RURALHEALTH_APP_ROLE are strictly limited to necessary tables.
-- 3. Idempotent MERGE operations prevent duplicate records on retry.

CREATE SCHEMA IF NOT EXISTS RURALHEALTH_DB.STAGING
  COMMENT = 'Governed staging schema for de-identified operational health sync';

CREATE SCHEMA IF NOT EXISTS RURALHEALTH_DB.CLINICAL
  COMMENT = 'Aggregated clinical surveillance and epidemiology registers';

-- 1. Staging table for de-identified patient analytical demographics
CREATE TABLE IF NOT EXISTS RURALHEALTH_DB.STAGING.STG_PATIENT_ANALYTICS (
  ANALYTICAL_ID VARCHAR(64) PRIMARY KEY, -- Deterministic HMAC-SHA256 (Never raw ID)
  AGE_GROUP VARCHAR(16),                 -- Cohort bracket ('0-17', '18-29', etc.)
  GENDER VARCHAR(16),
  VILLAGE VARCHAR(64),
  DISTRICT VARCHAR(64),
  FACILITY_ID VARCHAR(64),
  SERVER_VERSION NUMBER(38,0),
  IS_DELETED BOOLEAN DEFAULT FALSE,
  CREATED_AT TIMESTAMP_NTZ,
  UPDATED_AT TIMESTAMP_NTZ,
  SYNCED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- 2. Fact table for clinical triage and epidemiology surveillance
CREATE TABLE IF NOT EXISTS RURALHEALTH_DB.CLINICAL.FACT_CLINICAL_SUMMARY (
  ENCOUNTER_ID VARCHAR(64) PRIMARY KEY,
  PATIENT_ANALYTICAL_ID VARCHAR(64),     -- References STG_PATIENT_ANALYTICS(ANALYTICAL_ID)
  AGE_GROUP VARCHAR(16),
  GENDER VARCHAR(16),
  VILLAGE VARCHAR(64),
  DISTRICT VARCHAR(64),
  FACILITY_ID VARCHAR(64),
  TRIAGE_STATE VARCHAR(32),
  RISK_LEVEL VARCHAR(32),
  IS_EMERGENCY BOOLEAN,
  SYSTOLIC_BP NUMBER(5,1),
  DIASTOLIC_BP NUMBER(5,1),
  GLUCOSE_MG_DL NUMBER(6,1),
  HEART_RATE_BPM NUMBER(5,1),
  CONDITIONS_JSON VARCHAR(1024),
  SERVER_VERSION NUMBER(38,0),
  IS_DELETED BOOLEAN DEFAULT FALSE,
  ASSESSMENT_DATE TIMESTAMP_NTZ,
  SYNCED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- 3. Grants for least-privilege role
GRANT USAGE ON SCHEMA RURALHEALTH_DB.STAGING TO ROLE RURALHEALTH_APP_ROLE;
GRANT USAGE ON SCHEMA RURALHEALTH_DB.CLINICAL TO ROLE RURALHEALTH_APP_ROLE;

GRANT SELECT, INSERT, UPDATE ON TABLE RURALHEALTH_DB.STAGING.STG_PATIENT_ANALYTICS TO ROLE RURALHEALTH_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE RURALHEALTH_DB.CLINICAL.FACT_CLINICAL_SUMMARY TO ROLE RURALHEALTH_APP_ROLE;

-- ──────────────────────────────────────────────────────────────────────────────
-- SECTION 3: ARCHITECTURAL DIFFERENCES & CONSTRAINTS NOTICE
-- ──────────────────────────────────────────────────────────────────────────────
-- 1. PRIMARY KEY & UNIQUE CONSTRAINTS:
--    In Snowflake, PRIMARY KEY and UNIQUE constraints are INFORMATIONAL ONLY.
--    Snowflake does NOT enforce uniqueness upon INSERT or COPY INTO.
--    Application ETL logic must enforce deduplication before loading facts.
--
-- 2. FOREIGN KEY CONSTRAINTS:
--    Snowflake does NOT enforce referential integrity foreign keys.
--
-- 3. OLTP vs OLAP WORKLOADS:
--    Snowflake is a columnar cloud data warehouse (OLAP). It is NOT designed for
--    high-concurrency single-row CRUD operations, offline Dexie.js synchronization,
--    or millisecond transaction commitments.
--    Transactional patient workflows MUST remain on SQLite (local/dev) or PostgreSQL.
-- ==============================================================================
