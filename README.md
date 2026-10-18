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
```

---

## ⚙️ Environment Variables Specification

### Frontend (`Health-AI-main/frontend/.env`)
| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_API_BASE_URL` | No | `""` (Empty) | Base URL for backend API requests. If empty, the frontend uses relative same-origin paths (`/api/...`) via Vite dev proxy or production reverse proxy. Never place private backend credentials or secrets in `VITE_` variables. |

### Backend (`Health-AI-main/backend/.env`)
| Variable | Required | Default | Description |
|---|---|---|---|
| `OLLAMA_BASE_URL` | No | `http://localhost:11434` | Base URL of the local Ollama LLM runtime. |
| `OLLAMA_MODEL` | No | `gemma3:270m` | Target local model name (Gemma 3 270M). |
| `DATABASE_URL` | No | `sqlite:///./ruralhealth.db` | Database connection string (PostgreSQL for production). |
| `JWT_SECRET_KEY` | Yes (Prod) | Auto-generated/Dev default | HMAC key for signing JWT tokens. |
| `JWT_ALGORITHM` | No | `HS256` | JWT signing algorithm. |
| `ATTESTATION_SECRET`| Yes (Prod) | Dev default | Secret key used for cryptographic attestation of clinical reviews. |

---

## ⚡ Quick Start & Development Setup

### 1. Local AI Runtime Setup (Ollama + Gemma 3 270M)
The AI Assistant runs locally without sending sensitive data to external third-party cloud APIs.
```bash
# 1. Install Ollama
# macOS: brew install ollama
# Linux: curl -fsSL https://ollama.com/install.sh | sh
# Windows: Download from https://ollama.com/download

# 2. Pull the Gemma 3 270M model
ollama pull gemma3:270m

# 3. Start the Ollama server (runs on port 11434)
ollama serve

# 4. Verify connectivity
curl http://localhost:11434/api/tags
```

### 2. Backend Setup (FastAPI & Python)
```bash
cd Health-AI-main/backend

# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate  # Windows: .\venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start backend server on port 8000
uvicorn main:app --reload --port 8000
```

### 3. Frontend Setup (React & Vite)
```bash
cd Health-AI-main/frontend

# Install dependencies
npm install

# Start Vite dev server (proxies /api to http://127.0.0.1:8000)
npm run dev
```

---

## 🌐 Production Reverse Proxy Configuration (NGINX)
For production deployments, the frontend does not require the browser to access developer localhost. Use an NGINX reverse proxy to serve frontend static assets and route `/api/` calls:

```nginx
server {
    listen 80;
    server_name ruralhealth.example.com;

    # Serve compiled React PWA assets
    location / {
        root /var/www/rapidcheck/dist;
        try_files $uri $uri/ /index.html;
    }

    # Proxy API calls to FastAPI backend
    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 🤖 AI Health Architecture & Clinical Governance

### Unified Pipeline
$$\text{React Frontend} \xrightarrow{\text{apiFetch()}} \text{FastAPI Backend (/api/ai/chat)} \xrightarrow{\text{httpx (Async)}} \text{Ollama Runtime} \longrightarrow \text{Gemma 3 270M}$$

- **Authoritative Endpoint:** `POST /api/ai/chat` (and streaming `POST /api/ai/chat/stream`). Legacy `/api/chat` routes through the same local Ollama service.
- **Connection States Handled:**
  - `Local AI connected` (Healthy local runtime with model ready)
  - `Connecting...` (Verifying backend & model connectivity)
  - `AI unavailable` (Ollama offline or model not loaded; triggers user-friendly explanation and retry)
  - `Response generation failed` (Inference timeout or malformed reply with retry action)
- **Data Privacy & Sanitization:** Frontline queries undergo automated PII scrubbing (masking names, phone numbers, ABHA IDs, and email addresses) before reaching the LLM prompt. Full prompts and patient IDs are never logged.
- **Clinical Governance Boundaries:** Gemma 3 is purely assistive for health education and workflow hints. It cannot calculate, override, or downgrade authoritative clinical risk scores, emergency red-flag rules, or referral criteria.

---

## 📴 Offline Data Protection & PWA Cache Architecture

1. **Elimination of Generic Service Worker API Caching:**
   - Generic `/api/` caching in Workbox `runtimeCaching` has been completely disabled in `vite.config.ts`.
   - Browser Cache Storage persists ONLY public static assets (application JS/CSS bundles, CDN scripts, Google fonts, geocoding maps).
2. **Security Headers Middleware:**
   - All backend `/api/` endpoints return `Cache-Control: no-store, no-cache, must-revalidate, private` and `Pragma: no-cache` to ensure browser and proxy caches never persist sensitive records.
3. **Isolated Dexie / IndexedDB Storage:**
   - Supported offline patients, screenings, and appointments reside exclusively in IndexedDB (`db.patients`, `db.assessments`, `db.outbox`), completely isolated from static asset caches.
4. **Device-Level Protection Note:**
   - While browser storage isolation protects against generic cache leakage, multi-user shared frontline mobile tablets must also enforce OS-level screen locks, user session logout, and device storage encryption (e.g., Android FBE or iOS Data Protection).

---

## 🧪 Comprehensive Automated Test Execution

### Backend Tests (92 Tests Total)
```bash
cd Health-AI-main/backend
./venv/bin/pytest -v
```
**Verified Backend Test Coverage:**
- `test_phase2_reliability.py`: 7/7 Passed (PII sanitization, Ollama offline resiliency, timeout recovery, health status, security headers, endpoint delegation)
- `test_clinical_safety.py`: 11/11 Passed (Red flags, uncertainty states, vital defaults)
- `test_golden_vectors.py`: 10/10 Passed (Canonical vector equivalence)
- `test_sync_v2.py`: 5/5 Passed (Idempotency, OCC conflict detection, tombstones, pagination)
- `test_auth_review.py`: 9/9 Passed (PBKDF2 hashing, JWT login, review queue, attestation)
- `test_adversarial_security.py`: 23/23 Passed (Adversarial attack mitigations)
- `test_health_resources.py`: 7/7 Passed (Resource search, categories, listings)
- `test_resource_recommendation.py`: 7/7 Passed (Emergency safety gates, clinical condition matching)
- `test_resource_security.py`: 5/5 Passed (RBAC enforcement on health resources)
- `test_resource_versioning.py`: 3/3 Passed (Resource attestation and lifecycle)
- `ml/test_predictor.py`: 5/5 Passed (Scikit-learn multi-class model classification)
- **Total Backend:** **92 / 92 Passed (100% Pass Rate)**

### Frontend Tests & Build
```bash
cd Health-AI-main/frontend

# 1. TypeScript compilation check
npm run typecheck

# 2. Production build & service worker generation
npm run build

# 3. Phase 2 frontend integration & privacy test
npm run test:phase2

# 4. Outbox & persistence test suite (51 checks)
npm run test:outbox

# 5. Golden vectors suite (10 vectors)
npm run test:golden

# 6. Client sync engine unit tests (36 checks)
npx tsx test_task005_task006_sync.js
```

---

## ⚠️ Known Limitations & Outstanding Phase 1 Dependencies

- **Phase 1 Security Remediation Pending:**
  - Default development credentials (`admin`, `dr.sharma`, `anita.asha`) exist for local testing and must be rotated prior to real patient deployment.
  - Production database migration from SQLite fixture to secured, hardened PostgreSQL with automated backup and SSL connection strings is scheduled for Phase 1 remediation.
  - Multi-user device-level session isolation and biometric tablet unlock depend on native device policies outside the PWA sandbox.
- **Local AI Hardware Requirements:**
  - Gemma 3 270M requires ~1.5 GB RAM and standard CPU execution via Ollama. If Ollama is stopped, the application degrades gracefully: screening, offline sync, patient directories, and clinician reviews continue operating normally without interruption.

---

## 📊 Default Development Credentials

> *Note: Seeded for development and staging verification only. Rotate before production.*

| Role | Username | Default Password | Assigned Facility |
|---|---|---|---|
| **System Admin** | `admin` | `admin123` | `FAC_MAIN` |
| **PHC Doctor** | `dr.sharma` | `doctor123` | `PHC_RAMPUR` |
| **ASHA Worker** | `anita.asha` | `asha123` | `PHC_RAMPUR` |
| **District Officer** | `officer.verma` | `officer123` | `DISTRICT_HQ` |

---

## 📄 License & Ethical Medical Governance

This project is licensed under the **MIT License**.

> **Clinical Disclaimer:** RapiDChecK / RuralHealth AI is a clinical decision-support and triage platform designed for qualified frontline health workers and medical officers. It does not replace professional clinical judgement or laboratory diagnostics. All high-risk and emergency screenings mandate authoritative clinical review and medical officer signoff.
