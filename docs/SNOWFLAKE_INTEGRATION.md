# RuralHealth AI — Snowflake Cloud Data Warehouse Integration Guide

## 1. Architectural Overview & Workload Separation

RuralHealth AI implements a **dual-database architecture** designed to balance real-time, offline-first frontline clinic workflows with population-health analytical capabilities:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND CLIENTS                                │
│   • ASHA Frontline Mobile / Tablet (Offline-First via Dexie.js v4)    │
│   • PHC Doctor Clinical Review Portal                                  │
│   • District Health Officer Dashboard                                  │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
                    HTTPS / REST API │ (Bearer JWT)
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     FASTAPI APPLICATION BACKEND                         │
│   • Auth & RBAC (ASHA_WORKER, PHC_DOCTOR, SYSTEM_ADMIN)                │
│   • Clinical Risk Engine & Deterministic Triage                        │
│   • Monotonic Sync Journal & Idempotent Push/Pull Engine               │
│   • Security Headers & Strict Credential Isolation                     │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
    Transactional   │                                │  Analytical &
    OLTP Queries    │                                │  OLAP Queries
                    ▼                                ▼
┌──────────────────────────────────┐ ┌───────────────────────────────────┐
│     OPERATIONAL DATA STORE       │ │   SNOWFLAKE CLOUD DATA WAREHOUSE  │
│   (SQLite Local / PostgreSQL)    │ │         (RURALHEALTH_DB)          │
│ ──────────────────────────────── │ │ ───────────────────────────────── │
│ • Frontline Patient Records      │ │ • Population Health Indicators    │
│ • Real-time Triage Assessments   │ │ • Longitudinal HMIS Data Marts    │
│ • Teleconsult Appointments       │ │ • NFHS-5 Survey Benchmarks        │
│ • Cryptographic Attestations     │ │ • District Epidemiology Trends    │
│ • Dexie Outbox Sync & Idempotency│ │ • Cross-Facility Aggregations     │
│ • Low-latency row-level locking  │ │ • Columnar Analytics Engine       │
└──────────────────────────────────┘ └───────────────────────────────────┘
```

### Why SQLite / PostgreSQL Remains Authoritative for Operational Patient Data
- **Offline Synchronization:** Frontline ASHA workers queue mutations in browser IndexedDB (Dexie.js v4). Synchronizing batches requires sub-second row-level transactional commits (`patients`, `assessments`, `appointments`, `sync_journal`, `idempotency_log`).
- **Referential Integrity & Constraints:** Operational workflows require enforced primary and foreign key constraints. Snowflake **does not enforce** unique or foreign-key constraints during `INSERT` or `COPY INTO` operations.
- **Latency & Concurrency:** Snowflake is a columnar store optimized for aggregate scans over millions of records. High-frequency single-record reads and writes introduce unnecessary warehouse resume latency and consumption.

---

## 2. Centralized Backend-Only Configuration

All Snowflake connection parameters are managed exclusively via environment variables and loaded in [Health-AI-main/backend/snowflake_client.py](file:///Users/sohamghosh/RapiDChecK/Health-AI-main/backend/snowflake_client.py) and [Health-AI-main/backend/config.py](file:///Users/sohamghosh/RapiDChecK/Health-AI-main/backend/config.py).

### Environment Variables

| Variable Name | Required | Default Value | Description |
|---|---|---|---|
| `SNOWFLAKE_ACCOUNT` | **Yes** | *None* | Snowflake Account Identifier (e.g., `xy12345.us-east-1` or `orgname-accountname`). |
| `SNOWFLAKE_USER` | **Yes** | *None* | Dedicated service account username (e.g., `RURALHEALTH_APP_USER`). |
| `SNOWFLAKE_PASSWORD` | **Yes** | *None* | Service account password or authentication credential. |
| `SNOWFLAKE_WAREHOUSE` | No | `COMPUTE_WH` | Virtual warehouse used for application analytical queries. |
| `SNOWFLAKE_DATABASE` | No | `RURALHEALTH_DB` | Authoritative analytics database. |
| `SNOWFLAKE_SCHEMA` | No | `ANALYTICS` | Default active schema for analytics and verification queries. |
| `SNOWFLAKE_ROLE` | No | `RURALHEALTH_APP_ROLE` | Dedicated least-privilege role. **`ACCOUNTADMIN` is strictly forbidden.** |
| `SNOWFLAKE_LOGIN_TIMEOUT` | No | `15` | Snowflake login handshake timeout in seconds. |
| `SNOWFLAKE_NETWORK_TIMEOUT`| No | `15` | Network socket timeout in seconds. |

### Credential Protection & Secret Governance
1. **Zero Client Exposure:** Snowflake variables are never prefixed with `VITE_` or returned through client API bundles.
2. **Git Exclusion:** `.env`, `.env.*`, and private keys are strictly excluded in both [/.gitignore](file:///Users/sohamghosh/RapiDChecK/.gitignore) and [/Health-AI-main/.gitignore](file:///Users/sohamghosh/RapiDChecK/Health-AI-main/.gitignore).
3. **Empty Template:** Blank configuration placeholders are provided in [.env.example](file:///Users/sohamghosh/RapiDChecK/.env.example) and [Health-AI-main/backend/.env.example](file:///Users/sohamghosh/RapiDChecK/Health-AI-main/backend/.env.example).
4. **Credential Masking:** [snowflake_client.py](file:///Users/sohamghosh/RapiDChecK/Health-AI-main/backend/snowflake_client.py) automatically strips passwords and tokens from string representations, logs, and sanitized error messages using regex redaction.

---

## 3. Dependency Installation & Environment

The Snowflake connection relies on two core packages:
- `snowflake-connector-python>=3.8.0`: High-performance official C-extension DB-API 2.0 driver.
- `snowflake-sqlalchemy>=1.5.0`: SQLAlchemy dialect enabling connection pooling, query compilation, and session lifecycle management.

To install dependencies within the backend virtual environment:

```bash
cd Health-AI-main/backend
source venv/bin/activate
pip install -r requirements.txt
```

---

## 4. Least-Privilege Role Setup (Snowflake Administrator)

Administrative role setup must be performed once by an administrator in Snowflake Web Worksheet before the application connects.

The setup script is located at:
[scripts/snowflake_setup_least_privilege.sql](file:///Users/sohamghosh/RapiDChecK/scripts/snowflake_setup_least_privilege.sql)

### Step-by-Step Setup SQL

```sql
USE ROLE ACCOUNTADMIN;

-- 1. Create the dedicated least-privilege role
CREATE ROLE IF NOT EXISTS RURALHEALTH_APP_ROLE
  COMMENT = 'Dedicated least-privilege role for RuralHealth AI application';

-- 2. Grant warehouse usage (COMPUTE_WH)
GRANT USAGE ON WAREHOUSE COMPUTE_WH TO ROLE RURALHEALTH_APP_ROLE;

-- 3. Grant database resolution usage (RURALHEALTH_DB)
GRANT USAGE ON DATABASE RURALHEALTH_DB TO ROLE RURALHEALTH_APP_ROLE;

-- 4. Grant schema usage (ANALYTICS)
GRANT USAGE ON SCHEMA RURALHEALTH_DB.ANALYTICS TO ROLE RURALHEALTH_APP_ROLE;

-- 5. Grant read-only access strictly to the verification test table
GRANT SELECT ON TABLE RURALHEALTH_DB.ANALYTICS.CONNECTION_TEST TO ROLE RURALHEALTH_APP_ROLE;

-- 6. Create dedicated service user
-- Replace '<SET_STRONG_PASSWORD_HERE>' with a high-entropy secret
CREATE USER IF NOT EXISTS RURALHEALTH_APP_USER
  PASSWORD = '<SET_STRONG_PASSWORD_HERE>'
  DEFAULT_ROLE = RURALHEALTH_APP_ROLE
  DEFAULT_WAREHOUSE = COMPUTE_WH
  DEFAULT_NAMESPACE = RURALHEALTH_DB.ANALYTICS
  MUST_CHANGE_PASSWORD = FALSE
  COMMENT = 'Service account for RuralHealth AI backend';

-- 7. Bind role to service user
GRANT ROLE RURALHEALTH_APP_ROLE TO USER RURALHEALTH_APP_USER;
```

---

## 5. Verification Diagnostic & Connection Testing

The connection test is strictly read-only and targets the synthetic verification table:
`RURALHEALTH_DB.ANALYTICS.CONNECTION_TEST`

### A. CLI Health Verification

```bash
cd Health-AI-main/backend
venv/bin/python -c "from snowflake_client import verify_snowflake_connection; import json; print(json.dumps(verify_snowflake_connection(), indent=2))"
```

**Expected Successful Output Shape:**
```json
{
  "snowflake_configured": true,
  "connection_status": "connected",
  "warehouse_status": "accessible",
  "role": "RURALHEALTH_APP_ROLE",
  "database": "RURALHEALTH_DB",
  "schema": "ANALYTICS",
  "warehouse": "COMPUTE_WH",
  "verification_query_status": "passed",
  "verification_record": {
    "test_id": "1",
    "test_message": "Synthetic test record",
    "created_at": "2026-10-17 12:00:00"
  },
  "error": null
}
```

### B. Automated Pytest Diagnostic Suite

The test suite validates missing credentials, mocked successes, error sanitization, and endpoint RBAC:

```bash
cd Health-AI-main/backend
venv/bin/pytest test_snowflake_connection.py -v
```

### C. Authenticated Diagnostic API Endpoint

An administrative diagnostic endpoint is exposed at:
`GET /api/admin/snowflake/test-connection`

- **Authorization:** Restricted strictly to `SYSTEM_ADMIN` role accounts via Bearer JWT.
- **Unauthenticated:** Returns `401 Unauthorized`.
- **Frontline/Doctor (`ASHA_WORKER`, `PHC_DOCTOR`):** Returns `403 Forbidden`.
- **System Admin (`SYSTEM_ADMIN`):** Executes verification query and returns sanitized status object.

---

## 6. Troubleshooting Common Errors

| Error Indicator / Code | Root Cause | Remediation |
|---|---|---|
| `250001: Incorrect username or password` | Credential mismatch or wrong account identifier. | Verify `SNOWFLAKE_USER` and `SNOWFLAKE_PASSWORD`. Check `SNOWFLAKE_ACCOUNT` format (e.g. `<org>-<account>`). |
| `390144: Role does not exist` | Role not created or not granted to user. | Run `GRANT ROLE RURALHEALTH_APP_ROLE TO USER <user>;` in Snowflake worksheet. |
| `390111: Warehouse does not exist` | Role lacks `USAGE` on warehouse or warehouse name mismatch. | Run `GRANT USAGE ON WAREHOUSE COMPUTE_WH TO ROLE RURALHEALTH_APP_ROLE;`. |
| `002003: Database does not exist` | Database name mismatch or missing `USAGE` grant. | Run `GRANT USAGE ON DATABASE RURALHEALTH_DB TO ROLE RURALHEALTH_APP_ROLE;`. |
| `002043: Object 'CONNECTION_TEST' does not exist` | Table missing from `ANALYTICS` schema or role lacks `SELECT`. | Run `GRANT SELECT ON TABLE RURALHEALTH_DB.ANALYTICS.CONNECTION_TEST TO ROLE RURALHEALTH_APP_ROLE;`. |
| `Security policy violation: ACCOUNTADMIN role` | `SNOWFLAKE_ROLE=ACCOUNTADMIN` specified in `.env`. | Replace role in `.env` with `RURALHEALTH_APP_ROLE`. Routine backend operations must adhere to least-privilege. |
| `Connection timed out` | Outbound network egress blocked or invalid Snowflake account URL. | Verify network outbound HTTPS (port 443) connectivity to Snowflake cloud endpoint. |

---

## 7. Operational vs. Analytical Feature Mapping

| Application Feature | Active Database Engine | Storage Location | Rationale |
|---|---|---|---|
| Patient Registration & Demographics | SQLite / PostgreSQL | `patients` table | Sub-second writes, facility routing, offline Dexie outbox sync. |
| Clinical Risk Scoring & Symptoms | SQLite / PostgreSQL | `assessments` table | Deterministic scoring runtime, low-latency doctor reviews. |
| Frontline Teleconsultation Booking | SQLite / PostgreSQL | `appointments` table | Scheduling state machine, immediate patient confirmation. |
| Frontline Worker & Doctor Accounts | SQLite / PostgreSQL | `users` table | High-frequency password hashing and login authentication. |
| Clinician Override & Attestation | SQLite / PostgreSQL | `clinical_reviews` | Cryptographic HMAC signature persistence and audit verification. |
| Monotonic Outbox Push/Pull Sync | SQLite / PostgreSQL | `sync_journal`, `idempotency_log` | Monotonic integer sequence ordering for offline reconciliation. |
| Clinical Guidance Guidelines | SQLite / PostgreSQL | `health_resources` tables | Versioned content caching for offline clinic availability. |
| **Population Health Indicators** | **Snowflake (Candidate)** | `fact_health_indicator` | Multi-dimensional aggregation across 14 fiscal years. |
| **District Epidemiology Trends** | **Snowflake (Candidate)** | `dim_district`, `dim_indicator` | Cross-district comparative analytics and longitudinal reporting. |
| **NFHS-5 Survey Benchmarking** | **Snowflake (Candidate)** | `dim_time`, `dim_source` | Heavy star-schema analytical join queries. |

---

## 8. Migration Risks & Architectural Considerations

1. **Snowflake Constraints are Informational:**
   Unlike SQLite and PostgreSQL, Snowflake does **not enforce** `PRIMARY KEY` or `UNIQUE` constraints during data loading. Fact deduplication must be enforced by the backend ingestion pipeline prior to issuing `COPY INTO` or `INSERT` statements.
2. **Cold Start & Warehouse Resume Latency:**
   Snowflake auto-suspends inactive virtual warehouses after a configured period (e.g., 5 minutes) to conserve credits. The first query after suspension incurs a 2–6 second warehouse resume latency. Diagnostic and analytical endpoints should account for this behavior without failing prematurely.
3. **ETL Pipeline Strategy:**
   Rather than dual-writing transactional patient records on every clinical assessment, the recommended future pattern is an **asynchronous batch synchronization or CDC (Change Data Capture)** pipeline that periodically extracts de-identified epidemiological summaries into `RURALHEALTH_DB.STAGING` and transforms them into `RURALHEALTH_DB.ANALYTICS`.
