# Population Health Intelligence & Risk Context Layer (HMIS + NFHS-5)

> **CRITICAL CLINICAL NOTICE:**  
> This dataset is **population-level aggregate health data**. It is **not** an individual patient dataset.  
> It is **strictly insufficient by itself for clinical diagnosis or disease prediction**.  
> Population statistics **must never override** an individual patient's clinical examination, vital signs, or reported symptoms.

---

## 1. Executive Summary & Purpose

RuralHealth AI is designed as an offline-first community-health screening and clinical decision-support platform for ASHAs and PHC clinicians. While patient-level screening utilizes individual symptoms, vitals, and red-flag rules, clinical decision-making is heavily influenced by environmental and district-level disease burdens.

This **Population Health Intelligence & Risk Context Layer** incorporates processed aggregate government health data from:
1. **Health Management Information System (HMIS)** — West Bengal (Kolkata district annual time series, 2008–2021)
2. **National Family Health Survey (NFHS-5)** — Kolkata District Factsheet (2019–20 survey baseline)

Instead of manufacturing artificial patient labels or forcing 14 annual aggregate observations into an unsupported high-dimensional machine learning diagnostic model, this layer provides a **statistically sound, clinically governed population context and longitudinal trend intelligence engine**.

---

## 2. System Architecture

```text
                           RuralHealth AI
                                 |
            +--------------------+--------------------+
            |                                         |
            v                                         v
   Patient-Level ML                          Population Intelligence
(Symptoms, Vitals, Age)                     (HMIS West Bengal + NFHS-5)
            |                                         |
            v                                         v
   Candidate Conditions                     Community Burden Signals
 (Logistic Regression ML)                   (Trends, Baselines, Load)
            |                                         |
            +--------------------+--------------------+
                                 |
                                 v
                     Clinically Governed
                  Decision Support Engine
               (Red Flags, Data Completeness,
                 Community Risk Context)
                                 |
                                 v
                       PHC Medical Officer
                     Referral Prioritization
```

---

## 3. Data Sources & Provenance

| Source | Geographic Scope | Temporal Coverage | Frequency / Cadence | Total Raw Features | Extraction Nature |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **HMIS West Bengal** | Kolkata District | 2008–09 to 2021–22 (14 years) | Annual aggregate reporting | 1,882 indicators | Administrative facility data |
| **NFHS-5** | Kolkata District | 2019–20 | Single survey cycle | 73 indicators | Representative population sample |

### Curated Dataset
- File: `backend/data/processed/kolkata_population_health.csv`
- Records: 14 yearly observations (2008 to 2021)
- Total Columns: 73 (3 identifiers: `year`, `fiscal_year`, `district` + 70 curated health features)
- Feature Metadata Dictionary: `backend/data/processed/feature_dictionary.csv`

---

## 4. Clinically Meaningful Health Domains

The raw 1,957 columns were audited and reduced into **6 core clinical domains**:

### A. Maternal Health
- **HMIS Annual Continuous:**
  - `maternal_anc_registered_total`: Total pregnant women registered for ANC
  - `maternal_anc_3plus_checkups`: Pregnant women receiving 3+ ANC check-ups
  - `maternal_ifa_100_tablets_given`: Pregnant women receiving 100 IFA tablets
  - `maternal_institutional_deliveries_public`: Deliveries conducted at public health facilities
  - `maternal_postpartum_checkup_48h`: Women receiving postpartum check-up within 48 hours
  - `maternal_c_section_deliveries`: Caesarean deliveries performed across facilities
  - `maternal_eclampsia_managed`: Eclampsia cases managed during delivery
  - `maternal_deaths_reported`: Facility-reported maternal deaths
- **NFHS-5 Survey Baseline (2019–20 Context):**
  - First trimester ANC check-up: **74.2%**
  - At least 4 ANC visits: **71.7%**
  - IFA 100+ days consumed: **67.5%**
  - IFA 180+ days consumed: **33.8%**
  - Institutional births: **97.5%**
  - Skilled birth attendance: **99.3%**
  - C-section delivery rate: **44.7%**
  - Postnatal care within 2 days: **72.8%**

### B. Child Health & Immunization
- **HMIS Annual Continuous:**
  - `child_immunisation_sessions_held`: Immunisation sessions held
  - `child_fully_immunised_total`: Children 9–11 months fully immunised (BCG, DPT, OPV, Measles)
  - `child_bcg_vaccinated`: Infants receiving BCG
  - `child_dpt3_vaccinated`: Infants receiving DPT3 / Pentavalent3
  - `child_opv3_vaccinated`: Infants receiving OPV3
  - `child_measles_vaccinated`: Infants receiving 1st dose Measles vaccine
  - `child_under5_deaths_reported`: Deaths reported in children under 5 years
- **NFHS-5 Survey Baseline (2019–20 Context):**
  - Children 12–23 months fully vaccinated: **80.2%**
  - BCG received: **97.7%**
  - Polio 3 doses: **84.7%**
  - Penta / DPT 3 doses: **91.0%**
  - Measles 1st dose: **91.0%**
  - Vitamin A in last 6 months: **58.0%**

### C. Nutrition & Anemia
- **HMIS Annual Continuous:**
  - `nutrition_newborns_weighed`: Newborns weighed at birth
  - `nutrition_low_birth_weight_under_2_5kg`: Newborns with birth weight < 2.5 kg
  - `nutrition_breastfed_within_1hr`: Newborns breastfed within 1 hour of birth
- **NFHS-5 Survey Baseline (2019–20 Context):**
  - Children under 5 stunted (height-for-age): **29.6%**
  - Children under 5 wasted (weight-for-height): **29.3%**
  - Children under 5 severely wasted: **16.9%**
  - Children under 5 underweight (weight-for-age): **32.9%**
  - Children 6–59 months anaemic (<11.0 g/dL): **58.2%**
  - Women 15–49 years anaemic: **65.7%**
  - Women overweight/obese (BMI ≥ 25 kg/m²): **34.0%**
  - Women underweight (BMI < 18.5 kg/m²): **6.6%**

### D. NCD (Non-Communicable Disease) Context
- **HMIS Annual Continuous:**
  - `ncd_hypertension_cases_detected`: New cases of hypertension (BP > 140/90) detected in pregnant women
  - `ncd_outpatient_hypertension_attendance`: Outpatient attendance for hypertension (219,630 in 2021)
  - `ncd_outpatient_diabetes_attendance`: Outpatient attendance for diabetes (271,496 in 2021)
  - `ncd_outpatient_heart_disease_attendance`: Outpatient attendance for acute heart diseases
  - `ncd_outpatient_stroke_attendance`: Outpatient attendance for stroke/paralysis
  - `ncd_adult_deaths_heart_hypertension`: Deaths due to heart disease / hypertension
  - `ncd_adult_deaths_cancer`: Deaths due to cancer
- **NFHS-5 Survey Baseline (2019–20 Context):**
  - Blood sugar high (141–160 mg/dL): **6.8%**
  - Blood sugar very high (>160 mg/dL): **11.7%** (combined elevated blood sugar: **18.5%**)
  - Mildly elevated BP (140–159 / 90–99 mmHg): **17.3%**
  - Moderately/severely elevated BP (≥160 / ≥100 mmHg): **5.9%** (combined elevated BP: **23.2%**)
  - Men using tobacco: **43.6%**
  - Women using tobacco: **12.4%**
  - Women consuming alcohol: **1.3%**

### E. Communicable Disease Context
- **HMIS Annual Continuous:**
  - `communicable_child_diarrhoea_cases`: Pediatric diarrhoea and dehydration cases
  - `communicable_child_respiratory_cases`: Pediatric respiratory infection admissions
  - `communicable_child_malaria_cases`: Malaria cases reported in children
  - `communicable_adult_tb_deaths`: Adult deaths due to Tuberculosis
  - `communicable_dengue_deaths`: Deaths due to Dengue
  - `communicable_adult_respiratory_deaths`: Adult deaths due to respiratory infections
- **NFHS-5 Survey Baseline (2019–20 Context):**
  - 2-week diarrhoea prevalence: **5.6%**
  - 2-week acute respiratory infection (ARI) symptoms: **2.6%**

### F. Healthcare Access & Utilization
- **HMIS Annual Continuous:**
  - `healthcare_access_opd_attendance_total`: Total allopathic outpatient attendance (7,082,739 in 2021)
  - `healthcare_access_inpatient_midnight_headcount`: Inpatient midnight bed headcount (2,514,690 in 2021)
  - `healthcare_access_deliveries_public_facility`: Deliveries in public institutions
  - `healthcare_access_c_section_private_facility`: C-section deliveries in private facilities
- **NFHS-5 Survey Baseline (2019–20 Context):**
  - Institutional births in public facility: **69.9%**
  - Vaccinations received in public health facility: **83.5%**
  - Average out-of-pocket expenditure per delivery in public facility: **₹1,969**
  - MCP card received for pregnancy: **94.4%**

---

## 5. Methodological Principles & Anti-Patterns Avoided

### Mandatory Non-Leakage of Survey Data
NFHS-5 is a periodic household survey conducted in 2019–20. It is **not** an annual administrative report.
- **NEVER forward-fill or backward-fill NFHS values** into 2008–2018 or 2020–2021.
- All non-survey years explicitly maintain `null` / `NaN` for `nfhs5_...` columns.
- The data quality audit automatically validates temporal isolation (passed with 0 non-survey non-null entries).

### Avoiding Synthetic Distortion
- **NO SMOTE or synthetic oversampling:** 14 annual rows cannot be legitimately SMOTE-interpolated to simulate hundreds of patient records.
- **NO fabricated labels:** Disease diagnoses are never imputed from aggregate hospital admission counts.
- **NO false 95% clinical accuracy claims:** Aggregate trends represent surveillance counts, not patient diagnostic test performance.

---

## 6. Data Quality Monitoring Suite

Implemented in: `backend/ml/population_data_quality.py`  
Output report: `backend/data/processed/population_data_quality_report.json`

Automated validation checks:
1. **Duplicate Rows:** Verified 0 duplicate year/district combinations.
2. **Duplicate Features:** Verified 0 duplicate feature columns in dataset and dictionary.
3. **Year Continuity:** Verified unbroken contiguous sequence 2008 to 2021 (14 calendar years).
4. **NFHS Temporal Integrity:** 35 NFHS features populated strictly in 2019, 0 leaked values in all 13 other years.
5. **Valid Percentages:** All survey indicators confirmed in valid `[0.0%, 100.0%]` range.
6. **Non-Negative Counts:** All HMIS admission and attendance counts confirmed `>= 0`.
7. **Unit & Dictionary Consistency:** 100% of curated features correspond to validated units (`absolute_count`, `percentage`, `inr`).
8. **Missingness Documentation:** Explicit documentation of missing cells without converting missing data to zero.

---

## 7. Clinical Decision Support & Referral Boundary

The system maintains a strict clinical safety boundary:

$$\text{Patient Clinical Risk} + \text{Emergency Red Flags} + \text{Data Completeness} + \text{Population Context} \longrightarrow \text{PHC Clinician Review}$$

- **Vitals Precedence:** If a patient's BP is 158/96 mmHg, that measurement dictates clinical risk regardless of whether community prevalence is 10% or 40%.
- **Contextual Value:** Population data supplies alert context (e.g. *"District exhibits 23.2% elevated adult BP baseline and 219k annual OPD hypertension attendance — reinforce adherence and lifestyle counselling"*).
- **Prohibited Rule:** `population_score > X -> auto-referral` is strictly prohibited. Referral urgency is determined by clinician rules and individual vitals.

---

## 8. Requirements Traceability Matrix

| Requirement Area | Status | Implementation Details |
| :--- | :---: | :--- |
| **Population Health Trends** | **Strongly Supported** | Chart-ready JSON API (`GET /api/ml/population-health/trends`) + Recharts time series |
| **NCD Population Context** | **Strongly Supported** | Dedicated endpoint (`GET /api/ml/population-health/ncd-context`) with BP, sugar, tobacco signals |
| **Maternal / Child Health Monitoring** | **Strongly Supported** | Domain cards + continuous indicators (ANC, BCG, DPT, OPV, LBW) |
| **Nutrition Monitoring** | **Strongly Supported** | Low birth weight tracking + NFHS-5 stunting, wasting, anaemia baselines |
| **Communicable Disease Context** | **Strongly Supported** | Pediatric diarrhoea, ARI, adult TB deaths, dengue deaths |
| **Healthcare Access Indicators** | **Strongly Supported** | Outpatient attendance, inpatient midnight headcount, public delivery utilization |
| **PHC / District Dashboard Analytics** | **Strongly Supported** | `PopulationHealthPanel` integrated in PHC Dashboard and Admin view |
| **Data Provenance & Quality Report** | **Strongly Supported** | `feature_dictionary.csv` + automated `population_data_quality_report.json` |
| **NCD Risk Assessment Context** | **Partially Supported** | Enriches individual screening payload without overriding patient vitals |
| **Referral Prioritization** | **Partially Supported** | Program-level context advising clinician; no autonomous auto-referral |
| **Individual Disease Diagnosis** | **NOT Supported** | aggregate HMIS/NFHS cannot diagnose an individual patient |
| **Individual Patient Probability** | **NOT Supported** | aggregate counts cannot produce calibrated patient disease probability |

---

## 9. Future Provider Integrations

The extensible `BaseHealthDataProvider` interface allows seamless addition of upcoming public health datasets:

```python
class PopulationHealthProvider:
    # Existing active providers:
    HMISProvider       # Annual / monthly facility records
    NFHSProvider       # Representative population survey baselines
    
    # Future planned providers:
    IDSPProvider       # Weekly syndromic outbreak surveillance
    STEPSProvider      # ICMR-WHO behavioral & biochemical NCD survey
```
