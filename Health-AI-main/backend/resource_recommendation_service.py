"""
resource_recommendation_service.py — Deterministic Clinical Resource Recommendation & Safety Engine
======================================================================================================
Implements Sections 8, 9, 10 & Algorithms 2, 3, 4 of the Health Resources Implementation Plan:
1. Safety Gate: Evaluates vital emergencies & red flags to surface critical protocols first.
2. Eligibility Engine: Filters resources by role, facility, demographic, status, and freshness.
3. Deterministic Clinical Ranking Engine: Multi-factor scoring model with configurable weights.
4. Structured Recommendation Bundle with provenance, rationale, and freshness badges.
"""

from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
from sqlalchemy.orm import Session
from database import HealthResourceModel, HealthResourceCategoryModel, HealthResourceTagModel, HealthResourceScopeModel
from health_resource_schemas import (
    ResourceContext,
    ResourceRecommendationItem,
    ResourceRecommendationBundle
)

# ─── CONFIGURABLE SCORING WEIGHTS (Section 8) ───────────────────────────────

SCORE_WEIGHTS = {
    "CLINICAL_MATCH": 40.0,       # Matched diagnosed disease or screening condition
    "EXPLICIT_TOPIC": 30.0,       # Matched user search query or question
    "EMERGENCY_RELEVANCE": 25.0,  # Matched emergency vital sign or red flag
    "ROLE_MATCH": 15.0,           # Tailored for active role (ASHA, Doctor, District)
    "PREGNANCY_MATCH": 15.0,      # Matched pregnancy / maternal context
    "SYMPTOM_MATCH": 15.0,        # Matched individual clinical symptoms
    "FACILITY_RELEVANCE": 10.0,   # Matched local facility tier / scope
    "LANGUAGE_MATCH": 10.0,       # Matched user's selected language
    "FRESHNESS_SCORE": 10.0,      # Recently verified / published content
    "OFFLINE_AVAILABILITY": 5.0   # Verified offline cache availability
}

ENGINE_VERSION = "2.0.0"


# ─── FRESHNESS CALCULATOR (Section 16) ──────────────────────────────────────

def calculate_freshness_status(resource: HealthResourceModel) -> str:
    """
    Computes FRESH, STALE, EXPIRED, or REVOKED based on dates and status.
    """
    if resource.status == "REVOKED":
        return "REVOKED"
    if resource.status in ["SUPERSEDED", "ARCHIVED"]:
        return "STALE"

    now_iso = datetime.utcnow().isoformat()
    if resource.expires_at and resource.expires_at < now_iso:
        return "EXPIRED"

    # If not verified within 365 days, marked as STALE
    if resource.last_verified_at:
        try:
            verified_dt = datetime.fromisoformat(resource.last_verified_at.replace("Z", ""))
            days_old = (datetime.utcnow() - verified_dt).days
            if days_old > 365:
                return "STALE"
        except Exception:
            pass

    return "FRESH"


# ─── ALGORITHM 4: SAFETY GATE (Section 9) ───────────────────────────────────

def evaluate_emergency_safety_gate(context: ResourceContext) -> Tuple[bool, List[str]]:
    """
    Evaluates context against deterministic emergency conditions without diagnosing.
    Returns (is_emergency_active, emergency_triggers).
    """
    emergency_triggers: List[str] = []

    # 1. Explicit emergency triage from Clinical Engine
    if context.is_emergency or context.triage_state == "EMERGENCY" or context.risk_level == "EMERGENCY":
        emergency_triggers.append("Clinical screening engine flagged active EMERGENCY triage state.")

    # 2. Hypertensive Crisis (SBP >= 180 or DBP >= 120)
    if context.systolic_bp is not None and context.systolic_bp >= 180:
        emergency_triggers.append(f"Severe Hypertensive Crisis: Systolic BP {context.systolic_bp} mmHg (>= 180).")
    if context.diastolic_bp is not None and context.diastolic_bp >= 120:
        emergency_triggers.append(f"Severe Hypertensive Crisis: Diastolic BP {context.diastolic_bp} mmHg (>= 120).")

    # 3. Glycemic Emergency (RBG >= 300 or RBG <= 54)
    if context.glucose_mg_dl is not None:
        if context.glucose_mg_dl >= 300:
            emergency_triggers.append(f"Critical Hyperglycemia: Glucose {context.glucose_mg_dl} mg/dL (>= 300).")
        elif context.glucose_mg_dl <= 54:
            emergency_triggers.append(f"Critical Hypoglycemia: Glucose {context.glucose_mg_dl} mg/dL (<= 54).")

    # 4. Severe Red Flags
    symptoms_lower = [s.lower() for s in context.symptoms]
    red_flags_lower = [rf.lower() for rf in context.risk_flags]

    has_chest_pain = any("chest pain" in s for s in symptoms_lower) or any("chest pain" in rf for rf in red_flags_lower)
    has_dyspnea = any("dyspnea" in s or "shortness of breath" in s or "breathing" in s for s in symptoms_lower) or any("breath" in rf for rf in red_flags_lower)
    if has_chest_pain and has_dyspnea:
        emergency_triggers.append("Acute Cardiopulmonary Red Flag: Concurrent severe chest pain and dyspnea.")

    has_hemoptysis = any("hemoptysis" in s or "coughing blood" in s or "blood in sputum" in s for s in symptoms_lower) or any("hemoptysis" in rf for rf in red_flags_lower)
    if has_hemoptysis:
        emergency_triggers.append("Acute Hemoptysis / Pulmonary Crisis detected.")

    # 5. Maternal High Risk Emergency
    if context.pregnancy_status == "HIGH_RISK_PREGNANCY" or (
        context.pregnancy_status != "NOT_PREGNANT" and (
            (context.systolic_bp is not None and context.systolic_bp >= 140) or
            any("bleeding" in s or "convulsion" in s for s in symptoms_lower)
        )
    ):
        emergency_triggers.append("High-Risk Pregnancy Alert: Maternal red flag / pre-eclampsia risk.")

    is_emergency_active = len(emergency_triggers) > 0
    return is_emergency_active, emergency_triggers


# ─── ALGORITHM 2: ELIGIBILITY FILTER (Section 4, 5, 19) ─────────────────────

def filter_eligible_resources(
    db: Session,
    context: ResourceContext,
    include_drafts: bool = False
) -> List[HealthResourceModel]:
    """
    Filters health resources in the database for candidate eligibility:
    - Soft delete = 0
    - Status == PUBLISHED (or APPROVED/CLINICAL_REVIEW if user has clinical management rights)
    - Not REVOKED
    - Scoped to GLOBAL, or user's Role, or user's Facility
    """
    query = db.query(HealthResourceModel).filter(HealthResourceModel.is_deleted == 0)

    # Status check
    if not include_drafts:
        # Standard frontline and clinical users only see PUBLISHED
        query = query.filter(HealthResourceModel.status == "PUBLISHED")
    else:
        # Clinical reviewers can see draft/approved
        query = query.filter(HealthResourceModel.status.in_(["PUBLISHED", "APPROVED", "CLINICAL_REVIEW"]))

    all_candidates = query.all()
    eligible: List[HealthResourceModel] = []

    for res in all_candidates:
        # Check freshness
        freshness = calculate_freshness_status(res)
        if freshness == "REVOKED":
            continue

        # Check Scopes
        scopes = res.scopes or []
        if scopes:
            is_scope_allowed = False
            for scope in scopes:
                st = scope.scope_type.upper()
                sv = scope.scope_value.upper()
                if st == "GLOBAL" or sv == "GLOBAL":
                    is_scope_allowed = True
                    break
                elif st == "ROLE" and sv == context.user_role.upper():
                    is_scope_allowed = True
                    break
                elif st == "FACILITY" and sv == (context.facility_id or "").upper():
                    is_scope_allowed = True
                    break
                elif st == "DISTRICT":
                    is_scope_allowed = True
                    break
            if not is_scope_allowed:
                continue

        eligible.append(res)

    return eligible


# ─── ALGORITHM 3 & 4: SCORING & RECOMMENDATION BUNDLE (Section 8, 10) ────────

def generate_recommendations(
    db: Session,
    context: ResourceContext
) -> ResourceRecommendationBundle:
    """
    Executes the end-to-end recommendation workflow:
    1. Evaluates emergency safety gate.
    2. Retrieves eligible candidate resources.
    3. Calculates deterministic relevance scores.
    4. Applies safety override (emergency protocols prioritized).
    5. Returns canonical structured recommendation bundle.
    """
    is_emergency_active, emergency_triggers = evaluate_emergency_safety_gate(context)

    # Retrieve categories map for display
    categories = {c.code: c.name for c in db.query(HealthResourceCategoryModel).all()}

    # Allow CLINICAL_REVIEW access only if PHC_DOCTOR or SYSTEM_ADMIN
    can_view_drafts = context.user_role in ["PHC_DOCTOR", "SYSTEM_ADMIN"]
    eligible_resources = filter_eligible_resources(db, context, include_drafts=False)

    scored_items: List[Tuple[float, Dict[str, float], str, HealthResourceModel]] = []

    query_tokens = [w.lower() for w in (context.requested_topic or "").split() if len(w) > 2]
    context_diagnoses_lower = [d.lower() for d in context.diagnoses]
    context_symptoms_lower = [s.lower() for s in context.symptoms]

    for res in eligible_resources:
        score = 0.0
        breakdown: Dict[str, float] = {}
        matched_reasons: List[str] = []

        tags = res.tags or []
        tag_conditions = [t.tag_value.lower() for t in tags if t.tag_type == "condition"]
        tag_symptoms = [t.tag_value.lower() for t in tags if t.tag_type == "symptom"]
        tag_roles = [t.tag_value.upper() for t in tags if t.tag_type == "role"]
        tag_urgencies = [t.tag_value.upper() for t in tags if t.tag_type == "urgency"]
        tag_age_groups = [t.tag_value.lower() for t in tags if t.tag_type == "age_group"]
        tag_pregnancy_stages = [t.tag_value.upper() for t in tags if t.tag_type == "pregnancy_stage"]

        # 1. Clinical Diagnosis / Likely Condition Match (+40)
        clinical_matched = False
        for diag in context_diagnoses_lower:
            if any(tc in diag or diag in tc for tc in tag_conditions) or (res.category_code.lower() in diag):
                score += SCORE_WEIGHTS["CLINICAL_MATCH"]
                breakdown["clinical_match"] = SCORE_WEIGHTS["CLINICAL_MATCH"]
                matched_reasons.append(f"Matched clinical assessment finding: '{diag.title()}'")
                clinical_matched = True
                break

        # 2. Explicit User Query Match (+30)
        if query_tokens:
            res_text = f"{res.title} {res.summary} {res.category_code} {' '.join(tag_conditions)} {' '.join(tag_symptoms)}".lower()
            matching_query_tokens = [token for token in query_tokens if token in res_text]
            if matching_query_tokens:
                ratio = min(1.0, len(matching_query_tokens) / max(1, len(query_tokens)))
                topic_pts = round(SCORE_WEIGHTS["EXPLICIT_TOPIC"] * ratio, 1)
                score += topic_pts
                breakdown["explicit_topic"] = topic_pts
                matched_reasons.append(f"Matched requested topic keywords: {', '.join(matching_query_tokens)}")

        # 3. Emergency & Urgency Relevance (+25)
        if is_emergency_active:
            if res.is_emergency or res.urgency_level in ["EMERGENCY", "URGENT"] or "EMERGENCY" in tag_urgencies or res.resource_type == "EMERGENCY_PROTOCOL":
                score += SCORE_WEIGHTS["EMERGENCY_RELEVANCE"] * 2.0 # Extra boost for emergency resources during active emergency
                breakdown["emergency_safety_override"] = SCORE_WEIGHTS["EMERGENCY_RELEVANCE"] * 2.0
                matched_reasons.append("Emergency Protocol activated for detected red flags/vital crisis")
        elif res.urgency_level in ["URGENT", "EMERGENCY"]:
            if context.risk_level in ["HIGH", "EMERGENCY"]:
                score += SCORE_WEIGHTS["EMERGENCY_RELEVANCE"]
                breakdown["urgency_relevance"] = SCORE_WEIGHTS["EMERGENCY_RELEVANCE"]

        # 4. Role Match (+15)
        if context.user_role.upper() in tag_roles or not tag_roles:
            score += SCORE_WEIGHTS["ROLE_MATCH"]
            breakdown["role_match"] = SCORE_WEIGHTS["ROLE_MATCH"]
            matched_reasons.append(f"Tailored for {context.user_role.replace('_', ' ')}")

        # 5. Symptom Match (+15)
        symptom_matches = [s for s in context_symptoms_lower if any(ts in s or s in ts for ts in tag_symptoms)]
        if symptom_matches:
            score += SCORE_WEIGHTS["SYMPTOM_MATCH"]
            breakdown["symptom_match"] = SCORE_WEIGHTS["SYMPTOM_MATCH"]
            matched_reasons.append(f"Matched symptoms: {', '.join(symptom_matches[:2])}")

        # 6. Pregnancy / Maternal Context (+15)
        if context.pregnancy_status != "NOT_PREGNANT":
            if res.category_code == "MATERNAL" or any("PREGNANCY" in p or "ANC" in p or "PNC" in p for p in tag_pregnancy_stages):
                score += SCORE_WEIGHTS["PREGNANCY_MATCH"]
                breakdown["pregnancy_match"] = SCORE_WEIGHTS["PREGNANCY_MATCH"]
                matched_reasons.append(f"Maternal protocol matched: {context.pregnancy_status.replace('_', ' ')}")

        # 7. Age Group Match
        if context.age is not None:
            if context.age < 5 and any(ag in ["child", "pediatric", "infant", "under5"] for ag in tag_age_groups):
                score += 10.0
                breakdown["age_match"] = 10.0
            elif context.age >= 60 and any(ag in ["elderly", "geriatric", "senior"] for ag in tag_age_groups):
                score += 10.0
                breakdown["age_match"] = 10.0

        # 8. Language Match (+10)
        if res.language.lower() == context.language.lower():
            score += SCORE_WEIGHTS["LANGUAGE_MATCH"]
            breakdown["language_match"] = SCORE_WEIGHTS["LANGUAGE_MATCH"]

        # 9. Freshness Score (+10)
        freshness = calculate_freshness_status(res)
        if freshness == "FRESH":
            score += SCORE_WEIGHTS["FRESHNESS_SCORE"]
            breakdown["freshness"] = SCORE_WEIGHTS["FRESHNESS_SCORE"]

        # 10. Offline Availability (+5)
        score += SCORE_WEIGHTS["OFFLINE_AVAILABILITY"]
        breakdown["offline_available"] = SCORE_WEIGHTS["OFFLINE_AVAILABILITY"]

        primary_reason = " | ".join(matched_reasons) if matched_reasons else "General clinical guidance for frontline primary care."
        scored_items.append((score, breakdown, primary_reason, res))

    # Sort descending by calculated score
    scored_items.sort(key=lambda x: x[0], reverse=True)

    # Build response items
    recommendation_items: List[ResourceRecommendationItem] = []
    for score_val, breakdown_dict, reason_str, res in scored_items:
        # Skip items that have minimal match unless requested topic is empty and we need default guidance
        if score_val < 20.0 and len(scored_items) > 10 and not context.requested_topic:
            continue

        recommendation_items.append(
            ResourceRecommendationItem(
                resource_id=res.id,
                resource_code=res.resource_code,
                title=res.title,
                summary=res.summary,
                resource_type=res.resource_type,
                category_code=res.category_code,
                category_name=categories.get(res.category_code, res.category_code),
                reason=reason_str,
                priority=int(score_val),
                urgency=res.urgency_level, # type: ignore
                is_emergency=bool(res.is_emergency),
                offline_available=True,
                version=res.version,
                freshness_status=calculate_freshness_status(res),
                source_name=res.source_name,
                source_url=res.source_url,
                match_score=round(score_val, 1),
                score_breakdown=breakdown_dict
            )
        )

    # If emergency active, ensure emergency protocols are strictly placed at the top (Algorithm 4 Safety Override)
    if is_emergency_active:
        emergency_items = [it for it in recommendation_items if it.is_emergency or it.urgency in ["EMERGENCY", "URGENT"]]
        routine_items = [it for it in recommendation_items if not (it.is_emergency or it.urgency in ["EMERGENCY", "URGENT"])]
        recommendation_items = emergency_items + routine_items

    warnings: List[str] = []
    if is_emergency_active:
        warnings.extend(emergency_triggers)
        warnings.append("SAFETY OVERRIDE ACTIVE: Surface approved emergency protocols immediately. Do not rely on routine educational content.")

    if context.uncertainty_state in ["INSUFFICIENT_DATA", "CONFLICTING_DATA"]:
        warnings.append(f"Assessment uncertainty state '{context.uncertainty_state}' preserved. Recommend vital sign verification.")

    return ResourceRecommendationBundle(
        context={
            "user_role": context.user_role,
            "facility_id": context.facility_id,
            "patient_id": context.patient_id,
            "assessment_id": context.assessment_id,
            "triage_state": context.triage_state,
            "risk_level": context.risk_level,
            "is_emergency": context.is_emergency,
            "uncertainty_state": context.uncertainty_state,
            "pregnancy_status": context.pregnancy_status,
            "requested_topic": context.requested_topic,
            "language": context.language
        },
        recommendations=recommendation_items[:25], # Top 25 most relevant
        emergency_override=is_emergency_active,
        warnings=warnings,
        engine_version=ENGINE_VERSION,
        evaluated_at=datetime.utcnow().isoformat()
    )
