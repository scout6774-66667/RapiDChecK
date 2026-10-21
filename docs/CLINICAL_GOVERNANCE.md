# Clinical Governance & Decision Support Safety Invariants

## 1. Safety Principles & Invariants

RapiDChecK incorporates automated decision support designed for rural community healthcare. In healthcare engineering, software failures or silent assumptions directly impact human life. Therefore, the application strictly adheres to the following non-negotiable clinical safety invariants:

### Invariant 1: No Silent Normal Defaults (Missing Vitals Gating)
* **The Rule:** If vital signs (systolic/diastolic blood pressure, heart rate, blood oxygen saturation, blood glucose) are not measured or missing, the system **never** assumes normal values (e.g. 120/80 mmHg or 98% SpO2).
* **Behavior:** Missing vitals remain strictly `None` / `null`.
* **Uncertainty Quantification:** The system marks the assessment with an explicit `uncertainty_state` (`INSUFFICIENT_DATA` or `MISSING_VITALS`), and suppresses numerical risk scores (`risk_score: null`).

### Invariant 2: Red-Flag Emergency Short-Circuiting
* **The Rule:** When any critical red-flag symptom is detected, the ruleset evaluator immediately short-circuits evaluation.
* **Emergency Conditions:**
  * **Hypertensive Crisis:** Systolic BP $\ge 180$ mmHg or Diastolic BP $\ge 120$ mmHg.
  * **Severe Hypoxemia:** $\text{SpO}_2 < 90\%$.
  * **Maternal Red-Flags:** Vaginal bleeding during pregnancy, severe pre-eclampsia (BP $> 160/110$ + headache/visual changes).
  * **Severe Respiratory Distress:** Stridor, cyanosis, respiratory rate $> 30$ breaths/min.
* **Outcome:**
  * `triage_state = "EMERGENCY"`
  * `short_circuit = True`
  * `risk_score = 0.99` (or emergency priority)
  * Immediate guidance to dial **108** for ambulance dispatch and immediate transfer to the nearest Secondary/Tertiary Hospital.

### Invariant 3: Online / Offline Rule Equivalence (Golden Vectors)
* **The Rule:** Clinical triage rules must produce identical outcomes regardless of whether evaluation occurs on an offline tablet in a remote village or on the cloud backend.
* **Verification:** Validated by [`Health-AI-main/clinical-rules/v2.0.0/golden_test_vectors.json`](../Health-AI-main/clinical-rules/v2.0.0/golden_test_vectors.json), containing 10 canonical vectors executed across both Python ([`test_golden_vectors.py`](../Health-AI-main/backend/test_golden_vectors.py)) and TypeScript ([`test_golden_vectors.js`](../Health-AI-main/frontend/test_golden_vectors.js)).

### Invariant 4: Cryptographic Review Attestation & Non-Repudiation
* **The Rule:** Clinical decisions, modifications, and overrides by a PHC Medical Officer must be cryptographically sealed.
* **Implementation:** When a doctor approves or modifies an assessment, an HMAC-SHA256 signature hash is computed using `compute_signature_hash(review_id, assessment_id, reviewer_id, review_decision, timestamp)`.
* **Override Justification:** If a doctor modifies an AI assessment, mandatory clinical justification notes are enforced at the API level (HTTP 422 if omitted).

---

## 2. Ruleset Versioning & Lifecycle

```
Draft Ruleset ──► Peer Review & Simulation ──► Golden Vector Definition ──► Version Tag (e.g. v2.0.0) ──► Deployment
```
* Every assessment record permanently stores `ruleset_version` and `workflow_version`.
* When historical records are synced, the backend never recalculates past results using newer rules; historical provenance is strictly preserved.
