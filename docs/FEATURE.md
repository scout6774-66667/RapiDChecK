# Features, Capabilities & Clinical Engine Specification
**System:** RapiDChecK / RuralHealth AI  
**Scope:** Frontline Offline Durability, Dual-Engine AI Screening, Clinician Review Governance, Multilingual Voice Intake & Telemedicine

---

## 1. Offline-First Architecture & Durable Outbox Queue

RapiDChecK provides zero-connectivity field operability for frontline ASHA/ANM workers operating in remote rural habitations across India.

```
Frontline Tablet / Browser                               Authoritative PHC Server
┌──────────────────────────────────────────────┐        ┌────────────────────────────────────┐
│ • Domain Store (patients, assessments)       │        │ • PostgreSQL Database Engine       │
│ • Durable Outbox Store (sync_outbox)         │        │ • Idempotency Verification Log     │
│ • Local Deterministic Ruleset Engine (v2.0.0)│        │ • Optimistic Concurrency Control   │
│ • Monotonic Sequence Generator (seq: 1,2,3)  │        │ • Monotonic Sync Journal Stream    │
└──────────────────────┬───────────────────────┘        └─────────────────┬──────────────────┘
                       │                                                  │
                       │ 1. Atomic Local Commit (Entity + Outbox)         │
                       │ 2. Evaluate Local Triage & Display Result        │
                       │ 3. Network Restored -> Authenticated Push Sync  │
                       ├─────────────────────────────────────────────────►│
                       │                                                  │ 4. Validate Operation ID
                       │                                                  │ 5. Check OCC Base Version
                       │                                                  │ 6. Mutate PostgreSQL
                       │                                                  │ 7. Append to Sync Journal
                       │◄──────────────── 200 OK ACK ─────────────────────┤
                       │                                                  │
                       │ 8. Mark Outbox Operation ACKed                   │
                       │ 9. Pull Cursor Changes (since_cursor)            │
                       ├─────────────────────────────────────────────────►│
                       │◄─────────────── Journal Change Stream ───────────┤
```

### 1.1 Atomic Single-Transaction Persistence
Every offline mutation executed in the frontend uses Dexie v4's atomic transaction API:
```typescript
await db.transaction('rw', [db.patients, db.sync_outbox], async () => {
  await db.patients.put(patientEntity);
  await db.sync_outbox.add({
    operation_id: generateUUID(),
    device_id: getDeviceId(),
    client_sequence: getNextSequence(),
    entity_type: 'patient',
    entity_id: patientEntity.id,
    operation_type: 'CREATE',
    payload: patientEntity,
    base_version: 1,
    status: 'QUEUED'
  });
});
```
This guarantees that an entity record can never exist locally without its corresponding queued outbox operation.

### 1.2 20 Offline Failure-Injection Scenarios (`TEST-OFF-001` – `TEST-OFF-020`)
The outbox and sync engine are verified against 20 real-world failure scenarios in [`artifacts/offline-validation/report.json`](file:///c:/Users/ABIR%20SAHA/Downloads/Health-AI-main/artifacts/offline-validation/report.json):
1. `TEST-OFF-001`: Create patient and assessment offline (**PASS**).
2. `TEST-OFF-002`: Edit patient offline with incremented base version (**PASS**).
3. `TEST-OFF-003`: Delete patient offline creating durable tombstone (**PASS**).
4. `TEST-OFF-004`: Browser reload preserves uncommitted outbox queue (**PASS**).
5. `TEST-OFF-005`: Application restart / crash recovery (**PASS**).
6. `TEST-OFF-006`: Network drop during push sync retransmits cleanly (**PASS**).
7. `TEST-OFF-007`: Server timeout after commit (idempotency prevents duplicate write) (**PASS**).
8. `TEST-OFF-008`: Server 500 internal error triggers exponential backoff (**PASS**).
9. `TEST-OFF-009`: Malformed server response does not corrupt local outbox (**PASS**).
10. `TEST-OFF-010`: Expired authentication token prompts re-auth without data loss (**PASS**).
11. `TEST-OFF-011`: Deactivated user sync rejected without purging local queue (**PASS**).
12. `TEST-OFF-012`: Duplicate batch transmission handled idempotently (**PASS**).
13. `TEST-OFF-013`: Reconnect and burst push of 50 queued records (**PASS**).
14. `TEST-OFF-014`: Two-device non-conflicting field merge (**PASS**).
15. `TEST-OFF-015`: Two-device direct conflict detection (OCC 409) (**PASS**).
16. `TEST-OFF-016`: Tombstone delete vs update race prevents resurrection (**PASS**).
17. `TEST-OFF-017`: Ruleset version tagging preserved during sync (**PASS**).
18. `TEST-OFF-018`: Schema migration with pending outbox records (**PASS**).
19. `TEST-OFF-019`: Multiple concurrent sync workers guarded by lock (**PASS**).
20. `TEST-OFF-020`: Cursor pull pagination continuity (**PASS**).

---

## 2. Deterministic Clinical Safety & Triage Engine

### 2.1 Elimination of Silent Vitals Defaulting
In the original prototype, missing vitals were silently defaulted to normal values (e.g. SBP 120, DBP 80, Glucose 100 mg/dL). In production RapiDChecK:
- All vitals default strictly to `None` / `null`.
- Omission of vital signs sets `uncertainty_state="INSUFFICIENT_DATA"` and `risk_score=None`.

### 2.2 Deterministic Emergency Red-Flag Short-Circuiting
Critical acute conditions bypass ordinary probabilistic scoring and immediately assign `triage_state="EMERGENCY"`, `is_emergency=1`, and `review_state="REVIEW_REQUIRED"`:
- **Hypertensive Crisis:** SBP $\ge 180 \text{ mmHg}$ OR DBP $\ge 120 \text{ mmHg}$.
- **Suspected Acute Coronary Syndrome (ACS):** Chest pain AND dyspnea / shortness of breath.
- **Respiratory Emergency / Suspected Active TB:** Hemoptysis (coughing up blood).
- **Diabetic Hyperglycemic Emergency:** Random Blood Glucose $\ge 300 \text{ mg/dL}$.
- **Critical Hypoglycemia:** Random Blood Glucose $\le 54 \text{ mg/dL}$.

### 2.3 Cross-Platform Golden Vector Equivalence (10/10 Vectors)
The canonical ruleset is validated across Python backend and TypeScript client with 100% equivalence:

| Vector ID | Clinical Condition Profile | Target Risk Tier | Emergency Flag | Uncertainty State |
|---|---|:---:|:---:|:---:|
| `VECTOR-01` | Hypertensive Crisis (BP 190/125) | `HIGH` | `True` | `COMPLETE` |
| `VECTOR-02` | Suspected Acute Coronary Syndrome | `HIGH` | `True` | `COMPLETE` |
| `VECTOR-03` | Active TB Hemoptysis | `HIGH` | `True` | `COMPLETE` |
| `VECTOR-04` | Hyperglycemic Emergency (Glucose 320) | `HIGH` | `True` | `COMPLETE` |
| `VECTOR-05` | Severe Hypoglycemia (Glucose 48) | `HIGH` | `True` | `COMPLETE` |
| `VECTOR-06` | Missing Vitals (Fever only) | `MODERATE` | `False` | `INSUFFICIENT_DATA` |
| `VECTOR-07` | Chronic TB Cough (>21 days) | `HIGH` | `False` | `COMPLETE` |
| `VECTOR-08` | Severe Diabetes (Glucose 240, BMI 31) | `HIGH` | `False` | `COMPLETE` |
| `VECTOR-09` | Stage 1 Hypertension (BP 145/92) | `MODERATE` | `False` | `COMPLETE` |
| `VECTOR-10` | Healthy Young Adult Baseline | `LOW` | `False` | `COMPLETE` |

---

## 3. Real ML Disease Classification Engine

- **Dataset:** Kaggle Disease & Symptoms Dataset (246,945+ records, 377 symptom features, 773 classes).
- **Architecture:** Logistic Regression with L-BFGS optimizer and balanced class weights trained on 189,647 cleaned records over 328 symptom features and 512 disease classes.
- **Performance:** Achieves **95.24% Top-3 Accuracy** (83.99% top-1 accuracy, 0.846 weighted F1 score).
- **Clinical Safety Boundary:** The ML model is strictly **informational**. It cannot downgrade emergencies, override deterministic safety rules, or bypass clinician review mandates.

---

## 4. Clinician Review Queue & Attestation State Machine

Screenings flagged with `is_emergency=1`, `risk_level="HIGH"`, or `uncertainty_state="INSUFFICIENT_DATA"` enter the mandatory clinician review lifecycle:

$$\text{REVIEW\_REQUIRED} \longrightarrow \text{ASSIGNED} \longrightarrow \text{IN\_REVIEW} \longrightarrow \begin{cases} \text{APPROVED} & \text{(Attestation Sealed)} \\ \text{MODIFIED} & \text{(Override Justification Required)} \\ \text{REJECTED} & \text{(Override Justification Required)} \end{cases}$$

- **Mandatory Notes:** Clinician observations ($\ge 5$ characters) are enforced.
- **Override Justifications:** Modifying risk tier or downgrading an emergency requires an explicit clinical justification reason (e.g. `DIAGNOSTIC_CONFIRMATION`, `REPEAT_VITALS_NORMAL`).
- **Cryptographic Seal:** Server-side HMAC-SHA256 attestation binds the decision to the doctor's identity and timestamp.

---

## 5. Multilingual Voice Dictation & Telemedicine

- **Regional Localization:** Full interface available in **English**, **Hindi (हिंदी)**, and **Bengali (বাংলা)**.
- **Speech-to-Text:** Integrates the **Web Speech API** (`webkitSpeechRecognition`) supporting regional Indian accents (`hi-IN`, `bn-IN`, `en-IN`) for hands-free symptom recording by frontline workers.
- **Smart Hospital Locator:** Dual-engine mapping with **Google Maps Platform** and automated fallback to **OpenStreetMap & Nominatim** for geocoding and nearest PHC/CHC routing.
- **Teleconsultation Booking:** Frontline workers can book specialist teleconsultation slots directly into the PHC schedule.
