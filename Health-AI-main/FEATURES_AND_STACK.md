# RuralHealth AI / RapiDChecK - Features & Tech Stack Specification
**Target Environment:** Rural & Remote Primary Health Centres (PHCs), Sub-Centres, Community Health Centres across India  
**Target Personas:** ASHA / ANM Frontline Workers, PHC Medical Officers, District Health Officers, System Administrators  
**Production Status:** Verified Production Candidate (`58/58 Tests Passed, 100% Pass Rate`)

---

## 1. What This Platform Does

**RapiDChecK / RuralHealth AI** is an offline-first, clinically governed, AI-assisted health screening and triage platform. It enables community health workers (ASHA/ANM workers) to register patients, record vitals, evaluate multi-domain risk tiers deterministically at the patient's doorstep, and synchronize seamlessly with Primary Health Centre (PHC) doctors and authoritative PostgreSQL servers upon network restoration.

### Authoritative End-to-End Workflow:
$$\text{Patient Registration} \longrightarrow \text{Vitals/Symptom Intake} \longrightarrow \text{Deterministic Safety Engine} \longrightarrow \text{Durable Local Outbox} \longrightarrow \text{Authenticated Push Sync} \longrightarrow \text{PostgreSQL 16} \longrightarrow \text{Doctor Review Queue} \longrightarrow \text{HMAC Attestation}$$

---

## 2. Production Implemented Feature Set

### 📴 Module 1: Offline-First Durability & Bidirectional Sync Engine
- **Zero-Internet Operability:** Full field screening operability on mobile and tablet devices using **IndexedDB (Dexie v4)**.
- **Atomic Single-Transaction Outbox:** Mutations save the domain entity (`patients`, `assessments`, `appointments`) and an outbox record (`sync_outbox`) in a single atomic transaction with ascending `client_sequence` numbers.
- **Idempotent Push API (`POST /api/v2/sync/push`):** Unique `operation_id` index prevents duplicate writes during network retries or timeouts; cached responses are returned idempotently.
- **Optimistic Concurrency Control (OCC):** Atomic version check updates (`server_version = server_version + 1 WHERE server_version = :base_version`) prevent silent overwrites and emit `409 Conflict`.
- **Soft-Delete Tombstones:** Record deletions create durable tombstones (`is_deleted=1`), preventing stale client data from resurrecting deleted entities.
- **Monotonic Sync Journal & Pull (`POST /api/v2/sync/pull`):** Monotonically ascending `server_sequence` journal stream supports bounded cursor pagination and delta synchronizations.
- **20 Offline Failure-Injection Scenarios:** Verified against `TEST-OFF-001` through `TEST-OFF-020` (network cuts during push, server timeout after commit, crash restart, duplicate batch replay).
- **Two-Device Concurrency Simulation:** 3-way semantic merge preserves non-conflicting field updates; OCC guards conflicting edits.

---

### 🩺 Module 2: Deterministic Clinical Safety & Red-Flag Triage Engine
- **Vital Defaulting Elimination:** Omitted vital signs strictly default to `None` / `null`. Missing vitals cannot silently appear normal.
- **Explicit Uncertainty States:** Classifies screenings into `COMPLETE`, `INSUFFICIENT_DATA` (unrecorded vitals), `INVALID_DATA` (out-of-range physiological values), or `CONFLICTING_DATA`.
- **Deterministic Red-Flag Short-Circuiting:** Immediate escalation to `triage_state="EMERGENCY"`, `is_emergency=1`, and `review_state="REVIEW_REQUIRED"` for:
  - **Hypertensive Crisis:** SBP $\ge 180 \text{ mmHg}$ or DBP $\ge 120 \text{ mmHg}$.
  - **Suspected Acute Coronary Syndrome:** Acute chest pain with shortness of breath.
  - **Diabetic Hyperglycemic Emergency:** Blood Glucose $\ge 300 \text{ mg/dL}$.
  - **Critical Hypoglycemia:** Blood Glucose $\le 54 \text{ mg/dL}$.
  - **Active TB Hemoptysis:** Coughing up blood.
- **Cross-Platform Golden Vector Equivalence:** 10 canonical multi-condition golden vectors pass with 100% equivalence across Python backend and TypeScript client.
- **Informational ML Disease Classifier:** Logistic Regression (L-BFGS) trained on Kaggle Disease & Symptoms Dataset (189,647 records, 328 symptom features, 512 classes) achieving **95.24% Top-3 Accuracy**. Strict guardrails ensure ML cannot override safety rules or approve reviews.

---

### 🔐 Module 3: Security, RBAC & Server Attestation
- **Cryptographic Password Hashing:** PBKDF2-HMAC-SHA256 with 600,000 iterations and unique 16-byte cryptographically secure salts.
- **JWT Authentication Lifecycle:** HS256 tokens validating `sub`, `username`, `role`, `facility_id`, `iss`, `aud`, and `exp`.
- **Enforced RBAC Permission Matrix:**
  - `ASHA_WORKER`: Patient registration, screening intake, sync push/pull. Review submission strictly blocked (`403 Forbidden`).
  - `PHC_DOCTOR`: Clinical review queue, review assignment, approval/modification submissions, clinical overrides.
  - `DISTRICT_OFFICER`: Aggregate population disease analytics, read-only audit log inspection.
  - `SYSTEM_ADMIN`: User management, tenant provisioning, system configuration.
- **Multi-Tenant Facility Isolation:** Enforces facility boundaries (`facility_id`), preventing doctors from reviewing assessments outside their jurisdiction.
- **Server-Side Cryptographic Attestation (HMAC-SHA256):** Deterministic canonical serialization seals doctor review decisions (`review_id|assessment_id|reviewer_id|decision|timestamp|override_reason|workflow_version|ruleset_version`). Tampering with any attribute causes verification failure.
- **23 Adversarial Attack Tests:** Verified against `AUTH-001–009`, `RBAC-001–005`, `REV-001–009`, `ATT-001–009`, and `DB-001–007`.

---

### 👨‍⚕️ Module 4: Clinician Review Queue & Governance State Machine
- **Review Lifecycle:** `REVIEW_REQUIRED` $\rightarrow$ `ASSIGNED` $\rightarrow$ `IN_REVIEW` $\rightarrow$ `APPROVED` | `MODIFIED` | `REJECTED`.
- **Mandatory Clinical Notes:** Observations ($\ge 5$ characters) are enforced by server validation.
- **Governed Override Justifications:** Modifying risk tier or downgrading an emergency requires an explicit justification code and notes.
- **Immutable Audit Logging:** Every review mutation persists a structured `AuditEventModel` record and a `sync_journal` entry in a single atomic transaction.

---

### 🗣️ Module 5: Multilingual Voice Dictation & Telemedicine
- **Regional Languages:** Interface available in **English**, **Hindi (हिंदी)**, and **Bengali (বাংলা)**.
- **Web Speech API:** Hands-free speech-to-text symptom intake with regional Indian accents (`hi-IN`, `bn-IN`, `en-IN`).
- **Smart Hospital Locator:** Geospatial facility finder using **Google Maps Platform** with automated fallback to **OpenStreetMap & Nominatim**.
- **Teleconsultation Booking:** Frontline workers schedule specialist teleconsultations directly into doctor calendars.

---

## 3. Technology Stack & Production Infrastructure

```
┌───────────────────────────────────────────────────────────────────────────┐
│ FRONTEND LAYER                                                            │
│ • Framework:      React 19.0.0 (Strict Mode, Hooks, Functional Components)│
│ • Language:       TypeScript 5.9.3 (Strict Type Checking)                 │
│ • Build Tool:     Vite 6.2.0 (ESM, Fast HMR, Production Rollup Bundler)   │
│ • Styling:        Tailwind CSS 4.0.0 (Responsive, Mobile-First)           │
│ • Offline DB:     Dexie.js v4.0.11 (IndexedDB Wrapper, Atomic Outbox)     │
│ • Icons & Charts: Lucide React, Recharts                                  │
├───────────────────────────────────────────────────────────────────────────┤
│ BACKEND APPLICATION LAYER                                                 │
│ • Framework:      FastAPI 0.115+ (ASGI, Async, Dependency Injection)      │
│ • Language:       Python 3.11.9                                           │
│ • Server Engine:  Uvicorn (High-performance ASGI Server)                  │
│ • Validation:     Pydantic v2 (Strict Request/Response Schemas)           │
│ • Security/Auth:  PyJWT (HS256 Claims Validation), PBKDF2-HMAC-SHA256     │
│ • ML Engine:      Scikit-Learn (Logistic Regression L-BFGS), NumPy, SciPy │
├───────────────────────────────────────────────────────────────────────────┤
│ DATABASE & PERSISTENCE LAYER                                              │
│ • Production DB:  PostgreSQL 16 Alpine (Connection Pooling, OCC, FKs)     │
│ • Testing DB:     SQLite 3 (Isolated In-Memory Unit Test Fixtures)        │
│ • ORM:            SQLAlchemy 2.0.48 (Declarative Mappings, Transactions)  │
│ • Migrations:     Alembic & Automated ETL Script                         │
├───────────────────────────────────────────────────────────────────────────┤
│ DEPLOYMENT & CONTAINERIZATION                                             │
│ • Orchestration:  Docker Compose (Multi-Container HA Stack)               │
│ • Web Server:     NGINX Reverse Proxy (Alpine, CSP Headers, SSL Ready)    │
└───────────────────────────────────────────────────────────────────────────┘
```
