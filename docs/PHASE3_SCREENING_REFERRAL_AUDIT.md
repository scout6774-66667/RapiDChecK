# RuralHealth AI — Phase 3: Screening, Clinical Triage, and Referral Workflow Audit

**Project:** RuralHealth AI Decision Support Platform  
**Repository:** `sohamghosh1762-max/RapiDChecK`  
**Application Subdirectory:** `Health-AI-main/`  
**Audit Date:** October 2026  
**Auditor / Engineering Lead:** AI Systems Engineer & Antigravity IDE  

---

## Executive Summary

Phase 3 audited, completed, and validated the end-to-end patient screening, deterministic clinical triage, clinician review attestation, and facility-scoped referral lifecycle for the RuralHealth AI community platform.

Prior to Phase 3, role-based dashboards, cryptographic review attestation (HMAC), database migrations, and offline sync engines (Dexie v4 durable outbox with OCC) had been implemented. However, the active frontend screening workflow (`ScreenPatientPage.tsx`) was bypassing the atomic outbox queue, calling a legacy clinical rules evaluator that defaulted unmeasured vitals to normal physiological constants (e.g. 120/80 mmHg, 98.6°F, 100 mg/dL), squashing `INSUFFICIENT_DATA` into `'LOW'`, and failing to isolate appointments by facility at the database schema and sync level.

During Phase 3:
1. **Frontend Screening Engine Alignment:** Replaced legacy heuristic code with the canonical, test-verified clinical evaluator (`evaluator.ts`) matching `ml_engine.py` 1:1.
2. **Strict Vital Sign Nullability:** Enforced explicit nullability on all vital sign parameters across frontend intake forms, `ScreenPatientPage.tsx`, and `PatientDirectory.tsx`, preventing silent defaulting to normal.
3. **Atomic Outbox Integration:** Refactored `ScreenPatientPage.tsx` to commit all patient creations, clinical assessments, and referral status transitions through `savePatientAtomic`, `saveAssessmentAtomic`, and `updateReferralAtomic`.
4. **Backend Facility Scoping for Appointments:** Added `facility_id` to `AppointmentModel` with automatic schema migration, updated Pydantic schemas, and enforced object-level facility checks during sync operations.
5. **Transparent Duplicate Patient Detection:** Added demographic and National Health ID transparent matching on the server (`create_patient`), plus proactive duplicate candidate surfacing in `Step1PatientInfo.tsx`.
6. **Automated End-to-End Validation:** Created `test_phase3_workflow.py` (14/14 tests passing) and `test_phase3_frontend.js` (5/5 checks passing). The backend suite now totals **162/162 passing tests** and frontend golden vectors pass **10/10**.

---

## 1. Initial Gap Matrix

| Domain / Requirement | Initial Repository Status | Phase 3 Verification & Implementation | Final Status |
| :--- | :--- | :--- | :--- |
| **Patient Registration Validation** | Implemented in schemas (`PatientCreate`) | Verified Pydantic biological limits (age 1–125). Added client-side validation warnings. | **Verified & Passing** |
| **Duplicate Patient Prevention** | Absent on server; basic search in client | Added transparent NHID and name+phone+facility deduplication in `create_patient`. Added duplicate candidate alert banner in `Step1PatientInfo.tsx`. | **Verified & Passing** |
| **Server-Enforced Facility Scoping (Patients)** | Implemented in API | Verified `create_patient` and `get_patient` enforce token facility. Cross-facility access returns 403 Forbidden. | **Verified & Passing** |
| **Server-Enforced Facility Scoping (Appointments)** | Incomplete (`facility_id` missing from model) | Added `facility_id` to `AppointmentModel`, SQLite column migration, and `apply_appointment_operation` checks. | **Verified & Passing** |
| **Deterministic Clinical Engine** | Implemented in `evaluator.ts` / `ml_engine.py` | Verified 10/10 golden vectors. Replaced legacy `clinicalRules.ts` call in `ScreenPatientPage.tsx`. | **Verified & Passing** |
| **Strict Vital Nullability** | Defective in frontend (defaulted to 120/80/98.6) | Stripped silent defaults in `ScreenPatientPage.tsx` and `PatientDirectory.tsx`; missing vitals evaluate to `INSUFFICIENT_DATA`. | **Verified & Passing** |
| **Emergency Red-Flag Short-Circuit** | Implemented in `evaluator.ts` / `ml_engine.py` | Verified hypertensive crisis (BP>=180/120) and ACS short-circuit ordinary states; takes precedence over secondary AI. | **Verified & Passing** |
| **Clinician Review Attestation (HMAC)** | Implemented in `review_service.py` | Verified mandatory override rationale (422 without rationale) and HMAC digital signature generation. | **Verified & Passing** |
| **Referral Lifecycle & Transitions** | Implemented via Outbox & Sync | Verified referral state progression (`REFERRED` -> `CONSULTATION_COMPLETED`) via `updateReferralAtomic`. | **Verified & Passing** |
| **Durable Offline Outbox Synchronization** | Implemented in Dexie v4 (`offlineDb.ts`) | Replaced raw `db.patients.put` and `db.assessments.put` in `ScreenPatientPage.tsx` with atomic outbox methods. | **Verified & Passing** |
| **OCC Conflict Detection** | Implemented on server (`sync_service.py`) | Verified stale client versions yield `CONFLICT` ACK with server version and conflict data payload. | **Verified & Passing** |
| **Secondary AI Failure Resilience** | Implemented via safety interceptor | Verified that failure or outage of external recommendation services never downgrades or delays emergency flags. | **Verified & Passing** |

---

## 2. Implemented Changes

### 2.1 Backend Schema & Migration
- **File:** `Health-AI-main/backend/database.py`
  - Added `facility_id = Column(String, nullable=True, default="PHC_MAIN", index=True)` to `AppointmentModel`.
  - Added SQLite automatic column migration for `appointments` table (`facility_id`, `server_version`, `is_deleted`, `updated_at`) in `_migrate_sqlite_columns()`.
- **File:** `Health-AI-main/backend/schemas.py`
  - Added `facility_id: Optional[str] = None` to `AppointmentCreate` and `AppointmentResponse`.
- **File:** `Health-AI-main/backend/sync_service.py`
  - In `apply_appointment_operation`, enforced object-level facility checks (`current_user.facility_id == appt.facility_id`) for CREATE, UPDATE, and DELETE operations.
- **File:** `Health-AI-main/backend/main.py`
  - Added transparent duplicate patient detection in `create_patient` based on `national_health_id` and demographic normalization (`func.lower(name)`, `phone`, `facility_id`).

### 2.2 Frontend Screening Workflow & Decision Support
- **File:** `Health-AI-main/frontend/src/components/screening/ScreenPatientPage.tsx`
  - Replaced legacy evaluation with `saveAssessmentAtomic` which invokes the canonical `evaluateClinicalRisk` engine.
  - Eliminated silent vital defaults (`120/80/98.6`); inputs are parsed as strictly nullable numbers (`null` if unmeasured).
  - Replaced direct Dexie table calls with atomic outbox transactions: `savePatientAtomic`, `saveAssessmentAtomic`, and `updateReferralAtomic`.
  - Mapped canonical `ClinicalResult` fields (`is_emergency`, `red_flags`, `uncertainty_state`) directly to UI result state.
- **File:** `Health-AI-main/frontend/src/components/screening/Step7ScreeningResult.tsx`
  - Added explicit handling for `INSUFFICIENT_DATA` display level to prevent fallthrough to `'Low'`.
  - Added dedicated amber alert banner when essential vital signs are missing, prompting the health worker to record vitals.
  - Retained prominent red emergency alert banner for critical triage triggers.
- **File:** `Health-AI-main/frontend/src/components/screening/Step1PatientInfo.tsx`
  - Added proactive candidate duplicate detection banner when registering a new patient if name or phone matches existing Dexie records.
  - Included one-click "Use Existing" button to transition smoothly to the existing patient record without duplicate creation.
- **File:** `Health-AI-main/frontend/src/components/PatientDirectory.tsx`
  - Updated pre-fill logic and `saveEdit` to keep missing vitals as `null` rather than coercing to `98.6°F`, `120/80 mmHg`, or `100 mg/dL`.

---

## 3. Workflow and State Transition Specification

### 3.1 Patient Screening to Referral Workflow
```
[Step 1: Patient Info]
   ├─ Search Existing Record
   └─ Register New Patient (With duplicate candidate alert)
          │
[Step 2: Symptoms Intake]
   ├─ Symptom checklist & voice transcript
   └─ Duration & Severity recording
          │
[Step 3: Vital Signs Intake]
   ├─ BP (Systolic/Diastolic), Glucose, Temperature, HR, Height, Weight
   └─ Physiological plausibility validation (Strict nullability for unmeasured)
          │
[Step 4: Risk Factors]
   └─ Medical history, family history, lifestyle
          │
[Step 5: Pre-Screening Review]
   └─ Summary confirmation
          │
[Step 6: Clinical Engine Analysis]
   └─ Save Patient Atomic ──> Dexie Outbox ('CREATE' / 'UPDATE')
   └─ Evaluate Clinical Risk (Red-Flag Interceptor -> Uncertainty -> Scoring)
   └─ Save Assessment Atomic ──> Dexie Outbox ('CREATE')
          │
[Step 7: Screening Result & Triage]
   ├─ EMERGENCY (Red Flag): Immediate 108 / IDRC transfer instructions
   ├─ INSUFFICIENT DATA: Prompt to record vitals; risk score withheld
   ├─ HIGH RISK: Referred to PHC Medical Officer (<24 hrs)
   ├─ MODERATE RISK: Routine PHC evaluation (3-5 days)
   └─ LOW RISK: Community wellness guidance
          │
[Referral Disposition]
   └─ updateReferralAtomic ('REFERRED') ──> Dexie Outbox ('referral' UPDATE)
```

### 3.2 Clinician Review State Machine
```
[Assessment Created with High Risk / Emergency / Red Flag]
          │
          ▼
    REVIEW_REQUIRED (In Doctor Queue)
          │
   Doctor Assigns
          │
          ▼
      IN_REVIEW
          │
    Doctor Evaluates
     ├──────────────────────┬──────────────────────┐
     ▼                      ▼                      ▼
  APPROVED               MODIFIED               REJECTED
(Agreed with       (Mandatory Rationale    (Mandatory Rationale
 triage output)     required if changing    required)
                     risk level)
     │                      │                      │
     └──────────────────────┴──────────────────────┘
                            │
               Compute HMAC-SHA256 Signature
              Record Immutable Audit Log Entry
              Update Server Version & Outbox Sync
```

---

## 4. Tests Actually Executed and Exact Outcomes

### 4.1 Backend Test Suite (FastAPI + SQLite StaticPool)
**Command:** `./venv/bin/pytest`  
**Result:** **162 Passed, 0 Failed** (69.43s)

#### Phase 3 Dedicated Workflow & Security Test Suite (`test_phase3_workflow.py`):
1. `test_patient_registration_valid_and_invalid`: **PASSED** (Valid creation scopes to token facility; age <1 or >125 and missing name rejected with 422).
2. `test_duplicate_submission_handling`: **PASSED** (Identical demographic / NHID submissions transparently return existing patient ID).
3. `test_cross_facility_patient_access_and_mutation`: **PASSED** (Doctor at `PHC_RAMPUR` receives 403 Forbidden when reading or updating patient at `PHC_SONPUR`).
4. `test_valid_screening_complete_measurements`: **PASSED** (Complete intake produces `uncertainty_state="COMPLETE"` and deterministic risk score).
5. `test_missing_and_malformed_measurements`: **PASSED** (Zero vitals produce `INSUFFICIENT_DATA` and `risk_score=None`; biological range violations raise validation error).
6. `test_emergency_red_flags_and_emergency_precedence`: **PASSED** (BP 195/125, chest pain + dyspnea, and hemoptysis trigger `EMERGENCY` short-circuit).
7. `test_risk_score_boundaries`: **PASSED** (Validated chronic cough >= 14 days -> HIGH, BP 135/85 -> MODERATE, normal vitals -> LOW).
8. `test_assessment_persistence_and_repeated_submission`: **PASSED** (Repeated sync push with same `operation_id` yields `DUPLICATE` idempotent ACK).
9. `test_unauthorized_review_submission`: **PASSED** (ASHA worker without `reviews:perform` permission receives 403 Forbidden).
10. `test_clinical_override_justification_and_attestation`: **PASSED** (Override without rationale rejected with 422; override with rationale generates valid HMAC signature).
11. `test_referral_state_transitions`: **PASSED** (Sync outbox updates `referral_status` from `REFERRED` to `CONSULTATION_COMPLETED`).
12. `test_facility_scoped_appointments`: **PASSED** (Cross-facility mutation on appointments rejected by server sync engine).
13. `test_offline_occ_conflict_detection`: **PASSED** (Stale client base server version triggers `CONFLICT` ACK with current server version 3).
14. `test_secondary_ai_failure_resilience`: **PASSED** (External AI mock exception does not suppress or downgrade deterministic emergency triage).

### 4.2 Frontend Clinical Golden Vectors
**Command:** `npm run test:golden`  
**Result:** **10/10 Passed**
- VECTOR-01: Severe Hypertensive Crisis (190/125 mmHg) -> `EMERGENCY`
- VECTOR-02: Acute Coronary Syndrome (Chest pain + Dyspnea) -> `EMERGENCY`
- VECTOR-03: Acute Pulmonary Hemoptysis (Coughing blood) -> `EMERGENCY`
- VECTOR-04: Critical Hyperglycemia (Glucose 450 mg/dL) -> `EMERGENCY`
- VECTOR-05: Severe Hypoglycemia (Glucose 42 mg/dL) -> `EMERGENCY`
- VECTOR-06: Zero Vitals Captured -> `INSUFFICIENT_DATA`, `risk_score: null`
- VECTOR-07: Persistent Cough >= 14 days -> `HIGH_RISK`
- VECTOR-08: Elevated Glucose 240 mg/dL with Polyuria -> `HIGH_RISK`
- VECTOR-09: Stage 1 Borderline BP (135/85 mmHg) -> `MODERATE_RISK`
- VECTOR-10: Healthy Baseline -> `LOW_RISK`

### 4.3 Frontend Outbox & Persistence Test Suite
**Command:** `npm run test:outbox`  
**Result:** **51 Passed, 0 Failed**
- Strictly monotonic client sequence verification (1, 2, 3...)
- Idempotent device ID generation
- Atomic patient creation, update, and soft-delete tombstone generation
- Atomic assessment creation with emergency red-flag short-circuits
- Atomic referral update
- Atomic appointment creation and soft-delete
- Outbox lifecycle: `QUEUED` -> `ACKNOWLEDGED`
- Local conflict staging in `conflicts` table

### 4.4 Frontend Phase 3 Workflow Integration Suite
**Command:** `npm run test:phase3`  
**Result:** **5/5 Passed**
- Test 1: Verified `ScreenPatientPage` uses `savePatientAtomic`, `saveAssessmentAtomic`, and `updateReferralAtomic`.
- Test 2: Verified strict vital sign nullability across `ScreenPatientPage` and `PatientDirectory`.
- Test 3: Verified `Step7ScreeningResult` surfaces `INSUFFICIENT_DATA` and `EMERGENCY` banners.
- Test 4: Verified `Step1PatientInfo` transparently detects duplicate candidates.
- Test 5: Verified `App.tsx` correctly mounts `ScreenPatientPage`.

### 4.5 Frontend Build, Lint, and Typecheck
- **Command:** `npm run typecheck` (`tsc -b`) -> **0 errors**
- **Command:** `npm run lint` (`oxlint`) -> **0 errors**, 30 pre-existing framework warnings
- **Command:** `npm run build` (`tsc -b && vite build`) -> **Production bundle built in 406ms**

---

## 5. Remaining Defects, Clinical Dependencies, and Limitations

1. **Hardware & Peripheral Calibration:** Vitals entered into the application originate from manual user entry or paired Bluetooth peripherals. Plausibility ranges (e.g. 70–240 mmHg systolic BP) reject extreme typographical errors, but clinical accuracy depends on certified measurement equipment.
2. **Clinical Decision Support Scope:** RuralHealth AI is explicitly an offline-first decision-support and triage platform. In accordance with Indian National Health Mission (NHM) guidelines and the platform's medical disclaimer, it does not formulate autonomous diagnoses or prescribe pharmacotherapy. Final clinical diagnosis remains the sole responsibility of the qualified medical officer.
3. **Teleconsultation Video Channel:** WebRTC audio/video signaling relies on active network connectivity. In completely offline village environments, screening and referrals proceed via the local Dexie outbox and SMS/call fallback, with synchronization deferred until connectivity is restored.

---

## 6. Verification Status Summary

| Claim | Verified Reality | Evidence |
| :--- | :--- | :--- |
| **"Emergency rules never downgrade when AI is unavailable"** | **VERIFIED** | Deterministic RedFlagInterceptor runs prior to ML/AI and short-circuits with `is_emergency=True`. Validated in `test_secondary_ai_failure_resilience`. |
| **"Missing vitals are never treated as normal"** | **VERIFIED** | Assessment schemas and evaluators preserve `None`/`null`. Zero vitals yield `INSUFFICIENT_DATA` and `risk_score=None`. Validated in `test_missing_and_malformed_measurements` and Vector 06. |
| **"Facility isolation prevents cross-facility data leakage"** | **VERIFIED** | Server enforces facility scoping on patients, reviews, referrals, and appointments. Cross-facility access returns 403. Validated in `test_cross_facility_patient_access_and_mutation` and `test_facility_scoped_appointments`. |
| **"Clinician reviews cannot be tampered with"** | **VERIFIED** | Reviews require `reviews:perform` permission, enforce rationale for overrides, and compute an HMAC-SHA256 digital signature stored with the audit trail. Validated in `test_clinical_override_justification_and_attestation`. |
| **"Offline outbox transactions prevent data loss"** | **VERIFIED** | Domain records and outbox operations commit in single Dexie readwrite transactions. Stale versions trigger OCC conflicts. Validated across 51 assertions in `test_task004_outbox.js`. |
