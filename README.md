# RapiDChecK — RuralHealth AI 🏥🤖

> **AI-Powered Early Disease Risk Prediction & Kolkata Population Health Intelligence Platform**  
> Designed for ASHA/ANM community health workers, Primary Health Centre (PHC) medical officers, district health authorities, and rural patients across India.

[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688.svg?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19.0+-61DAFB.svg?style=flat&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6.svg?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.0+-646CFF.svg?style=flat&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.0+-38B2AC.svg?style=flat&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Ollama](https://img.shields.io/badge/Ollama-Gemma_3_270M-black.svg?style=flat&logo=ollama&logoColor=white)](https://ollama.com)
[![Scikit-Learn](https://img.shields.io/badge/scikit--learn-ML_Engine-F7931E.svg?style=flat&logo=scikit-learn&logoColor=white)](https://scikit-learn.org/)
[![SQLite](https://img.shields.io/badge/SQLite-Database-003B57.svg?style=flat&logo=sqlite&logoColor=white)](https://www.sqlite.org/)

---

## 🌟 Executive Summary

**RuralHealth AI (RapiDChecK)** bridges the critical healthcare access gap in low-resource and remote rural environments. Operating with an **offline-first** philosophy, the platform enables community health workers (ASHA / ANMs) to conduct doorstep screening, early disease risk triage, and data-aware population health inquiry without requiring persistent internet connectivity.

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                     RURALHEALTH AI                      │
                    └────────────────────────────┬────────────────────────────┘
                                                 │
                                                 ▼
                                        INTENT ROUTER LAYER
                                                 │
                   ┌─────────────────────────────┴─────────────────────────────┐
                   │                                                           │
                   ▼                                                           ▼
         HEALTH QUESTION / RAG                                        DATASET & ANALYTICS QUERY
                   │                                                           │
                   ▼                                                           ▼
       CLINICAL KNOWLEDGE BASE                                        KOLKATA HEALTH DATA ENGINE
   • Pathophysiology & symptoms                                  • 14 annual fiscal years (2008–2022)
   • ASHA screening guidelines                                   • 1955 features (HMIS & NFHS-5)
   • Multilingual (EN / BN / HI)                                 • Deterministic trends & comparisons
                   │                                                           │
                   └─────────────────────────────┬─────────────────────────────┘
                                                 │
                                                 ▼
                                     LOCAL GEMMA 3 270M (Ollama)
                                     Natural Language Explanation
                                                 │
                                                 ▼
                                      GROUNDED RESPONSE CARD
                               (Visual Badge + Source + Exact Data)
```

---

## ✨ Key Features & Capabilities

### 1. 📊 Kolkata Health Intelligence & Data Engine
* **Deterministic Analytics Layer**: Python computes exact statistics, trends, and multi-year comparisons; Gemma explains the findings without doing manual arithmetic or hallucinating numbers.
* **Dataset Schema & Catalog**:
  * **14 Annual Rows**: Fiscal years `2008-09` to `2021-22`.
  * **1957 Columns (1955 Health Features)**: Structured across Communicable diseases, NCDs, Maternal/Child health, Immunization, and Diagnostics.
  * **8,202 HMIS Numeric Records Processed**: Forming the longitudinal yearly time-series backbone.
  * **73 NFHS-5 Survey Features**: Cross-sectional factsheet indicators (attached exclusively to `2019–20`).
* **Statistical Limitation Awareness**: Explicitly labels low-sample high-dimensional properties ($p \gg n$; $1957 > 14$) as exploratory and non-causal.

### 2. 🤖 Offline Local AI Chat Assistant (Gemma 3 270M)
* **Local Ollama Integration**: Runs entirely on-device via `http://localhost:11434` with zero external cloud dependencies.
* **Context-Aware Intent Routing**:
  * `📊 DATASET INSIGHT`: Dataset summary, feature counts, NFHS-5 period, and indicator discovery.
  * `📊 TREND ANALYSIS`: 14-year time series, net change, % change, and trend direction.
  * `📊 DATASET COMPARISON`: Deterministic difference between fiscal years (e.g. `2018-19` vs `2020-21`).
  * `🩺 HEALTH EDUCATION`: Clinically verified medical explanations in simple language.
  * `📋 WORKFLOW GUIDANCE`: ASHA screening protocols and red-flag escalation triggers.
  * `🛡️ CLINICAL SAFETY BOUNDARY`: Safe refusal of autonomous prescription and diagnosis requests.
* **Multilingual Fluency**: Native support for **English**, **Bengali (বাংলা)**, and **Hindi (हिंदी)**.
* **Multi-Turn Context Window**: Bounded conversational memory that resolves contextual pronouns (e.g., *"What is hypertension?"* $\rightarrow$ *"How does the Kolkata dataset represent it?"*).

### 3. 📴 Offline-First Clinical Screening Engine
* **IndexedDB (Dexie.js)**: Full offline client-side database allowing continuous screening in zero-connectivity environments.
* **Deterministic Multi-Domain Risk Stratification**:
  * Triage for **Cardiovascular / Hypertension**, **Diabetes**, **Respiratory / TB**, and **Maternal Malnutrition**.
  * Classifies into **Low**, **Moderate**, and **High Risk** tiers with explainable contributing factors.
* **Machine Learning Disease Classifier**: Scikit-Learn Logistic Regression (328 symptom features, 512 disease classes) with **95.24% Top-3 accuracy**.
* **Automatic Background Sync**: Reactive heartbeat (`/api/health`) that pushes queued screenings via `POST /api/sync` upon reconnection.

### 4. 🏥 Community Health Worker & PHC Doctor Dashboards
* **Census & High-Risk Priority Queue**: Real-time referral management for Primary Health Centre doctors.
* **Village Coverage & Interactive Mapping**: Google Maps Platform with OpenStreetMap / Nominatim fallback for geospatial facility identification.
* **Hands-Free Voice Dictation**: Web Speech API for regional voice input (`hi-IN`, `bn-IN`, `en-IN`).

---

## 🛠️ Technology Stack

| Layer | Technologies | Role |
| :--- | :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4 | Responsive, mobile-first community UI |
| **Offline Storage** | Dexie.js (IndexedDB), Service Worker PWA | Offline screening persistence |
| **Local AI Runtime** | Ollama, Gemma 3 270M | On-device multilingual reasoning |
| **Backend Framework** | Python 3.10+, FastAPI, Uvicorn | Asynchronous REST & Streaming API |
| **Data Engine** | Pandas, NumPy, JSON Catalogs | Deterministic health data analytics |
| **ML & Analytics** | Scikit-Learn, Joblib | 512-class clinical disease predictor |
| **Database & ORM** | SQLite, SQLAlchemy 2.0, Pydantic v2 | Structured relational persistence |

---

## 📁 Repository Structure

```
.
├── Health-AI-main/
│   ├── backend/
│   │   ├── main.py                     # FastAPI routes & API definitions
│   │   ├── ml_engine.py                # Deterministic screening risk triage
│   │   ├── database.py                 # SQLAlchemy models & SQLite setup
│   │   ├── schemas.py                  # Pydantic schemas & validators
│   │   ├── requirements.txt            # Python dependencies
│   │   ├── .env.example                # Safe environment variable template
│   │   ├── ai/
│   │   │   └── data_catalog/           # Generated dataset catalogs
│   │   │       ├── dataset_metadata.json
│   │   │       ├── feature_catalog.json
│   │   │       ├── category_catalog.json
│   │   │       └── year_catalog.json
│   │   ├── prompts/
│   │   │   └── ruralhealth_ai.py       # System prompt & clinical safety governance
│   │   ├── services/
│   │   │   ├── ollama_service.py       # Ollama LLM integration & memory
│   │   │   └── kolkata_health_data_service.py # Deterministic data analytics engine
│   │   └── ml/
│   │       ├── predictor.py            # ML disease classifier
│   │       └── population_health.py    # Aggregate health engine
│   │
│   ├── frontend/
│   │   ├── src/
│   │   │   ├── App.tsx                 # Root application component
│   │   │   ├── components/
│   │   │   │   ├── ChatAssistantPage.tsx   # Full-page data-aware chat assistant
│   │   │   │   ├── HealthChatbot.tsx       # Floating health assistant widget
│   │   │   │   ├── ScreeningForm.tsx       # Patient intake & vitals form
│   │   │   │   ├── Dashboard.tsx           # PHC Doctor census & referrals
│   │   │   │   └── maps/                   # Facility locator components
│   │   │   ├── db/                     # Dexie.js offline schema
│   │   │   └── i18n/                   # English, Hindi, Bengali translations
│   │   ├── package.json
│   │   └── vite.config.ts
│   │
│   └── kolkata_model_output/
│       ├── kolkata_model_training_dataset.csv  # 14 rows × 1957 columns
│       ├── feature_dictionary.csv              # 1955 metadata definitions
│       └── processing_summary.txt              # Data ingestion summary
│
├── .gitignore                          # Comprehensive security & build exclusions
├── .env.example                        # Root environment template
└── README.md                           # Documentation
```

---

## 🚀 Getting Started

### Prerequisites
* **Node.js** (v18+) & **npm**
* **Python** (3.10+)
* **Ollama** installed locally ([ollama.com](https://ollama.com))

### 1. Start Local Ollama Model
```bash
# Pull and start the compact local model
ollama pull gemma3:270m
ollama serve
```

### 2. Backend Setup
```bash
cd Health-AI-main/backend

# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start FastAPI server
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

### 3. Frontend Setup
```bash
cd Health-AI-main/frontend

# Install dependencies
npm install

# Run Vite development server
npm run dev
```
Open **`http://localhost:5173`** in your browser.

---

## 📡 Key API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Backend & database health status |
| `GET` | `/api/ai/ollama/health` | Local Ollama connection & model status |
| `GET` | `/api/ai/data/summary` | Factual summary of Kolkata Health Dataset |
| `GET` | `/api/ai/data/features/search?q={query}` | Semantic search across 1,955 health indicators |
| `GET` | `/api/ai/data/indicator/{feature}` | Time series values for a specific indicator |
| `GET` | `/api/ai/data/trend/{feature}` | Deterministic trend statistics across fiscal years |
| `POST` | `/api/ai/data/compare` | Multi-year comparison (`feature`, `year1`, `year2`) |
| `POST` | `/api/ai/chat` | Data-aware AI chat with safety guardrails |
| `POST` | `/api/ai/chat/stream` | Real-time SSE token delivery stream |
| `POST` | `/api/assess` | Deterministic patient screening risk evaluation |
| `POST` | `/api/sync` | Batch sync for offline patient screening records |

---

## 🛡️ Clinical Safety & Governance Boundaries

RuralHealth AI adheres to strict medical decision-support principles:
1. **Non-Diagnostic & Non-Prescribing**: The platform never assigns autonomous clinical diagnoses or issues drug prescriptions.
2. **Clinical Authority**: All clinical risk stratifications and treatment plans require verification by licensed Primary Health Centre (PHC) Medical Officers.
3. **Data Separation**: Aggregate population datasets (Kolkata HMIS / NFHS-5) are strictly decoupled from individual patient records.
4. **No Numerical Hallucinations**: Statistical figures and trends are calculated deterministically by Python prior to natural-language summarization.

---

## 📄 License
This project is developed for public health innovation and community health empowerment under the MIT License.
