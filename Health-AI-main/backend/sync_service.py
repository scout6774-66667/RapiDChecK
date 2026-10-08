import json
from datetime import datetime
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import (
    PatientModel,
    AssessmentModel,
    AppointmentModel,
    SyncJournalModel,
    IdempotencyModel
)
from schemas import (
    SyncOperation,
    SyncPushRequest,
    SyncPushResponse,
    SyncOperationResult,
    SyncConflictData,
    SyncPullRequest,
    SyncPullResponse,
    SyncJournalEntry,
    AssessmentCreate
)
from ml_engine import screening_engine


def record_journal_entry(
    db: Session,
    device_id: Optional[str],
    entity_type: str,
    entity_id: str,
    operation_type: str,
    payload: Dict[str, Any],
    server_version: int
) -> SyncJournalModel:
    """Appends an immutable entry to the server sync journal."""
    entry = SyncJournalModel(
        device_id=device_id,
        entity_type=entity_type,
        entity_id=entity_id,
        operation_type=operation_type,
        payload_json=json.dumps(payload),
        server_version=server_version,
        created_at=datetime.utcnow().isoformat()
    )
    db.add(entry)
    db.flush()
    return entry


def apply_patient_operation(
    db: Session,
    op: SyncOperation,
    device_id: str
) -> SyncOperationResult:
    payload = op.payload or {}
    patient = db.query(PatientModel).filter(PatientModel.id == op.entity_id).first()

    if op.operation_type == 'CREATE':
        if patient:
            return SyncOperationResult(
                operation_id=op.operation_id,
                entity_type=op.entity_type,
                entity_id=op.entity_id,
                operation_type=op.operation_type,
                status='DUPLICATE',
                server_version=patient.server_version
            )

        new_patient = PatientModel(
            id=op.entity_id,
            national_health_id=payload.get('national_health_id'),
            name=payload.get('name', 'Unknown'),
            age=int(payload.get('age', 40)),
            gender=payload.get('gender', 'Other'),
            village=payload.get('village', 'Unknown'),
            phone=payload.get('phone', ''),
            patient_id=payload.get('patient_id') or f"RH-{op.entity_id[:6].upper()}",
            server_version=1,
            is_deleted=0,
            created_at=payload.get('created_at') or datetime.utcnow().isoformat(),
            updated_at=datetime.utcnow().isoformat()
        )
        db.add(new_patient)
        db.flush()

        j_entry = record_journal_entry(
            db=db,
            device_id=device_id,
            entity_type='patient',
            entity_id=new_patient.id,
            operation_type='CREATE',
            payload={
                "id": new_patient.id,
                "national_health_id": new_patient.national_health_id,
                "name": new_patient.name,
                "age": new_patient.age,
                "gender": new_patient.gender,
                "village": new_patient.village,
                "phone": new_patient.phone,
                "patient_id": new_patient.patient_id,
                "server_version": new_patient.server_version,
                "is_deleted": 0,
                "created_at": new_patient.created_at
            },
            server_version=1
        )

        return SyncOperationResult(
            operation_id=op.operation_id,
            entity_type=op.entity_type,
            entity_id=op.entity_id,
            operation_type=op.operation_type,
            status='APPLIED',
            server_version=1,
            server_sequence=j_entry.server_sequence
        )

    elif op.operation_type == 'UPDATE':
        if not patient:
            return SyncOperationResult(
                operation_id=op.operation_id,
                entity_type=op.entity_type,
                entity_id=op.entity_id,
                operation_type=op.operation_type,
                status='REJECTED',
                server_version=0,
                error_message='Patient not found'
            )

        # Optimistic Concurrency Control (OCC)
        if op.base_server_version is not None and op.base_server_version < patient.server_version:
            server_payload = {
                "id": patient.id,
                "name": patient.name,
                "age": patient.age,
                "gender": patient.gender,
                "village": patient.village,
                "phone": patient.phone,
                "server_version": patient.server_version
            }
            return SyncOperationResult(
                operation_id=op.operation_id,
                entity_type=op.entity_type,
                entity_id=op.entity_id,
                operation_type=op.operation_type,
                status='CONFLICT',
                server_version=patient.server_version,
                conflict_data=SyncConflictData(
                    entity_id=patient.id,
                    entity_type='patient',
                    base_server_version=op.base_server_version,
                    current_server_version=patient.server_version,
                    base_version=op.base_server_version,
                    server_version=patient.server_version,
                    server_payload=server_payload
                ),
                error_message=f"Conflict: server version is {patient.server_version}, client base was {op.base_server_version}"
            )

        # Apply update
        if 'name' in payload: patient.name = payload['name']
        if 'age' in payload: patient.age = int(payload['age'])
        if 'gender' in payload: patient.gender = payload['gender']
        if 'village' in payload: patient.village = payload['village']
        if 'phone' in payload: patient.phone = payload['phone']
        if 'national_health_id' in payload: patient.national_health_id = payload['national_health_id']

        patient.server_version += 1
        patient.updated_at = datetime.utcnow().isoformat()
        db.flush()

        j_entry = record_journal_entry(
            db=db,
            device_id=device_id,
            entity_type='patient',
            entity_id=patient.id,
            operation_type='UPDATE',
            payload={
                "id": patient.id,
                "name": patient.name,
                "age": patient.age,
                "gender": patient.gender,
                "village": patient.village,
                "phone": patient.phone,
                "server_version": patient.server_version,
                "updated_at": patient.updated_at
            },
            server_version=patient.server_version
        )

        return SyncOperationResult(
            operation_id=op.operation_id,
            entity_type=op.entity_type,
            entity_id=op.entity_id,
            operation_type=op.operation_type,
            status='APPLIED',
            server_version=patient.server_version,
            server_sequence=j_entry.server_sequence
        )

    elif op.operation_type == 'DELETE':
        if not patient or patient.is_deleted:
            return SyncOperationResult(
                operation_id=op.operation_id,
                entity_type=op.entity_type,
                entity_id=op.entity_id,
                operation_type=op.operation_type,
                status='APPLIED',
                server_version=patient.server_version if patient else 0
            )

        patient.is_deleted = 1
        patient.server_version += 1
        patient.updated_at = datetime.utcnow().isoformat()
        db.flush()

        j_entry = record_journal_entry(
            db=db,
            device_id=device_id,
            entity_type='patient',
            entity_id=patient.id,
            operation_type='DELETE',
            payload={"id": patient.id, "is_deleted": 1, "server_version": patient.server_version},
            server_version=patient.server_version
        )

        return SyncOperationResult(
            operation_id=op.operation_id,
            entity_type=op.entity_type,
            entity_id=op.entity_id,
            operation_type=op.operation_type,
            status='APPLIED',
            server_version=patient.server_version,
            server_sequence=j_entry.server_sequence
        )

    return SyncOperationResult(
        operation_id=op.operation_id,
        entity_type=op.entity_type,
        entity_id=op.entity_id,
        operation_type=op.operation_type,
        status='REJECTED',
        server_version=0,
        error_message=f"Unsupported operation_type '{op.operation_type}'"
    )


def apply_assessment_operation(
    db: Session,
    op: SyncOperation,
    device_id: str
) -> SyncOperationResult:
    payload = op.payload or {}
    assessment = db.query(AssessmentModel).filter(AssessmentModel.id == op.entity_id).first()

    if op.operation_type == 'CREATE':
        if assessment:
            return SyncOperationResult(
                operation_id=op.operation_id,
                entity_type=op.entity_type,
                entity_id=op.entity_id,
                operation_type=op.operation_type,
                status='DUPLICATE',
                server_version=assessment.server_version
            )

        patient_id = payload.get('patient_id')
        if not patient_id:
            return SyncOperationResult(
                operation_id=op.operation_id,
                entity_type=op.entity_type,
                entity_id=op.entity_id,
                operation_type=op.operation_type,
                status='REJECTED',
                server_version=0,
                error_message='Assessment requires a valid patient_id'
            )

        # Ensure patient exists
        patient = db.query(PatientModel).filter(PatientModel.id == patient_id).first()
        if not patient:
            patient = PatientModel(
                id=patient_id,
                name=payload.get('patient_name', 'Patient'),
                age=40,
                gender='Other',
                village=payload.get('village', 'Unknown'),
                phone='',
                patient_id=f"RH-{patient_id[:6].upper()}",
                server_version=1,
                is_deleted=0
            )
            db.add(patient)
            db.flush()

        # Run canonical clinical evaluation engine
        assessment_in = AssessmentCreate(
            id=op.entity_id,
            patient_id=patient_id,
            symptoms=payload.get('symptoms', []),
            symptom_duration_days=payload.get('symptom_duration_days'),
            temperature_f=payload.get('temperature_f'),
            systolic_bp=payload.get('systolic_bp'),
            diastolic_bp=payload.get('diastolic_bp'),
            glucose_mg_dl=payload.get('glucose_mg_dl'),
            heart_rate_bpm=payload.get('heart_rate_bpm'),
            height_cm=payload.get('height_cm'),
            weight_kg=payload.get('weight_kg'),
            bmi=payload.get('bmi'),
            smoking_status=payload.get('smoking_status', 'Never'),
            alcohol_status=payload.get('alcohol_status', 'Never'),
            physical_activity=payload.get('physical_activity', 'Moderate'),
            family_history=payload.get('family_history', []),
            client_operation_id=op.operation_id
        )
        eval_result = screening_engine.evaluate(assessment_in.model_dump())

        # Determine clinician review requirement
        if eval_result.get("is_emergency") or eval_result.get("triage_state") == "EMERGENCY" or len(eval_result.get("red_flags", [])) > 0:
            review_state = "REVIEW_REQUIRED"
        elif eval_result.get("risk_level") == "HIGH":
            review_state = "REVIEW_REQUIRED"
        elif eval_result.get("uncertainty_state") in ["INSUFFICIENT_DATA", "INVALID_DATA", "CONFLICTING_DATA", "UNCERTAIN"]:
            review_state = "REVIEW_REQUIRED"
        else:
            review_state = "NOT_REQUIRED"

        new_assessment = AssessmentModel(
            id=op.entity_id,
            patient_id=patient_id,
            client_operation_id=op.operation_id,
            symptom_duration_days=assessment_in.symptom_duration_days,
            temperature_f=assessment_in.temperature_f,
            systolic_bp=assessment_in.systolic_bp,
            diastolic_bp=assessment_in.diastolic_bp,
            glucose_mg_dl=assessment_in.glucose_mg_dl,
            heart_rate_bpm=assessment_in.heart_rate_bpm,
            height_cm=assessment_in.height_cm,
            weight_kg=assessment_in.weight_kg,
            bmi=assessment_in.bmi,
            smoking_status=assessment_in.smoking_status,
            alcohol_status=assessment_in.alcohol_status,
            physical_activity=assessment_in.physical_activity,
            risk_level=eval_result["risk_level"],
            triage_state=eval_result.get("triage_state", "LOW_RISK"),
            is_emergency=1 if eval_result.get("is_emergency") else 0,
            uncertainty_state=eval_result.get("uncertainty_state", "COMPLETE"),
            risk_score=eval_result.get("risk_score"),
            recommended_action=eval_result.get("recommended_action", ""),
            referral_status=eval_result.get("referral_status", "NOT_REFERRED"),
            workflow_version=eval_result.get("workflow_version", "2.0.0"),
            ruleset_version=eval_result.get("ruleset_version", "2.0.0"),
            review_state=review_state,
            server_version=1,
            is_deleted=0,
            created_at=payload.get('created_at') or datetime.utcnow().isoformat(),
            updated_at=datetime.utcnow().isoformat()
        )
        new_assessment.symptoms = assessment_in.symptoms
        new_assessment.family_history = assessment_in.family_history
        new_assessment.likely_conditions = eval_result.get("likely_conditions", [])
        new_assessment.contributing_factors = eval_result.get("contributing_factors", [])
        new_assessment.red_flags = eval_result.get("red_flags", [])

        db.add(new_assessment)
        db.flush()

        j_entry = record_journal_entry(
            db=db,
            device_id=device_id,
            entity_type='assessment',
            entity_id=new_assessment.id,
            operation_type='CREATE',
            payload={
                "id": new_assessment.id,
                "patient_id": new_assessment.patient_id,
                "client_operation_id": op.operation_id,
                "symptoms": new_assessment.symptoms,
                "systolic_bp": new_assessment.systolic_bp,
                "diastolic_bp": new_assessment.diastolic_bp,
                "glucose_mg_dl": new_assessment.glucose_mg_dl,
                "heart_rate_bpm": new_assessment.heart_rate_bpm,
                "risk_level": new_assessment.risk_level,
                "triage_state": new_assessment.triage_state,
                "is_emergency": bool(new_assessment.is_emergency),
                "referral_status": new_assessment.referral_status,
                "ruleset_version": new_assessment.ruleset_version,
                "server_version": 1,
                "created_at": new_assessment.created_at
            },
            server_version=1
        )

        return SyncOperationResult(
            operation_id=op.operation_id,
            entity_type=op.entity_type,
            entity_id=op.entity_id,
            operation_type=op.operation_type,
            status='APPLIED',
            server_version=1,
            server_sequence=j_entry.server_sequence
        )

    elif op.operation_type == 'UPDATE':
        if not assessment:
            return SyncOperationResult(
                operation_id=op.operation_id,
                entity_type=op.entity_type,
                entity_id=op.entity_id,
                operation_type=op.operation_type,
                status='REJECTED',
                server_version=0,
                error_message='Assessment not found'
            )

        if op.base_server_version is not None and op.base_server_version < assessment.server_version:
            return SyncOperationResult(
                operation_id=op.operation_id,
                entity_type=op.entity_type,
                entity_id=op.entity_id,
                operation_type=op.operation_type,
                status='CONFLICT',
                server_version=assessment.server_version,
                conflict_data=SyncConflictData(
                    entity_id=assessment.id,
                    entity_type='assessment',
                    base_server_version=op.base_server_version,
                    current_server_version=assessment.server_version,
                    base_version=op.base_server_version,
                    server_version=assessment.server_version,
                    server_payload={"id": assessment.id, "referral_status": assessment.referral_status}
                ),
                error_message=f"Assessment version conflict"
            )

        if 'referral_status' in payload:
            assessment.referral_status = payload['referral_status']
        assessment.server_version += 1
        assessment.updated_at = datetime.utcnow().isoformat()
        db.flush()

        j_entry = record_journal_entry(
            db=db,
            device_id=device_id,
            entity_type='assessment',
            entity_id=assessment.id,
            operation_type='UPDATE',
            payload={"id": assessment.id, "referral_status": assessment.referral_status, "server_version": assessment.server_version},
            server_version=assessment.server_version
        )

        return SyncOperationResult(
            operation_id=op.operation_id,
            entity_type=op.entity_type,
            entity_id=op.entity_id,
            operation_type=op.operation_type,
            status='APPLIED',
            server_version=assessment.server_version,
            server_sequence=j_entry.server_sequence
        )

    elif op.operation_type == 'DELETE':
        if not assessment or assessment.is_deleted:
            return SyncOperationResult(
                operation_id=op.operation_id,
                entity_type=op.entity_type,
                entity_id=op.entity_id,
                operation_type=op.operation_type,
                status='APPLIED',
                server_version=assessment.server_version if assessment else 0
            )

        assessment.is_deleted = 1
        assessment.server_version += 1
        assessment.updated_at = datetime.utcnow().isoformat()
        db.flush()

        j_entry = record_journal_entry(
            db=db,
            device_id=device_id,
            entity_type='assessment',
            entity_id=assessment.id,
            operation_type='DELETE',
            payload={"id": assessment.id, "is_deleted": 1, "server_version": assessment.server_version},
            server_version=assessment.server_version
        )

        return SyncOperationResult(
            operation_id=op.operation_id,
            entity_type=op.entity_type,
            entity_id=op.entity_id,
            operation_type=op.operation_type,
            status='APPLIED',
            server_version=assessment.server_version,
            server_sequence=j_entry.server_sequence
        )

    return SyncOperationResult(
        operation_id=op.operation_id,
        entity_type=op.entity_type,
        entity_id=op.entity_id,
        operation_type=op.operation_type,
        status='REJECTED',
        server_version=0,
        error_message=f"Unsupported operation_type '{op.operation_type}'"
    )


def apply_referral_operation(
    db: Session,
    op: SyncOperation,
    device_id: str
) -> SyncOperationResult:
    payload = op.payload or {}
    assessment_id = payload.get('assessment_id') or op.entity_id
    assessment = db.query(AssessmentModel).filter(AssessmentModel.id == assessment_id).first()

    if not assessment:
        return SyncOperationResult(
            operation_id=op.operation_id,
            entity_type=op.entity_type,
            entity_id=op.entity_id,
            operation_type=op.operation_type,
            status='REJECTED',
            server_version=0,
            error_message=f"Assessment {assessment_id} not found for referral update"
        )

    if op.base_server_version is not None and op.base_server_version < assessment.server_version:
        return SyncOperationResult(
            operation_id=op.operation_id,
            entity_type=op.entity_type,
            entity_id=op.entity_id,
            operation_type=op.operation_type,
            status='CONFLICT',
            server_version=assessment.server_version,
            conflict_data=SyncConflictData(
                entity_id=assessment.id,
                entity_type='assessment',
                base_server_version=op.base_server_version,
                current_server_version=assessment.server_version,
                base_version=op.base_server_version,
                server_version=assessment.server_version,
                server_payload={"id": assessment.id, "referral_status": assessment.referral_status}
            ),
            error_message=f"Referral status conflict"
        )

    new_status = payload.get('referral_status') or payload.get('status') or 'REFERRED'
    assessment.referral_status = new_status
    assessment.server_version += 1
    assessment.updated_at = datetime.utcnow().isoformat()
    db.flush()

    j_entry = record_journal_entry(
        db=db,
        device_id=device_id,
        entity_type='assessment',
        entity_id=assessment.id,
        operation_type='UPDATE',
        payload={"assessment_id": assessment.id, "referral_status": new_status, "server_version": assessment.server_version},
        server_version=assessment.server_version
    )

    return SyncOperationResult(
        operation_id=op.operation_id,
        entity_type=op.entity_type,
        entity_id=op.entity_id,
        operation_type=op.operation_type,
        status='APPLIED',
        server_version=assessment.server_version,
        server_sequence=j_entry.server_sequence
    )


def apply_appointment_operation(
    db: Session,
    op: SyncOperation,
    device_id: str
) -> SyncOperationResult:
    payload = op.payload or {}
    appt = db.query(AppointmentModel).filter(AppointmentModel.id == op.entity_id).first()

    if op.operation_type == 'CREATE':
        if appt:
            return SyncOperationResult(
                operation_id=op.operation_id,
                entity_type=op.entity_type,
                entity_id=op.entity_id,
                operation_type=op.operation_type,
                status='DUPLICATE',
                server_version=appt.server_version
            )

        new_appt = AppointmentModel(
            id=op.entity_id,
            patient_name=payload.get('patient_name', 'Patient'),
            patient_phone=payload.get('patient_phone', ''),
            doctor_name=payload.get('doctor_name', 'Doctor'),
            doctor_specialty=payload.get('doctor_specialty', 'General Physician'),
            doctor_address=payload.get('doctor_address', ''),
            appointment_date=payload.get('appointment_date', '2026-10-15'),
            appointment_time=payload.get('appointment_time', '10:00 AM'),
            notes=payload.get('notes', ''),
            status=payload.get('status', 'PENDING'),
            risk_level=payload.get('risk_level', 'LOW'),
            server_version=1,
            is_deleted=0,
            created_at=payload.get('created_at') or datetime.utcnow().isoformat(),
            updated_at=datetime.utcnow().isoformat()
        )
        new_appt.likely_conditions = payload.get('likely_conditions', [])
        db.add(new_appt)
        db.flush()

        j_entry = record_journal_entry(
            db=db,
            device_id=device_id,
            entity_type='appointment',
            entity_id=new_appt.id,
            operation_type='CREATE',
            payload={
                "id": new_appt.id,
                "patient_name": new_appt.patient_name,
                "doctor_name": new_appt.doctor_name,
                "appointment_date": new_appt.appointment_date,
                "appointment_time": new_appt.appointment_time,
                "status": new_appt.status,
                "server_version": 1,
                "created_at": new_appt.created_at
            },
            server_version=1
        )

        return SyncOperationResult(
            operation_id=op.operation_id,
            entity_type=op.entity_type,
            entity_id=op.entity_id,
            operation_type=op.operation_type,
            status='APPLIED',
            server_version=1,
            server_sequence=j_entry.server_sequence
        )

    elif op.operation_type == 'UPDATE':
        if not appt:
            return SyncOperationResult(
                operation_id=op.operation_id,
                entity_type=op.entity_type,
                entity_id=op.entity_id,
                operation_type=op.operation_type,
                status='REJECTED',
                server_version=0,
                error_message='Appointment not found'
            )

        if op.base_server_version is not None and op.base_server_version < appt.server_version:
            return SyncOperationResult(
                operation_id=op.operation_id,
                entity_type=op.entity_type,
                entity_id=op.entity_id,
                operation_type=op.operation_type,
                status='CONFLICT',
                server_version=appt.server_version,
                conflict_data=SyncConflictData(
                    entity_id=appt.id,
                    entity_type='appointment',
                    base_server_version=op.base_server_version,
                    current_server_version=appt.server_version,
                    base_version=op.base_server_version,
                    server_version=appt.server_version,
                    server_payload={"id": appt.id, "status": appt.status, "appointment_date": appt.appointment_date}
                ),
                error_message="Appointment version conflict"
            )

        if 'status' in payload: appt.status = payload['status']
        if 'patient_name' in payload: appt.patient_name = payload['patient_name']
        if 'patient_phone' in payload: appt.patient_phone = payload['patient_phone']
        if 'appointment_date' in payload: appt.appointment_date = payload['appointment_date']
        if 'appointment_time' in payload: appt.appointment_time = payload['appointment_time']
        if 'notes' in payload: appt.notes = payload['notes']

        appt.server_version += 1
        appt.updated_at = datetime.utcnow().isoformat()
        db.flush()

        j_entry = record_journal_entry(
            db=db,
            device_id=device_id,
            entity_type='appointment',
            entity_id=appt.id,
            operation_type='UPDATE',
            payload={"id": appt.id, "status": appt.status, "server_version": appt.server_version},
            server_version=appt.server_version
        )

        return SyncOperationResult(
            operation_id=op.operation_id,
            entity_type=op.entity_type,
            entity_id=op.entity_id,
            operation_type=op.operation_type,
            status='APPLIED',
            server_version=appt.server_version,
            server_sequence=j_entry.server_sequence
        )

    elif op.operation_type == 'DELETE':
        if not appt or appt.is_deleted:
            return SyncOperationResult(
                operation_id=op.operation_id,
                entity_type=op.entity_type,
                entity_id=op.entity_id,
                operation_type=op.operation_type,
                status='APPLIED',
                server_version=appt.server_version if appt else 0
            )

        appt.is_deleted = 1
        appt.server_version += 1
        appt.updated_at = datetime.utcnow().isoformat()
        db.flush()

        j_entry = record_journal_entry(
            db=db,
            device_id=device_id,
            entity_type='appointment',
            entity_id=appt.id,
            operation_type='DELETE',
            payload={"id": appt.id, "is_deleted": 1, "server_version": appt.server_version},
            server_version=appt.server_version
        )

        return SyncOperationResult(
            operation_id=op.operation_id,
            entity_type=op.entity_type,
            entity_id=op.entity_id,
            operation_type=op.operation_type,
            status='APPLIED',
            server_version=appt.server_version,
            server_sequence=j_entry.server_sequence
        )

    return SyncOperationResult(
        operation_id=op.operation_id,
        entity_type=op.entity_type,
        entity_id=op.entity_id,
        operation_type=op.operation_type,
        status='REJECTED',
        server_version=0,
        error_message=f"Unsupported operation_type '{op.operation_type}'"
    )


def process_push_batch(
    db: Session,
    request: SyncPushRequest
) -> SyncPushResponse:
    """
    TASK-005: Atomically processes a batch of operations pushed from client outbox.
    Provides strict idempotency, OCC conflict detection, and audit journalling.
    """
    results: List[SyncOperationResult] = []
    sorted_ops = sorted(request.operations, key=lambda o: o.client_sequence)

    for op in sorted_ops:
        # 1. Idempotency Check
        existing_log = db.query(IdempotencyModel).filter(IdempotencyModel.operation_id == op.operation_id).first()
        if existing_log:
            results.append(SyncOperationResult(
                operation_id=op.operation_id,
                entity_type=op.entity_type,
                entity_id=op.entity_id,
                operation_type=op.operation_type,
                status='DUPLICATE',
                server_version=existing_log.server_version
            ))
            continue

        # 2. Dispatch to entity mutation handler inside transaction
        res: SyncOperationResult
        if op.entity_type == 'patient':
            res = apply_patient_operation(db, op, request.device_id)
        elif op.entity_type == 'assessment':
            res = apply_assessment_operation(db, op, request.device_id)
        elif op.entity_type == 'referral':
            res = apply_referral_operation(db, op, request.device_id)
        elif op.entity_type == 'appointment':
            res = apply_appointment_operation(db, op, request.device_id)
        else:
            res = SyncOperationResult(
                operation_id=op.operation_id,
                entity_type=op.entity_type,
                entity_id=op.entity_id,
                operation_type=op.operation_type,
                status='REJECTED',
                server_version=0,
                error_message=f"Unknown entity_type '{op.entity_type}'"
            )

        # 3. Record in Idempotency Log
        if res.status in ('APPLIED', 'DUPLICATE', 'CONFLICT'):
            idem_entry = IdempotencyModel(
                operation_id=op.operation_id,
                device_id=request.device_id,
                client_sequence=op.client_sequence,
                entity_type=op.entity_type,
                entity_id=op.entity_id,
                status=res.status,
                server_version=res.server_version,
                response_json=json.dumps(res.model_dump())
            )
            db.add(idem_entry)

        db.commit()
        results.append(res)

    applied_count = sum(1 for r in results if r.status == 'APPLIED')
    duplicate_count = sum(1 for r in results if r.status == 'DUPLICATE')
    conflict_count = sum(1 for r in results if r.status == 'CONFLICT')
    rejected_count = sum(1 for r in results if r.status == 'REJECTED')
    max_seq = db.query(func.max(SyncJournalModel.server_sequence)).scalar() or 0

    return SyncPushResponse(
        device_id=request.device_id,
        processed_at=datetime.utcnow().isoformat(),
        applied_count=applied_count,
        duplicate_count=duplicate_count,
        conflict_count=conflict_count,
        rejected_count=rejected_count,
        current_server_sequence=max_seq,
        results=results
    )


def process_pull_request(
    db: Session,
    request: SyncPullRequest
) -> SyncPullResponse:
    """
    TASK-006: Cursor-based incremental pull synchronization.
    Streams journal entries created after `last_server_sequence`.
    """
    max_seq = db.query(func.max(SyncJournalModel.server_sequence)).scalar() or 0

    query = db.query(SyncJournalModel).filter(
        SyncJournalModel.server_sequence > request.last_server_sequence
    )
    
    # Exclude entries originated by same device if specified
    if request.device_id:
        query = query.filter(
            (SyncJournalModel.device_id != request.device_id) | (SyncJournalModel.device_id == None)
        )

    entries = query.order_by(SyncJournalModel.server_sequence.asc()).limit(request.limit + 1).all()

    has_more = len(entries) > request.limit
    page_entries = entries[:request.limit]

    changes: List[SyncJournalEntry] = []
    new_cursor = request.last_server_sequence

    for e in page_entries:
        changes.append(SyncJournalEntry(
            server_sequence=e.server_sequence,
            device_id=e.device_id,
            entity_type=e.entity_type,
            entity_id=e.entity_id,
            operation_type=e.operation_type,
            payload=e.payload,
            server_version=e.server_version,
            created_at=e.created_at
        ))
        new_cursor = max(new_cursor, e.server_sequence)

    return SyncPullResponse(
        last_server_sequence=new_cursor,
        current_server_sequence=max_seq,
        entries_count=len(changes),
        has_more=has_more,
        entries=changes,
        changes=changes
    )
