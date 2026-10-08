# RapiDChecK - RuralHealth AI 🏥🤖
> **Clinically Governed, Offline-First Disease Triage & Rural Health Access Platform**  
> Built for ASHA/ANM Frontline Workers, Primary Health Centre (PHC) Medical Officers, and District Health Authorities across India.

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-336791.svg?style=flat&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![React](https://img.shields.io/badge/React-19.0+-61DAFB.svg?style=flat&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-3178C6.svg?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Dexie.js](https://img.shields.io/badge/Dexie.js-v4.0_IndexedDB-2C8EBB.svg?style=flat)](https://dexie.org/)
[![Scikit-Learn](https://img.shields.io/badge/scikit--learn-ML_Engine-F7931E.svg?style=flat&logo=scikit-learn&logoColor=white)](https://scikit-learn.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose_HA-2496ED.svg?style=flat&logo=docker&logoColor=white)](https://www.docker.com/)

---

## 🌟 Executive Summary

**RapiDChecK / RuralHealth AI** solves the healthcare delivery bottleneck in remote, low-connectivity rural regions. In areas with intermittent power, scarce internet, and severe specialist shortages, the platform empowers grassroots community health workers (ASHA/ANM workers) to conduct structured clinical risk triage at the patient's doorstep.

### Authoritative Architecture Flow:
$$\text{Patient Registration} \longrightarrow \text{Vitals \& Symptom Intake} \longrightarrow \text{Deterministic Safety Engine} \longrightarrow \text{Durable Local Outbox} \longrightarrow \text{Authenticated Sync (OCC + Idempotency)} \longrightarrow \text{PostgreSQL 16} \longrightarrow \text{Clinician Review \& HMAC Attestation}$$

---

## 📚 Detailed Documentation Hub

For in-depth architectural and technical specifications, refer to our comprehensive documentation modules:

| Document | Description | Key Topics Covered |
|---|---|---|
| [**`docs/PROJECT.md`**](docs/PROJECT.md) | **Master Engineering & System Architecture** | Component topology, directory structure, Docker Compose stack, CI/CD validation gates. |
| [**`docs/DATABASE.md`**](docs/DATABASE.md) | **Database Architecture & Schema Specification** | PostgreSQL 16 engine enforcement, connection pooling, full relational schemas, Alembic migrations, ETL migration pipeline. |
| [**`docs/AUTH.md`**](docs/AUTH.md) | **Authentication, RBAC & Cryptographic Attestation** | PBKDF2-HMAC-SHA256 (600k iter), JWT claims, fine-grained RBAC matrix, facility isolation, HMAC-SHA256 attestation, 23 adversarial tests. |
| [**`docs/FEATURE.md`**](docs/FEATURE.md) | **Features, Capabilities & Clinical Engine** | Dexie v4 outbox, 20 offline failure scenarios, 10/10 golden vectors, ML disease classifier, clinician review queue, voice dictation. |
| [**`docs/validation/`**](docs/validation/) | **Production Validation Records & Test Artifacts** | Baseline runtime report, requirements-to-test matrix, live validation records, and machine-readable JSON artifacts. |

---

## 🚀 Key Core Capabilities

### 1. 📴 Offline-First Durability & Outbox Queue
- **Zero-Connectivity Field Operation:** Full screening capabilities on mobile/tablet devices via **IndexedDB (Dexie v4)**.
- **Single-Transaction Atomicity:** Domain records and outbox queue entries are committed together in a single atomic transaction.
- **20 Offline Failure Scenarios (`TEST-OFF-001` – `TEST-OFF-020`):** Survives network drops during sync, server timeouts after commit, process crashes, and duplicate burst retransmissions with 0% data loss.
- **Two-Device Concurrent Mutation:** Preserves non-conflicting field edits via 3-way merge and prevents silent overwrites via Optimistic Concurrency Control (OCC `409 Conflict`).

### 2. 🩺 Clinically Governed Triage & Safety Engine
- **No Silent Defaulting:** Missing vital signs never default to normal values; absent vitals explicitly trigger `uncertainty_state="INSUFFICIENT_DATA"` and `risk_score=None`.
- **Deterministic Emergency Short-Circuit:** Acute conditions (hypertensive crisis, suspected acute coronary syndrome, diabetic emergencies, active TB hemoptysis) instantly trigger `triage_state="EMERGENCY"`, `is_emergency=1`, and mandatory doctor review.
- **Cross-Platform Golden Vector Equivalence:** 10/10 multi-condition golden vectors match identically across Python backend and TypeScript client.
- **Informational ML Disease Classifier:** Trained on Kaggle Disease & Symptoms Dataset (189,647 records, 328 symptom features, 512 classes) achieving **95.24% Top-3 Accuracy**. Strict safety guardrails ensure ML cannot override safety rules or downgrade emergencies.

### 3. 🔐 Production Security, RBAC & Server Attestation
- **Cryptographic Password Hashing:** PBKDF2-HMAC-SHA256 with 600,000 iterations and unique 16-byte salts.
- **JWT Claims Verification:** Validates `sub`, `role`, `facility_id`, `iss`, `aud`, and `exp`.
- **Enforced RBAC Matrix:** Frontline workers cannot perform clinical reviews or overrides (`403 Forbidden`).
- **Multi-Tenant Facility Isolation:** Medical officers are strictly confined to their registered facility boundaries.
- **Server-Side Cryptographic Attestation (HMAC-SHA256):** Seals doctor review decisions over canonical payloads (`review_id|assessment_id|reviewer_id|decision|timestamp|override_reason|workflow_version|ruleset_version`). Tampering with any parameter immediately invalidates verification.

### 4. 🗣️ Multilingual Voice Dictation & Telemedicine
- **Regional Languages:** Instant UI localization in **English**, **Hindi (हिंदी)**, and **Bengali (বাংলা)**.
- **Speech-to-Text:** Hands-free symptom input powered by the **Web Speech API** supporting Indian regional accents (`hi-IN`, `bn-IN`, `en-IN`).
- **Smart Hospital Locator:** Dual-engine mapping with **Google Maps Platform** and automated fallback to **OpenStreetMap / Nominatim**.
- **Teleconsultation Scheduling:** Direct booking of specialist teleconsultations into PHC doctor calendars.

---

## 🛠️ Technology Stack

```
┌──────────────────────────────────────────────────────────────────────────┐
│ FRONTEND: React 19 • TypeScript 5.9 • Vite 6 • Tailwind CSS 4 • Dexie v4 │
├──────────────────────────────────────────────────────────────────────────┤
│ BACKEND:  FastAPI 0.115+ • Python 3.11 • SQLAlchemy 2.0 • PyJWT • Pytest │
├──────────────────────────────────────────────────────────────────────────┤
│ DATABASE: PostgreSQL 16 Alpine (Production) • SQLite 3 (Testing Fixtures)│
├──────────────────────────────────────────────────────────────────────────┤
│ DEPLOY:   Docker Compose • NGINX Reverse Proxy • Multi-Stage Containers │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## ⚡ Quick Start & Development Setup

### Option A: Complete Docker Compose Stack (Recommended for Production)
```powershell
# 1. Clone the repository
git clone https://github.com/your-org/Health-AI.git
cd Health-AI

# 2. Configure environment variables
cp Health-AI-main/backend/.env.example Health-AI-main/backend/.env

# 3. Launch all containers (PostgreSQL 16, Backend, Frontend)
docker-compose up -d --build

# 4. Access the application
# Frontend UI:   http://localhost
# Backend API:   http://localhost:8000
# API Docs:      http://localhost:8000/docs
```

### Option B: Local Development Setup

#### 1. Backend Setup (FastAPI & Python 3.11)
```powershell
cd Health-AI-main/backend

# Create and activate virtual environment
python -m venv venv
.\venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run backend development server
uvicorn main:app --reload --port 8000
```

#### 2. Frontend Setup (React & Vite)
```powershell
cd Health-AI-main/frontend

# Install dependencies
npm install

# Start Vite dev server
npm run dev
```

---

## 🧪 Comprehensive Automated Test Execution

Run the complete 58-test production verification suite:
```powershell
cd Health-AI-main/backend

# Execute all backend tests
pytest test_clinical_safety.py test_golden_vectors.py test_sync_v2.py test_auth_review.py test_adversarial_security.py -v
```

### Verified Test Results:
- **`test_clinical_safety.py`:** 11/11 Passed (Red flags, uncertainty, vital defaults)
- **`test_golden_vectors.py`:** 10/10 Passed (Cross-platform canonical vector equivalence)
- **`test_sync_v2.py`:** 5/5 Passed (Idempotency, OCC conflict detection, tombstones, pull pagination)
- **`test_auth_review.py`:** 9/9 Passed (PBKDF2 hashing, JWT login, review queue, attestation)
- **`test_adversarial_security.py`:** 23/23 Passed (AUTH-001–009, RBAC-001–005, REV-001–009, ATT-001–009, DB-001–007)
- **Grand Total:** **58 / 58 Tests Passed (100% Pass Rate)**

---

## 📊 Default Development & Pilot Credentials

> *Note: These credentials are seeded automatically for development and pilot testing environments. In production, rotate all passwords immediately.*

| Role | Username | Default Password | Assigned Facility | Permissions Summary |
|---|---|---|---|---|
| **System Admin** | `admin` | `admin123` | `FAC_MAIN` | Full administrative control, user management, system config. |
| **PHC Doctor** | `dr.sharma` | `doctor123` | `PHC_RAMPUR` | Review pending triage queue, perform clinical reviews, clinical overrides. |
| **ASHA Worker** | `anita.asha` | `asha123` | `PHC_RAMPUR` | Patient registration, vital intake, offline screening, sync push/pull. |
| **District Officer**| `officer.verma` | `officer123` | `DISTRICT_HQ` | High-level disease analytics, referral monitoring, audit log inspection. |

---

## 📄 License & Ethical Medical Governance

This project is licensed under the **MIT License**.

> **Clinical Disclaimer:** RapiDChecK / RuralHealth AI is a clinical decision-support and triage platform designed for qualified frontline health workers and medical officers. It does not replace professional clinical judgement or laboratory diagnostics. All high-risk and emergency screenings mandate authoritative clinical review and medical officer signoff.
