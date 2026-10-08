# System Baseline & Architecture Verification Record

- **Document Version:** 1.0.0
- **Verification Timestamp:** 2026-10-08T12:52:00+05:30
- **Base Git Commit:** `ab74f35` (`first commit`)
- **Baseline Git Tag:** `production-hardening-baseline`
- **Operating System:** Windows 11 (NT 10.0.26100)

---

## 1. Runtime & Package Dependencies

| Component | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Backend Runtime** | Python (CPython) | 3.11.9 | REST API & Clinical Safety Core |
| **API Framework** | FastAPI | 0.115.0+ / Starlette 0.46 | High-performance async/sync endpoints |
| **ORM / Relational DB** | SQLAlchemy | 2.0.35+ (SQLite / PostgreSQL ready) | Server-side entity state & sync journal |
| **Authentication** | PyJWT + standard PBKDF2 | 2.15.0 / PBKDF2-HMAC-SHA256 (600k iter) | Token-based auth & role authorization |
| **Frontend Runtime** | Node.js | v24.20.0 | Frontend build & test environment |
| **Package Manager** | npm | 11.19.0 | Client package management |
| **Client Framework** | React + TypeScript + Vite | React 19 / TypeScript 6 / Vite 8.2 | Frontline Clinical PWA |
| **Local Persistence** | Dexie.js (IndexedDB v4) | 4.0.11 | Durable local storage & outbox queue |
| **Service Worker** | Workbox + Vite PWA | Workbox 7.3 / Vite-PWA 1.3 | Offline application caching |

---

## 2. Boundaries & Architectural Structure

### Backend (`Health-AI-main/backend/`)
- `main.py`: FastAPI route handlers, CORS middleware, startup user seeding.
- `database.py`: SQLAlchemy models (`PatientModel`, `AssessmentModel`, `AppointmentModel`, `UserModel`, `ClinicalReviewModel`, `SyncJournalModel`, `IdempotencyModel`, `AuditEventModel`).
- `schemas.py`: Pydantic models for validation, clinical evaluation, auth, review, and bidirectional sync.
- `clinical_rules.py` / `ml_engine.py`: Canonical deterministic clinical evaluation engine (V2.0.0).
- `auth_service.py`: Password hashing, JWT token lifecycle, and RBAC matrix.
- `review_service.py`: Clinician review state machine, override validation, and server-side HMAC-SHA256 cryptographic attestation.
- `sync_service.py`: Idempotent batch push engine, OCC version conflict detection, and cursor-based pull engine.

### Frontend (`Health-AI-main/frontend/`)
- `src/clinical/evaluator.ts`: Offline TypeScript clinical evaluation engine (V2.0.0).
- `src/db/offlineDb.ts`: Dexie v4 durable schema, atomic transaction boundaries, tombstones, and local outbox queue.
- `src/sync/SyncManager.ts`: Client synchronization engine, automatic network listener, push/pull manager.
- `src/auth/AuthContext.tsx`: JWT authentication session provider and role guard.
- `src/components/PhcDashboard.tsx`: Doctor Review Queue & Digital Attestation Modal.
- `src/components/AshaScreeningFlow.tsx`: Frontline screening UI with zero unsafe defaults.

---

## 3. Build, Run & Test Commands

```bash
# 1. Backend Start Command
cd Health-AI-main/backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# 2. Frontend Start Command
cd Health-AI-main/frontend
npm run dev

# 3. Frontend Production Build Command
cd Health-AI-main/frontend
npm run build

# 4. Backend Automated Test Suite
cd Health-AI-main/backend
pytest test_clinical_safety.py test_golden_vectors.py test_sync_v2.py test_auth_review.py

# 5. Frontend Node Automated Test Suites
cd Health-AI-main/frontend
node test_task004_outbox.js
node test_task005_task006_sync.js
```

---

## 4. Initial Pass / Fail Status

| Test Suite | Commands | Target Assertions | Status |
| :--- | :--- | :---: | :---: |
| **Backend Clinical Safety** | `pytest test_clinical_safety.py` | 11 | ✅ PASS |
| **Backend Golden Vectors** | `pytest test_golden_vectors.py` | 10 | ✅ PASS |
| **Backend Sync V2 Engine** | `pytest test_sync_v2.py` | 5 | ✅ PASS |
| **Backend Auth & Review** | `pytest test_auth_review.py` | 9 | ✅ PASS |
| **Frontend Outbox Persistence**| `node test_task004_outbox.js` | 51 | ✅ PASS |
| **Frontend Sync Manager** | `node test_task005_task006_sync.js`| 36 | ✅ PASS |
| **Frontend TypeScript Build** | `npm run build` | 2,386 modules | ✅ PASS |
