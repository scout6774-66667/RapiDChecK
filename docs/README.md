# RapiDChecK Documentation Hub

Welcome to the comprehensive technical documentation for **RapiDChecK — RuralHealth AI**.

This documentation suite covers system architecture, clinical governance invariants, security policies, API contracts, database schemas, offline synchronization, and deployment workflows.

---

## 📚 Core Documentation Index

| Document | Topic | Description |
|---|---|---|
| [PROJECT.md](PROJECT.md) | Project Overview | Mission, problem statement, high-level features, and technology stack |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System Architecture | Architectural blueprints, component hierarchy, dataflows, and Mermaid diagrams |
| [CLINICAL_GOVERNANCE.md](CLINICAL_GOVERNANCE.md) | Clinical Safety Rules | Missing vitals gating, emergency short-circuits, and golden vector parity |
| [AUTH.md](AUTH.md) | Auth & RBAC | PBKDF2 password hashing, JWT specifications, role permissions, and session lifecycles |
| [DATABASE.md](DATABASE.md) | Database & Schemas | PostgreSQL/SQLite schemas, foreign keys, migrations, and connection pooling |
| [FEATURE.md](FEATURE.md) | Feature Specification | Offline Outbox, symptom triage, teleconsultation, and referral state machines |
| [API.md](API.md) | REST API Contracts | Detailed request/response payloads, error codes, and endpoint documentation |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Deployment & DevOps | Docker Compose, environment configuration, NGINX reverse proxy, and monitoring |
| [SECURITY.md](SECURITY.md) | Security Architecture | Adversarial attack mitigations, cryptographic attestation, and data confidentiality |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Developer Guide | Local environment setup, test commands, scripts, and debugging tips |
| [SYSTEM_ARCHITECTURE_AND_SPECIFICATION.md](SYSTEM_ARCHITECTURE_AND_SPECIFICATION.md) | Master Specification | 100-page consolidated master specification (RC v2.0.0-PROD) |
| [SNOWFLAKE_INTEGRATION.md](SNOWFLAKE_INTEGRATION.md) | Analytics Warehouse | Cloud Snowflake connection, star schemas, and anonymized population analytics |

---

## 🧪 Validation & Test Artifacts

* [validation/VALIDATION_RECORD.md](validation/VALIDATION_RECORD.md) — Production verification evidence and test results.
* [validation/requirements-test-matrix.md](validation/requirements-test-matrix.md) — Requirement-to-test mapping matrix.
* [validation/baseline.md](validation/baseline.md) — Verification baseline test logs.
* [PHASE1_SECURITY_AUDIT.md](PHASE1_SECURITY_AUDIT.md) — Phase 1 adversarial and security penetration test results.
* [PHASE3_SCREENING_REFERRAL_AUDIT.md](PHASE3_SCREENING_REFERRAL_AUDIT.md) — Phase 3 clinical referral state machine audit.
* [PHASE4_RELIABILITY_AUDIT.md](PHASE4_RELIABILITY_AUDIT.md) — Phase 4 data reliability, tombstone, and OCC audit.
* [PHASE4_DELETION_VERIFICATION.md](PHASE4_DELETION_VERIFICATION.md) — Soft-deletion cascade and non-resurrection verification.
