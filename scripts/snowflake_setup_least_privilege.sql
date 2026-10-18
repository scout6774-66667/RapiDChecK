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

-- 1. Create the dedicated least-privilege application role
CREATE ROLE IF NOT EXISTS RURALHEALTH_APP_ROLE
  COMMENT = 'Dedicated least-privilege application role for RuralHealth AI backend';

-- 2. Grant USAGE on the virtual warehouse (COMPUTE_WH)
--    Enables query execution without granting warehouse modification privileges
GRANT USAGE ON WAREHOUSE COMPUTE_WH TO ROLE RURALHEALTH_APP_ROLE;

-- 3. Grant USAGE on the database (RURALHEALTH_DB)
--    Enables resolution of schemas inside the database
GRANT USAGE ON DATABASE RURALHEALTH_DB TO ROLE RURALHEALTH_APP_ROLE;

-- 4. Grant USAGE on the ANALYTICS schema
GRANT USAGE ON SCHEMA RURALHEALTH_DB.ANALYTICS TO ROLE RURALHEALTH_APP_ROLE;

-- 5. Grant read-only SELECT privilege strictly on the verification table
--    This is sufficient for Phase 5 backend diagnostic connection testing
GRANT SELECT ON TABLE RURALHEALTH_DB.ANALYTICS.CONNECTION_TEST TO ROLE RURALHEALTH_APP_ROLE;

-- 6. Create dedicated service user for backend authentication
--    NOTE: Replace placeholder password before executing!
--    Never commit real passwords to Git or share in chat.
CREATE USER IF NOT EXISTS RURALHEALTH_APP_USER
  PASSWORD = '<SET_STRONG_PASSWORD_HERE>'
  DEFAULT_ROLE = RURALHEALTH_APP_ROLE
  DEFAULT_WAREHOUSE = COMPUTE_WH
  DEFAULT_NAMESPACE = RURALHEALTH_DB.ANALYTICS
  MUST_CHANGE_PASSWORD = FALSE
  COMMENT = 'Service account user for RuralHealth AI backend';

-- 7. Assign the least-privilege role to the application service user
GRANT ROLE RURALHEALTH_APP_ROLE TO USER RURALHEALTH_APP_USER;

-- 8. Verify the role and grant hierarchy
SHOW GRANTS TO ROLE RURALHEALTH_APP_ROLE;
SHOW GRANTS OF ROLE RURALHEALTH_APP_ROLE;


-- ──────────────────────────────────────────────────────────────────────────────
-- SECTION 2: PLANNED FUTURE PRIVILEGES (DOCUMENTED FOR FUTURE ROADMAP)
-- ──────────────────────────────────────────────────────────────────────────────
-- The following permissions are NOT granted during initial connection verification.
-- They are documented here for future expansion when analytics features are migrated.

/*
-- A. Population-Health Analytical Reporting (ANALYTICS Schema)
-- Reason: Required when executing longitudinal queries over dim_state, dim_district,
-- dim_time, dim_indicator, and fact_health_indicator from the backend ML engine.
GRANT SELECT ON ALL TABLES IN SCHEMA RURALHEALTH_DB.ANALYTICS TO ROLE RURALHEALTH_APP_ROLE;
GRANT SELECT ON ALL VIEWS IN SCHEMA RURALHEALTH_DB.ANALYTICS TO ROLE RURALHEALTH_APP_ROLE;
GRANT SELECT ON FUTURE TABLES IN SCHEMA RURALHEALTH_DB.ANALYTICS TO ROLE RURALHEALTH_APP_ROLE;

-- B. Bulk Data Staging & Ingestion (STAGING Schema)
-- Reason: Required for staging HMIS & NFHS batch CSV ingestion before aggregation.
GRANT USAGE ON SCHEMA RURALHEALTH_DB.STAGING TO ROLE RURALHEALTH_APP_ROLE;
GRANT CREATE TABLE, CREATE STAGE ON SCHEMA RURALHEALTH_DB.STAGING TO ROLE RURALHEALTH_APP_ROLE;

-- C. Aggregated Clinical Surveillance (CLINICAL Schema)
-- Reason: Required for read-only population epidemiology and risk vector monitoring.
-- Direct transactional patient records remain in SQLite/PostgreSQL; only aggregated
-- or de-identified clinical registers are exposed here.
GRANT USAGE ON SCHEMA RURALHEALTH_DB.CLINICAL TO ROLE RURALHEALTH_APP_ROLE;
GRANT SELECT ON ALL VIEWS IN SCHEMA RURALHEALTH_DB.CLINICAL TO ROLE RURALHEALTH_APP_ROLE;
*/

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
