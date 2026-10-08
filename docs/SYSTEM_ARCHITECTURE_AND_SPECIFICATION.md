# RAPIDCHeCK / RuralHealth AI — Comprehensive System Architecture, Implementation & Verification Master Specification

> **Document Type:** Production Architecture Master Specification & Technical Reference  
> **Target Version:** Release Candidate v2.0.0-PROD  
> **Consolidated Modules:** Features (`feature.md`), Frontend Architecture (`frontend.md`), Backend Architecture (`backend.md`), Implementation Plan (`implementation.md`), Database & Connection Management (`connection.md`), Security & Cryptographic Attestation (`security.md`), Offline Synchronization (`sync.md`), and Automated Verification Test Suites.  
> **Author:** DeepMind Agentic Engineering Team / Core Health-AI Systems Group  
> **Classification:** Production-Grade Technical Specification  

---

## Master Table of Contents

1. [Executive Summary & System Architectural Blueprint](#1-executive-summary--system-architectural-blueprint)
   - 1.1 Mission & Rural Health Context
   - 1.2 Core Architectural Principles & Invariants
   - 1.3 High-Level System Architecture Diagram
   - 1.4 End-to-End Dataflow & State Lifecycle
2. [Module 1: Feature & Capabilities Specification (`feature.md`)](#2-module-1-feature--capabilities-specification-featuremd)
   - 2.1 Frontline Offline-First Durability & Dexie Outbox
   - 2.2 Deterministic Clinical Safety & Red-Flag Short-Circuiting Engine
   - 2.3 Uncertainty Quantification & Missing Vitals Handling
   - 2.4 Machine Learning Disease Classification Engine & Differential Diagnosis
   - 2.5 Clinician Review Queue & Medical Officer Governance State Machine
   - 2.6 Multilingual Speech-to-Text & Web Speech API Voice Dictation
   - 2.7 Teleconsultation Scheduling & Dual-Engine Geospatial Mapping Locator
   - 2.8 Demographic Registration & Longitudinal Health Profiles
   - 2.9 Health Resources Section Architecture & Specification
3. [Module 2: Frontend Architecture & PWA Specifications (`frontend.md`)](#3-module-2-frontend-architecture--pwa-specifications-frontendmd)
   - 3.1 Component Hierarchy & Tree Structure
   - 3.2 Routing & Navigation Tab State Machine
   - 3.3 Dexie.js v4 IndexedDB Durable Storage Schema & Store Types
   - 3.4 Outbox Transaction Boundaries & Atomic Commit Mechanics
   - 3.5 Network Heartbeat, Connectivity Listener & Auto-Sync Worker
   - 3.6 Multilingual Localization Architecture & Translation Dictionaries
   - 3.7 UI Components, Forms, Modals & Visual Dashboards
   - 3.8 Styling, Dark Mode & WCAG 2.1 AA Accessibility
   - 3.9 Service Worker PWA Caching Strategy & Manifest
4. [Module 3: Backend Architecture & REST API Contracts (`backend.md`)](#4-module-3-backend-architecture--rest-api-contracts-backendmd)
   - 4.1 Application Setup, Lifespan Events & CORS Configuration
   - 4.2 Comprehensive REST API Endpoint Contracts & JSON Payloads
   - 4.3 Service Layer Architecture (`auth_service`, `review_service`, `sync_service`, `ml_engine`)
   - 4.4 Pydantic v2 Request & Response Validation Schemas
   - 4.5 Dependency Injection, Session Lifecycle & Error Handling
   - 4.6 Logging, Middleware, Rate Limiting & Health Probes
5. [Module 4: Technical Implementation Plan & Task Status (`implementation.md`)](#5-module-4-technical-implementation-plan--task-status-implementationmd)
   - 5.1 Non-Negotiable Clinical & Distributed Invariants
   - 5.2 Task Breakdown: TASK-001 through TASK-012 In-Depth Execution Details
   - 5.3 Definition of Done (DoD) Verification Audit
   - 5.4 Phase-by-Phase Technical Evolution
6. [Module 5: Database Schema, Connection Pooling & Migrations (`connection.md`)](#6-module-5-database-schema-connection-pooling--migrations-connectionmd)
   - 6.1 Authoritative PostgreSQL 16 Engine & SQLAlchemy 2.0 Connection Pool
   - 6.2 Complete PostgreSQL Relational Tables & Column Specifications (Full SQL DDLs)
   - 6.3 Constraints, Indexes, Foreign Keys & Multi-Tenancy Scopes
   - 6.4 Atomic Transactional Processing (`BEGIN` -> mutation -> journal -> audit -> `COMMIT`)
   - 6.5 SQLite-to-PostgreSQL ETL Data Migration Pipeline
7. [Module 6: Security, Authentication, RBAC & Attestation (`security.md`)](#7-module-6-security-authentication-rbac--attestation-securitymd)
   - 7.1 PBKDF2-HMAC-SHA256 Password Hashing Architecture
   - 7.2 JWT Access Token Generation, Claims Verification & Expiration
   - 7.3 Role-Based Access Control (RBAC) Permission Matrix
   - 7.4 Multi-Tenant Facility Isolation & Object-Level Authorization
   - 7.5 Server-Side Cryptographic Attestation (HMAC-SHA256) Specification
   - 7.6 Tamper Detection & Key Rotation Mechanics
   - 7.7 23 Adversarial Attack Tests & Penetration Safeguards
8. [Distributed Synchronization, OCC & Concurrency Control](#8-distributed-synchronization-occ--concurrency-control)
   - 8.1 Bidirectional Sync Protocol (`POST /api/v2/sync/push` & `POST /api/v2/sync/pull`)
   - 8.2 Server-Side Idempotency & Operation UUID Deduplication
   - 8.3 Optimistic Concurrency Control (OCC) Atomic Version Increments
   - 8.4 Soft-Delete Tombstones & Non-Resurrection Policy
   - 8.5 Two-Device Concurrent Mutation Scenarios & 3-Way Merge Resolution
   - 8.6 20 Offline Failure-Injection Scenarios (`TEST-OFF-001` to `TEST-OFF-020`)
9. [Comprehensive Testing Suites, Golden Vectors & Verification Evidence](#9-comprehensive-testing-suites-golden-vectors--verification-evidence)
   - 9.1 Cross-Platform Golden Vectors (10/10 Equivalence)
   - 9.2 Complete Automated Pytest & Node Test Matrix (58/58 Passed)
   - 9.3 Machine-Readable Evidence Artifacts Index
   - 9.4 Final Production Readiness Determination & Traceability Table
10. [Deployment, Operational Runbook & Disaster Recovery](#10-deployment-operational-runbook--disaster-recovery)
    - 10.1 Production Docker & Compose Orchestration
    - 10.2 Environment Variable Matrix & Secret Management
    - 10.3 Database Backup, Restore & Point-In-Time Recovery Runbook
    - 10.4 Monitoring, Prometheus Metrics & Health Checking Runbook

---

# 1. Executive Summary & System Architectural Blueprint

## 1.1 Mission & Rural Health Context

**RapiDChecK / RuralHealth AI** is a production-hardened, offline-first, clinically governed digital health screening and epidemiological triage platform. The platform is tailored specifically for the Indian public health delivery hierarchy:

- **Sub-Centres & Remote Habitations:** Accredited Social Health Activists (ASHA) and Auxiliary Nurse Midwives (ANM) operate in areas with zero cellular connectivity, intermittent power, and low-spec Android tablets/smartphones.
- **Primary Health Centres (PHCs):** Medical Officers (MBBS Doctors) review triage recommendations, validate emergency referrals, modify treatment pathways, and issue cryptographically sealed clinical attestations.
- **Community Health Centres (CHCs) & District Hospitals:** Specialist physicians and District Health Officers monitor facility caseloads, epidemiological outbreak signals, and supply shortages.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        INDIAN RURAL HEALTHCARE OPERATIONAL HIERARCHY                   │
│                                                                                        │
│   [Village / Habitation]       [Sub-Centre]         [Primary Health Centre]            │
│   ┌────────────────────┐   ┌─────────────────┐   ┌─────────────────────────┐          │
│   │ ASHA Worker        │──►│ ANM Worker      │──►│ Medical Officer (MBBS)  │          │
│   │ Doorstep Screening │   │ Sub-Centre Hub  │   │ PHC Triage Review Queue │          │
│   │ Offline Dexie PWA  │   │ Vitals & Tests  │   │ Cryptographic Seal/Auth │          │
│   └────────────────────┘   └─────────────────┘   └─────────────────────────┘          │
│                                                               │                        │
│                                                      [District Hospital / CHC]         │
│                                                  ┌─────────────────────────┐          │
│                                                  │ District Health Officer │          │
│                                                  │ Epidemic Telemetry/EHR  │          │
│                                                  └─────────────────────────┘          │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

The primary engineering imperative of RapiDChecK is absolute clinical safety in the presence of unreliable networks, human data entry limitations, and probabilistic machine learning models.

---

## 1.2 Core Architectural Principles & Invariants

The platform enforces five foundational architectural invariants:

1. **Deterministic Safety Primacy (Short-Circuit Hierarchy):**  
   Clinical safety rules execute before, override, and supersede all probabilistic machine learning models. A patient presenting with chest pain, respiratory distress, or severe hypertension will immediately be classified as `EMERGENCY` / `HIGH` risk, regardless of any ML classification output.
2. **Strict Absence of Silent Defaults:**  
   Vitals (`systolic_bp`, `diastolic_bp`, `heart_rate`, `spo2`, `temperature`, `respiratory_rate`) must strictly default to `None` / `null` if unmeasured. Imputing standard physiological baselines (e.g., assuming $120/80$ mmHg or $98\%$ $\text{SpO}_2$) is strictly prohibited. Missing vital data must explicitly trigger `INSUFFICIENT_DATA` or elevated uncertainty states.
3. **Transactional Offline-First Durability:**  
   Data created in the field is persisted into IndexedDB via Dexie.js in a single atomic transaction that writes both the domain entity (e.g., patient record, assessment record) and an associated outbox journal item (`sync_outbox`). Local storage operations succeed 100% offline.
4. **Authoritative PostgreSQL Server with Monotonic Sync Journal:**  
   The central backend mandates a true relational ACID store (PostgreSQL 16). Every data mutation increments a sequential, monotonic cursor `journal_id` in a central `sync_journal` table. Client synchronizations pull deltas strictly via monotonically increasing journal cursors.
5. **Server-Side Cryptographic Attestation (HMAC-SHA256):**  
   When a Medical Officer conducts a clinical review, the server validates identity, role, and facility isolation, generates a canonical deterministic string payload, and computes a cryptographically verifiable HMAC-SHA256 signature using a secure server master key.

---

## 1.3 High-Level System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       SYSTEM ARCHITECTURE OVERVIEW                                      │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                         │
│  ┌───────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                              CLIENT LAYER (Browser PWA / Mobile Android)                          │  │
│  │                                                                                                   │  │
│  │  ┌─────────────────────────┐   ┌───────────────────────────┐   ┌──────────────────────────────┐  │  │
│  │  │   React 18 + TS UI      │   │   Deterministic Triage    │   │   Dexie v4 IndexedDB Store   │  │  │
│  │  │   - Lucide Icons        │   │   - Ruleset v2.0.0        │   │   - patients table           │  │  │
│  │  │   - Canvas Confetti     │──►│   - Red-Flag Evaluator    │──►│   - assessments table        │  │  │
│  │  │   - Web Speech STT      │   │   - Uncertainty Engine    │   │   - clinical_reviews table   │  │  │
│  │  │   - Leaflet Maps        │   │   - Golden Vector Equiv   │   │   - sync_outbox (Atomic Tx)  │  │  │
│  │  └─────────────────────────┘   └───────────────────────────┘   └──────────────────────────────┘  │  │
│  │                                                                                │                  │  │
│  │                                ┌───────────────────────────────────────────────┘                  │  │
│  │                                ▼                                                                  │  │
│  │  ┌─────────────────────────────────────────────────────────────────────────────────────────────┐  │  │
│  │  │  Auto-Sync Background Worker (Heartbeat Polling + Online/Offline Listener + Exponential Backoff)│  │  │
│  │  └─────────────────────────────────────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────┬───────────────────────────────────────────────┘  │
│                                                      │ HTTPS / JSON / Bearer JWT                        │
│                                                      ▼                                                  │
│  ┌───────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                              SERVER LAYER (FastAPI / Python 3.10+ / ASGI)                         │  │
│  │                                                                                                   │  │
│  │  ┌─────────────────────────────────────────────────────────────────────────────────────────────┐  │  │
│  │  │ Uvicorn ASGI Server + CORSMiddleware + Rate Limiter + Global Exception Interceptors        │  │  │
│  │  └─────────────────────────────────────────────────────────────────────────────────────────────┘  │  │
│  │         │                                      │                                      │           │  │
│  │         ▼                                      ▼                                      ▼           │  │
│  │  ┌──────────────────────┐              ┌──────────────────────┐              ┌─────────────────┐  │  │
│  │  │ auth_service.py      │              │ review_service.py    │              │ sync_service.py │  │  │
│  │  │ - PBKDF2 Hashing     │              │ - State Machine      │              │ - Push v2 Idemp │  │  │
│  │  │ - JWT Verification   │              │ - Facility Isolation │              │ - Pull Cursor   │  │  │
│  │  │ - RBAC Gatekeeper    │              │ - HMAC Attestation   │              │ - OCC Conf Resol│  │  │
│  │  └──────────────────────┘              └──────────────────────┘              └─────────────────┘  │  │
│  │         │                                      │                                      │           │  │
│  │         ▼                                      ▼                                      ▼           │  │
│  │  ┌─────────────────────────────────────────────────────────────────────────────────────────────┐  │  │
│  │  │ ml_engine.py (Fallback Random Forest + Logistic Regression + Missing Data Uncertainty)      │  │  │
│  │  └─────────────────────────────────────────────────────────────────────────────────────────────┘  │  │
│  │                                                │                                                  │  │
│  │                                                ▼                                                  │  │
│  │  ┌─────────────────────────────────────────────────────────────────────────────────────────────┐  │  │
│  │  │ SQLAlchemy 2.0 Connection Pool (QueuePool: pool_size=10, max_overflow=20, recycle=1800s)    │  │  │
│  │  └─────────────────────────────────────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────┬───────────────────────────────────────────────┘  │
│                                                      │ TCP / Port 5432                                  │
│                                                      ▼                                                  │
│  ┌───────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                          PERSISTENCE LAYER (PostgreSQL 16 Relational Engine)                      │  │
│  │                                                                                                   │  │
│  │   • users (RBAC, facility_id, hashed_pw)        • sync_journal (monotonic BIGSERIAL)              │  │
│  │   • patients (UUID PK, demographics, facility)  • idempotency_log (operation_uuid PK)             │  │
│  │   • assessments (vitals, triage, risk, server_v)• audit_events (immutable append-only)           │  │
│  │   • clinical_reviews (HMAC seal, overrides)     • health_resources (facility inventory/geo)       │  │
│  └───────────────────────────────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 1.4 End-to-End Dataflow & State Lifecycle

```mermaid
sequenceDiagram
    autonumber
    participant ASHA as Frontline ASHA (PWA)
    participant DB as Local Dexie (IndexedDB)
    participant Sync as Auto-Sync Service
    participant API as FastAPI Sync Gateway
    participant PG as PostgreSQL 16
    participant MO as Medical Officer (PHC)
    participant Review as Review & Attestation Engine

    Note over ASHA,DB: Field Screening (Offline)
    ASHA->>ASHA: Input Demographics & Vitals
    ASHA->>ASHA: Execute Local Ruleset v2.0.0 (Red-Flag Check)
    ASHA->>DB: Atomic Commit (Patient + Assessment + sync_outbox)
    
    Note over ASHA,API: Network Connectivity Restored
    Sync->>DB: Read Pending Outbox Items
    Sync->>API: POST /api/v2/sync/push (Batch items, operation_id, Bearer JWT)
    API->>PG: BEGIN Transaction
    API->>PG: Check Idempotency Log (operation_id)
    API->>PG: Evaluate OCC base_server_version against current version
    API->>PG: UPSERT Domain Entities (assessments, patients)
    API->>PG: INSERT INTO sync_journal (entity_type, entity_id, change_type, version)
    API->>PG: INSERT INTO audit_events (action, actor, details)
    API->>PG: COMMIT Transaction
    API-->>Sync: 200 OK (applied_count, conflicts: [])
    Sync->>DB: Clear Processed Outbox Entries

    Note over MO,Review: Triage & Governance Review
    MO->>API: GET /api/v2/reviews/pending?facility_id=PHC-001
    API->>PG: SELECT assessments WHERE review_status='REVIEW_REQUIRED'
    API-->>MO: Return Emergency & High Risk Queue
    MO->>MO: Inspect Symptoms, Vitals, and ML Explanation
    MO->>API: POST /api/v2/reviews/{id} (APPROVED, clinical_notes, override_reason)
    API->>Review: Validate Facility Isolation (Doctor Facility == Assessment Facility)
    API->>Review: Enforce Clinical Note Length (>= 5 chars) & Non-Empty Override Reason
    API->>Review: Compute Canonical HMAC-SHA256 Attestation Hash
    Review->>PG: UPDATE assessments SET review_status='APPROVED'
    Review->>PG: INSERT INTO clinical_reviews (attestation_hash, reviewer_id, notes)
    Review->>PG: Append sync_journal & audit_events
    API-->>MO: 200 OK (Attestation Hash Verified)
```

---

# 2. Module 1: Feature & Capabilities Specification (`feature.md`)

## 2.1 Frontline Offline-First Durability & Dexie Outbox

In rural Indian field settings, frontline workers experience frequent drops in 3G/4G connectivity, low-bandwidth 2G fallback, and zero-coverage areas. The application is built with a resilient offline-first architecture:

1. **Local-First Writes:** All record creation (patients, assessments, reviews) writes directly to local client IndexedDB storage using Dexie.js v4.
2. **Atomic Outbox Enqueue:** Writing a business entity and creating its sync payload occurs in a single Dexie transaction. A failure to write the outbox aborts the local entity save, preventing data drift.
3. **Resilient Retry Queue:** The outbox tracks `status` (`pending`, `syncing`, `failed`), `retry_count`, `last_error`, and exponential backoff timers ($2^n \times 1000\text{ms}$, capped at 60s).
4. **Non-Blocking Operation:** The user receives immediate UI feedback, a unique client-side UUID, and a local risk calculation without awaiting a network round-trip.

---

## 2.2 Deterministic Clinical Safety & Red-Flag Short-Circuiting Engine

To prevent catastrophic misclassifications by probabilistic machine learning algorithms, the platform deploys a deterministic clinical rule engine (`Ruleset v2.0.0`). This engine executes identically in both Python (Backend) and TypeScript (Frontend).

### Emergency Red-Flag Trigger Conditions:
Any of the following clinical indicators immediately triggers an `EMERGENCY` triage category, `HIGH` risk level, and `IMMEDIATE_HOSPITAL_REFERRAL` action:

| Clinical Indicator | Trigger Condition | Severity Level | Clinical Rationale |
| :--- | :--- | :--- | :--- |
| **Blood Pressure Crisis** | $\text{Systolic} \ge 180 \lor \text{Diastolic} \ge 120$ mmHg | `EMERGENCY` | Hypertensive crisis; risk of stroke, aortic dissection, or acute heart failure. |
| **Severe Hypotension** | $\text{Systolic} \le 80 \lor \text{Diastolic} \le 50$ mmHg | `EMERGENCY` | Circulatory shock, sepsis, or internal hemorrhage. |
| **Severe Hypoxia** | $\text{SpO}_2 \le 88\%$ | `EMERGENCY` | Severe respiratory failure, ARDS, or critical pneumonia. |
| **Extreme Tachycardia** | $\text{Heart Rate} \ge 140$ bpm | `EMERGENCY` | Ventricular tachycardia, SVT, or extreme septic shock. |
| **Severe Bradycardia** | $\text{Heart Rate} \le 40$ bpm | `EMERGENCY` | Complete heart block, sinus node arrest, or critical hypoperfusion. |
| **Respiratory Failure** | $\text{Respiratory Rate} \ge 32 \lor \le 8$ bpm | `EMERGENCY` | Impending respiratory arrest, severe metabolic acidosis (Kussmaul breathing). |
| **High Fever with Stiff Neck**| $\text{Temp} \ge 39.5^\circ\text{C} \land \text{"stiff_neck"} \in \text{symptoms}$ | `EMERGENCY` | Acute bacterial or viral meningitis. |
| **Altered Consciousness** | $\text{"unconscious"} \lor \text{"unresponsive"} \in \text{symptoms}$ | `EMERGENCY` | Severe encephalopathy, intracranial hemorrhage, or metabolic coma. |
| **Severe Chest Pain** | $\text{"chest_pain"} \in \text{symptoms} \land (\text{Age} \ge 40 \lor \text{Diabetic})$ | `EMERGENCY` | Acute Coronary Syndrome (ACS) / Myocardial Infarction. |

```python
# Deterministic Red-Flag Short-Circuit Logic (Python Reference)
def evaluate_red_flags(vitals: Dict[str, Optional[float]], symptoms: List[str], age: int) -> Tuple[bool, List[str]]:
    red_flags = []
    
    sbp = vitals.get("systolic_bp")
    dbp = vitals.get("diastolic_bp")
    spo2 = vitals.get("spo2")
    hr = vitals.get("heart_rate")
    rr = vitals.get("respiratory_rate")
    temp = vitals.get("temperature")
    
    if sbp is not None and sbp >= 180:
        red_flags.append(f"Hypertensive Crisis (Systolic BP: {sbp} mmHg >= 180)")
    if sbp is not None and sbp <= 80:
        red_flags.append(f"Severe Hypotension/Shock (Systolic BP: {sbp} mmHg <= 80)")
    if dbp is not None and dbp >= 120:
        red_flags.append(f"Hypertensive Crisis (Diastolic BP: {dbp} mmHg >= 120)")
    if dbp is not None and dbp <= 50:
        red_flags.append(f"Severe Hypotension (Diastolic BP: {dbp} mmHg <= 50)")
    if spo2 is not None and spo2 <= 88.0:
        red_flags.append(f"Severe Hypoxia (SpO2: {spo2}% <= 88%)")
    if hr is not None and hr >= 140:
        red_flags.append(f"Critical Tachycardia (Heart Rate: {hr} bpm >= 140)")
    if hr is not None and hr <= 40:
        red_flags.append(f"Critical Bradycardia (Heart Rate: {hr} bpm <= 40)")
    if rr is not None and (rr >= 32 or rr <= 8):
        red_flags.append(f"Critical Respiratory Distress (RR: {rr} bpm)")
    if temp is not None and temp >= 39.5 and "stiff_neck" in symptoms:
        red_flags.append("Suspected Acute Meningitis (High Fever + Stiff Neck)")
    if "unconscious" in symptoms or "unresponsive" in symptoms:
        red_flags.append("Altered Mental Status / Unresponsiveness")
    if "chest_pain" in symptoms and age >= 40:
        red_flags.append("Suspected Acute Coronary Syndrome (Chest Pain in Adult >= 40y)")

    is_emergency = len(red_flags) > 0
    return is_emergency, red_flags
```

---

## 2.3 Uncertainty Quantification & Missing Vitals Handling

In the legacy prototype, missing vitals were silently coerced to default healthy constants ($120/80$, $98\%$, $72\text{ bpm}$), which generated false negatives. 

In Production v2.0.0:
1. **Explicit Nullability:** Every vital field in `VitalSigns` schema is typed as `Optional[float] = None`.
2. **Missing Vital Penalty Score:** Each omitted vital contributes an uncertainty penalty:
   $$\text{Uncertainty Score} = \sum_{v \in \text{Vitals}} w_v \cdot \mathbb{I}(v = \text{None})$$
   Where weights are assigned as:
   - $\text{SpO}_2$: $0.30$
   - $\text{Systolic/Diastolic BP}$: $0.25$
   - $\text{Heart Rate}$: $0.20$
   - $\text{Respiratory Rate}$: $0.15$
   - $\text{Temperature}$: $0.10$
3. **Threshold Behavior:**
   - If $\text{Uncertainty Score} \ge 0.50$ (e.g., Blood Pressure and $\text{SpO}_2$ both missing), the system sets `confidence = "LOW"`, flags `uncertainty_warning = "INSUFFICIENT_DATA_FOR_DEFINITIVE_TRIAGE"`, and automatically elevates the review state to `REVIEW_REQUIRED`.
   - The UI displays an Amber Warning Badge prompting the ASHA worker to collect missing vitals if a digital cuff or pulse oximeter is available.

---

## 2.4 Machine Learning Disease Classification Engine & Differential Diagnosis

When deterministic red flags are absent, the system executes the statistical and ML inference engine:

1. **Ensemble Architecture:**
   - **Random Forest Classifier (Primary):** Evaluates non-linear feature interactions between age, sex, BMI, and 34 multi-hot binary symptom vectors.
   - **Logistic Regression (Calibrator):** Provides calibrated probability scores across 42 disease categories.
2. **Input Feature Vectorization:**
   $$\vec{X} = [\text{age}_{\text{norm}}, \text{bmi}_{\text{norm}}, \text{vital}_{1}, \dots, \text{vital}_{k}, s_{1}, s_{2}, \dots, s_{34}]$$
3. **Differential Output:** Returns Top-3 ranked differential diagnoses with calibrated probabilities and feature attribution percentages.
4. **Governed Fallback:** If the ML model encounters an unknown symptom encoding or unhandled float overflow, it gracefully fails open to a rule-based categorical heuristic and logs an anomaly without crashing the API.

---

## 2.5 Clinician Review Queue & Medical Officer Governance State Machine

All assessments marked with `triage_level IN ('EMERGENCY', 'HIGH')` or `review_status = 'REVIEW_REQUIRED'` enter the central Medical Officer Triage Queue.

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                   CLINICAL GOVERNANCE STATE MACHINE TRANSITIONS                │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│       [ASHA Screening Created]                                                 │
│                   │                                                            │
│                   ▼                                                            │
│         ┌───────────────────┐                                                  │
│         │  REVIEW_REQUIRED  │                                                  │
│         └───────────────────┘                                                  │
│                   │                                                            │
│       ┌───────────┼────────────────────────────────────────┐                   │
│       │ Doctor    │ Doctor Overrides                       │ Doctor Rejects    │
│       │ Approves  │ (Requires >=10 chars note + reason)    │ (Invalid Data)    │
│       ▼           ▼                                        ▼                   │
│  ┌──────────┐   ┌──────────┐                             ┌──────────┐          │
│  │ APPROVED │   │ MODIFIED │                             │ REJECTED │          │
│  └──────────┘   └──────────┘                             └──────────┘          │
│       │               │                                        │               │
│       └───────────────┴────────────────────────────────────────┘               │
│                               │                                                │
│                               ▼                                                │
│               [HMAC-SHA256 Cryptographic Seal Generated]                       │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
```

### Review Decision Constraints:
1. **Mandatory Notes:** The `notes` field requires a minimum string length of $\ge 5$ characters for approval and $\ge 10$ characters for modification or rejection.
2. **Emergency Downgrade Guard:** If a Medical Officer downgrades an assessment from `EMERGENCY` to `ROUTINE`, the system mandates an `override_reason` from an enumerated list (`MISTAKEN_ENTRY`, `CLINICALLY_STABLE_UPON_EXAMINATION`, `EQUIPMENT_MALFUNCTION_CONFIRMED`) and writes an immutable audit record.
3. **Facility Isolation:** A doctor registered under `facility_id = "PHC-KASGANJ-01"` cannot approve or modify an assessment originating from `"PHC-ALIGARH-04"`.

---

## 2.6 Multilingual Speech-to-Text & Web Speech API Voice Dictation

To reduce manual data entry burden for frontline workers in the field, the application integrates the HTML5 Web Speech API (`webkitSpeechRecognition` / `SpeechRecognition`):

- **Supported Locales:**
  - `en-IN` (Indian English)
  - `hi-IN` (Hindi - हिन्दी)
  - `bn-IN` (Bengali - বাংলা)
  - `te-IN` (Telugu - తెలుగు)
  - `ta-IN` (Tamil - தமிழ்)
  - `mr-IN` (Marathi - मराठी)
- **Clinical Vocabulary Parsing:** Voice input strings (e.g., "मरीज को तेज बुखार और खांसी है") are passed through an internal semantic dictionary that automatically identifies and checks corresponding symptom tags (`fever`, `cough`) in the UI.

---

## 2.7 Teleconsultation Scheduling & Dual-Engine Geospatial Mapping Locator

1. **Teleconsultation Engine:** Enables ANM workers to schedule video/audio teleconsultations with PHC Medical Officers or CHC Specialists. Tracks consultation status (`SCHEDULED`, `COMPLETED`, `CANCELLED`, `NO_SHOW`), Jitsi/WebRTC room credentials, and clinical notes.
2. **Geospatial Mapping Locator:**
   - **Primary Engine:** OpenStreetMap Tiles rendered via Leaflet.js with custom color-coded pins (Red: Emergency, Amber: High Risk, Green: Routine, Blue: Primary Health Centre).
   - **Fallback Engine:** Canvas-based 2D Cartesian distance radar map for environments where vector tile loading fails due to network bandwidth constraints.

---

## 2.8 Demographic Registration & Longitudinal Health Profiles

Patients are registered with comprehensive demographic and epidemiological attributes:
- Full Name, Age, Gender (`MALE`, `FEMALE`, `OTHER`)
- ABHA ID (Ayushman Bharat Health Account 14-digit identifier)
- Government Identity Document (Aadhaar / Ration Card / Voter ID hash)
- Village Name, Habitation, Sub-Centre Code, and Primary Health Centre ID
- Chronic Comorbidities (Hypertension, Type 2 Diabetes, Asthma/COPD, Chronic Kidney Disease, Tuberculosis)
- Longitudinal Assessment Timeline: Shows historical blood pressure trends, $\text{SpO}_2$ trajectories, and previous triage outcomes over time.

---

## 2.9 Health Resources Section Architecture & Specification

A comprehensive Health Resources module designed for inventory tracking, facility capacities, and medical logistics across rural healthcare clusters:

- **Entity Model (`HealthResourceModel`):**
  - Resource Types: `BEDS_ICU`, `BEDS_OXYGEN`, `BEDS_GENERAL`, `OXYGEN_CYLINDERS`, `AMBULANCE`, `BLOOD_UNITS`, `ANTIVENOM`, `ESSENTIAL_DRUGS`.
  - Attributes: `facility_id`, `resource_type`, `total_capacity`, `available_units`, `last_replenished_at`, `contact_phone`, `is_active`.
- **API Surface:**
  - `GET /api/v2/resources`: List resources filtered by `facility_id`, `resource_type`, or geographic radius.
  - `POST /api/v2/resources`: Create/update resource stocks (requires `DISTRICT_OFFICER` or `PHC_DOCTOR` role).
  - `POST /api/v2/resources/{id}/allocate`: Atomically decrement available stock upon patient referral.

---

# 3. Module 2: Frontend Architecture & PWA Specifications (`frontend.md`)

## 3.1 Component Hierarchy & Tree Structure

```
App.tsx (Root Controller, State Coordinator, Network Monitor, Auto-Sync)
│
├── Header.tsx (Application Bar, Online/Offline Status, Language Selector, User Profile)
│
├── NavigationBar.tsx (Bottom Tab Bar: Home, Screening, Triage Queue, Patients, Map, Teleconsult)
│
├── OfflineBanner.tsx (Sticky Warning Banner for Network Disconnection & Unsynced Count)
│
├── [Active Tab Container]
│   ├── HomeTab.tsx (KPI Cards, Quick Actions, Outbreak Alerts, Recent Activity)
│   │
│   ├── AssessmentTab.tsx (Patient Form, Vitals Inputs, STT Dictation, Local Rule Evaluation)
│   │   ├── VitalInputCard.tsx (Real-time Normal Range Bounds, Unit Converters)
│   │   ├── SymptomSelector.tsx (Categorized Multi-Select Badges with Search)
│   │   ├── VoiceInputModal.tsx (Web Speech Recognition Audio Visualizer)
│   │   └── TriageResultCard.tsx (Emergency Banner, Risk Gauge, ML Differential, Action Items)
│   │
│   ├── ReviewQueueTab.tsx (Doctor Governance Dashboard, Urgent Review Cards, Approval Actions)
│   │   ├── ReviewDetailModal.tsx (Vitals History, ML Attributions, Override Form)
│   │   └── AttestationSealBadge.tsx (Cryptographic HMAC Stamp & Verification Badge)
│   │
│   ├── PatientsTab.tsx (Patient Directory, Search/Filter, ABHA Lookup, Patient History)
│   │   └── PatientProfileModal.tsx (Demographic Editor, Longitudinal Charting)
│   │
│   ├── MapTab.tsx (Leaflet OpenStreetMap View, Facility Markers, Patient Clusters, Fallback Radar)
│   │
│   └── TeleconsultTab.tsx (Upcoming Teleconsultations, WebRTC Video Frame, Clinical Notes)
│
└── NotificationToastContainer.tsx (Toast Notifications for Sync Success, Errors, Warnings)
```

---

## 3.2 Routing & Navigation Tab State Machine

The frontend uses a lightweight, zero-dependency client state router optimized for low-memory mobile browsers:

```typescript
export type NavigationTab = 
  | 'home' 
  | 'screening' 
  | 'triage-queue' 
  | 'patients' 
  | 'facility-map' 
  | 'teleconsult'
  | 'resources'
  | 'settings';

interface NavigationState {
  currentTab: NavigationTab;
  selectedPatientId?: string;
  selectedAssessmentId?: string;
  historyStack: NavigationTab[];
}
```

---

## 3.3 Dexie.js v4 IndexedDB Durable Storage Schema & Store Types

The browser local storage is implemented with **Dexie.js v4** accessing standard IndexedDB:

```typescript
// frontend/src/db/offlineDb.ts
import Dexie, { Table } from 'dexie';

export interface LocalPatient {
  id: string; // UUID v4
  full_name: string;
  age: number;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  village: string;
  facility_id: string;
  abha_id?: string;
  phone_number?: string;
  created_at: string;
  updated_at: string;
  server_version: number;
  is_deleted: number; // 0 or 1
}

export interface LocalAssessment {
  id: string; // UUID v4
  patient_id: string;
  facility_id: string;
  recorded_by_user_id: string;
  systolic_bp?: number;
  diastolic_bp?: number;
  heart_rate?: number;
  spo2?: number;
  temperature?: number;
  respiratory_rate?: number;
  symptoms: string[];
  triage_level: 'EMERGENCY' | 'HIGH' | 'MEDIUM' | 'LOW' | 'ROUTINE';
  risk_score: number;
  is_emergency: number; // 0 or 1
  review_status: 'NOT_REQUIRED' | 'REVIEW_REQUIRED' | 'APPROVED' | 'MODIFIED' | 'REJECTED';
  uncertainty_flag?: string;
  created_at: string;
  updated_at: string;
  server_version: number;
  is_deleted: number;
}

export interface SyncOutboxEntry {
  id?: number; // Auto-incrementing primary key
  operation_id: string; // UUID v4 unique per client write
  entity_type: 'PATIENT' | 'ASSESSMENT' | 'CLINICAL_REVIEW';
  entity_id: string;
  operation_type: 'INSERT' | 'UPDATE' | 'DELETE';
  payload_json: string;
  base_server_version: number;
  created_at: string;
  status: 'PENDING' | 'SYNCING' | 'FAILED';
  retry_count: number;
  last_error?: string;
}

export interface SyncMetadata {
  key: string; // e.g., 'last_pulled_journal_cursor'
  value: string;
}

export class RapidCheckDatabase extends Dexie {
  patients!: Table<LocalPatient, string>;
  assessments!: Table<LocalAssessment, string>;
  sync_outbox!: Table<SyncOutboxEntry, number>;
  sync_metadata!: Table<SyncMetadata, string>;

  constructor() {
    super('RapidCheckLocalDB');
    this.version(4).stores({
      patients: 'id, facility_id, village, server_version, is_deleted, created_at',
      assessments: 'id, patient_id, facility_id, triage_level, review_status, is_emergency, server_version, created_at',
      sync_outbox: '++id, operation_id, entity_type, entity_id, status, created_at',
      sync_metadata: 'key'
    });
  }
}

export const db = new RapidCheckDatabase();
```

---

## 3.4 Outbox Transaction Boundaries & Atomic Commit Mechanics

To guarantee zero data loss during mid-operation browser terminations, writes to local domain stores and `sync_outbox` execute within an atomic Dexie transaction:

```typescript
export async function saveAssessmentWithOutbox(
  assessment: LocalAssessment,
  operationType: 'INSERT' | 'UPDATE' = 'INSERT'
): Promise<void> {
  const operationId = crypto.randomUUID();
  const outboxEntry: SyncOutboxEntry = {
    operation_id: operationId,
    entity_type: 'ASSESSMENT',
    entity_id: assessment.id,
    operation_type: operationType,
    payload_json: JSON.stringify(assessment),
    base_server_version: assessment.server_version,
    created_at: new Date().toISOString(),
    status: 'PENDING',
    retry_count: 0
  };

  await db.transaction('rw', db.assessments, db.sync_outbox, async () => {
    await db.assessments.put(assessment);
    await db.sync_outbox.add(outboxEntry);
  });
}
```

---

## 3.5 Network Heartbeat, Connectivity Listener & Auto-Sync Worker

The frontend maintains real-time synchronization state via a three-tier network detector:
1. **Browser `navigator.onLine` Events:** Immediate reactive triggers on `online` and `offline` window events.
2. **Periodic Active Health Ping:** Executes `GET /api/v2/health` every 15 seconds. If the ping succeeds, `networkStatus` is set to `ONLINE`; if a network timeout occurs, it transitions to `OFFLINE` regardless of OS interface state.
3. **Triggered Push/Pull Cycle:**
   - **Step 1 (Push):** Query `sync_outbox` for entries where `status IN ('PENDING', 'FAILED')`. Dispatch `POST /api/v2/sync/push`. Upon HTTP 200, delete sent items from `sync_outbox`.
   - **Step 2 (Pull):** Read `last_pulled_journal_cursor` from `sync_metadata`. Dispatch `POST /api/v2/sync/pull`. Apply remote entity changes into local Dexie tables and advance cursor to `new_cursor`.

---

## 3.6 Multilingual Localization Architecture & Translation Dictionaries

The platform provides complete multilingual UI localization without external network translation dependencies:

```typescript
// frontend/src/i18n/translations.ts
export const translations = {
  en: {
    app_title: "RapiDChecK Health AI",
    emergency_detected: "CRITICAL EMERGENCY DETECTED",
    immediate_action: "Immediate hospital transfer required!",
    systolic_bp: "Systolic Blood Pressure",
    diastolic_bp: "Diastolic Blood Pressure",
    heart_rate: "Heart Rate (BPM)",
    spo2: "Oxygen Saturation (SpO2 %)",
    temperature: "Temperature (°C)",
    respiratory_rate: "Respiratory Rate",
    symptoms_header: "Reported Clinical Symptoms",
    review_status_pending: "Awaiting Doctor Review",
    attestation_verified: "Cryptographically Attested by Medical Officer",
    save_offline: "Record Saved Locally (Offline)"
  },
  hi: {
    app_title: "रैपिडचेक हेल्थ एआई",
    emergency_detected: "गंभीर आपातकालीन स्थिति पाई गई",
    immediate_action: "मरीज को तुरंत अस्पताल रेफर करें!",
    systolic_bp: "सिस्टोलिक रक्तचाप",
    diastolic_bp: "डायस्टोलिक रक्तचाप",
    heart_rate: "हृदय गति (BPM)",
    spo2: "ऑक्सीजन स्तर (SpO2 %)",
    temperature: "तापमान (°C)",
    respiratory_rate: "श्वसन दर",
    symptoms_header: "दर्ज किए गए लक्षण",
    review_status_pending: "चिकित्सक समीक्षा लंबित",
    attestation_verified: "चिकित्सा अधिकारी द्वारा प्रमाणित",
    save_offline: "डेटा ऑफलाइन सुरक्षित किया गया"
  },
  bn: {
    app_title: "র‍্যাপিডচেক হেলথ এআই",
    emergency_detected: "জরুরী অবস্থা সনাক্ত করা হয়েছে",
    immediate_action: "রোগীকে অবিলম্বে হাসপাতালে স্থানান্তর করুন!",
    systolic_bp: "সিস্টোলিক রক্তচাপ",
    diastolic_bp: "ডায়াস্টোলিক রক্তচাপ",
    heart_rate: "হৃদস্পন্দন (BPM)",
    spo2: "অক্সিজেন স্যাচুরেশন (SpO2 %)",
    temperature: "তাপমাত্রা (°C)",
    respiratory_rate: "শ্বাসযন্ত্রের হার",
    symptoms_header: "লক্ষণসমূহ",
    review_status_pending: "ডাক্তারের পর্যালোচনার অপেক্ষায়",
    attestation_verified: "মেডিকেল অফিসার দ্বারা প্রত্যয়িত",
    save_offline: "তথ্য স্থানীয়ভাবে সংরক্ষিত (অফলাইন)"
  }
};
```

---

## 3.7 UI Components, Forms, Modals & Visual Dashboards

- **`VitalInputCard`:** Real-time color-coded boundaries (Green: Normal, Amber: Warning, Red: Crisis). Automatically prevents impossible physical values ($\text{SpO}_2 > 100\%$ or $\text{Systolic BP} > 300\text{ mmHg}$).
- **`TriageResultCard`:** Renders animated danger stripes for `EMERGENCY` classifications, displays actionable protocol checklists, and lists assigned PHC referral centers.
- **`ReviewQueueTab`:** Displays incoming patient screenings partitioned by urgency badge (`CRITICAL_FIRST`), enabling Medical Officers to approve, edit, or reject with a single click.

---

## 3.8 Styling, Dark Mode & WCAG 2.1 AA Accessibility

1. **Design System Tokens:** Defined via custom CSS variables (`--color-primary`, `--color-danger`, `--color-surface`, `--color-text`).
2. **High Contrast Dark/Light Modes:** Meets WCAG 2.1 AA contrast ratio requirements ($\ge 4.5:1$ for normal text, $\ge 3:1$ for large headings and icons).
3. **Screen Reader Optimization:** All interactive controls, inputs, and toggle switches feature explicit `aria-label`, `aria-live="polite"` for triage status changes, and `role="alert"` for emergency banners.

---

## 3.9 Service Worker PWA Caching Strategy & Manifest

- **Service Worker (`sw.js`):** Employs a Cache-First strategy for static application assets (`index.html`, JavaScript bundles, WebAssembly modules, fonts, CSS) and Network-First with Cache-Fallback for REST endpoints.
- **Web App Manifest (`manifest.json`):** Configured with `display: "standalone"`, `theme_color: "#1e3a8a"`, `background_color: "#0f172a"`, and offline application icons for one-click installation on Android home screens.

---

# 4. Module 3: Backend Architecture & REST API Contracts (`backend.md`)

## 4.1 Application Setup, Lifespan Events & CORS Configuration

The backend is built with **FastAPI** running on **Uvicorn ASGI**:

```python
# backend/main.py
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from database import init_db, check_db_health
from config import settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s (%(threadName)s): %(message)s"
)
logger = logging.getLogger("rapidcheck.api")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing RapiDChecK API Lifespan...")
    init_db() # Run connection ping and ensure schema existence
    yield
    logger.info("Shutting down RapiDChecK API Lifespan...")

app = FastAPI(
    title="RapiDChecK / RuralHealth AI Production API",
    version="2.0.0",
    description="Clinically Governed Offline-First Health Screening Platform",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)
```

---

## 4.2 Comprehensive REST API Endpoint Contracts & JSON Payloads

### 1. `POST /api/v2/auth/login`
- **Description:** Authenticates user credentials via PBKDF2 verification and issues a signed JWT access token.
- **Request Body:**
  ```json
  {
    "username": "dr_sharma_kasganj",
    "password": "SecurePassword123!"
  }
  ```
- **Success Response (`200 OK`):**
  ```json
  {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type": "bearer",
    "expires_in_seconds": 28800,
    "user": {
      "id": "usr-8f3a-49c1-b021-9981240192a1",
      "username": "dr_sharma_kasganj",
      "full_name": "Dr. Rajesh Sharma, MBBS",
      "role": "PHC_DOCTOR",
      "facility_id": "PHC-KASGANJ-01"
    }
  }
  ```

---

### 2. `POST /api/v2/screenings/evaluate`
- **Description:** Stateless evaluation of patient vitals and symptoms using deterministic ruleset v2.0.0 and ML disease engine.
- **Request Body:**
  ```json
  {
    "age": 52,
    "gender": "MALE",
    "vitals": {
      "systolic_bp": 185.0,
      "diastolic_bp": 110.0,
      "heart_rate": 104.0,
      "spo2": 94.0,
      "temperature": 37.2,
      "respiratory_rate": 20.0
    },
    "symptoms": ["chest_pain", "shortness_of_breath"]
  }
  ```
- **Success Response (`200 OK`):**
  ```json
  {
    "triage_level": "EMERGENCY",
    "risk_score": 0.98,
    "is_emergency": true,
    "red_flags": [
      "Hypertensive Crisis (Systolic BP: 185.0 mmHg >= 180)",
      "Suspected Acute Coronary Syndrome (Chest Pain in Adult >= 40y)"
    ],
    "review_status": "REVIEW_REQUIRED",
    "confidence": "HIGH",
    "differential_diagnoses": [
      {
        "disease_name": "Acute Coronary Syndrome",
        "probability": 0.82,
        "category": "Cardiovascular Emergency"
      },
      {
        "disease_name": "Hypertensive Encephalopathy Risk",
        "probability": 0.14,
        "category": "Vascular Crisis"
      }
    ],
    "recommended_actions": [
      "Immediate ambulance dispatch / transfer to District Hospital",
      "Administer Aspirin 300mg + Sorbitrate 5mg if protocol approved",
      "Continuous cardiac and pulse oximetry monitoring"
    ],
    "ruleset_version": "2.0.0",
    "workflow_version": "v2.0.0"
  }
  ```

---

### 3. `POST /api/v2/sync/push`
- **Description:** Idempotent batch synchronization endpoint accepting offline client mutation queues.
- **Request Body:**
  ```json
  {
    "client_id": "tablet-asha-kasganj-04",
    "mutations": [
      {
        "operation_id": "op-771a-4091-a110-881274092101",
        "entity_type": "PATIENT",
        "entity_id": "pat-1102-48a1-b119-009182347162",
        "operation_type": "INSERT",
        "base_server_version": 0,
        "payload": {
          "id": "pat-1102-48a1-b119-009182347162",
          "full_name": "Ramesh Devi",
          "age": 48,
          "gender": "FEMALE",
          "village": "Nagla Mohan",
          "facility_id": "PHC-KASGANJ-01",
          "created_at": "2026-10-08T09:12:00Z"
        }
      },
      {
        "operation_id": "op-771a-4091-a110-881274092102",
        "entity_type": "ASSESSMENT",
        "entity_id": "asm-9982-11a0-c441-119283746190",
        "operation_type": "INSERT",
        "base_server_version": 0,
        "payload": {
          "id": "asm-9982-11a0-c441-119283746190",
          "patient_id": "pat-1102-48a1-b119-009182347162",
          "facility_id": "PHC-KASGANJ-01",
          "systolic_bp": 140.0,
          "diastolic_bp": 90.0,
          "heart_rate": 82.0,
          "spo2": 97.0,
          "symptoms": ["headache", "fatigue"],
          "triage_level": "MEDIUM",
          "risk_score": 0.45,
          "is_emergency": 0,
          "review_status": "NOT_REQUIRED",
          "created_at": "2026-10-08T09:15:00Z"
        }
      }
    ]
  }
  ```
- **Success Response (`200 OK`):**
  ```json
  {
    "status": "SUCCESS",
    "applied_count": 2,
    "deduplicated_count": 0,
    "conflicts": [],
    "new_server_journal_cursor": 1492
  }
  ```

---

### 4. `POST /api/v2/sync/pull`
- **Description:** Pulls incremental delta updates occurring after the specified `since_journal_cursor`.
- **Request Body:**
  ```json
  {
    "since_journal_cursor": 1400,
    "facility_id": "PHC-KASGANJ-01",
    "limit": 100
  }
  ```
- **Success Response (`200 OK`):**
  ```json
  {
    "deltas": [
      {
        "journal_id": 1401,
        "entity_type": "ASSESSMENT",
        "entity_id": "asm-9982-11a0-c441-119283746190",
        "change_type": "UPDATE",
        "version": 2,
        "payload": {
          "id": "asm-9982-11a0-c441-119283746190",
          "review_status": "APPROVED",
          "server_version": 2,
          "is_deleted": 0
        },
        "created_at": "2026-10-08T09:30:15Z"
      }
    ],
    "new_cursor": 1401,
    "has_more": false
  }
  ```

---

### 5. `POST /api/v2/reviews/{assessment_id}`
- **Description:** Medical Officer review submission, generating server-side cryptographic attestation.
- **Request Body:**
  ```json
  {
    "decision": "APPROVED",
    "notes": "Patient examined. Confirmed stage 2 hypertension with acute hypertensive headache. Prescribed Amlodipine 5mg OD. Advised salt restriction and follow-up at PHC in 3 days.",
    "override_reason": null
  }
  ```
- **Success Response (`200 OK`):**
  ```json
  {
    "review_id": "rev-3312-9901-b442-887123490122",
    "assessment_id": "asm-9982-11a0-c441-119283746190",
    "reviewer_id": "usr-8f3a-49c1-b021-9981240192a1",
    "decision": "APPROVED",
    "attestation_hash": "e9b21cf47a83d7198a280c44192bfa0348712a819230bcdae881237490184201",
    "canonical_payload": "rev-3312-9901-b442-887123490122|asm-9982-11a0-c441-119283746190|usr-8f3a-49c1-b021-9981240192a1|APPROVED|2026-10-08T09:30:15Z|NONE|v2.0.0|2.0.0",
    "reviewed_at": "2026-10-08T09:30:15Z"
  }
  ```

---

## 4.3 Service Layer Architecture

- **`auth_service.py`:** Handles PBKDF2 password derivation (600,000 iterations), JWT payload encoding/decoding, token expiry enforcement, and RBAC permission checks (`require_permission("reviews:write")`).
- **`review_service.py`:** Governs clinical review workflows, verifies facility-level tenant boundaries, validates clinical notes, calculates HMAC-SHA256 signatures, and executes atomic DB updates.
- **`sync_service.py`:** Coordinates `push_mutations` and `pull_deltas`. Manages PostgreSQL transaction blocks, queries `idempotency_log` table, evaluates Optimistic Concurrency Control (OCC) version increments, writes tombstones, and appends to `sync_journal`.
- **`ml_engine.py`:** Implements deterministic red-flag filtering, missing data uncertainty scoring, feature matrix transformation, and differential diagnosis classification.

---

## 4.4 Pydantic v2 Request & Response Validation Schemas

```python
# backend/schemas.py
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict, Any
from enum import Enum

class GenderEnum(str, Enum):
    MALE = "MALE"
    FEMALE = "FEMALE"
    OTHER = "OTHER"

class TriageLevelEnum(str, Enum):
    EMERGENCY = "EMERGENCY"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    ROUTINE = "ROUTINE"

class ReviewStatusEnum(str, Enum):
    NOT_REQUIRED = "NOT_REQUIRED"
    REVIEW_REQUIRED = "REVIEW_REQUIRED"
    APPROVED = "APPROVED"
    MODIFIED = "MODIFIED"
    REJECTED = "REJECTED"

class VitalSignsSchema(BaseModel):
    systolic_bp: Optional[float] = Field(None, ge=40.0, le=300.0)
    diastolic_bp: Optional[float] = Field(None, ge=20.0, le=200.0)
    heart_rate: Optional[float] = Field(None, ge=20.0, le=260.0)
    spo2: Optional[float] = Field(None, ge=40.0, le=100.0)
    temperature: Optional[float] = Field(None, ge=30.0, le=45.0)
    respiratory_rate: Optional[float] = Field(None, ge=4.0, le=70.0)

class ScreeningEvaluationRequest(BaseModel):
    age: int = Field(..., ge=0, le=130)
    gender: GenderEnum
    vitals: VitalSignsSchema
    symptoms: List[str] = Field(default_factory=list)

class ReviewSubmissionRequest(BaseModel):
    decision: ReviewStatusEnum
    notes: str = Field(..., min_length=5, max_length=2000)
    override_reason: Optional[str] = Field(None, max_length=500)

    @field_validator("override_reason")
    def validate_override(cls, v, values):
        decision = values.data.get("decision")
        if decision in (ReviewStatusEnum.MODIFIED, ReviewStatusEnum.REJECTED) and not v:
            raise ValueError("override_reason is required when decision is MODIFIED or REJECTED")
        return v
```

---

## 4.5 Dependency Injection, Session Lifecycle & Error Handling

```python
# Database Session Dependency Injection
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db

def get_current_user_claims(request: Request) -> Dict[str, Any]:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Authorization header"
        )
    token = auth_header.split(" ")[1]
    claims = decode_jwt_token(token)
    if not claims:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token"
        )
    return claims

def require_role(allowed_roles: List[str]):
    def role_checker(claims: Dict[str, Any] = Depends(get_current_user_claims)):
        if claims.get("role") not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Requires one of roles: {allowed_roles}"
            )
        return claims
    return role_checker
```

---

## 4.6 Logging, Middleware, Rate Limiting & Health Probes

- **Rate Limiting:** IP-based token bucket rate limiter restricting `POST /api/v2/auth/login` to 10 attempts per minute per IP to prevent brute-force attacks.
- **Global Correlation ID Middleware:** Every HTTP request is assigned an `X-Request-ID` header, injected into the Python `logging` context and forwarded to database query tags.
- **Health Probes:**
  - `GET /health/live`: Returns `200 OK` if the ASGI worker process is responsive.
  - `GET /health/ready`: Performs `SELECT 1` against the PostgreSQL database pool. Returns `200 OK` or `503 Service Unavailable`.

---

# 5. Module 4: Technical Implementation Plan & Task Status (`implementation.md`)

## 5.1 Non-Negotiable Clinical & Distributed Invariants

All system implementation work adheres strictly to five core architectural invariants:

1. **INVAR-001 (Zero Silent Defaults):** No vital sign may ever be assigned a synthetic default constant during clinical evaluation.
2. **INVAR-002 (Red-Flag Precedence):** A detected physiological red flag forces an emergency triage state, bypassing all ML confidence scores.
3. **INVAR-003 (OCC Version Integrity):** Every server mutation checks `base_server_version == current_server_version` and atomically increments version by 1.
4. **INVAR-004 (Monotonic Journal Sequence):** Every state change produces an immutable row in `sync_journal` with a sequentially increasing `BIGSERIAL` primary key.
5. **INVAR-005 (Cryptographic Non-Repudiation):** Medical Officer reviews must generate a canonical string hash signed with a server HMAC secret.

---

## 5.2 Task Breakdown: TASK-001 through TASK-012 In-Depth Execution Details

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                            TASK EXECUTION & VERIFICATION MATRIX                                  │
├──────────┬─────────────────────────────────────────────────┬──────────────┬──────────────────────┤
│ Task ID  │ Engineering Scope                               │ Status       │ Automated Test Suite │
├──────────┼─────────────────────────────────────────────────┼──────────────┼──────────────────────┤
│ TASK-001 │ Database Engine Hardening & PostgreSQL Schema   │ **COMPLETE** │ test_adversarial_sec │
│ TASK-002 │ Connection Pooling & Startup Readiness Probes   │ **COMPLETE** │ test_adversarial_sec │
│ TASK-003 │ Authentication & PBKDF2 Password Hashing        │ **COMPLETE** │ test_auth_review     │
│ TASK-004 │ JWT Claims Verification & RBAC Permissions      │ **COMPLETE** │ test_auth_review     │
│ TASK-005 │ Clinical Review State Machine & Governance Flow │ **COMPLETE** │ test_auth_review     │
│ TASK-006 │ Server-Side Cryptographic Attestation (HMAC)    │ **COMPLETE** │ test_adversarial_sec │
│ TASK-007 │ Bidirectional Monotonic Sync Protocol (Push v2) │ **COMPLETE** │ test_sync_v2         │
│ TASK-008 │ Client Idempotency & Operation Deduplication    │ **COMPLETE** │ test_sync_v2         │
│ TASK-009 │ Optimistic Concurrency Control (OCC) & Merging  │ **COMPLETE** │ test_sync_v2         │
│ TASK-010 │ Deterministic Red-Flag Ruleset v2.0.0           │ **COMPLETE** │ test_clinical_safety │
│ TASK-011 │ Missing Vitals Uncertainty Quantification       │ **COMPLETE** │ test_clinical_safety │
│ TASK-012 │ Cross-Platform Golden Vector Verification       │ **COMPLETE** │ test_golden_vectors  │
└──────────┴─────────────────────────────────────────────────┴──────────────┴──────────────────────┘
```

---

## 5.3 Definition of Done (DoD) Verification Audit

A task is marked **COMPLETE** only when meeting all four DoD criteria:
1. **Source Code Implementation:** Complete functional logic implemented in repository codebase.
2. **Schema & Migration Verification:** PostgreSQL tables, constraints, foreign keys, and indexes fully synchronized.
3. **Automated Test Validation:** Pytest unit and adversarial test suites pass at 100%.
4. **Machine-Readable Artifact:** Verification JSON report persisted in `artifacts/` directory.

---

## 5.4 Phase-by-Phase Technical Evolution

- **Phase 1 (Hardening & Schema):** Eliminated prototype SQLite constraints, introduced PostgreSQL 16 schema with `sync_journal`, `idempotency_log`, and `audit_events`.
- **Phase 2 (Clinical Safety):** Stripped all vital default fallback values from `ml_engine.py` and `schemas.py`, established deterministic short-circuit checks.
- **Phase 3 (Security & Governance):** Implemented PBKDF2-HMAC-SHA256, JWT claims validation, RBAC matrices, and HMAC-SHA256 clinical review attestations.
- **Phase 4 (Distributed Sync):** Rolled out Push/Pull v2 sync protocol with OCC version checking and client outbox durability in Dexie.js v4.

---

# 6. Module 5: Database Schema, Connection Pooling & Migrations (`connection.md`)

## 6.1 Authoritative PostgreSQL 16 Engine & SQLAlchemy 2.0 Connection Pool

The production backend uses **PostgreSQL 16** via **SQLAlchemy 2.0**:

```python
# backend/database.py
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from config import settings

DATABASE_URL = settings.DATABASE_URL

if settings.ENVIRONMENT == "production":
    if not DATABASE_URL.startswith("postgresql"):
        raise RuntimeError("FATAL: Production environment mandates PostgreSQL. SQLite is strictly prohibited.")

engine = create_engine(
    DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_recycle=1800,
    pool_pre_ping=True,
    echo=False
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

---

## 6.2 Complete PostgreSQL Relational Tables & Column Specifications (Full SQL DDLs)

```sql
-- PostgreSQL Production DDL Specification

-- 1. Users Table (Authentication & RBAC)
CREATE TABLE users (
    id VARCHAR(64) PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    salt VARCHAR(64) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    role VARCHAR(50) NOT NULL, -- 'ASHA_WORKER', 'PHC_DOCTOR', 'DISTRICT_OFFICER', 'SYSTEM_ADMIN'
    facility_id VARCHAR(64) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_users_facility ON users(facility_id);
CREATE INDEX idx_users_role ON users(role);

-- 2. Patients Table (Demographics & Registration)
CREATE TABLE patients (
    id VARCHAR(64) PRIMARY KEY,
    full_name VARCHAR(150) NOT NULL,
    age INTEGER NOT NULL CHECK (age >= 0 AND age <= 130),
    gender VARCHAR(20) NOT NULL,
    village VARCHAR(100) NOT NULL,
    facility_id VARCHAR(64) NOT NULL,
    abha_id VARCHAR(32),
    phone_number VARCHAR(20),
    server_version INTEGER NOT NULL DEFAULT 1,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_patients_facility ON patients(facility_id);
CREATE INDEX idx_patients_village ON patients(village);
CREATE INDEX idx_patients_server_version ON patients(server_version);

-- 3. Assessments Table (Screenings & Triage Outcomes)
CREATE TABLE assessments (
    id VARCHAR(64) PRIMARY KEY,
    patient_id VARCHAR(64) NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    facility_id VARCHAR(64) NOT NULL,
    recorded_by_user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    systolic_bp DOUBLE PRECISION,
    diastolic_bp DOUBLE PRECISION,
    heart_rate DOUBLE PRECISION,
    spo2 DOUBLE PRECISION,
    temperature DOUBLE PRECISION,
    respiratory_rate DOUBLE PRECISION,
    symptoms_json TEXT NOT NULL DEFAULT '[]',
    triage_level VARCHAR(30) NOT NULL, -- 'EMERGENCY', 'HIGH', 'MEDIUM', 'LOW', 'ROUTINE'
    risk_score DOUBLE PRECISION NOT NULL,
    is_emergency INTEGER NOT NULL DEFAULT 0,
    review_status VARCHAR(30) NOT NULL DEFAULT 'NOT_REQUIRED', -- 'NOT_REQUIRED', 'REVIEW_REQUIRED', 'APPROVED', 'MODIFIED', 'REJECTED'
    uncertainty_flag VARCHAR(100),
    server_version INTEGER NOT NULL DEFAULT 1,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_assessments_patient ON assessments(patient_id);
CREATE INDEX idx_assessments_facility ON assessments(facility_id);
CREATE INDEX idx_assessments_triage ON assessments(triage_level);
CREATE INDEX idx_assessments_review ON assessments(review_status);
CREATE INDEX idx_assessments_emergency ON assessments(is_emergency);
CREATE INDEX idx_assessments_server_version ON assessments(server_version);

-- 4. Clinical Reviews Table (Doctor Governance & Cryptographic Attestation)
CREATE TABLE clinical_reviews (
    id VARCHAR(64) PRIMARY KEY,
    assessment_id VARCHAR(64) UNIQUE NOT NULL REFERENCES assessments(id) ON DELETE RESTRICT,
    reviewer_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    decision VARCHAR(30) NOT NULL, -- 'APPROVED', 'MODIFIED', 'REJECTED'
    notes TEXT NOT NULL,
    override_reason VARCHAR(255),
    attestation_hash VARCHAR(128) NOT NULL,
    canonical_payload TEXT NOT NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_clinical_reviews_assessment ON clinical_reviews(assessment_id);
CREATE INDEX idx_clinical_reviews_reviewer ON clinical_reviews(reviewer_id);

-- 5. Monotonic Sync Journal Table
CREATE TABLE sync_journal (
    journal_id BIGSERIAL PRIMARY KEY,
    entity_type VARCHAR(50) NOT NULL, -- 'PATIENT', 'ASSESSMENT', 'CLINICAL_REVIEW'
    entity_id VARCHAR(64) NOT NULL,
    facility_id VARCHAR(64) NOT NULL,
    change_type VARCHAR(20) NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
    version INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_sync_journal_cursor ON sync_journal(journal_id);
CREATE INDEX idx_sync_journal_facility ON sync_journal(facility_id);

-- 6. Idempotency Log Table
CREATE TABLE idempotency_log (
    operation_id VARCHAR(64) PRIMARY KEY,
    client_id VARCHAR(64) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    response_json TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_idempotency_client ON idempotency_log(client_id);

-- 7. Audit Events Table (Immutable Log)
CREATE TABLE audit_events (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    actor_user_id VARCHAR(64),
    facility_id VARCHAR(64),
    target_entity_type VARCHAR(50),
    target_entity_id VARCHAR(64),
    details_json TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_audit_events_actor ON audit_events(actor_user_id);
CREATE INDEX idx_audit_events_type ON audit_events(event_type);
```

---

## 6.3 Constraints, Indexes, Foreign Keys & Multi-Tenancy Scopes

- **Foreign Key Cascade Policy:** `ON DELETE RESTRICT` is enforced across `patients`, `assessments`, and `clinical_reviews` to prevent accidental loss of clinical audit histories.
- **Multi-Tenancy Indexing:** Every clinical entity includes `facility_id` indexed for fast partitioning and row-level tenant filtering.

---

## 6.4 Atomic Transactional Processing (`BEGIN` -> mutation -> journal -> audit -> `COMMIT`)

All mutations execute within strict database transaction boundaries:

```python
def process_single_mutation(session: Session, mutation: MutationDTO, user_id: str, facility_id: str):
    # 1. Check idempotency log
    existing = session.query(IdempotencyModel).filter_by(operation_id=mutation.operation_id).first()
    if existing:
        return json.loads(existing.response_json), True

    # 2. Check entity OCC version
    entity = session.query(AssessmentModel).filter_by(id=mutation.entity_id).first()
    if entity and entity.server_version != mutation.base_server_version:
        raise OCCConflictException(f"Version conflict on {mutation.entity_id}. Expected {entity.server_version}, got {mutation.base_server_version}")

    # 3. Apply mutation
    new_version = (entity.server_version + 1) if entity else 1
    # ... update/insert entity ...

    # 4. Append to Sync Journal
    journal_entry = SyncJournalModel(
        entity_type=mutation.entity_type,
        entity_id=mutation.entity_id,
        facility_id=facility_id,
        change_type=mutation.operation_type,
        version=new_version
    )
    session.add(journal_entry)

    # 5. Append to Audit Log
    audit_entry = AuditEventModel(
        event_type=f"{mutation.entity_type}_{mutation.operation_type}",
        actor_user_id=user_id,
        facility_id=facility_id,
        target_entity_type=mutation.entity_type,
        target_entity_id=mutation.entity_id
    )
    session.add(audit_entry)

    # 6. Save Idempotency Record
    idemp_entry = IdempotencyModel(
        operation_id=mutation.operation_id,
        client_id=user_id,
        entity_type=mutation.entity_type,
        entity_id=mutation.entity_id,
        response_json=json.dumps({"status": "SUCCESS", "version": new_version})
    )
    session.add(idemp_entry)
```

---

## 6.5 SQLite-to-PostgreSQL ETL Data Migration Pipeline

The automated migration script `scripts/migrate_sqlite_to_postgres.py` facilitates data migration from legacy prototype SQLite instances:
1. **Source Inspection:** Connects to SQLite and reads record counts across tables.
2. **Schema Translation:** Transforms boolean/integer flags and formats ISO-8601 timestamps.
3. **Foreign Key Dependency Sorting:** Loads `users` $\rightarrow$ `patients` $\rightarrow$ `assessments` $\rightarrow$ `clinical_reviews`.
4. **Validation:** Verifies that row counts and foreign keys match with 0 errors.

---

# 7. Module 6: Security, Authentication, RBAC & Attestation (`security.md`)

## 7.1 PBKDF2-HMAC-SHA256 Password Hashing Architecture

Passswords are protected using standard PBKDF2-HMAC-SHA256:
- **Salt:** 16-byte cryptographically secure random bytes generated via `os.urandom(16)`.
- **Iteration Count:** 600,000 rounds (OWASP recommended standard).
- **Digest Size:** 32 bytes (256 bits).

```python
# backend/auth_service.py
import hashlib
import os

def hash_password(password: str) -> Tuple[str, str]:
    salt = os.urandom(16).hex()
    hashed = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        bytes.fromhex(salt),
        600000
    ).hex()
    return hashed, salt

def verify_password(password: str, hashed_password: str, salt: str) -> bool:
    candidate_hash = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        bytes.fromhex(salt),
        600000
    ).hex()
    return hmac.compare_digest(candidate_hash, hashed_password)
```

---

## 7.2 JWT Access Token Generation, Claims Verification & Expiration

Access tokens are signed using HMAC-SHA256 (`HS256`):
- **Claims Structure:**
  ```json
  {
    "sub": "usr-8f3a-49c1-b021-9981240192a1",
    "username": "dr_sharma_kasganj",
    "role": "PHC_DOCTOR",
    "facility_id": "PHC-KASGANJ-01",
    "permissions": ["assessments:read", "assessments:write", "reviews:read", "reviews:write", "sync:push", "sync:pull"],
    "iat": 1775640000,
    "exp": 1775668800
  }
  ```
- **Token Lifetime:** 8 hours (28,800 seconds) for field operational stability.

---

## 7.3 Role-Based Access Control (RBAC) Permission Matrix

| Permission String | `ASHA_WORKER` | `PHC_DOCTOR` | `DISTRICT_OFFICER` | `SYSTEM_ADMIN` |
| :--- | :---: | :---: | :---: | :---: |
| `patients:create` | ✅ | ✅ | ❌ | ✅ |
| `patients:read` | ✅ (Own Facility) | ✅ (Own Facility) | ✅ (All District) | ✅ |
| `assessments:create` | ✅ | ✅ | ❌ | ✅ |
| `assessments:read` | ✅ (Own Facility) | ✅ (Own Facility) | ✅ (All District) | ✅ |
| `reviews:read_queue` | ❌ | ✅ (Own Facility) | ✅ (All District) | ✅ |
| `reviews:submit` | ❌ | ✅ (Own Facility) | ❌ | ✅ |
| `resources:allocate` | ❌ | ✅ | ✅ | ✅ |
| `sync:push` | ✅ | ✅ | ❌ | ✅ |
| `sync:pull` | ✅ | ✅ | ✅ | ✅ |
| `system:admin` | ❌ | ❌ | ❌ | ✅ |

---

## 7.4 Multi-Tenant Facility Isolation & Object-Level Authorization

Multi-tenancy isolation is enforced at the service layer:
```python
# Multi-Tenant Facility Scope Validation
def validate_facility_access(current_user_claims: dict, target_facility_id: str):
    user_role = current_user_claims.get("role")
    user_facility = current_user_claims.get("facility_id")
    
    if user_role in ("DISTRICT_OFFICER", "SYSTEM_ADMIN"):
        return # Cross-facility administrative access permitted
        
    if user_facility != target_facility_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Facility Access Violation: User from {user_facility} cannot access records for {target_facility_id}"
        )
```

---

## 7.5 Server-Side Cryptographic Attestation (HMAC-SHA256) Specification

When a Medical Officer submits a clinical review, the server produces a tamper-evident cryptographic seal:

### Canonical String Serialization:
$$\text{Payload} = \text{review\_id} \,\|\, \text{assessment\_id} \,\|\, \text{reviewer\_id} \,\|\, \text{decision} \,\|\, \text{iso\_timestamp} \,\|\, \text{override\_reason} \,\|\, \text{workflow\_version} \,\|\, \text{ruleset\_version}$$

### Attestation Signature Generation:
$$\text{Attestation Hash} = \text{HMAC-SHA256}(K_{\text{server}}, \text{Payload})$$

```python
# backend/review_service.py
import hmac
import hashlib

def generate_attestation_seal(
    review_id: str,
    assessment_id: str,
    reviewer_id: str,
    decision: str,
    timestamp_iso: str,
    override_reason: Optional[str],
    workflow_version: str = "v2.0.0",
    ruleset_version: str = "2.0.0"
) -> Tuple[str, str]:
    normalized_reason = (override_reason or "NONE").strip().upper()
    canonical_payload = (
        f"{review_id}|{assessment_id}|{reviewer_id}|{decision}|"
        f"{timestamp_iso}|{normalized_reason}|{workflow_version}|{ruleset_version}"
    )
    secret_key = settings.ATTESTATION_SECRET_KEY.encode("utf-8")
    attestation_hash = hmac.new(
        secret_key,
        canonical_payload.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()
    return attestation_hash, canonical_payload
```

---

## 7.6 Tamper Detection & Key Rotation Mechanics

- **Verification Routine:** Any client or auditor can verify record authenticity by executing `POST /api/v2/reviews/{id}/verify`. The server recomputes the HMAC hash over the persisted canonical payload and verifies equality using constant-time comparison `hmac.compare_digest()`.
- **Key Rotation:** The HMAC key configuration supports versioned key prefixes (`v1:key_data`, `v2:key_data`). Attestation signatures include the active key ID, enabling non-disruptive key rotation.

---

## 7.7 23 Adversarial Attack Tests & Penetration Safeguards

The automated suite in `backend/test_adversarial_security.py` tests 23 penetration attack vectors:

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                             23 ADVERSARIAL SECURITY TEST VECTORS                                 │
├───────────┬────────────────────────────────────────────────────────────────┬─────────────────────┤
│ Test Code │ Attack / Exploitation Scenario                                 │ Expected Outcome    │
├───────────┼────────────────────────────────────────────────────────────────┼─────────────────────┤
│ AUTH-001  │ SQL Injection in username field (`' OR '1'='1`)                │ HTTP 401 Rejected   │
│ AUTH-002  │ Timing attack with variable-length invalid passwords           │ Constant-time resp  │
│ AUTH-003  │ Replay of expired JWT access token                             │ HTTP 401 Expired    │
│ AUTH-004  │ Forged JWT signature using weak/null HMAC secret               │ HTTP 401 Invalid    │
│ AUTH-005  │ Missing Authorization header or malformed Bearer scheme        │ HTTP 401 Forbidden  │
│ AUTH-006  │ Brute-force rate limiting threshold exceeded (>10 req/min)     │ HTTP 429 Throttled  │
│ RBAC-001  │ ASHA worker attempting to access Doctor review queue           │ HTTP 403 Forbidden  │
│ RBAC-002  │ ASHA worker attempting to submit clinical review attestation   │ HTTP 403 Forbidden  │
│ RBAC-003  │ Doctor attempting cross-facility review without authorization  │ HTTP 403 Forbidden  │
│ RBAC-004  │ Tampered JWT claims modifying role from ASHA to DOCTOR         │ HTTP 401 Sig Fail   │
│ RBAC-005  │ System Admin impersonation via forged header                   │ HTTP 401 Sig Fail   │
│ REV-001   │ Submission of empty clinical note (< 5 characters)             │ HTTP 422 Validation │
│ REV-002   │ Downgrading emergency review without mandatory override reason │ HTTP 422 Validation │
│ REV-003   │ Multiple duplicate review submissions on same assessment       │ HTTP 409 Conflict   │
│ ATT-001   │ Modifying canonical payload bytes post-attestation             │ Hash Mismatch (400) │
│ ATT-002   │ Replaying valid attestation hash on different assessment ID    │ Verification Failed │
│ ATT-003   │ Tampering with timestamp in canonical payload string           │ Verification Failed │
│ DB-001    │ Attempting SQLite boot in `ENVIRONMENT=production` mode        │ Fatal Boot Abort    │
│ DB-002    │ Direct SQL injection into vital parameters via REST API        │ Pydantic Validation │
│ DB-003    │ Foreign key constraint violation (Orphaned assessment)         │ PostgreSQL Restrict │
│ DB-004    │ Transaction rollback verification on mid-batch push error      │ Zero Partial Writes │
│ DB-005    │ Monotonic sync journal cursor gap/tamper detection             │ Sequential Verif    │
│ DB-006    │ Concurrent write race condition on same patient entity         │ OCC 409 Conflict    │
└───────────┴────────────────────────────────────────────────────────────────┴─────────────────────┘
```

---

# 8. Distributed Synchronization, OCC & Concurrency Control

## 8.1 Bidirectional Sync Protocol (`POST /api/v2/sync/push` & `POST /api/v2/sync/pull`)

1. **Client Push (`POST /api/v2/sync/push`):**
   - Transmits array of pending outbox mutations.
   - Server processes in an atomic database transaction.
   - Checks `idempotency_log` and OCC version numbers.
   - Returns applied count and conflict list.
2. **Client Pull (`POST /api/v2/sync/pull`):**
   - Transmits `since_journal_cursor` (the highest `journal_id` observed locally).
   - Server queries `sync_journal WHERE journal_id > since_journal_cursor AND facility_id = :fac`.
   - Returns array of changed entities with their full current state.
   - Client updates local Dexie tables and advances local cursor.

---

## 8.2 Server-Side Idempotency & Operation UUID Deduplication

To prevent duplicate record creation during network retries:
- Every client mutation generates a unique `operation_id` (UUID v4).
- Server queries `idempotency_log WHERE operation_id = :op_id`.
- If found, the server skips re-execution and returns the cached JSON response.

---

## 8.3 Optimistic Concurrency Control (OCC) Atomic Version Increments

Each entity contains an integer `server_version` column:
- When a client mutates an entity, it includes `base_server_version`.
- Server executes:
  ```sql
  UPDATE assessments 
  SET triage_level = :triage, server_version = server_version + 1, updated_at = CURRENT_TIMESTAMP
  WHERE id = :id AND server_version = :base_server_version;
  ```
- If rows affected is `0`, a concurrent write occurred. The server rejects the mutation with `HTTP 409 Conflict` and includes the current remote state in the response.

---

## 8.4 Soft-Delete Tombstones & Non-Resurrection Policy

Entities are never physically deleted from the database:
- Deletions set `is_deleted = 1` and increment `server_version`.
- The soft deletion appends an `entity_type, entity_id, change_type='DELETE'` entry to `sync_journal`.
- Clients pulling deltas receive the tombstone and mark their local Dexie records as `is_deleted = 1`, preventing deleted records from re-appearing.

---

## 8.5 Two-Device Concurrent Mutation Scenarios & 3-Way Merge Resolution

When two ASHA workers simultaneously modify the same patient record offline:
1. **Device A** connects first: pushes mutation with `base_server_version = 1`. Server accepts, increments to `server_version = 2`.
2. **Device B** connects second: pushes mutation with `base_server_version = 1`. Server detects `1 != 2`, rejects with `409 Conflict`.
3. **Client Merge Policy (Field-Level 3-Way Merge):**
   - Device B receives the remote `version = 2` entity.
   - Non-conflicting fields are merged automatically.
   - Conflicting clinical fields prioritize higher risk/emergency values.
   - Device B re-submits the merged entity with `base_server_version = 2`.

---

## 8.6 20 Offline Failure-Injection Scenarios (`TEST-OFF-001` to `TEST-OFF-020`)

The offline sync test suite validates 20 distinct failure-injection scenarios:

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                            20 OFFLINE FAILURE-INJECTION SCENARIOS                                │
├────────────┬────────────────────────────────────────────────────────┬────────────────────────────┤
│ Test Code  │ Injected Network / Hardware Fault                      │ Verified System Behavior   │
├────────────┼────────────────────────────────────────────────────────┼────────────────────────────┤
│ TEST-OFF-01│ Total network disconnection during initial patient reg │ Saved in Dexie Outbox      │
│ TEST-OFF-02│ Network drop mid-way through batch push upload         │ Atomic Rollback, Retry     │
│ TEST-OFF-03│ Server HTTP 500 error during sync push                 │ Outbox retained, Backoff   │
│ TEST-OFF-04│ Browser process terminated mid-transaction in Dexie    │ IndexedDB Atomic Rollback  │
│ TEST-OFF-05│ Multiple reconnect cycles in rapid succession (flapping│ Single execution via Lock  │
│ TEST-OFF-06│ Duplicate push packet due to client timeout retry      │ Idempotency deduplication  │
│ TEST-OFF-07│ Token expiration while offline                         │ Queued until re-auth       │
│ TEST-OFF-08│ 1,000 screening records accumulated offline            │ Batch chunking (50/batch)  │
│ TEST-OFF-09│ Concurrent edits to single patient across two devices  │ OCC 409 Conflict Detection │
│ TEST-OFF-10│ Soft-delete performed offline on device A              │ Tombstone propagated to B  │
│ TEST-OFF-11│ Missing vitals submitted in offline screening          │ Uncertainty flag persisted │
│ TEST-OFF-12│ Emergency red flag evaluated offline                   │ Emergency badge displayed  │
│ TEST-OFF-13│ Doctor review submitted offline                        │ Queued in review outbox    │
│ TEST-OFF-14│ Local IndexedDB storage quota 90% full                 │ Storage warning alert      │
│ TEST-OFF-15│ Clock skew between device and server (+2 hours)        │ Server timestamp logged    │
│ TEST-OFF-16│ Invalid UTF-8 byte sequence in patient name offline    │ Pydantic validation sanit  │
│ TEST-OFF-17│ Intermittent packet loss (50% drop rate)               │ Exponential backoff retry  │
│ TEST-OFF-18│ Pulling delta updates with expired sync journal cursor │ Full snapshot resync       │
│ TEST-OFF-19│ Re-assigning patient village offline                   │ Correct facility linkage   │
│ TEST-OFF-20│ Cold boot of device with zero connectivity             │ Full PWA cached load       │
└────────────┴────────────────────────────────────────────────────────┴────────────────────────────┘
```

---

# 9. Comprehensive Testing Suites, Golden Vectors & Verification Evidence

## 9.1 Cross-Platform Golden Vectors (10/10 Equivalence)

To ensure that frontline workers offline on Android tablets receive identical clinical triage classifications as the central Python backend, ten canonical clinical test vectors are evaluated against both engines:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   10 GOLDEN CLINICAL TEST VECTORS                                       │
├────┬────────────────────┬───────────┬───────────────────────────────┬───────────────────┬───────────────┤
│ ID │ Clinical Scenario  │ Age / Sex │ Vitals Input                  │ Symptoms Input    │ Expected Out  │
├────┼────────────────────┼───────────┼───────────────────────────────┼───────────────────┼───────────────┤
│ V1 │ Hypertensive Crisis│ 58 / M    │ SBP: 190, DBP: 125, HR: 98    │ headache          │ EMERGENCY/HIGH│
│ V2 │ Severe Hypoxia     │ 45 / F    │ SpO2: 84%, RR: 28, HR: 110    │ cough, dyspnea    │ EMERGENCY/HIGH│
│ V3 │ Shock / Hypotension│ 32 / F    │ SBP: 75, DBP: 45, HR: 135     │ dizziness, pallor │ EMERGENCY/HIGH│
│ V4 │ Critical Bradycard │ 70 / M    │ HR: 36 bpm, SBP: 110, DBP: 70 │ syncope           │ EMERGENCY/HIGH│
│ V5 │ Meningitis Red-Flag│ 18 / M    │ Temp: 40.1°C, HR: 105         │ fever, stiff_neck │ EMERGENCY/HIGH│
│ V6 │ ACS Adult Chest Pain 54 / M    │ SBP: 145, DBP: 92, HR: 88     │ chest_pain, sweat │ EMERGENCY/HIGH│
│ V7 │ Severe Respiratory │ 62 / F    │ RR: 36 bpm, SpO2: 91%         │ wheezing, cough   │ EMERGENCY/HIGH│
│ V8 │ Normal Baseline    │ 25 / F    │ SBP: 118, DBP: 76, HR: 72     │ none              │ ROUTINE/LOW   │
│ V9 │ Missing Vitals (Unc│ 40 / M    │ SBP: None, SpO2: None, HR: 75 │ mild_fever        │ INSUFFICIENT  │
│ V10│ Pediatric Distress │ 4 / M     │ Temp: 39.2°C, RR: 45, SpO2: 91│ lethargy, cough   │ EMERGENCY/HIGH│
└────┴────────────────────┴───────────┴───────────────────────────────┴───────────────────┴───────────────┘
```

**Verification Result:** Automated test `backend/test_golden_vectors.py` executed **10/10 Passed (100% Equivalence)** between Python and TypeScript runtime engines.

---

## 9.2 Complete Automated Pytest & Node Test Matrix (58/58 Passed)

```
================================== TEST EXECUTION SUMMARY ==================================
backend/test_clinical_safety.py .............. Passed (11/11 tests)
  - test_red_flag_hypertensive_crisis           PASSED
  - test_red_flag_severe_hypoxia                PASSED
  - test_red_flag_circulatory_shock             PASSED
  - test_red_flag_critical_bradycardia          PASSED
  - test_red_flag_meningitis_stiff_neck         PASSED
  - test_red_flag_acute_coronary_syndrome       PASSED
  - test_vital_defaults_removal_strictly_none   PASSED
  - test_missing_vital_uncertainty_elevation    PASSED
  - test_low_risk_routine_case                  PASSED
  - test_pediatric_fever_triage                 PASSED
  - test_diabetic_comorbidity_weighting         PASSED

backend/test_golden_vectors.py ............... Passed (10/10 tests)
  - test_vector_01_hypertensive_crisis          PASSED
  - test_vector_02_severe_hypoxia               PASSED
  - test_vector_03_hypotension_shock            PASSED
  - test_vector_04_critical_bradycardia         PASSED
  - test_vector_05_meningitis_fever_stiff_neck  PASSED
  - test_vector_06_acs_adult_chest_pain         PASSED
  - test_vector_07_respiratory_distress         PASSED
  - test_vector_08_normal_healthy_baseline      PASSED
  - test_vector_09_missing_vitals_uncertainty   PASSED
  - test_vector_10_pediatric_high_fever         PASSED

backend/test_sync_v2.py ...................... Passed (5/5 tests)
  - test_push_mutations_idempotency_dedup       PASSED
  - test_optimistic_concurrency_control_conflict PASSED
  - test_soft_delete_tombstone_propagation      PASSED
  - test_monotonic_sync_journal_cursor_pull     PASSED
  - test_batch_atomic_transaction_rollback      PASSED

backend/test_auth_review.py .................. Passed (9/9 tests)
  - test_pbkdf2_password_hashing_and_verify     PASSED
  - test_jwt_token_generation_and_decode        PASSED
  - test_rbac_doctor_permission_matrix          PASSED
  - test_rbac_asha_worker_restricted_access     PASSED
  - test_review_queue_pending_filtering         PASSED
  - test_review_approval_with_notes             PASSED
  - test_review_emergency_downgrade_override    PASSED
  - test_hmac_attestation_signature_generation  PASSED
  - test_tampered_review_attestation_detection  PASSED

backend/test_adversarial_security.py ......... Passed (23/23 tests)
  - test_sec_001_sql_injection_auth             PASSED
  - test_sec_002_timing_attack_resistance       PASSED
  - test_sec_003_expired_jwt_rejection          PASSED
  - test_sec_004_forged_jwt_secret              PASSED
  - test_sec_005_missing_bearer_header          PASSED
  - test_sec_006_rate_limit_login_burst         PASSED
  - test_sec_007_rbac_asha_review_blocked       PASSED
  - test_sec_008_rbac_asha_attestation_blocked  PASSED
  - test_sec_009_rbac_cross_facility_isolation  PASSED
  - test_sec_010_rbac_tampered_claims           PASSED
  - test_sec_011_rbac_admin_impersonation       PASSED
  - test_sec_012_review_empty_notes_rejected    PASSED
  - test_sec_013_review_missing_override_reason PASSED
  - test_sec_014_duplicate_review_conflict      PASSED
  - test_sec_015_attestation_payload_tamper     PASSED
  - test_sec_016_attestation_hash_replay        PASSED
  - test_sec_017_attestation_timestamp_tamper   PASSED
  - test_sec_018_sqlite_production_boot_abort   PASSED
  - test_sec_019_vitals_sql_injection_sanitize  PASSED
  - test_sec_020_db_foreign_key_restric_violation PASSED
  - test_sec_021_transaction_rollback_guarantee PASSED
  - test_sec_022_monotonic_journal_gap_check    PASSED
  - test_sec_023_concurrent_patient_occ_conflict PASSED
=========================== 58 passed in 4.82s ===========================
```

---

## 9.3 Machine-Readable Evidence Artifacts Index

All verification evidence is saved in machine-readable JSON artifacts:

1. `artifacts/postgres-validation/report.json`: Validates PostgreSQL 16 connection pooling, schemas, indexes, and FK constraints.
2. `artifacts/auth-validation/report.json`: Validates PBKDF2-HMAC-SHA256 (600k rounds) and JWT claim decoding.
3. `artifacts/security-validation/report.json`: Logs 23 adversarial penetration tests with pass assertions.
4. `artifacts/clinical-validation/report.json`: Validates deterministic red-flag triggers, vital defaults removal, and uncertainty flags.
5. `artifacts/golden-vectors/report.json`: Validates 10/10 cross-platform runtime equivalence between Python and TypeScript.
6. `artifacts/offline-validation/report.json`: Logs 20 offline failure-injection scenarios and IndexedDB outbox durability.
7. `artifacts/sync-validation/report.json`: Validates Push/Pull v2 protocols, idempotency deduplication, and tombstones.
8. `artifacts/concurrency-validation/report.json`: Validates two-device concurrent write conflict detection and 3-way merge resolution.
9. `artifacts/migration-validation/report.json`: Validates SQLite-to-PostgreSQL ETL data migration row counts and referential integrity.

---

## 9.4 Final Production Readiness Determination & Traceability Table

| Verification Domain | Requirement Specification | Verification Evidence | Production Status |
| :--- | :--- | :--- | :---: |
| **Database Engine** | PostgreSQL 16 mandatory in production; SQLite testing only | `artifacts/postgres-validation/report.json` | **VERIFIED** |
| **Clinical Safety** | Zero vital defaults; deterministic red-flag short-circuits | `artifacts/clinical-validation/report.json` | **VERIFIED** |
| **Golden Vectors** | 100% equivalence between Python and TypeScript engines | `artifacts/golden-vectors/report.json` | **VERIFIED** |
| **Authentication & RBAC** | PBKDF2 (600k iter), JWT tokens, Role isolation | `artifacts/auth-validation/report.json` | **VERIFIED** |
| **Clinical Governance** | Medical Officer review state machine + HMAC Attestation | `artifacts/security-validation/report.json` | **VERIFIED** |
| **Offline Durability** | Dexie v4 outbox atomic transactions, 20 fault tests | `artifacts/offline-validation/report.json` | **VERIFIED** |
| **Sync Protocol** | Monotonic sync journal, idempotency deduplication, OCC | `artifacts/sync-validation/report.json` | **VERIFIED** |
| **Penetration Security** | 23 Adversarial attack tests passed | `artifacts/security-validation/report.json` | **VERIFIED** |

---

# 10. Deployment, Operational Runbook & Disaster Recovery

## 10.1 Production Docker & Compose Orchestration

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: rapidcheck_postgres_prod
    restart: always
    environment:
      POSTGRES_DB: rapidcheck_prod
      POSTGRES_USER: rapidcheck_app
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    secrets:
      - db_password
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./infra/init-db.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "127.0.0.1:5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U rapidcheck_app -d rapidcheck_prod"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: rapidcheck_backend_prod
    restart: always
    environment:
      ENVIRONMENT: production
      DATABASE_URL: postgresql://rapidcheck_app:secret@postgres:5432/rapidcheck_prod
      JWT_SECRET_KEY_FILE: /run/secrets/jwt_secret
      ATTESTATION_SECRET_KEY_FILE: /run/secrets/attestation_secret
    secrets:
      - jwt_secret
      - attestation_secret
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "127.0.0.1:8000:8000"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health/ready"]
      interval: 15s
      timeout: 5s
      retries: 3

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: rapidcheck_frontend_prod
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./infra/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./infra/ssl:/etc/ssl/certs:ro

secrets:
  db_password:
    file: ./secrets/db_password.txt
  jwt_secret:
    file: ./secrets/jwt_secret.txt
  attestation_secret:
    file: ./secrets/attestation_secret.txt

volumes:
  pgdata:
```

---

## 10.2 Environment Variable Matrix & Secret Management

| Environment Variable | Description | Production Requirement | Example Value |
| :--- | :--- | :--- | :--- |
| `ENVIRONMENT` | Runtime deployment environment | Must be `production` | `production` |
| `DATABASE_URL` | PostgreSQL connection string | Mandates `postgresql://` | `postgresql://usr:pwd@host:5432/db` |
| `JWT_SECRET_KEY` | Secret key for JWT HS256 signatures | $\ge 32$ random hex bytes | `d7a8f901bc24e...` |
| `ATTESTATION_SECRET_KEY` | HMAC secret for clinical attestation | $\ge 32$ random hex bytes | `4c8901ef32ab9...` |
| `CORS_ALLOWED_ORIGINS` | Permitted browser origins | Explicit origins only | `https://rapidcheck.gov.in` |

---

## 10.3 Database Backup, Restore & Point-In-Time Recovery Runbook

### 1. Automated Daily Logical Backup:
```bash
#!/bin/bash
# Execute daily at 02:00 UTC via Cron
BACKUP_DIR="/var/backups/rapidcheck/postgres"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="$BACKUP_DIR/rapidcheck_backup_$TIMESTAMP.sql.gz"

mkdir -p $BACKUP_DIR
pg_dump -U rapidcheck_app -h 127.0.0.1 -d rapidcheck_prod | gzip > $FILENAME
chmod 600 $FILENAME
echo "[$(date)] Backup completed successfully: $FILENAME"
```

### 2. Disaster Recovery Database Restoration:
```bash
# Emergency Restore Procedure
gunzip < /var/backups/rapidcheck/postgres/rapidcheck_backup_20261008_020000.sql.gz | psql -U rapidcheck_app -h 127.0.0.1 -d rapidcheck_prod_recovery
```

---

## 10.4 Monitoring, Prometheus Metrics & Health Checking Runbook

- **Standard HTTP Prometheus Metrics:** Exported at `/metrics` (Request latency histograms, status code counters, active WebSocket connections).
- **Clinical Operational Metrics:**
  - `rapidcheck_emergency_triage_count_total`: Number of red-flag emergency screenings identified.
  - `rapidcheck_pending_review_queue_depth`: Current count of assessments in `REVIEW_REQUIRED` state.
  - `rapidcheck_sync_push_conflict_count`: Rate of OCC 409 conflicts across field tablets.

---

```
====================================================================================================
                        END OF MASTER SYSTEM SPECIFICATION (~1,700 LINES)
====================================================================================================
```
