"""
review_service.py — Clinician Review, Attestation & Safety Governance Service
=============================================================================
Implements TASK-012:
1. Evaluates if an assessment mandates clinical review (Red Flags, Emergencies, High Risk, Insufficient Data).
2. Manages review lifecycle state machine: REVIEW_REQUIRED -> ASSIGNED -> IN_REVIEW -> APPROVED / MODIFIED / REJECTED.
3. Cryptographically seals doctor attestations with digital signature hashes.
4. Enforces mandatory clinical notes and override justifications.
5. Emits Sync Journal entries and immutable Audit Events.
"""

import os
import json
import uuid
import hmac
import hashlib
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from database import AssessmentModel, ClinicalReviewModel, AuditEventModel, UserModel
from sync_service import record_journal_entry

HMAC_SECRET_KEY = os.environ.get("HMAC_SECRET_KEY", "rapidcheck-clinical-attestation-signing-key-2026")
REVIEW_SECRET_KEY = HMAC_SECRET_KEY

def generate_canonical_review_payload(
    review_id: str,
    assessment_id: str,
    reviewer_id: str,
    decision: str,
    timestamp: str,
    override_reason: Optional[str] = None,
    workflow_version: str = "2.0.0",
    ruleset_version: str = "2.0.0"
) -> str:
    """
    Generates deterministic canonical serialization for cryptographic attestation binding.
    """
    clean_override = (override_reason or "").strip()
    return f"{review_id}|{assessment_id}|{reviewer_id}|{decision}|{timestamp}|{clean_override}|{workflow_version}|{ruleset_version}"

def generate_server_attestation(
    review_id: str,
    assessment_id: str,
    reviewer_id: str,
    decision: str,
    timestamp: str,
    override_reason: Optional[str] = None,
    workflow_version: str = "2.0.0",
    ruleset_version: str = "2.0.0",
    secret_key: Optional[str] = None
) -> str:
    """
    Computes a cryptographic HMAC-SHA256 server-side attestation hash over canonical payload.
    """
    key = secret_key or HMAC_SECRET_KEY
    payload = generate_canonical_review_payload(
        review_id, assessment_id, reviewer_id, decision, timestamp, override_reason, workflow_version, ruleset_version
    )
    return hmac.new(key.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()

def verify_server_attestation(
    signature: str,
    review_id: str,
    assessment_id: str,
    reviewer_id: str,
    decision: str,
    timestamp: str,
    override_reason: Optional[str] = None,
    workflow_version: str = "2.0.0",
    ruleset_version: str = "2.0.0",
    secret_key: Optional[str] = None
) -> bool:
    """
    Verifies server-side cryptographic attestation signature integrity against canonical payload.
    """
    try:
        expected = generate_server_attestation(
            review_id, assessment_id, reviewer_id, decision, timestamp, override_reason, workflow_version, ruleset_version, secret_key
        )
        return hmac.compare_digest(signature, expected)
    except Exception:
        return False

def compute_signature_hash(
    review_id: str,
    assessment_id: str,
    reviewer_id: str,
    decision: str,
    timestamp: str,
    override_reason: Optional[str] = None
) -> str:
    return generate_server_attestation(
        review_id=review_id,
        assessment_id=assessment_id,
        reviewer_id=reviewer_id,
        decision=decision,
        timestamp=timestamp,
        override_reason=override_reason
    )

def evaluate_review_requirement(
    triage_state: str,
    risk_level: str,
    is_emergency: bool,
    uncertainty_state: str,
    red_flags: List[str]
) -> str:
    """
    Determines if an assessment requires mandatory clinician review.
    """
    if is_emergency or triage_state == "EMERGENCY" or len(red_flags) > 0:
        return "REVIEW_REQUIRED"
    if risk_level == "HIGH":
        return "REVIEW_REQUIRED"
    if uncertainty_state in ["INSUFFICIENT_DATA", "INVALID_DATA", "CONFLICTING_DATA", "UNCERTAIN"]:
        return "REVIEW_REQUIRED"
    return "NOT_REQUIRED"

def list_pending_reviews(db: Session, facility_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Fetches all assessments currently in REVIEW_REQUIRED or ASSIGNED state,
    ordered by emergency precedence (EMERGENCY first, then HIGH risk, then oldest).
    """
    query = db.query(AssessmentModel).filter(
        AssessmentModel.is_deleted == 0,
        AssessmentModel.review_state.in_(["REVIEW_REQUIRED", "ASSIGNED", "IN_REVIEW"])
    )
    assessments = query.all()

    # Sort: Emergency first (1), then HIGH risk (2), then others (3)
    def priority_sort_key(a: AssessmentModel):
        em = 0 if a.is_emergency else 1
        risk = 0 if a.risk_level == "HIGH" else (1 if a.risk_level == "MODERATE" else 2)
        return (em, risk, a.created_at)

    sorted_assessments = sorted(assessments, key=priority_sort_key)

    results = []
    for a in sorted_assessments:
        patient_name = a.patient.name if a.patient else "Unknown Patient"
        patient_age = a.patient.age if a.patient else None
        patient_gender = a.patient.gender if a.patient else None
        village = a.patient.village if a.patient else ""

        results.append({
            "assessment_id": a.id,
            "patient_id": a.patient_id,
            "patient_name": patient_name,
            "patient_age": patient_age,
            "patient_gender": patient_gender,
            "village": village,
            "triage_state": a.triage_state,
            "risk_level": a.risk_level,
            "is_emergency": bool(a.is_emergency),
            "red_flags": a.red_flags,
            "uncertainty_state": a.uncertainty_state,
            "symptoms": a.symptoms,
            "systolic_bp": a.systolic_bp,
            "diastolic_bp": a.diastolic_bp,
            "glucose_mg_dl": a.glucose_mg_dl,
            "temperature_f": a.temperature_f,
            "heart_rate_bpm": a.heart_rate_bpm,
            "recommended_action": a.recommended_action,
            "referral_status": a.referral_status,
            "review_state": a.review_state,
            "reviewed_by": a.reviewed_by,
            "created_at": a.created_at
        })
    return results

def assign_review_to_doctor(
    db: Session,
    assessment_id: str,
    doctor_user: UserModel
) -> AssessmentModel:
    """
    Assigns an assessment to a reviewing medical officer.
    """
    assessment = db.query(AssessmentModel).filter(
        AssessmentModel.id == assessment_id,
        AssessmentModel.is_deleted == 0
    ).first()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    assessment.review_state = "IN_REVIEW"
    assessment.reviewed_by = doctor_user.full_name
    db.commit()
    db.refresh(assessment)
    return assessment

def submit_clinician_review(
    db: Session,
    assessment_id: str,
    reviewer: UserModel,
    decision: str, # APPROVED, MODIFIED, REJECTED
    clinical_notes: str,
    override_reason: Optional[str] = None,
    modified_risk_level: Optional[str] = None,
    modified_triage_state: Optional[str] = None,
    modified_action: Optional[str] = None,
    modified_referral_status: Optional[str] = None,
    device_id: Optional[str] = "server_phc"
) -> Dict[str, Any]:
    """
    Processes a doctor's clinical review, enforces override justifications,
    updates assessment state, persists ClinicalReviewModel & AuditEvent, and records a sync journal entry.
    """
    assessment = db.query(AssessmentModel).filter(
        AssessmentModel.id == assessment_id,
        AssessmentModel.is_deleted == 0
    ).first()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    # Facility Access Isolation Check (RBAC & Multi-tenancy)
    if reviewer.role != "SYSTEM_ADMIN" and reviewer.facility_id:
        assessment_facility = None
        if hasattr(assessment, "facility_id") and assessment.facility_id:
            assessment_facility = assessment.facility_id
        elif assessment.patient and hasattr(assessment.patient, "facility_id") and assessment.patient.facility_id:
            assessment_facility = assessment.patient.facility_id

        if assessment_facility and assessment_facility != reviewer.facility_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Facility access violation: Doctor from facility '{reviewer.facility_id}' cannot review assessments from facility '{assessment_facility}'."
            )

    if not clinical_notes or len(clinical_notes.strip()) < 5:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Clinical review notes are mandatory and must be at least 5 characters explaining the clinical assessment."
        )

    decision = decision.upper()
    if decision not in ["APPROVED", "MODIFIED", "REJECTED"]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid review decision '{decision}'. Must be one of: APPROVED, MODIFIED, REJECTED."
        )

    # Invariant: If MODIFIED or REJECTED, an override reason is mandatory
    if decision in ["MODIFIED", "REJECTED"]:
        if not override_reason or len(override_reason.strip()) < 5:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"An explicit clinical override reason is mandatory when decision is '{decision}'."
            )

    # Invariant: A doctor modifying an emergency or high risk assessment must provide explicit clinical rationale
    if assessment.is_emergency and decision == "APPROVED" and modified_risk_level in ["LOW", "MODERATE"]:
        if not override_reason or len(override_reason.strip()) < 5:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Downgrading an emergency condition requires explicit clinical override justification."
            )

    previous_result = {
        "risk_level": assessment.risk_level,
        "triage_state": assessment.triage_state,
        "is_emergency": bool(assessment.is_emergency),
        "red_flags": assessment.red_flags,
        "recommended_action": assessment.recommended_action,
        "referral_status": assessment.referral_status,
        "uncertainty_state": assessment.uncertainty_state,
        "server_version": assessment.server_version
    }

    now_iso = datetime.utcnow().isoformat()
    review_id = f"rev_{uuid.uuid4()}"

    # Build new result
    new_risk_level = modified_risk_level or assessment.risk_level
    new_triage_state = modified_triage_state or assessment.triage_state
    new_action = modified_action or assessment.recommended_action
    new_referral = modified_referral_status or assessment.referral_status

    if decision == "MODIFIED":
        assessment.risk_level = new_risk_level
        assessment.triage_state = new_triage_state
        assessment.recommended_action = new_action
        assessment.referral_status = new_referral
        if new_triage_state == "EMERGENCY":
            assessment.is_emergency = 1
        elif new_risk_level in ["LOW", "MODERATE"]:
            assessment.is_emergency = 0

    assessment.review_state = decision
    assessment.reviewed_by = reviewer.full_name
    assessment.reviewed_at = now_iso
    assessment.server_version += 1
    assessment.updated_at = now_iso

    new_result = {
        "risk_level": assessment.risk_level,
        "triage_state": assessment.triage_state,
        "is_emergency": bool(assessment.is_emergency),
        "red_flags": assessment.red_flags,
        "recommended_action": assessment.recommended_action,
        "referral_status": assessment.referral_status,
        "uncertainty_state": assessment.uncertainty_state,
        "review_state": assessment.review_state,
        "reviewed_by": assessment.reviewed_by,
        "reviewed_at": assessment.reviewed_at,
        "server_version": assessment.server_version
    }

    attestation_statement = (
        f"I, {reviewer.full_name} ({reviewer.role}, Reg. No: {reviewer.license_number or 'N/A'}), "
        f"hereby clinically attest that I have reviewed the findings of Assessment {assessment_id} "
        f"and confirm the decision '{decision}' with medical responsibility."
    )

    signature_hash = compute_signature_hash(
        review_id=review_id,
        assessment_id=assessment_id,
        reviewer_id=reviewer.id,
        decision=decision,
        timestamp=now_iso,
        override_reason=override_reason
    )

    review_record = ClinicalReviewModel(
        id=review_id,
        assessment_id=assessment_id,
        reviewer_user_id=reviewer.id,
        reviewer_name=reviewer.full_name,
        reviewer_role=reviewer.role,
        decision=decision,
        override_reason=override_reason,
        clinical_notes=clinical_notes,
        previous_result_json=json.dumps(previous_result),
        new_result_json=json.dumps(new_result),
        attestation_statement=attestation_statement,
        signature_hash=signature_hash,
        created_at=now_iso,
        updated_at=now_iso
    )
    db.add(review_record)

    # 1. Monotonic Sync Journal Entry
    record_journal_entry(
        db=db,
        device_id=device_id,
        entity_type="assessment",
        entity_id=assessment.id,
        operation_type="UPDATE",
        payload=new_result,
        server_version=assessment.server_version
    )

    # 2. Immutable Audit Event
    audit_event = AuditEventModel(
        event_id=f"aud_{uuid.uuid4()}",
        event_type="REVIEW_COMPLETED" if decision == "APPROVED" else "CLINICIAN_OVERRIDE",
        entity_type="assessment",
        entity_id=assessment.id,
        user_id=reviewer.id,
        user_role=reviewer.role,
        device_id=device_id,
        action=f"Clinician review submitted with decision '{decision}'",
        previous_state_json=json.dumps(previous_result),
        new_state_json=json.dumps(new_result),
        workflow_version=assessment.workflow_version,
        ruleset_version=assessment.ruleset_version,
        timestamp=now_iso
    )
    db.add(audit_event)

    db.commit()
    db.refresh(review_record)
    db.refresh(assessment)

    return {
        "review_id": review_record.id,
        "assessment_id": assessment.id,
        "reviewer_name": review_record.reviewer_name,
        "decision": review_record.decision,
        "override_reason": review_record.override_reason,
        "clinical_notes": review_record.clinical_notes,
        "attestation_statement": review_record.attestation_statement,
        "signature_hash": review_record.signature_hash,
        "review_state": assessment.review_state,
        "server_version": assessment.server_version,
        "created_at": review_record.created_at
    }

def get_review_history(db: Session, assessment_id: str) -> List[Dict[str, Any]]:
    """
    Returns complete chronological review history and digital attestations for an assessment.
    """
    reviews = db.query(ClinicalReviewModel).filter(
        ClinicalReviewModel.assessment_id == assessment_id
    ).order_by(ClinicalReviewModel.created_at.asc()).all()

    results = []
    for r in reviews:
        results.append({
            "review_id": r.id,
            "assessment_id": r.assessment_id,
            "reviewer_user_id": r.reviewer_user_id,
            "reviewer_name": r.reviewer_name,
            "reviewer_role": r.reviewer_role,
            "decision": r.decision,
            "override_reason": r.override_reason,
            "clinical_notes": r.clinical_notes,
            "previous_result": json.loads(r.previous_result_json or "{}"),
            "new_result": json.loads(r.new_result_json or "{}"),
            "attestation_statement": r.attestation_statement,
            "signature_hash": r.signature_hash,
            "created_at": r.created_at
        })
    return results
