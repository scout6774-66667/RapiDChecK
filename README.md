# RapiDChecK - RuralHealth AI 🏥🤖

> **AI-Powered Early Disease Risk Prediction & Rural Health Access Platform**  
> Designed for ASHA/ANM health workers, Primary Health Centre (PHC) doctors, district health officers, and rural patients across India.

[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688.svg?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19.0+-61DAFB.svg?style=flat&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6.svg?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.0+-646CFF.svg?style=flat&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.0+-38B2AC.svg?style=flat&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![SQLite](https://img.shields.io/badge/SQLite-Database-003B57.svg?style=flat&logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![Scikit-Learn](https://img.shields.io/badge/scikit--learn-ML_Engine-F7931E.svg?style=flat&logo=scikit-learn&logoColor=white)](https://scikit-learn.org/)

---

## 🌟 Executive Summary

**RuralHealth AI** bridges the critical healthcare access gap in low-resource and remote rural environments. In regions with limited network connectivity and scarce specialized medical personnel, the platform empowers grassroots community health workers (ASHA/ANMs) to perform fast, structured triage and early disease risk screening at the patient's doorstep.

### Core Screening Workflow
$$\text{Patient Registration} \longrightarrow \text{Vitals \& Symptom Intake} \longrightarrow \text{Dual-Engine AI Screening} \longrightarrow \text{Explainable Risk Report} \longrightarrow \text{Offline/Online Sync} \longrightarrow \text{PHC Doctor Dashboard}$$

---

## ✨ Key Features & Capabilities

### 1. 📴 Offline-First Resilience
- **Zero-Internet Operability**: Works seamlessly in remote villages with zero connectivity using **IndexedDB (Dexie.js)**.
- **Local Fallback Engine**: If the backend is unreachable, the client-side decision engine evaluates risks locally.
- **Dual-Signal Heartbeat & Auto-Sync**: Monitors browser network state and pings `/api/health` every 5 seconds. Automatically pushes queued records via `POST /api/sync` as soon as connectivity is restored.

### 2. 🧠 Dual AI & Machine Learning Architecture
- **Deterministic Clinical Risk Engine**:
  - Evaluates vitals (BP, Glucose, HR, Temp, SpO2, BMI), lifestyle factors, duration, and family history.
  - Multi-domain risk triage: **Diabetes**, **Hypertension & Cardiovascular risks**, **Tuberculosis / Respiratory concerns**, and **Anemia / General Malnutrition**.
  - Produces structured **LOW / MODERATE / HIGH** risk tiers (0–100%) with human-readable contributing factors and clinical referral recommendations.
- **Real ML Disease Classification Engine**:
  - **Dataset**: Kaggle Disease & Symptoms Dataset (246,945+ samples, 377 features, 773 initial classes).
  - **Model**: Logistic Regression (L-BFGS, balanced weights) trained on 189,647 cleaned records over 328 symptom features and 512 disease classes.
  - **Performance**: Achieves **95.24% Top-3 Accuracy** (83.99% top-1 accuracy, 0.846 weighted F1).
  - **Explainability**: Identifies the primary symptom feature weights that influenced the top-3 predictions.

### 3. 🗣️ Multilingual Support & Voice Dictation
- **Instant Language Switching**: Full UI localization in **English**, **Hindi (हिंदी)**, and **Bengali (বাংলা)**.
- **Hands-Free Speech-to-Text**: Integrates the **Web Speech API** (`webkitSpeechRecognition`) for hands-free symptom entry in regional accents (`hi-IN`, `bn-IN`, `en-IN`).
- **Graceful Offline Fallback**: Automatically switches to an amber quick-type symptom chip selector when offline.

### 4. 🤖 AI Health Assistant Chatbot
- Floating chat widget powered by **OpenAI GPT-4o mini** via `POST /api/chat`.
- Provides context-aware home remedies, symptom guidance, and wellness tips.
- **Strict Clinical Guardrails**: Enforces non-diagnostic guidance, forbids prescriptive medications, promotes PHC visits, and triggers emergency alerts (e.g. calling **108**).

### 5. 🏥 Teleconsultation & Smart Hospital Locator
- **Dual-Engine Mapping**: Primary integration with **Google Maps Platform** with automated fallback to **OpenStreetMap & Nominatim**.
- **Interactive Geospatial Search**: Village/district geocoding with bidirectional pan-to-marker and list-highlight interaction.

### 6. 📊 PHC Doctor & Administrator Dashboard
- **Live Real-Time Metrics**: Total patient census, daily assessments, high-risk flags, and pending referrals.
- **Risk Distribution Visualizations**: Interactive Recharts breakdown.
- **High-Risk Priority Queue**: Actionable triage list allowing doctors to review contributing factors and update referral status with a single click.
- **Searchable Patient Directory**: Filter by village or name, complete with full longitudinal health assessment histories.

### 7. 🎨 Delightful & Context-Aware UI/UX
- **Dynamic Doctor Mascot**: Interactive vector mascot that reacts dynamically across the 3-step screening workflow (Noting symptoms $\rightarrow$ Thumbs up / Thinking / Urgent alerts).
- **Medical Trail Cursor**: Interactive canvas particle effect rendering trailing hearts and crosses.
- **Celebratory Feedback**: Confetti animations upon successful local and cloud saves.

---

## 🛠️ Technology Stack

| Layer | Technologies | Purpose |
|---|---|---|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4 | Responsive, performant, mobile-first UI |
| **State & Offline Storage** | Dexie.js (IndexedDB), dexie-react-hooks | Offline database and reactive live queries |
| **Data Visualization** | Recharts, Lucide React, Canvas-Confetti | Analytics charts, icons, and UX animations |
| **Backend Framework** | Python 3.10+, FastAPI, Uvicorn | High-performance asynchronous REST API |
| **Database & ORM** | SQLite, SQLAlchemy 2.0, Pydantic v2 | Structured schema validation and persistence |
| **Machine Learning** | Scikit-Learn, Joblib, NumPy, Pandas | ML model training, inference, and serialization |
| **External APIs** | OpenAI GPT-4o mini, Web Speech API, Google Maps | Generative health assistant, voice, and mapping |

---

## 📁 Repository Structure

```
Health-AI-main/
├── backend/
│   ├── main.py                   # FastAPI application & REST route definitions
│   ├── ml_engine.py              # Rule-based clinical triage & risk scoring engine
│   ├── database.py               # SQLAlchemy ORM models & SQLite connection
│   ├── schemas.py                # Pydantic data schemas & request validators
│   ├── requirements.txt          # Python backend dependencies
│   ├── .env.example              # Sample environment configuration
│   ├── data/                     # Dataset storage for model training
│   └── ml/
│       ├── train_model.py        # ML training pipeline (data cleaning, LR & RF models)
│       ├── predictor.py          # Singleton ML prediction service
│       ├── test_predictor.py     # Predictor test suite
│       ├── test_api.py           # API integration tests
│       └── models/               # Saved model artifacts (.joblib, .json)
├── frontend/
│   ├── index.html                # HTML5 entry point
│   ├── vite.config.ts            # Vite configuration & backend proxy rules
│   ├── package.json              # Node dependencies and scripts
│   ├── src/
│   │   ├── App.tsx               # Main application shell, routing, and sync engine
│   │   ├── components/           # UI widgets (Mascot, Chatbot, Hospital Finder, Voice Input)
│   │   ├── db/                   # Dexie.js IndexedDB schema & offline helpers
│   │   ├── i18n/                 # Localization dictionaries (English, Hindi, Bengali)
│   │   └── types/                # TypeScript interfaces and type definitions
│   └── public/                   # Static assets
├── FEATURES_AND_STACK.md         # Comprehensive feature documentation
├── FILE_STRUCTURE.md             # Detailed file-by-file architecture breakdown
└── PROJECT_AUDIT.md              # Project implementation audit log
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v18.0.0 or higher ([Download Node.js](https://nodejs.org/))
- **Python**: v3.10 or higher ([Download Python](https://www.python.org/))
- **Git**: ([Download Git](https://git-scm.com/))

---

### Step 1: Clone the Repository

```bash
git clone https://github.com/Priyam-07-thala/ruralhealth-ai.git
cd ruralhealth-ai
```

---

### Step 2: Backend Setup & Launch

1. Open a terminal and navigate to the `backend` folder:
   ```bash
   cd backend
   ```

2. Create and activate a virtual environment:
   ```bash
   # Windows
   python -m venv venv
   venv\Scripts\activate

   # macOS / Linux
   python3 -m venv venv
   source venv/bin/activate
   ```

3. Install required Python packages:
   ```bash
   pip install -r requirements.txt
   ```

4. Configure environment variables:
   ```bash
   cp .env.example .env
   # Edit .env and supply your OPENAI_API_KEY (optional for chatbot)
   ```

5. *(Optional)* Train/Rebuild the ML Disease Classification Model:
   ```bash
   python ml/train_model.py
   ```

6. Start the FastAPI server:
   ```bash
   python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
   ```

> 🌐 **Backend API**: `http://127.0.0.1:8000`  
> 📖 **Interactive Swagger Documentation**: `http://127.0.0.1:8000/docs`

---

### Step 3: Frontend Setup & Launch

1. Open a second terminal window and navigate to the `frontend` folder:
   ```bash
   cd frontend
   ```

2. Install Node.js dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   ```bash
   cp .env.example .env
   # Edit .env to add VITE_GOOGLE_MAPS_API_KEY (optional; defaults to OpenStreetMap)
   ```

4. Start the Vite development server:
   ```bash
   npm run dev
   ```

> 💻 **Frontend Web App**: `http://localhost:5173` (or `http://127.0.0.1:5173`)

---

## 📡 API Reference

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/health` | Server heartbeat and liveness check |
| `POST` | `/api/patients` | Register a new patient record |
| `GET` | `/api/patients` | Retrieve all registered patients |
| `POST` | `/api/assess` | Submit assessment, calculate clinical risk & persist |
| `GET` | `/api/assessments` | Fetch assessment records (filterable by `patient_id`) |
| `PUT` | `/api/assessments/{id}/referral` | Update patient referral status (`Referred`, `Completed`) |
| `POST` | `/api/sync` | Batch-sync offline records from client IndexedDB |
| `GET` | `/api/dashboard/stats` | Aggregated PHC metrics (totals, high-risk counts, risk breakdown) |
| `POST` | `/api/ml/predict` | Predict Top-3 likely conditions from a list of symptoms |
| `POST` | `/api/chat` | OpenAI GPT-4o mini health assistant with safety guardrails |

---

## ⚖️ Clinical Safety & Ethical Disclaimer

> [!IMPORTANT]
> **RuralHealth AI is an assistive decision-support and risk-screening prototype.**
> - It **does not provide formal medical diagnoses** or prescribe pharmaceutical medications.
> - It is designed to assist frontline healthcare workers in triaging and identifying patients who require timely evaluation by qualified medical professionals at Primary Health Centres (PHC) and Community Health Centres (CHC).
> - In case of acute or life-threatening symptoms (e.g., severe chest pain, extreme shortness of breath, loss of consciousness), emergency medical services (**108 Ambulance**) must be contacted immediately.

---

## 🎥 Project Demonstration
- **Video Walkthrough**: [Google Drive Demo Link](https://drive.google.com/file/d/1h_03v0dPRL_zMRVGjCnYnOE2QUSFpCmz/view?usp=drive_link)

---

## 📄 License
Developed for the **RuralHealth AI Hackathon**. Licensed under the [MIT License](LICENSE).
