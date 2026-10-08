# Project Master Architecture & Engineering Guide
**Project:** RapiDChecK / RuralHealth AI 🏥🤖  
**Target Environment:** Rural & Remote Primary Health Centres (PHCs), Community Health Centres (CHCs), Sub-Centres across India  
**Target Personas:** ASHA / ANM Frontline Workers, Medical Officers (PHC Doctors), District Health Officers, System Administrators

---

## 1. System Topology & Architecture

RapiDChecK is architected as an **offline-first, distributed, clinically governed health screening and triage platform**. It combines lightweight edge computing on frontline mobile/tablet devices with a centralized, authoritative PostgreSQL-backed server.

```
                    ┌────────────────────────────────────────┐
                    │      Field Devices (ASHA / ANM)        │
                    │   • Progressive Web App (React 19)     │
                    │   • Durable Dexie v4 Outbox (IndexedDB)│
                    │   • Local Deterministic Ruleset Engine │
                    └───────────────────┬────────────────────┘
                                        │
                         Bidirectional Sync API (JSON/HTTP)
                    • POST /api/v2/sync/push (Idempotent, OCC)
                    • POST /api/v2/sync/pull (Cursor Bounded)
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Primary Health Centre (PHC) Server                    │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                        FastAPI Application Core                     │   │
│   │  • Auth Service (PBKDF2-HMAC-SHA256, JWT HS256, Claims Validation)  │   │
│   │  • RBAC & Multi-Tenant Facility Isolation Boundary                  │   │
│   │  • Deterministic Clinical Safety & Red-Flag Short-Circuit Engine    │   │
│   │  • Informational ML Disease Classifier (Logistic Regression L-BFGS) │   │
│   │  • Clinician Review State Machine & Server Attestation (HMAC-SHA256)│   │
│   │  • Monotonic Sync Journal & Cursor Management                       │   │
│   └──────────────────────────────────┬──────────────────────────────────┘   │
│                                      │                                      │
│                        SQLAlchemy 2.0 Connection Pool                       │
│                                      │                                      │
│                                      ▼                                      │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                       PostgreSQL 16 Engine                          │   │
│   │  • Domain Entities (patients, assessments, appointments)            │   │
│   │  • Governance & Security (users, clinical_reviews, audit_events)    │   │
│   │  • Distributed Integrity (sync_journal, idempotency_log)            │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Directory Structure & Repository Layout

```
Health-AI-main/
├── backend/                         # FastAPI Production Backend
│   ├── alembic/                     # Database migration definitions
│   ├── auth_service.py              # PBKDF2 hashing, JWT lifecycle, RBAC matrix
│   ├── config.py                    # Environment validation (PostgreSQL enforcement)
│   ├── database.py                  # SQLAlchemy engine, connection pool, ORM schemas
│   ├── main.py                      # FastAPI routes, middleware, lifecycle events
│   ├── ml_engine.py                 # Deterministic safety rules & ML classifier
│   ├── review_service.py            # Clinician review workflow & HMAC attestation
│   ├── schemas.py                   # Pydantic v2 schemas & request/response contracts
│   ├── sync_service.py              # Push/pull synchronization, idempotency, OCC
│   ├── test_adversarial_security.py # AUTH-001–009, RBAC-001–005, ATT-001–009, DB-001–007
│   ├── test_auth_review.py          # Clinician review lifecycle & attestation tests
│   ├── test_clinical_safety.py      # Red flags, uncertainty & vital defaulting tests
│   ├── test_golden_vectors.py       # Cross-platform golden vector tests (10/10)
│   └── test_sync_v2.py              # Push, pull, OCC, and tombstone sync tests
│
├── frontend/                        # React 19 + TypeScript + Vite PWA
│   ├── public/                      # Static assets, PWA icons, manifest.json
│   ├── src/
│   │   ├── auth/                    # AuthContext, Login, RoleSelector (dev-only)
│   │   ├── components/              # UI components, VitalsForm, SymptomSelector
│   │   ├── clinical/                # TypeScript offline evaluator & ruleset engine
│   │   ├── pages/                   # PatientRegistration, Screening, DoctorReviewQueue
│   │   ├── offlineDb.ts             # Dexie v4 schema, atomic outbox transactions
│   │   └── sync/                    # SyncService, auto-sync worker, network listener
│   ├── test_golden_vectors.js       # Client-side golden vector test suite
│   ├── test_task004_outbox.js       # Outbox atomic persistence & recovery test suite
│   └── generate_offline_validation_report.py # 20 offline failure-injection runner
│
├── clinical-rules/                  # Versioned Canonical Clinical Rulesets
│   └── v2.0.0/
│       ├── ruleset.json             # Canonical thresholds, weights, red flags
│       └── golden_test_vectors.json # 10 multi-condition canonical test vectors
│
├── artifacts/                       # Machine-Readable Verification Records
│   ├── auth-validation/report.json
│   ├── clinical-validation/report.json
│   ├── concurrency-validation/report.json
│   ├── golden-vectors/report.json
│   ├── migration-validation/report.json
│   ├── offline-validation/report.json
│   ├── postgres-validation/report.json
│   ├── security-validation/report.json
│   └── sync-validation/report.json
│
├── docs/                            # Comprehensive Documentation
│   ├── DATABASE.md                  # Relational schema, indexes, constraints, migrations
│   ├── PROJECT.md                   # Master engineering architecture guide
│   ├── AUTH.md                      # Auth, RBAC, HMAC attestation, adversarial matrix
│   ├── FEATURE.md                   # Features, offline outbox, golden vectors, reviews
│   └── validation/                  # Baseline, matrix, and validation records
│
├── scripts/                         # Operational & Migration Utilities
│   ├── generate_all_artifacts.py    # Automated test artifact generator
│   └── migrate_sqlite_to_postgres.py# SQLite to PostgreSQL ETL pipeline
│
├── docker-compose.yml               # Multi-container orchestration stack
└── README.md                        # Master repository README
```

---

## 3. Core Processing Pipelines

### 3.1 Clinical Safety & Triage Pipeline
1. **Input Normalization:** Vital signs and symptoms are validated. Absent vitals default to strict `None`.
2. **Deterministic Red-Flag Short-Circuit:** Emergency conditions (SBP $\ge 180$, DBP $\ge 120$, acute chest pain + dyspnea, blood glucose $\ge 300$ or $\le 54$) instantly short-circuit execution to `triage_state="EMERGENCY"`, `is_emergency=1`, and `review_state="REVIEW_REQUIRED"`.
3. **Uncertainty Quantification:** Detects missing or contradictory inputs, categorizing into `INSUFFICIENT_DATA`, `INVALID_DATA`, or `CONFLICTING_DATA`.
4. **Deterministic Multi-Domain Ruleset:** Evaluates cardiovascular, diabetic, respiratory, and general risks against versioned ruleset `v2.0.0`.
5. **Informational ML Classification:** Scikit-learn Logistic Regression (328 symptom features, 512 disease classes) generates top-3 disease likelihoods (informational only; cannot downgrade emergencies).
6. **Provenance Tagging:** Result stamped with `workflow_version="2.0.0"`, `ruleset_version="2.0.0"`, and timestamp.

### 3.2 Offline-First Outbox Synchronization Pipeline
1. **Atomic Local Mutation:** Frontline worker saves patient/assessment $\rightarrow$ Dexie transaction commits entity + outbox record with monotonic `client_sequence`.
2. **Network Reconnection:** Sync worker detects connectivity $\rightarrow$ reads unacknowledged outbox operations ordered by sequence.
3. **Authenticated Push (`POST /api/v2/sync/push`):** Backend validates JWT claims $\rightarrow$ checks `idempotency_log` $\rightarrow$ verifies OCC `base_server_version` $\rightarrow$ mutates PostgreSQL $\rightarrow$ appends monotonic `sync_journal` entry $\rightarrow$ writes immutable `audit_events` $\rightarrow$ returns ACK.
4. **Client ACK & Pruning:** Client marks outbox record as acknowledged.
5. **Cursor Pull (`POST /api/v2/sync/pull`):** Client requests journal entries after `since_cursor` $\rightarrow$ applies remote updates locally $\rightarrow$ updates local sync cursor.

---

## 4. Production Deployment with Docker Compose

The complete production candidate stack is orchestrated via [`docker-compose.yml`](file:///c:/Users/ABIR%20SAHA/Downloads/Health-AI-main/docker-compose.yml):

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: rapidcheck_postgres
    environment:
      POSTGRES_DB: rapidcheck_db
      POSTGRES_USER: rapidcheck_user
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-rapidcheck_secure_prod_password_2026}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U rapidcheck_user -d rapidcheck_db"]
      interval: 5s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: ./Health-AI-main/backend
      dockerfile: Dockerfile
    container_name: rapidcheck_backend
    environment:
      ENVIRONMENT: production
      DATABASE_URL: postgresql+psycopg2://rapidcheck_user:${POSTGRES_PASSWORD:-rapidcheck_secure_prod_password_2026}@postgres:5432/rapidcheck_db
      JWT_SECRET_KEY: ${JWT_SECRET_KEY}
      HMAC_SECRET_KEY: ${HMAC_SECRET_KEY}
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "8000:8000"

  frontend:
    build:
      context: ./Health-AI-main/frontend
      dockerfile: Dockerfile
    container_name: rapidcheck_frontend
    ports:
      - "80:80"
    depends_on:
      - backend

volumes:
  postgres_data:
```

### Launch Commands:
```powershell
# 1. Start all production containers
docker-compose up -d --build

# 2. Verify container health
docker-compose ps

# 3. View backend logs
docker-compose logs -f backend
```

---

## 5. Production Readiness Quality Gates

| Gate | Category | Description | Verification Criterion | Status |
|---|---|---|---|---|
| **Gate A** | PostgreSQL | Authoritative database connectivity | Mandatory PG in prod; connection pooling verified | **PASS** |
| **Gate B** | Clinical Safety | Deterministic triage & emergency short-circuit | 10/10 Golden Vectors match; zero silent vitals defaulting | **PASS** |
| **Gate C** | Offline Durability | IndexedDB outbox resilience | 20/20 Offline failure injection scenarios pass | **PASS** |
| **Gate D** | Distributed Sync | Idempotency, OCC, tombstones | Zero duplicate effects; OCC 409 on stale edits | **PASS** |
| **Gate E** | Security & RBAC | JWT validation, role boundaries, facility isolation | 23/23 Adversarial security tests pass | **PASS** |
| **Gate F** | Audit & Governance | Clinician reviews & attestation | Sealed HMAC-SHA256 attestations with tamper detection | **PASS** |
| **Gate G** | Data Migration | SQLite to PostgreSQL ETL pipeline | 100% row match; foreign key verification | **PASS** |
