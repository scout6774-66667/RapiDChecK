# Database Architecture & Production Schema Specification
**System:** RapiDChecK / RuralHealth AI  
**Authoritative Engine:** PostgreSQL 16+ (Production) | SQLite 3 (Isolated Testing / Development Fixtures)  
**ORM / Data Layer:** SQLAlchemy 2.0+ (Connection Pooling, Transactional OCC, Foreign Keys)  
**Migration Tooling:** Alembic & Automated ETL Migration Pipeline (`scripts/migrate_sqlite_to_postgres.py`)

---

## 1. Architectural Overview & Engine Enforcement

The authoritative production database for RapiDChecK / RuralHealth AI is **PostgreSQL 16**. SQLite is strictly confined to in-memory/local unit tests and lightweight fixtures, avoiding behavioral divergence.

```
                    ┌────────────────────────────────────────┐
                    │       FastAPI Production Backend       │
                    └───────────────────┬────────────────────┘
                                        │
                         SQLAlchemy 2.0 Connection Pool
                     (pool_size=10, max_overflow=20, pre-ping)
                                        │
                                        ▼
  ┌───────────────────────────────────────────────────────────────────────────┐
  │                           PostgreSQL 16 Engine                            │
  │  ┌───────────────────────┬───────────────────────┬─────────────────────┐  │
  │  │    Domain Entities    │   Identity & Review   │   Sync & Integrity  │  │
  │  ├───────────────────────┼───────────────────────┼─────────────────────┤  │
  │  │ • patients            │ • users               │ • sync_journal      │  │
  │  │ • assessments         │ • clinical_reviews    │ • idempotency_log   │  │
  │  │ • appointments        │ • audit_events        │ • sync_cursors      │  │
  │  └───────────────────────┴───────────────────────┴─────────────────────┘  │
  └───────────────────────────────────────────────────────────────────────────┘
```

### 1.1 Environment-Level Engine Enforcement
The backend configuration ([`backend/config.py`](file:///c:/Users/ABIR%20SAHA/Downloads/Health-AI-main/Health-AI-main/backend/config.py)) strictly enforces database engine compliance:
- When `ENVIRONMENT=production`: `DATABASE_URL` must be a valid PostgreSQL connection URI (e.g. `postgresql+psycopg2://...` or `postgresql+psycopg://...`).
- If `DATABASE_URL` is omitted or points to SQLite while in production mode, application startup immediately terminates with a fatal `RuntimeError`. Silent fallback to SQLite is completely prevented.
- `init_db()` executes an active database ping (`SELECT 1`) on FastAPI startup. If unreachable, the server fails fast.

---

## 2. Production Relational Schema

### 2.1 `users` Table
Stores authenticated frontline workers, medical officers, district administrators, and system admins.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `VARCHAR(64)` | `PRIMARY KEY` | Distributed UUID string. |
| `username` | `VARCHAR(100)` | `UNIQUE, NOT NULL, INDEX` | Unique login username. |
| `email` | `VARCHAR(255)` | `UNIQUE, NOT NULL, INDEX` | Unique email address. |
| `password_hash` | `TEXT` | `NOT NULL` | PBKDF2-HMAC-SHA256 (600,000 iterations). |
| `full_name` | `VARCHAR(255)` | `NOT NULL` | Clinician / worker display name. |
| `role` | `VARCHAR(50)` | `NOT NULL` | `ASHA_WORKER`, `PHC_DOCTOR`, `DISTRICT_OFFICER`, `SYSTEM_ADMIN`. |
| `license_number` | `VARCHAR(100)` | `NULLABLE` | State Medical Council registration ID (for doctors). |
| `facility_id` | `VARCHAR(100)` | `NULLABLE, INDEX` | Tenancy identifier (e.g. `PHC_NORTH`, `CHC_WEST`). |
| `assigned_villages_json` | `TEXT` | `DEFAULT '[]'` | JSON array of assigned village strings (for ASHA workers). |
| `is_active` | `INTEGER` | `NOT NULL, DEFAULT 1` | `1` = Active, `0` = Deactivated/Disabled. |
| `created_at` | `VARCHAR(50)` | `NOT NULL` | UTC ISO-8601 timestamp. |
| `last_login_at` | `VARCHAR(50)` | `NULLABLE` | UTC ISO-8601 timestamp updated post-auth. |

---

### 2.2 `patients` Table
Stores citizen demographic records with versioning and soft-delete capabilities.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `VARCHAR(64)` | `PRIMARY KEY, INDEX` | Distributed Patient UUID string. |
| `national_health_id` | `VARCHAR(100)` | `NULLABLE, INDEX` | ABHA / Ayushman Bharat Health Account ID. |
| `name` | `VARCHAR(255)` | `NOT NULL` | Full patient name. |
| `age` | `INTEGER` | `NOT NULL, CHECK (age >= 0)` | Patient age in years. |
| `gender` | `VARCHAR(20)` | `NOT NULL` | `Male`, `Female`, `Other`. |
| `village` | `VARCHAR(255)` | `NOT NULL, INDEX` | Village / habitation name. |
| `phone` | `VARCHAR(30)` | `NOT NULL` | Contact telephone / mobile number. |
| `facility_id` | `VARCHAR(100)` | `NULLABLE, INDEX` | Primary Health Centre tenancy boundary. |
| `server_version` | `INTEGER` | `NOT NULL, DEFAULT 1` | Monotonic entity version for Optimistic Concurrency Control. |
| `is_deleted` | `INTEGER` | `NOT NULL, DEFAULT 0` | Soft-delete tombstone flag (`1` = Tombstoned). |
| `created_at` | `VARCHAR(50)` | `NOT NULL` | Creation timestamp (UTC ISO-8601). |
| `updated_at` | `VARCHAR(50)` | `NOT NULL` | Last modification timestamp (UTC ISO-8601). |

---

### 2.3 `assessments` Table
Stores comprehensive clinical triage screenings, vital signs, deterministic risk scores, and review statuses.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `VARCHAR(64)` | `PRIMARY KEY, INDEX` | Distributed Assessment UUID. |
| `patient_id` | `VARCHAR(64)` | `FOREIGN KEY (patients.id), NOT NULL` | Cascade delete on patient removal. |
| `facility_id` | `VARCHAR(100)` | `NULLABLE, INDEX` | Facility tenancy boundary. |
| `client_operation_id` | `VARCHAR(64)` | `NULLABLE, INDEX` | Outbox operation UUID that generated assessment. |
| `symptoms_json` | `TEXT` | `DEFAULT '[]'` | JSON array of normalized symptom tokens. |
| `symptom_duration_days` | `INTEGER` | `NULLABLE` | Symptom duration in days. |
| `temperature_f` | `FLOAT` | `NULLABLE` | Body temperature in Fahrenheit. |
| `systolic_bp` | `INTEGER` | `NULLABLE` | Systolic blood pressure (mmHg). |
| `diastolic_bp` | `INTEGER` | `NULLABLE` | Diastolic blood pressure (mmHg). |
| `glucose_mg_dl` | `FLOAT` | `NULLABLE` | Blood glucose (mg/dL). |
| `heart_rate_bpm` | `INTEGER` | `NULLABLE` | Pulse rate in beats per minute. |
| `height_cm` | `FLOAT` | `NULLABLE` | Height in centimeters. |
| `weight_kg` | `FLOAT` | `NULLABLE` | Weight in kilograms. |
| `bmi` | `FLOAT` | `NULLABLE` | Calculated Body Mass Index ($kg/m^2$). |
| `smoking_status` | `VARCHAR(50)` | `DEFAULT 'Never'` | Tobacco usage profile. |
| `alcohol_status` | `VARCHAR(50)` | `DEFAULT 'Never'` | Alcohol consumption profile. |
| `physical_activity` | `VARCHAR(50)` | `DEFAULT 'Moderate'` | Activity level profile. |
| `family_history_json` | `TEXT` | `DEFAULT '[]'` | Family medical history tags. |
| `risk_level` | `VARCHAR(50)` | `NOT NULL, DEFAULT 'LOW'` | `LOW`, `MODERATE`, `HIGH`, `EMERGENCY`. |
| `triage_state` | `VARCHAR(50)` | `NOT NULL, DEFAULT 'LOW_RISK'` | `LOW_RISK`, `MODERATE_RISK`, `HIGH_RISK`, `EMERGENCY`. |
| `is_emergency` | `INTEGER` | `NOT NULL, DEFAULT 0` | Red-flag short-circuit flag (`1` = Acute emergency). |
| `red_flags_json` | `TEXT` | `DEFAULT '[]'` | Triggered emergency red-flag descriptions. |
| `uncertainty_state` | `VARCHAR(50)` | `NOT NULL, DEFAULT 'COMPLETE'` | `COMPLETE`, `INSUFFICIENT_DATA`, `INVALID_DATA`, `CONFLICTING_DATA`. |
| `risk_score` | `FLOAT` | `NULLABLE` | Composite numeric risk score (0.00 – 1.00). `NULL` on insufficient data. |
| `likely_conditions_json` | `TEXT` | `DEFAULT '[]'` | Top disease predictions with probabilities. |
| `contributing_factors_json` | `TEXT` | `DEFAULT '[]'` | Clinical explanations of risk drivers. |
| `recommended_action` | `TEXT` | `DEFAULT ''` | Clinical protocol guidance & next steps. |
| `referral_status` | `VARCHAR(50)` | `NOT NULL, DEFAULT 'NOT_REFERRED'` | `NOT_REFERRED`, `REFERRED`, `EMERGENCY_DISPATCH`, `COMPLETED`. |
| `workflow_version` | `VARCHAR(20)` | `NOT NULL, DEFAULT '2.0.0'` | Workflow definition version tag. |
| `ruleset_version` | `VARCHAR(20)` | `NOT NULL, DEFAULT '2.0.0'` | Clinical safety ruleset version tag. |
| `review_state` | `VARCHAR(50)` | `NOT NULL, DEFAULT 'NOT_REQUIRED', INDEX` | `NOT_REQUIRED`, `REVIEW_REQUIRED`, `ASSIGNED`, `IN_REVIEW`, `APPROVED`, `MODIFIED`, `REJECTED`. |
| `reviewed_by` | `VARCHAR(255)` | `NULLABLE` | Clinician name who conducted review. |
| `reviewed_at` | `VARCHAR(50)` | `NULLABLE` | Clinician review timestamp (UTC ISO-8601). |
| `server_version` | `INTEGER` | `NOT NULL, DEFAULT 1` | Monotonic version for OCC. |
| `is_deleted` | `INTEGER` | `NOT NULL, DEFAULT 0` | Soft-delete flag. |
| `created_at` | `VARCHAR(50)` | `NOT NULL` | Screening timestamp. |
| `updated_at` | `VARCHAR(50)` | `NOT NULL` | Modification timestamp. |

---

### 2.4 `clinical_reviews` Table
Stores immutable clinical reviews, override justifications, and server-side cryptographic attestation seals.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `VARCHAR(64)` | `PRIMARY KEY, INDEX` | Distributed Review UUID (`rev_...`). |
| `assessment_id` | `VARCHAR(64)` | `FOREIGN KEY (assessments.id), NOT NULL, INDEX` | Assessment reference. |
| `reviewer_user_id` | `VARCHAR(64)` | `FOREIGN KEY (users.id), NOT NULL, INDEX` | Medical officer user reference. |
| `reviewer_name` | `VARCHAR(255)` | `NOT NULL` | Doctor's full name. |
| `reviewer_role` | `VARCHAR(50)` | `NOT NULL` | Role (`PHC_DOCTOR`, `SYSTEM_ADMIN`). |
| `decision` | `VARCHAR(50)` | `NOT NULL` | `APPROVED`, `MODIFIED`, `REJECTED`. |
| `override_reason` | `TEXT` | `NULLABLE` | Mandatory justification when modifying/rejecting assessments. |
| `clinical_notes` | `TEXT` | `NOT NULL` | Mandatory clinical review observations ($\ge 5$ chars). |
| `previous_result_json` | `TEXT` | `NOT NULL` | Snapshot of assessment state prior to review. |
| `new_result_json` | `TEXT` | `NOT NULL` | Snapshot of assessment state after clinician decision. |
| `attestation_statement` | `TEXT` | `NOT NULL` | Legal medical responsibility statement. |
| `signature_hash` | `VARCHAR(128)` | `NOT NULL` | Server-Side Cryptographic Attestation (HMAC-SHA256). |
| `created_at` | `VARCHAR(50)` | `NOT NULL` | Review submission timestamp (UTC ISO-8601). |

---

### 2.5 `sync_journal` Table
Authoritative, monotonic, gapless change stream supporting bounded cursor-based client pull synchronization.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `server_sequence` | `INTEGER` | `PRIMARY KEY, AUTOINCREMENT, INDEX` | Monotonically ascending integer sequence. |
| `device_id` | `VARCHAR(64)` | `NULLABLE, INDEX` | Originating client device UUID. |
| `entity_type` | `VARCHAR(50)` | `NOT NULL, INDEX` | `patient`, `assessment`, `appointment`, `referral`, `review`. |
| `entity_id` | `VARCHAR(64)` | `NOT NULL, INDEX` | Target entity UUID. |
| `operation_type` | `VARCHAR(20)` | `NOT NULL` | `CREATE`, `UPDATE`, `DELETE`. |
| `payload_json` | `TEXT` | `NOT NULL` | Serialized entity payload representation. |
| `server_version` | `INTEGER` | `NOT NULL` | Entity version after mutation. |
| `created_at` | `VARCHAR(50)` | `NOT NULL` | Server journal commit timestamp. |

---

### 2.6 `idempotency_log` Table
Prevents duplicate executions from network retries, dropped ACKs, or concurrent client pushes.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `operation_id` | `VARCHAR(64)` | `PRIMARY KEY, INDEX` | Unique client operation UUID. |
| `device_id` | `VARCHAR(64)` | `NOT NULL, INDEX` | Originating client device identifier. |
| `client_sequence` | `INTEGER` | `NOT NULL` | Monotonic client sequence number. |
| `entity_type` | `VARCHAR(50)` | `NOT NULL` | `PATIENT`, `ASSESSMENT`, `APPOINTMENT`. |
| `entity_id` | `VARCHAR(64)` | `NOT NULL` | Target entity identifier. |
| `status` | `VARCHAR(50)` | `NOT NULL` | `APPLIED`, `DUPLICATE`, `CONFLICT`, `REJECTED`. |
| `server_version` | `INTEGER` | `NOT NULL` | Resulting entity server version. |
| `response_json` | `TEXT` | `NULLABLE` | Cached API response payload returned on idempotent retry. |
| `created_at` | `VARCHAR(50)` | `NOT NULL` | Registration timestamp. |

---

### 2.7 `audit_events` Table
Immutable, append-only security and clinical audit trail.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `VARCHAR(64)` | `PRIMARY KEY, INDEX` | Audit event UUID (`aud_...`). |
| `event_type` | `VARCHAR(100)` | `NOT NULL, INDEX` | e.g. `CLINICAL_REVIEW_SUBMITTED`, `SYNC_PUSH_APPLIED`. |
| `actor_user_id` | `VARCHAR(64)` | `NULLABLE, INDEX` | User UUID who initiated the action. |
| `actor_name` | `VARCHAR(255)` | `NULLABLE` | Actor display name. |
| `actor_role` | `VARCHAR(50)` | `NULLABLE` | Actor RBAC role. |
| `target_entity_type` | `VARCHAR(50)` | `NOT NULL` | Entity type affected. |
| `target_entity_id` | `VARCHAR(64)` | `NOT NULL` | Target entity identifier. |
| `details_json` | `TEXT` | `NULLABLE` | Structured event context metadata. |
| `device_id` | `VARCHAR(64)` | `NULLABLE` | Device identifier. |
| `ip_address` | `VARCHAR(64)` | `NULLABLE` | Client IP address. |
| `created_at` | `VARCHAR(50)` | `NOT NULL` | Audit record timestamp. |

---

## 3. Transaction Management & Atomicity Guarantees

Every authoritative server mutation is wrapped in an atomic database transaction:
$$\text{BEGIN} \longrightarrow \text{Idempotency Check} \longrightarrow \text{OCC Version Check} \longrightarrow \text{Domain Mutation} \longrightarrow \text{Sync Journal Insertion} \longrightarrow \text{Audit Log Insertion} \longrightarrow \text{COMMIT}$$

If any step fails (e.g. unique constraint violation, foreign key failure, or network drop), SQLAlchemy triggers an immediate `db.rollback()`. Zero partial mutations or phantom journal entries are persisted.

---

## 4. SQLite to PostgreSQL ETL Migration Pipeline

The script [`scripts/migrate_sqlite_to_postgres.py`](file:///c:/Users/ABIR%20SAHA/Downloads/Health-AI-main/scripts/migrate_sqlite_to_postgres.py) provides a verifiable data extraction, normalization, and loading pipeline:
1. **Extraction:** Reads source SQLite tables (`patients`, `assessments`, `appointments`, `users`).
2. **Transformation:** Validates UUID compliance, parses JSON metadata, normalizes timestamps, and tags unknown legacy rulesets with `ruleset_version="UNKNOWN_LEGACY"`.
3. **Loading:** Inserts records inside an atomic PostgreSQL transaction.
4. **Validation:** Executes exact row-count matching, foreign-key relationship verification, and produces an execution audit report at [`artifacts/migration-validation/report.json`](file:///c:/Users/ABIR%20SAHA/Downloads/Health-AI-main/artifacts/migration-validation/report.json).
