# RuralHealth AI (RapiDChecK) — Phase 1 Security Audit & Policy Inventory

**Document Version:** 1.0.0  
**Phase:** Phase 1: Authentication, Authorization & Security Hardening  
**Target Repository:** `sohamghosh1762-max/RapiDChecK`  
**Application Directory:** `Health-AI-main/`  
**Scope:** Backend FastAPI, Frontend React/TypeScript, SQLite/PostgreSQL Database Layer, JWT Authentication, RBAC, Tenant Isolation, HMAC Clinical Attestations, and Offline Sync Engine.

---

## 1. Executive Summary

RuralHealth AI is an offline-first community healthcare screening and referral decision-support platform operating across rural Primary Health Centres (PHCs) and Sub-Centres. Frontline Accredited Social Health Activists (ASHAs) collect patient vitals and symptoms offline in remote villages, while PHC doctors review clinical queues, override risk determinations when clinically indicated, and issue verifiable digital attestations.

A comprehensive, code-level security audit was conducted on the application codebase. The audit uncovered critical authentication, authorization, multi-tenant isolation, configuration, and offline sync vulnerabilities. All confirmed vulnerabilities have been systematically remediated with minimal compatible changes, and verified using an adversarial test suite of 41 targeted security tests alongside 51 functional and clinical safety tests (92 passing tests in total).

---

## 2. API Route & Security Inventory

The table below catalogs every registered route in the backend, documenting authentication requirements, RBAC roles and permissions, multi-tenant facility scope, resource ownership rules, sensitive data handled, abuse considerations, and automated test coverage.

| Method | Route Path | Auth Required | Required Role / Permission | Facility / District Scope | Resource Ownership | Sensitive Data Handled | Abuse / Rate-Limit Controls | Test Identifiers |
|---|---|---|---|---|---|---|---|---|
| `GET` | `/api/health` | No | Genuine Public | Global | None | Service status, runtime environment mode | Monitored | Baseline |
| `POST` | `/api/v2/auth/login` | No | Public Authentication | Global | Authenticated user | Plaintext credentials in, JWT Bearer tokens out | 5 attempts / 5-min lockout per user | `BRUTE-001`, `AUTH-001`, `AUTH-002` |
| `POST` | `/api/v2/auth/register` | Yes | `SYSTEM_ADMIN` / `admin:manage_users` | Global | New administrative user | User account records, hashed credentials | Administrative audit trail | `RBAC-006` |
| `GET` | `/api/v2/auth/me` | Yes | Authenticated (`*`) | Assigned Facility | Own profile (`user.id`) | Role, assigned facility, license number, villages | Bearer token validation | `AUTH-005` |
| `GET` | `/api/v2/auth/users` | Yes | `SYSTEM_ADMIN` / `admin:manage_users` | Global | System-wide directory | User names, emails, roles, facility assignments | Administrative audit trail | `RBAC-006` |
| `POST` | `/api/patients` | Yes | `ASHA_WORKER`, `PHC_DOCTOR`, `SYSTEM_ADMIN` / `patients:create` | Assigned Facility (`user.facility_id`) | Facility tenancy enforced | Patient PII (Name, Age, Gender, Village, Phone, National Health ID) | Validated schema; server-assigned facility | `AUTH-010`, `FAC-003`, `test_sync_v2` |
| `GET` | `/api/patients` | Yes | `patients:read` | Assigned Facility | Facility-filtered query | List of patient demographic records | Database query filter (`facility_id`) | `FAC-006`, `AUTH-010` |
| `GET` | `/api/patients/{id}` | Yes | `patients:read` | Assigned Facility | Object-level tenancy | Individual patient record | 403 Forbidden on foreign facility access | `FAC-001`, `FAC-006` |
| `PUT` | `/api/patients/{id}` | Yes | `patients:update` | Assigned Facility | Object-level tenancy | Patient demographics mutation | 403 Forbidden on foreign facility access | `FAC-002` |
| `DELETE` | `/api/patients/{id}` | Yes | `patients:delete` | Assigned Facility | Object-level tenancy | Soft-deletion / tombstone creation | 403 Forbidden on foreign facility access | `test_sync_v2` |
| `POST` | `/api/assess` | Yes | `assessments:create` | Assigned Facility | Patient + Assessment tenancy | Vitals (BP, HR, Glucose), Symptoms, Clinical triage score | Validated physiological ranges; deterministic triage | `FAC-003`, `test_clinical_safety` |
| `GET` | `/api/assessments` | Yes | `assessments:read` | Assigned Facility | Facility-filtered query | Clinical assessment history | Database query filter (`facility_id`) | `AUTH-010` |
| `GET` | `/api/assessments/{id}` | Yes | `assessments:read` | Assigned Facility | Object-level tenancy | Assessment vitals, triage risk, referral status | 403 Forbidden on foreign facility access | `FAC-003` |
| `PUT` | `/api/assessments/{id}/referral` | Yes | `referrals:update` | Assigned Facility | Object-level tenancy | Referral status, destination facility | 403 Forbidden on foreign facility access | `FAC-003`, `test_auth_review` |
| `POST` | `/api/appointments` | Yes | `appointments:create` | Assigned Facility | Patient tenancy | Appointment date, clinical department, priority | Tenant isolation on patient lookup | `test_phase1` |
| `GET` | `/api/appointments` | Yes | `appointments:read` | Assigned Facility | Facility-filtered query | Active appointment schedules | Database query filter (`facility_id`) | `test_phase1` |
| `PATCH` | `/api/appointments/{id}/status`| Yes | `appointments:manage` | Assigned Facility | Object-level tenancy | Scheduled status (COMPLETED, CANCELLED) | 403 Forbidden on foreign facility access | `test_phase1` |
| `PATCH` | `/api/appointments/{id}` | Yes | `appointments:manage` | Assigned Facility | Object-level tenancy | Appointment rescheduling | 403 Forbidden on foreign facility access | `test_phase1` |
| `DELETE` | `/api/appointments/{id}` | Yes | `appointments:delete` | Assigned Facility | Object-level tenancy | Appointment cancellation tombstone | 403 Forbidden on foreign facility access | `test_phase1` |
| `POST` | `/api/sync` | Yes | `sync:push` | Assigned Facility | Frontline batch sync | Bulk patient and assessment operations | Max batch size 100; user facility enforced | `SYNC-001`, `SYNC-003` |
| `POST` | `/api/v2/sync/push` | Yes | `sync:push` | Assigned Facility | Object-level tenancy per op | Outbox transactions (CREATE, UPDATE, DELETE) | Max batch size 100; per-op OCC version check; rejects cross-facility | `SYNC-001`, `SYNC-002`, `SYNC-003`, `test_sync_v2` |
| `POST` / `GET` | `/api/v2/sync/pull` | Yes | `sync:pull` | Assigned Facility | Journal cursor | Incremental server journal changes | Max limit 200; journal cursor sequence validation | `SYNC-001`, `test_sync_v2` |
| `GET` | `/api/dashboard/stats` | Yes | `analytics:view` (Doctor/Officer/Admin) | Assigned Facility / District | Role-scoped aggregate | Aggregate disease prevalence and triage counts | Frontline ASHAs rejected (403); doctor scoped to facility | `RBAC-007`, `FAC-005` |
| `GET` | `/api/v2/dashboard/phc` | Yes | `analytics:view` (Doctor/Officer/Admin) | Assigned Facility / District | Facility-scoped analytics | Facility review backlog, high-risk counts | Frontline ASHAs rejected (403); doctor scoped to facility | `RBAC-007`, `FAC-005` |
| `GET` | `/api/v2/reviews/pending` | Yes | `reviews:view_queue` (`PHC_DOCTOR`, `SYSTEM_ADMIN`) | Assigned Facility | Facility review queue | Unreviewed high-risk and emergency assessments | Frontline ASHAs & District Officers blocked (403) | `RBAC-001`, `RBAC-003`, `FAC-004` |
| `POST` | `/api/v2/reviews/{id}/assign` | Yes | `reviews:perform` (`PHC_DOCTOR`, `SYSTEM_ADMIN`) | Assigned Facility | Object-level tenancy | Doctor assignment to pending review | 403 Forbidden if doctor facility != assessment facility | `FAC-004`, `test_auth_review` |
| `POST` | `/api/v2/reviews/{id}/submit` | Yes | `reviews:perform` (`PHC_DOCTOR`, `SYSTEM_ADMIN`) | Assigned Facility | Object-level tenancy | Clinical decisions, override reasons, HMAC attestation | Mandatory reason validation; emergency downgrade safety gate | `REV-001`–`REV-006`, `ATT-001`–`ATT-009` |
| `GET` | `/api/v2/reviews/{id}/history` | Yes | `reviews:perform`, `reviews:view_queue` | Assigned Facility | Object-level tenancy | Attestation signatures, reviewer timestamps | Cryptographic signature re-verification (`integrity_verified`) | `ATT-001`, `FAC-004` |
| `POST` | `/api/ai/chat` | Yes | Authenticated (`*`) | Assigned Facility | Ephemeral prompt | De-identified clinical consultation query | Regex PII scrubbing; non-fabricating offline 503 fallback | `test_phase2_reliability` |
| `POST` | `/api/chat` (Legacy) | Yes | Authenticated (`*`) | Assigned Facility | Ephemeral prompt | De-identified clinical consultation query | Regex PII scrubbing; delegates to AI service | `test_phase2_reliability` |
| `GET` | `/api/ai/ollama/health` | No | Public / Frontline | Global | Runtime state | AI runtime connectivity status | Monitored | `test_phase2_reliability` |
| `POST` | `/api/ml/predict` | No | Public / Frontline | Global | Model feature vector | Symptom classification softmax outputs | Normalized inputs; decision support only | `test_predictor`, `test_risk_scoring` |
| `POST` | `/api/ml/hybrid-predict` | No | Public / Frontline | Global | Model feature vector | ML + Google Search consensus | Input validation | Baseline |
| `POST` | `/api/ml/gemini-predict` | No | Public / Frontline | Global | Model feature vector | LLM differential diagnosis | Monitored | Baseline |
| `GET` | `/api/hospitals/search` | No | Public / Frontline | Global | Directory lookup | Health facility coordinates, specialized capabilities | Query validation | `test_risk_scoring` |
| `POST` | `/api/hospitals/recommend` | No | Public / Frontline | Global | Clinical condition & risk score | Capability-aware hospital recommendation & ICU priority | Risk score bounds validation | `test_risk_scoring` |
| `GET` | `/api/hospitals/recommend` | No | Public / Frontline | Global | Clinical condition & risk score | Capability-aware hospital recommendation & ICU priority | Query parameter validation | `test_risk_scoring` |
| `GET` | `/api/ml/population-health` | No | Public / Frontline | Global | Aggregate HMIS / NFHS data | Population domain summaries for district & year | Read-only aggregate; no identifiable PII | `test_population_api` |
| `GET` | `/api/ml/population-health/trends` | No | Public / Frontline | Global | Aggregate HMIS / NFHS data | Annual time series for Recharts graphs | Read-only aggregate; no identifiable PII | `test_population_api` |
| `GET` | `/api/ml/population-health/indicator-trend` | No | Public / Frontline | Global | Aggregate HMIS / NFHS data | Indicator CAGR and direction | Read-only aggregate; no identifiable PII | `test_population_api` |
| `GET` | `/api/ml/population-health/ncd-context` | No | Public / Frontline | Global | Aggregate HMIS / NFHS data | NCD burden indicators (BP, Glucose, Tobacco) | Read-only aggregate; no identifiable PII | `test_population_api` |
| `GET` | `/api/ml/population-health/data-quality` | No | Public / Frontline | Global | Pipeline monitoring | Data quality report (orphan facts, leakage audit) | Read-only system audit | `test_population_api` |
| `GET` | `/api/ml/population-health/dictionary` | No | Public / Frontline | Global | Feature provenance | Curated feature dictionary metadata | Read-only feature catalog | `test_population_api` |
| `GET` | `/api/ml/population-health/snowflake/metadata` | No | Public / Frontline | Global | Warehouse architecture | Dimension and fact statistics | Read-only schema summary | `test_snowflake_schema` |
| `GET` | `/api/ml/population-health/snowflake/query` | No | Public / Frontline | Global | Multidimensional facts | Normalized relational query against Snowflake fact table | Read-only query; limit max 100 | `test_snowflake_schema` |
| `POST` | `/api/ml/population-health/enrich-screening` | No | Public / Frontline | Global | De-identified screening vitals | Population-level risk context enrichment | Safety boundary: dataset never overrides patient vitals | `test_population_api` |
| `GET` | `/api/v2/health-resources` | No | Public / Frontline | Global | Governed library | Published clinical guidelines | Filtered by status (`PUBLISHED` only) | `test_health_resources` |
| `POST` | `/api/v2/health-resources/recommend` | Yes | Authenticated (`*`) | Assigned Facility | Patient context | Context-matched clinical guidelines | Safety-gated emergency overrides | `test_resource_recommendation` |
| `POST` | `/api/v2/admin/health-resources` | Yes | `PHC_DOCTOR`, `SYSTEM_ADMIN` / `resources:write` | Global | Draft author | Guideline drafts | Frontline ASHAs rejected (403) | `test_resource_security` |
| `POST` | `/api/v2/admin/health-resources/{id}/publish` | Yes | `PHC_DOCTOR`, `SYSTEM_ADMIN` / `resources:publish` | Global | Reviewer signature | Attestation hash, publication version | Frontline ASHAs rejected (403); immutable versioning | `test_resource_security` |
| `POST` | `/api/v2/admin/health-resources/{id}/revoke` | Yes | `SYSTEM_ADMIN` / `resources:admin` | Global | Admin action | Mandatory revocation justification | Non-admins rejected (403); sync journal recorded | `test_resource_security` |

---

## 3. Confirmed Vulnerabilities and Implemented Remediations

### Vulnerability 1: Hardcoded Authentication Bypass / Backdoor Fallback
- **Severity:** CRITICAL (CVSS 9.8)
- **Confirmed Location:** `Health-AI-main/backend/auth_service.py` (`get_current_user`)
- **Finding:** In the original implementation, when an incoming request omitted the `Authorization` header or provided an invalid token, `get_current_user` silently caught exceptions or checked for absence, and defaulted to fetching or synthesizing user `dr.sharma` with `role="PHC_DOCTOR"` and assigned facility `"PHC-01"`. This completely nullified authentication, giving unauthenticated attackers full clinical review and triage privileges.
- **Remediation:** Removed the backdoor entirely. `get_current_user` now enforces strict Bearer token parsing and raises `401 Unauthorized` (`WWW-Authenticate: Bearer`) for missing, malformed, or invalid tokens. In addition, user status is validated against the active database (`user.is_active == 1`).
- **Verification:** Tested by `AUTH-010`, `AUTH-011`, and `AUTH-012` (all passing).

### Vulnerability 2: Insecure Direct Object References (IDOR) & Cross-Facility Tenancy Leakage
- **Severity:** HIGH (CVSS 8.5)
- **Confirmed Location:** `Health-AI-main/backend/main.py` (`/api/patients/{id}`, `/api/assessments/{id}`, `/api/dashboard/stats`, `/api/v2/reviews/{id}/assign`)
- **Finding:** Routes accepted `patient_id` or `assessment_id` as URL parameters and returned or modified database entities without confirming whether the requesting user's assigned facility matched the entity's `facility_id`. Doctors and ASHAs from Facility A could view and modify confidential patient records and clinical assessments belonging to Facility B.
- **Remediation:** Object-level authorization checks were added to all patient, assessment, referral, and appointment endpoints. If `current_user.facility_id` differs from `record.facility_id` and the user is not a `SYSTEM_ADMIN`, the backend immediately raises `HTTP 403 Forbidden` (`Detail: "Access denied: Patient belongs to facility '...' while user belongs to '...'"`). Furthermore, listing and search queries enforce `filter(PatientModel.facility_id == current_user.facility_id)` directly in the SQL statement.
- **Verification:** Tested by `FAC-001`, `FAC-002`, `FAC-003`, `FAC-004`, `FAC-005`, and `FAC-006` (all passing).

### Vulnerability 3: Privilege Escalation via Client-Supplied Roles and Client-Side Fallback
- **Severity:** HIGH (CVSS 8.2)
- **Confirmed Location:** `Health-AI-main/frontend/src/auth/AuthContext.tsx`
- **Finding:** In the frontend, if the backend returned an error (e.g. 401 or 403), the frontend fallback mechanism automatically synthesized a local mock session with whatever role was requested in the dropdown, allowing an unauthenticated user to interact with the UI as a doctor or administrator.
- **Remediation:** Frontend `login()` in `AuthContext.tsx` was hardened to strictly reject authentication and return `false` on any 400/401/403/429 backend response. Demo fallback is completely disabled in production mode (`import.meta.env.MODE === 'production'`). Backend routes now strictly verify roles against the cryptographically signed JWT payload and the authoritative `UserModel` database row.
- **Verification:** Tested by `RBAC-005` and `AUTH-001` (all passing).

### Vulnerability 4: Cross-Facility Mutation and Replay in Offline Sync Engine
- **Severity:** HIGH (CVSS 8.1)
- **Confirmed Location:** `Health-AI-main/backend/sync_service.py` (`apply_patient_operation`, `apply_assessment_operation`, `apply_referral_operation`, `apply_appointment_operation`)
- **Finding:** The sync endpoints `/api/v2/sync/push` accepted arbitrary batches of JSON operations from client devices without validating the authenticated user identity or facility scope of the operations. A compromised or misconfigured frontline tablet could push mutations claiming to be from a foreign facility. Furthermore, sync batches were unbounded in size.
- **Remediation:** 
  1. Enforced `current_user: UserModel = Depends(require_permissions("sync:push"))` on `/api/v2/sync/push` and `sync:pull`.
  2. Implemented batch size limits: `MAX_PUSH_BATCH_SIZE = 100` and `MAX_PULL_LIMIT = 200`. Requests exceeding limits are rejected with `HTTP 413 Payload Too Large`.
  3. Added object-level tenancy validation inside `sync_service.py`: On CREATE operations, frontline workers are restricted to their assigned `facility_id` (foreign client-supplied facility IDs are rejected). On UPDATE/DELETE operations, existing records are checked; cross-facility operations receive `status='REJECTED'` with error message `"Facility access violation"`.
- **Verification:** Tested by `SYNC-001`, `SYNC-002`, and `SYNC-003` (all passing).

### Vulnerability 5: Insecure Production JWT, HMAC, and CORS Configuration
- **Severity:** HIGH (CVSS 7.8)
- **Confirmed Location:** `Health-AI-main/backend/config.py` & `main.py`
- **Finding:** Default configuration used weak fallback secret keys (`"default_dev_jwt_secret_key"`, `"default_review_hmac_secret_key"`) and wildcard CORS (`allow_origins=["*"]`) with `allow_credentials=True`. If deployed in production without explicit environment variables, this would allow token forgery and credential theft via malicious third-party websites.
- **Remediation:** Added `validate_security_configuration(env)` in `config.py`. When `ENVIRONMENT == "production"`:
  1. It asserts `JWT_SECRET_KEY` is not default, not empty, and has at least 32 characters (or raises `RuntimeError` at application startup).
  2. It asserts `REVIEW_SECRET_KEY` is not default, not empty, and has at least 32 characters.
  3. It rejects wildcard `*` CORS origins when credentials are enabled, enforcing an explicit origin allowlist (`CORS_ORIGINS`).
- **Verification:** Tested by `CONFIG-001`, `CORS-001`, and `CORS-002` (all passing).

### Vulnerability 6: Missing Brute-Force Protection on Authentication Endpoint
- **Severity:** MEDIUM (CVSS 5.3)
- **Confirmed Location:** `Health-AI-main/backend/auth_service.py` & `main.py` (`/api/v2/auth/login`)
- **Finding:** The login endpoint permitted unlimited rapid guessing of user passwords without rate limiting or lockout protection.
- **Remediation:** Implemented in-memory sliding window lockout (`check_brute_force_lockout`, `record_login_failure`, `clear_login_failures`). If an account accumulates 5 consecutive failed attempts, further login attempts are locked out for 5 minutes with `HTTP 429 Too Many Requests`. Successful logins clear the failure counter.
- **Verification:** Tested by `BRUTE-001` (5 failures trigger 429; lockout clears on valid login).

### Vulnerability 7: Internal Information Disclosure via Unhandled Exceptions
- **Severity:** LOW (CVSS 4.3)
- **Confirmed Location:** `Health-AI-main/backend/main.py`
- **Finding:** Uncaught exceptions in route handlers could default to FastAPI's 500 handler, potentially leaking Python stack traces, internal database schema details, or filesystem paths to callers.
- **Remediation:** Registered a global exception handler (`@app.exception_handler(Exception)`) in `main.py` that intercepts all unhandled errors, logs them internally via Python's standard `logging` module, and returns a sanitized JSON response: `{"detail": "An internal server error occurred. Please contact the administrator."}`. Security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`) are attached to all responses.

---

## 4. Role-Based Access Control (RBAC) Specification

The system defines four authoritative roles stored in `UserModel.role` and validated server-side.

### Role Definitions & Permissions Matrix

| Permission | ASHA Worker (`ASHA_WORKER`) | PHC Doctor (`PHC_DOCTOR`) | District Officer (`DISTRICT_OFFICER`) | System Admin (`SYSTEM_ADMIN`) |
|---|---|---|---|---|
| `patients:create` | ✅ (Own facility) | ✅ (Own facility) | ❌ | ✅ (All facilities) |
| `patients:read` | ✅ (Own facility) | ✅ (Own facility) | ❌ (Identifiable PII restricted) | ✅ (All facilities) |
| `patients:update` | ✅ (Own facility) | ✅ (Own facility) | ❌ | ✅ (All facilities) |
| `patients:delete` | ❌ | ❌ | ❌ | ✅ (All facilities) |
| `assessments:create` | ✅ (Own facility) | ✅ (Own facility) | ❌ | ✅ (All facilities) |
| `assessments:read` | ✅ (Own facility) | ✅ (Own facility) | ❌ | ✅ (All facilities) |
| `reviews:view_queue` | ❌ | ✅ (Own facility) | ❌ | ✅ (All facilities) |
| `reviews:perform` | ❌ | ✅ (Own facility) | ❌ | ✅ (All facilities) |
| `reviews:override` | ❌ | ✅ (Own facility + reason) | ❌ | ✅ (All facilities) |
| `referrals:update` | ❌ | ✅ (Own facility) | ❌ | ✅ (All facilities) |
| `analytics:view` | ❌ | ✅ (Own facility only) | ✅ (District aggregate) | ✅ (System-wide) |
| `admin:manage_users` | ❌ | ❌ | ❌ | ✅ |
| `sync:push` | ✅ (Own facility) | ✅ (Own facility) | ❌ | ✅ |
| `sync:pull` | ✅ (Own facility) | ✅ (Own facility) | ❌ | ✅ |

### Least Privilege Architectural Guarantees
1. **Frontline ASHA Isolation:** Frontline workers cannot perform clinical reviews, approve or override diagnoses, access administrative user management, or query district-wide analytic dashboards.
2. **Clinical Doctor Scoping:** PHC doctors are restricted to their assigned facility (`PHC_DOCTOR.facility_id`). They cannot view or modify clinical queues or patient records of neighboring PHCs.
3. **District Officer Privacy Gate:** District officers have access only to aggregate, de-identified population analytics (`analytics:view`). They are forbidden from querying identifiable patient demographics, assessments, or review histories.
4. **Administrative Audit Compliance:** `SYSTEM_ADMIN` actions do not bypass cryptographic HMAC verification or audit journal persistence.

---

## 5. Cryptographic Attestation & Audit Trail Architecture

### HMAC-SHA256 Clinical Attestation
When a PHC doctor submits a clinical review for an assessment, the system generates an immutable cryptographic attestation using HMAC-SHA256:

1. **Canonical Payload Construction:** A deterministic JSON string is constructed containing sorted keys:
   ```json
   {
     "assessment_id": "...",
     "clinician_id": "usr_dr_sharma",
     "clinician_role": "PHC_DOCTOR",
     "decision": "APPROVED",
     "facility_id": "PHC_SONPUR",
     "notes": "ECG ordered. Emergency referral confirmed.",
     "override_reason": null,
     "timestamp": "2026-10-14T07:00:00Z"
   }
   ```
2. **Signature Computation:** The payload is hashed using `hmac.new(REVIEW_SECRET_KEY, canonical_bytes, hashlib.sha256).hexdigest()`.
3. **Storage & Verification:** The signature is stored in `ClinicalReviewModel.attestation_signature`. When fetching review history via `/api/v2/reviews/{id}/history`, the server recomputes the signature from canonical fields in constant time (`hmac.compare_digest`). If any field has been modified (decision, notes, doctor identity, timestamp), `integrity_verified` evaluates to `False`.
4. **Emergency Downgrade Governance:** If an assessment flagged an emergency red flag (e.g., suspected acute coronary syndrome or hypertensive crisis), the clinical rules engine strictly rejects any review downgrade to `LOW` or `NORMAL` unless the doctor explicitly supplies a documented `override_reason`.

### Audit Log Architecture
- Audited actions: Authentication failures, brute-force lockouts, patient creation/mutation/deletion, assessment recordings, review submissions, and administrative user creations.
- Captured attributes: Timestamp (UTC ISO-8601), actor ID, role, action, target entity type, target entity ID, outcome (`SUCCESS` / `FAILURE` / `REJECTED`), and client IP.
- Privacy preservation: Audit records **never** contain passwords, bearer tokens, HMAC secrets, or raw patient clinical vitals.
- Immutability: Audit log rows are append-only. The database schema does not expose update or delete endpoints for audit records.

---

## 6. Offline Synchronization Security

Frontline workers in remote villages utilize Dexie.js (IndexedDB) locally while offline. When connectivity is restored, the synchronization engine reconciles local changes with the central database:

1. **Authentication Requirement:** Both `/api/v2/sync/push` and `/api/v2/sync/pull` require an active, validated Bearer JWT.
2. **Tenancy Re-authorization:** The server never trusts client-asserted ownership or facility fields. If an ASHA worker assigned to `SC_SONPUR` submits a sync batch containing an operation for `SC_RAMPUR`, the server marks that operation `REJECTED` (`Facility access violation`) while processing valid operations in the batch.
3. **Idempotency & Replay Protection:** Each sync operation includes an `operation_id` (UUID). The server verifies the operation against `IdempotencyModel`. Replayed operations are recognized and return the cached `APPLIED` outcome without duplicate database mutation or duplicate journal entry creation.
4. **Optimistic Concurrency Control (OCC):** Updates verify `base_server_version`. If a record was modified concurrently on the server (`server_version > base_server_version`), the server rejects the operation with `status='CONFLICT'`, staging the conflict for clinician resolution.
5. **No Sensitive Cache Storage:** The frontend Service Worker (`vite-plugin-pwa`) explicitly excludes `/api/*` from HTTP runtime caching, preventing patient clinical records from residing unencrypted in browser Cache Storage.

---

## 7. Token Lifecycle, Logout Semantics & Revocation Guarantees

### Access-Token Architecture
- **Token Format:** Signed JSON Web Token (JWT) utilizing explicit HMAC-SHA256 (`HS256`).
- **Lifetime:** Configurable via `ACCESS_TOKEN_EXPIRE_MINUTES` in environment configuration (defaults to `1440` minutes / 24 hours).
- **Embedded Claims:** Token contains `sub` (unique user identifier), `username`, `role`, `facility_id`, `iss` (`rapidcheck.internal`), `aud` (`rapidcheck-clinical-workforce`), `iat`, and `exp`.
- **Stateless Validation:** Tokens are self-contained and cryptographically verified on incoming requests without requiring an external centralized session store for signature validation.

### Account Invalidation Guarantee
On every authenticated request, `get_current_user` extracts the `sub` claim and performs an authoritative query against `UserModel`:
1. If the user does not exist in the database, the token is rejected (`401 Unauthorized`).
2. If the user account has been disabled (`is_active = 0`), the token is immediately rejected (`401 Unauthorized: User account does not exist or is disabled`).
This guarantees that revoking or deactivating a clinician or worker account in the database immediately prevents further API access across all existing tokens without waiting for `exp` expiry.

### Immediate Token Revocation Limitations (Truthful Disclosure)
Because the platform currently uses stateless JWTs without a distributed denylist cache (such as Redis) or per-user token versioning columns (`token_version` on `UserModel` incremented on logout/password change), individual tokens issued to an active user remain cryptographically valid until their `exp` timestamp elapses.
- **Logout Semantics:** Logout in the current frontend is client-side: it purges the token and user profile from `localStorage` and memory.
- **Production Recommendation:** For enterprise multi-region deployments requiring instant per-session token revocation, implement a `token_version` sequence column in `UserModel` (validated during `get_current_user`) or a short token TTL (e.g. 15 minutes) with refresh token rotation.

---

## 8. Conclusion & Operational Guidance

All Phase 1 authentication, authorization, multi-tenant isolation, cryptographic attestation, and offline sync vulnerabilities have been remediated and verified with automated test suites.

### Operational Prerequisites for Production Deployment
1. **Rotate Production Secrets:** In production, set high-entropy 64-character random secrets for `JWT_SECRET_KEY` and `REVIEW_SECRET_KEY` via enterprise secret managers (e.g. HashiCorp Vault, AWS Secrets Manager, or Kubernetes Secrets).
2. **Enforce HTTPS / TLS 1.3:** Set `ENVIRONMENT=production` and terminate TLS at the reverse proxy (NGINX/Cloudflare) with HSTS headers enabled.
3. **Database Migration:** Use PostgreSQL with row-level security policies as the authoritative production database.
4. **Clinical Governance Review:** Conduct formal clinical validation of emergency triage decision trees prior to field deployment.
