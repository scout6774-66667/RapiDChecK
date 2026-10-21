# Local Development & Engineering Guide

## 1. Prerequisites

* **Node.js:** v20+ or v24+
* **Python:** v3.11+ (Python 3.9+ supported)
* **Git:** v2.30+

---

## 2. Quick Start (From Repository Root)

The repository root includes convenience scripts and workspace orchestration:

```bash
# 1. Start both Frontend and Backend concurrently
npm run dev:all

# Or start individually:
npm run dev:backend   # Launches FastAPI on http://127.0.0.1:8000
npm run dev:frontend  # Launches Vite on http://localhost:5173
```

---

## 3. Manual Startup (Directory-by-Directory)

### Terminal 1: Backend Setup & Launch
```bash
cd Health-AI-main/backend

# Create virtualenv if not already created
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Start FastAPI server
./venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```
* **Swagger UI:** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
* **Health Probe:** [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health)

### Terminal 2: Frontend Setup & Launch
```bash
cd Health-AI-main/frontend

# Install dependencies
npm ci

# Start Vite dev server
npm run dev
```
* **Web App:** [http://localhost:5173/](http://localhost:5173/)

---

## 4. Troubleshooting Common Issues

### Issue: `ERROR: [Errno 48] Address already in use`
This occurs if an instance of Uvicorn or another process is already bound to port 8000.
**Resolution:**
```bash
# Find the process ID occupying port 8000
lsof -i :8000

# Terminate the lingering process
kill -9 $(lsof -t -i :8000)
```

### Issue: Vite Port Conflict (5173)
If port 5173 is occupied:
```bash
kill -9 $(lsof -t -i :5173)
```

---

## 5. Running Automated Verification Suites

```bash
# Run all frontend & backend test suites
npm run test

# Individual test suites:
npm run typecheck         # Strict TypeScript compilation (tsc -b)
npm run test:i18n         # 94/94 Internationalization parity tests (EN, HI, BN)
npm run test:role-selection # Role selection & patient onboarding flow test
npm run test:golden       # Canonical golden vector equivalence test
npm run test:backend      # Pytest backend suite (auth, clinical, sync, RBAC)
npm run build             # Production Vite build check
```

---

## 6. Pre-Configured Demo Credentials

| Role | Username / Email | Password | Primary Workflow |
|---|---|---|---|
| **Doctor / Medical Officer** | `dr.sharma@phc.in` | `password123` | Clinical Review Queue & Doctor Dashboard |
| **Frontline ASHA Worker** | `sunita.devi@asha.gov.in` | `password123` | Doorstep Patient Screening & Field Assessment |
| **Citizen / Patient** | `ramesh.kumar@patient.in` | `password123` | Symptom Checker, Hospital Locator & Teleconsultations |
| **District Officer** | `district.admin@wbhealth.gov.in` | `password123` | Epidemiological Analysis & Cross-Facility Oversight |
