# File Structure & Architecture Map
**Project:** RapiDChecK / RuralHealth AI  
**Production Status:** Production Candidate (`ab74f35`)

---

## 1. Project Root

```
Health-AI-main/
├── .gitignore                          <- Git ignore specifications
├── README.md                           <- Root project documentation hub & quickstart
├── docker-compose.yml                  <- Production multi-container orchestration stack
├── AGENTS.md                           <- Developer and AI coding agent guidelines
│
├── docs/                               <- Comprehensive Architecture & Engineering Hub
│   ├── DATABASE.md                     <- Relational schema, indexes, constraints, migrations
│   ├── PROJECT.md                      <- Master engineering architecture guide
│   ├── AUTH.md                         <- Auth, RBAC, HMAC attestation, adversarial matrix
│   ├── FEATURE.md                      <- Features, offline outbox, golden vectors, reviews
│   └── validation/                     <- Baseline, matrix, and validation records
│       ├── baseline.md                 <- Runtime environment package versions
│       ├── requirements-test-matrix.md <- 58 requirements mapped to tests and evidence
│       └── VALIDATION_RECORD.md        <- Findings 1–10 live execution audit records
│
├── artifacts/                          <- Machine-Readable Production Evidence Artifacts
│   ├── auth-validation/report.json     <- AUTH-001–009 test outputs & claims verification
│   ├── clinical-validation/report.json <- REV-001–009 review lifecycle & downgrade proofs
│   ├── concurrency-validation/report.json <- Two-device concurrent mutation logs
│   ├── golden-vectors/report.json      <- 10/10 cross-platform vector equivalence output
│   ├── migration-validation/report.json<- SQLite to PostgreSQL ETL execution results
│   ├── offline-validation/report.json  <- 20 offline failure-injection scenario results
│   ├── postgres-validation/report.json <- Connection pool, rollback, and OCC proofs
│   ├── security-validation/report.json <- RBAC & HMAC-SHA256 tamper detection records
│   └── sync-validation/report.json     <- Idempotency and cursor pull pagination logs
│
├── scripts/                            <- Automation & Verification Scripts
│   ├── generate_all_artifacts.py       <- Automated report generator for artifacts/
│   └── migrate_sqlite_to_postgres.py   <- SQLite to PostgreSQL ETL pipeline
│
├── clinical-rules/                     <- Canonical Versioned Clinical Rulesets
│   └── v2.0.0/
│       ├── ruleset.json                <- Canonical thresholds, weights, red flags
│       └── golden_test_vectors.json    <- 10 canonical multi-condition test vectors
│
├── Health-AI-main/
│   ├── FEATURES_AND_STACK.md           <- Implemented features & technology stack
│   ├── FILE_STRUCTURE.md               <- This architecture map
│   ├── PROJECT_AUDIT.md                <- Comprehensive project validation audit
│   ├── README.md                       <- Sub-project pointer README
│   │
│   ├── backend/                        <- FastAPI Production Backend
│   │   ├── Dockerfile                  <- Production container definition
│   │   ├── .env.example                <- Production environment template
│   │   ├── requirements.txt            <- Python dependencies
│   │   ├── config.py                   <- Environment validation (PostgreSQL enforcement)
│   │   ├── database.py                 <- SQLAlchemy models, connection pool, init_db()
│   │   ├── schemas.py                  <- Pydantic v2 validation models
│   │   ├── auth_service.py             <- PBKDF2 hashing, JWT lifecycle, RBAC matrix
│   │   ├── review_service.py           <- Clinician reviews & HMAC attestation
│   │   ├── ml_engine.py                <- Deterministic safety rules & ML integration
│   │   ├── sync_service.py             <- Push/pull sync, idempotency, OCC, journal
│   │   ├── main.py                     <- FastAPI routes & app entry point
│   │   │
│   │   ├── test_clinical_safety.py     <- Red flags & vital defaulting tests (11 tests)
│   │   ├── test_golden_vectors.py      <- Canonical vector equivalence tests (10 tests)
│   │   ├── test_sync_v2.py             <- Sync push, pull, OCC, tombstones (5 tests)
│   │   ├── test_auth_review.py         <- Review queue, submit & attestation (9 tests)
│   │   ├── test_adversarial_security.py<- AUTH, RBAC, REV, ATT, DB adversarial suite (23 tests)
│   │   │
│   │   └── ml/                         <- Machine Learning Artifacts & Training
│   │       ├── train_model.py          <- Preprocessing & training pipeline
│   │       ├── predictor.py            <- Singleton disease classifier inference
│   │       ├── test_predictor.py       <- Model inference unit tests
│   │       ├── test_api.py             <- Model endpoint API tests
│   │       ├── training_report.md      <- Classification metrics & feature weights
│   │       └── models/                 <- Serialized joblib classifiers & metadata
│   │
│   └── frontend/                       <- React 19 + TypeScript + Vite PWA
│       ├── Dockerfile                  <- Multi-stage container build
│       ├── nginx.conf                  <- Production NGINX reverse proxy
│       ├── package.json                <- NPM dependencies & scripts
│       ├── vite.config.ts              <- Vite build & PWA plugin config
│       ├── test_golden_vectors.js      <- Client-side golden vector test runner
│       ├── test_task004_outbox.js      <- Client-side atomic outbox test runner
│       ├── generate_offline_validation_report.py <- 20 failure scenario runner
│       │
│       └── src/
│           ├── main.tsx                <- React entry point
│           ├── App.tsx                 <- Root navigation & role-based routing
│           ├── db/
│           │   └── offlineDb.ts        <- Dexie v4 schema, atomic outbox transactions
│           ├── auth/
│           │   └── AuthContext.tsx     <- JWT storage, state, role switcher (dev)
│           ├── clinical/
│           │   ├── evaluator.ts        <- TypeScript offline ruleset evaluator
│           │   └── ruleset.ts          <- Versioned ruleset loader
│           ├── sync/
│           │   ├── syncService.ts      <- Push/pull sync engine & network listener
│           │   └── autoSyncWorker.ts   <- Heartbeat periodic sync worker
│           ├── components/             <- Modular UI components
│           │   ├── AshaScreeningFlow.tsx
│           │   ├── PhcDashboard.tsx
│           │   ├── PatientDirectory.tsx
│           │   ├── TeleconsultBooking.tsx
│           │   └── VoiceInputButton.tsx
│           └── services/               <- API clients & map integrations
```
