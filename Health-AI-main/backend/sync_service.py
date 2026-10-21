import json
import uuid
from datetime import datetime
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import (
    PatientModel,
    AssessmentModel,
    AppointmentModel,
    ReferralModel,
    SyncJournalModel,
    IdempotencyModel,
    UserModel,
    AuditEventModel
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
    server_version: int,
    clinic_id: Optional[str] = None
) -> SyncJournalModel:
    """Appends an immutable entry to the server sync journal with clinic tenant scoping."""
    resolved_clinic_id = clinic_id or payload.get("clinic_id")
    entry = SyncJournalModel(
        device_id=device_id,
        clinic_id=resolved_clinic_id,
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
    device_id: str,
    current_user: Optional[UserModel] = None,
    current_clinic: Optional[Any] = None
) -> SyncOperationResult:
    payload = op.payload or {}
    patient = db.query(PatientModel).filter(PatientModel.id == op.entity_id).first()

    # Clinic workspace isolation check
    if patient and current_clinic and patient.clinic_id and patient.clinic_id != current_clinic.id:
        return SyncOperationResult(
            operation_id=op.operation_id,
            entity_type=op.entity_type,
            entity_id=op.entity_id,
            operation_type=op.operation_type,
            status='REJECTED',
            server_version=patient.server_version,
            error_message="Access denied: Cannot mutate patient belonging to another clinic workspace."
        )

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

        # Enforce server-assigned facility_id for frontline workers and reject cross-facility creation
        facility = None
        if current_user and current_user.role != "SYSTEM_ADMIN" and current_user.facility_id:
            client_fac = payload.get('facility_id')
            if client_fac and client_fac != current_user.facility_id:
                return SyncOperationResult(
                    operation_id=op.operation_id,
                    entity_type=op.entity_type,
                    entity_id=op.entity_id,
                    operation_type=op.operation_type,
                    status='REJECTED',
                    server_version=0,
                    error_message=f"Facility access violation: User from facility '{current_user.facility_id}' cannot create patient for foreign facility '{client_fac}'."
                )
            facility = current_user.facility_id
        else:
            facility = payload.get('facility_id') or (getattr(current_user, 'facility_id', None) if current_user else None)

        target_clinic_id = current_clinic.id if current_clinic else (payload.get('clinic_id') or (getattr(current_user, 'clinic_id', None) if current_user else None))

        new_patient = PatientModel(
            id=op.entity_id,
            national_health_id=payload.get('national_health_id'),
            name=payload.get('name', 'Unknown'),
            age=int(payload.get('age', 40)),
            gender=payload.get('gender', 'Other'),
            village=payload.get('village', 'Unknown'),
            phone=payload.get('phone', ''),
            patient_id=payload.get('patient_id') or f"RH-{op.entity_id[:6].upper()}",
            facility_id=facility,
            clinic_id=target_clinic_id,
            record_origin=payload.get('record_origin') or "OFFLINE_SYNC",
            is_synthetic=1 if payload.get('is_synthetic') else 0,
            sync_status="SYNCED",
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
                "facility_id": new_patient.facility_id,
                "clinic_id": new_patient.clinic_id,
                "server_version": 1,
                "is_deleted": 0,
                "created_at": new_patient.created_at
            },
            server_version=1,
            clinic_id=new_patient.clinic_id
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

        # Object-level facility isolation check
        if current_user and current_user.role != "SYSTEM_ADMIN" and current_user.facility_id:
            if patient.facility_id and patient.facility_id != current_user.facility_id:
                return SyncOperationResult(
                    operation_id=op.operation_id,
                    entity_type=op.entity_type,
                    entity_id=op.entity_id,
                    operation_type=op.operation_type,
                    status='REJECTED',
                    server_version=patient.server_version,
                    error_message=f"Facility access violation: User from facility '{current_user.facility_id}' cannot mutate patient belonging to facility '{patient.facility_id}'."
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

        if current_user and current_user.role != "SYSTEM_ADMIN" and current_user.facility_id:
            if patient.facility_id and patient.facility_id != current_user.facility_id:
                return SyncOperationResult(
                    operation_id=op.operation_id,
                    entity_type=op.entity_type,
                    entity_id=op.entity_id,
                    operation_type=op.operation_type,
                    status='REJECTED',
                    server_version=patient.server_version,
                    error_message=f"Facility access violation: User from facility '{current_user.facility_id}' cannot delete patient belonging to facility '{patient.facility_id}'."
                )


        now_iso = datetime.utcnow().isoformat()
        patient.is_deleted = 1
        patient.server_version += 1
        patient.updated_at = now_iso
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

        for ass in (patient.assessments or []):
            if not ass.is_deleted:
                ass.is_deleted = 1
                ass.server_version += 1
                ass.updated_at = now_iso
                record_journal_entry(
                    db=db,
                    device_id=device_id,
                    entity_type='assessment',
                    entity_id=ass.id,
                    operation_type='DELETE',
                    payload={"id": ass.id, "is_deleted": 1, "server_version": ass.server_version},
                    server_version=ass.server_version
                )

        if patient.phone:
            linked_appts = db.query(AppointmentModel).filter(
                AppointmentModel.patient_phone == patient.phone,
                AppointmentModel.is_deleted == 0
            ).all()
            for appt in linked_appts:
                appt.is_deleted = 1
                appt.status = "CANCELLED"
                appt.server_version += 1
                appt.updated_at = now_iso
                record_journal_entry(
                    db=db,
                    device_id=device_id,
                    entity_type='appointment',
                    entity_id=appt.id,
                    operation_type='DELETE',
                    payload={"id": appt.id, "is_deleted": 1, "status": "CANCELLED", "server_version": appt.server_version},
                    server_version=appt.server_version
                )

        audit_event = AuditEventModel(
            event_id=str(uuid.uuid4()),
            event_type="PATIENT_DELETED",
            entity_type="patient",
            entity_id=patient.id,
            user_id=current_user.id if current_user else "sync_device",
            user_role=current_user.role if current_user else "DEVICE",
            device_id=device_id,
            action="ARCHIVE_AND_DELETE",
            previous_state_json=json.dumps({
                "id": patient.id,
                "patient_id": patient.patient_id,
                "name": patient.name,
                "facility_id": patient.facility_id,
                "is_deleted": 0
            }),
            new_state_json=json.dumps({
                "id": patient.id,
                "patient_id": patient.patient_id,
                "is_deleted": 1,
                "server_version": patient.server_version
            }),
            workflow_version="2.0.0",
            ruleset_version="2.0.0",
            timestamp=now_iso
        )
        db.add(audit_event)

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
    device_id: str,
    current_user: Optional[UserModel] = None,
    current_clinic: Optional[Any] = None
) -> SyncOperationResult:
    payload = op.payload or {}
    assessment = db.query(AssessmentModel).filter(AssessmentModel.id == op.entity_id).first()

    # Clinic workspace isolation check
    if assessment and current_clinic and assessment.clinic_id and assessment.clinic_id != current_clinic.id:
        return SyncOperationResult(
            operation_id=op.operation_id,
            entity_type=op.entity_type,
            entity_id=op.entity_id,
            operation_type=op.operation_type,
            status='REJECTED',
            server_version=assessment.server_version,
            error_message="Access denied: Cannot mutate assessment belonging to another clinic workspace."
        )

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

        # Ensure patient exists and belongs to authorized clinic
        patient = db.query(PatientModel).filter(PatientModel.id == patient_id).first()
        if patient and current_clinic and patient.clinic_id and patient.clinic_id != current_clinic.id:
            return SyncOperationResult(
                operation_id=op.operation_id,
                entity_type=op.entity_type,
                entity_id=op.entity_id,
                operation_type=op.operation_type,
                status='REJECTED',
                server_version=0,
                error_message="Access denied: Referenced patient belongs to another clinic workspace."
            )

        if not patient:
            patient_facility = current_user.facility_id if (current_user and current_user.role != 'SYSTEM_ADMIN') else payload.get('facility_id')
            patient = PatientModel(
                id=patient_id,
                name=payload.get('patient_name', 'Patient'),
                age=40,
                gender='Other',
                village=payload.get('village', 'Unknown'),
                phone='',
                patient_id=f"RH-{patient_id[:6].upper()}",
                facility_id=patient_facility,
                clinic_id=current_clinic.id if current_clinic else payload.get('clinic_id'),
                record_origin="OFFLINE_SYNC",
                is_synthetic=0,
                sync_status="SYNCED",
                server_version=1,
                is_deleted=0
            )
            db.add(patient)
            db.flush()

        # Object-level facility isolation check
        if patient and current_user and current_user.role != "SYSTEM_ADMIN" and current_user.facility_id:
            if patient.facility_id and patient.facility_id != current_user.facility_id:
                return SyncOperationResult(
                    operation_id=op.operation_id,
                    entity_type=op.entity_type,
                    entity_id=op.entity_id,
                    operation_type=op.operation_type,
                    status='REJECTED',
                    server_version=0,
                    error_message=f"Facility access violation: User from facility '{current_user.facility_id}' cannot create assessment for patient in facility '{patient.facility_id}'."
                )

        facility = None
        if current_user and current_user.role != "SYSTEM_ADMIN" and current_user.facility_id:
            facility = current_user.facility_id
        else:
            facility = payload.get('facility_id') or (patient.facility_id if patient else None)

        # Normalize and validate temperature input safely
        temp = payload.get('temperature_f')
        if temp is not None:
            try:
                temp_val = float(temp)
                # Auto-correct common missing decimal typo (e.g. 986 -> 98.6)
                if 900.0 <= temp_val <= 1150.0:
                    temp_val = round(temp_val / 10.0, 1)
                temp = temp_val
            except (ValueError, TypeError):
                temp = None

        # Run canonical clinical evaluation engine
        try:
            assessment_in = AssessmentCreate(
                id=op.entity_id,
                patient_id=patient_id,
                facility_id=facility,
                symptoms=payload.get('symptoms', []),
                symptom_duration_days=payload.get('symptom_duration_days'),
                temperature_f=temp,
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
        except Exception as val_err:
            return SyncOperationResult(
                operation_id=op.operation_id,
                entity_type=op.entity_type,
                entity_id=op.entity_id,
                operation_type=op.operation_type,
                status='REJECTED',
                server_version=0,
                error_message=f"Assessment validation failed: {val_err}"
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

        target_clinic_id = current_clinic.id if current_clinic else (payload.get('clinic_id') or (patient.clinic_id if patient else None))

        new_assessment = AssessmentModel(
            id=op.entity_id,
            patient_id=patient_id,
            facility_id=facility,
            clinic_id=target_clinic_id,
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
                "facility_id": new_assessment.facility_id,
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
                "created_at": new_assessment.created_at,
                "clinic_id": new_assessment.clinic_id
            },
            server_version=1,
            clinic_id=new_assessment.clinic_id
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

        # Object-level facility isolation check
        if current_user and current_user.role != "SYSTEM_ADMIN" and current_user.facility_id:
            if assessment.facility_id and assessment.facility_id != current_user.facility_id:
                return SyncOperationResult(
                    operation_id=op.operation_id,
                    entity_type=op.entity_type,
                    entity_id=op.entity_id,
                    operation_type=op.operation_type,
                    status='REJECTED',
                    server_version=assessment.server_version,
                    error_message=f"Facility access violation: User from facility '{current_user.facility_id}' cannot mutate assessment belonging to facility '{assessment.facility_id}'."
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

        # Object-level facility isolation check
        if current_user and current_user.role != "SYSTEM_ADMIN" and current_user.facility_id:
            if assessment.facility_id and assessment.facility_id != current_user.facility_id:
                return SyncOperationResult(
                    operation_id=op.operation_id,
                    entity_type=op.entity_type,
                    entity_id=op.entity_id,
                    operation_type=op.operation_type,
                    status='REJECTED',
                    server_version=assessment.server_version,
                    error_message=f"Facility access violation: User from facility '{current_user.facility_id}' cannot delete assessment belonging to facility '{assessment.facility_id}'."
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
    device_id: str,
    current_user: Optional[UserModel] = None,
    current_clinic: Optional[Any] = None
) -> SyncOperationResult:
    payload = op.payload or {}

    # 1. Operational Referral Management (ReferralModel)
    existing_referral = db.query(ReferralModel).filter(ReferralModel.id == op.entity_id).first()
    if existing_referral and current_clinic and existing_referral.clinic_id and existing_referral.clinic_id != current_clinic.id:
        return SyncOperationResult(
            operation_id=op.operation_id,
            entity_type=op.entity_type,
            entity_id=op.entity_id,
            operation_type=op.operation_type,
            status='REJECTED',
            server_version=existing_referral.server_version,
            error_message="Access denied: Cannot mutate referral belonging to another clinic workspace."
        )

    is_operational_referral = (
        existing_referral is not None
        or (op.operation_type == "CREATE" and ("patient_id" in payload or "destination_facility" in payload))
        or ("referral_reason" in payload or "destination_facility" in payload)
    )

    if is_operational_referral:
        if op.operation_type == "CREATE":
            if existing_referral:
                return SyncOperationResult(
                    operation_id=op.operation_id,
                    entity_type=op.entity_type,
                    entity_id=op.entity_id,
                    operation_type=op.operation_type,
                    status='APPLIED',
                    server_version=existing_referral.server_version
                )
            patient_id = payload.get("patient_id")
            if not patient_id:
                return SyncOperationResult(
                    operation_id=op.operation_id,
                    entity_type=op.entity_type,
                    entity_id=op.entity_id,
                    operation_type=op.operation_type,
                    status='REJECTED',
                    server_version=0,
                    error_message="Missing patient_id for operational referral creation"
                )
            target_clinic_id = current_clinic.id if current_clinic else (payload.get('clinic_id') or (current_user.facility_id if current_user else None))
            new_ref = ReferralModel(
                id=op.entity_id,
                patient_id=patient_id,
                assessment_id=payload.get("assessment_id"),
                referral_reason=payload.get("referral_reason", "Clinical Referral"),
                priority=payload.get("priority", "ROUTINE"),
                destination_facility=payload.get("destination_facility", "District Hospital"),
                facility_id=payload.get("facility_id") or (current_user.facility_id if current_user else None),
                clinic_id=target_clinic_id,
                status=payload.get("status", "REQUESTED"),
                notes=payload.get("notes", ""),
                outcome_notes=payload.get("outcome_notes", ""),
                created_by=payload.get("created_by") or (current_user.username if current_user else "Frontline Health Worker"),
                client_operation_id=op.operation_id,
                server_version=1,
                is_deleted=0,
                created_at=payload.get("created_at") or datetime.utcnow().isoformat(),
                updated_at=datetime.utcnow().isoformat()
            )
            db.add(new_ref)
            db.flush()
            j_entry = record_journal_entry(
                db=db,
                device_id=device_id,
                entity_type='referral',
                entity_id=new_ref.id,
                operation_type='CREATE',
                payload={"id": new_ref.id, "status": new_ref.status, "server_version": new_ref.server_version, "clinic_id": new_ref.clinic_id},
                server_version=new_ref.server_version,
                clinic_id=new_ref.clinic_id
            )
            return SyncOperationResult(
                operation_id=op.operation_id,
                entity_type=op.entity_type,
                entity_id=op.entity_id,
                operation_type=op.operation_type,
                status='APPLIED',
                server_version=new_ref.server_version,
                server_sequence=j_entry.server_sequence
            )

        elif op.operation_type == "UPDATE":
            if not existing_referral:
                return SyncOperationResult(
                    operation_id=op.operation_id,
                    entity_type=op.entity_type,
                    entity_id=op.entity_id,
                    operation_type=op.operation_type,
                    status='REJECTED',
                    server_version=0,
                    error_message=f"Referral {op.entity_id} not found"
                )
            if op.base_server_version is not None and op.base_server_version < existing_referral.server_version:
                return SyncOperationResult(
                    operation_id=op.operation_id,
                    entity_type=op.entity_type,
                    entity_id=op.entity_id,
                    operation_type=op.operation_type,
                    status='CONFLICT',
                    server_version=existing_referral.server_version,
                    conflict_data=SyncConflictData(
                        entity_id=existing_referral.id,
                        entity_type='referral',
                        base_server_version=op.base_server_version,
                        current_server_version=existing_referral.server_version,
                        base_version=op.base_server_version,
                        server_version=existing_referral.server_version,
                        server_payload={"id": existing_referral.id, "status": existing_referral.status}
                    ),
                    error_message="Referral status conflict"
                )
            new_status = payload.get("status") or payload.get("referral_status") or existing_referral.status
            existing_referral.status = new_status
            if "outcome_notes" in payload:
                existing_referral.outcome_notes = payload["outcome_notes"]
            if "notes" in payload:
                existing_referral.notes = payload["notes"]
            if current_user:
                existing_referral.updated_by = current_user.username
            existing_referral.server_version += 1
            existing_referral.updated_at = datetime.utcnow().isoformat()
            db.flush()
            j_entry = record_journal_entry(
                db=db,
                device_id=device_id,
                entity_type='referral',
                entity_id=existing_referral.id,
                operation_type='UPDATE',
                payload={"id": existing_referral.id, "status": new_status, "server_version": existing_referral.server_version},
                server_version=existing_referral.server_version
            )
            return SyncOperationResult(
                operation_id=op.operation_id,
                entity_type=op.entity_type,
                entity_id=op.entity_id,
                operation_type=op.operation_type,
                status='APPLIED',
                server_version=existing_referral.server_version,
                server_sequence=j_entry.server_sequence
            )

    # 2. Legacy fallback: Assessment referral_status update (backwards compatibility for Phase 3 tests)
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
            error_message=f"Assessment or Referral {op.entity_id} not found"
        )

    # Object-level facility isolation check
    if current_user and current_user.role != "SYSTEM_ADMIN" and current_user.facility_id:
        if assessment.facility_id and assessment.facility_id != current_user.facility_id:
            return SyncOperationResult(
                operation_id=op.operation_id,
                entity_type=op.entity_type,
                entity_id=op.entity_id,
                operation_type=op.operation_type,
                status='REJECTED',
                server_version=assessment.server_version,
                error_message=f"Facility access violation: User from facility '{current_user.facility_id}' cannot mutate referral for assessment in facility '{assessment.facility_id}'."
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
    device_id: str,
    current_user: Optional[UserModel] = None,
    current_clinic: Optional[Any] = None
) -> SyncOperationResult:
    payload = op.payload or {}
    appt = db.query(AppointmentModel).filter(AppointmentModel.id == op.entity_id).first()

    if appt and current_clinic and appt.clinic_id and appt.clinic_id != current_clinic.id:
        return SyncOperationResult(
            operation_id=op.operation_id,
            entity_type=op.entity_type,
            entity_id=op.entity_id,
            operation_type=op.operation_type,
            status='REJECTED',
            server_version=appt.server_version,
            error_message="Access denied: Cannot mutate appointment belonging to another clinic workspace."
        )

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

        target_facility = None
        if current_user and current_user.role != "SYSTEM_ADMIN" and current_user.facility_id:
            client_fac = payload.get('facility_id')
            if client_fac and client_fac != current_user.facility_id:
                return SyncOperationResult(
                    operation_id=op.operation_id,
                    entity_type=op.entity_type,
                    entity_id=op.entity_id,
                    operation_type=op.operation_type,
                    status='REJECTED',
                    server_version=0,
                    error_message=f"Facility access violation: User from facility '{current_user.facility_id}' cannot create appointment for foreign facility '{client_fac}'."
                )
            target_facility = current_user.facility_id
        else:
            target_facility = payload.get('facility_id') or (getattr(current_user, 'facility_id', None) if current_user else None) or "PHC-DEFAULT"

        target_clinic_id = current_clinic.id if current_clinic else (payload.get('clinic_id') or (getattr(current_user, 'clinic_id', None) if current_user else None))

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
            facility_id=target_facility,
            clinic_id=target_clinic_id,
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
                "patient_phone": new_appt.patient_phone,
                "doctor_name": new_appt.doctor_name,
                "doctor_specialty": new_appt.doctor_specialty,
                "doctor_address": new_appt.doctor_address,
                "appointment_date": new_appt.appointment_date,
                "appointment_time": new_appt.appointment_time,
                "status": new_appt.status,
                "facility_id": new_appt.facility_id,
                "clinic_id": new_appt.clinic_id,
                "server_version": 1,
                "created_at": new_appt.created_at
            },
            server_version=1,
            clinic_id=new_appt.clinic_id
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

        # Object-level facility isolation check
        if current_user and current_user.role != "SYSTEM_ADMIN" and current_user.facility_id:
            if appt.facility_id and appt.facility_id != current_user.facility_id:
                return SyncOperationResult(
                    operation_id=op.operation_id,
                    entity_type=op.entity_type,
                    entity_id=op.entity_id,
                    operation_type=op.operation_type,
                    status='REJECTED',
                    server_version=appt.server_version,
                    error_message=f"Facility access violation: User from facility '{current_user.facility_id}' cannot mutate appointment in facility '{appt.facility_id}'."
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

        # Object-level facility isolation check
        if current_user and current_user.role != "SYSTEM_ADMIN" and current_user.facility_id:
            if appt.facility_id and appt.facility_id != current_user.facility_id:
                return SyncOperationResult(
                    operation_id=op.operation_id,
                    entity_type=op.entity_type,
                    entity_id=op.entity_id,
                    operation_type=op.operation_type,
                    status='REJECTED',
                    server_version=appt.server_version,
                    error_message=f"Facility access violation: User from facility '{current_user.facility_id}' cannot delete appointment in facility '{appt.facility_id}'."
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


MAX_PUSH_BATCH_SIZE = 100


def process_push_batch(
    db: Session,
    request: SyncPushRequest,
    current_user: Optional[UserModel] = None,
    current_clinic: Optional[Any] = None
) -> SyncPushResponse:
    """
    TASK-005: Atomically processes a batch of operations pushed from client outbox.
    Provides strict idempotency, OCC conflict detection, and audit journalling.
    Enforces maximum batch size and object-level facility tenancy authorization.
    """
    from fastapi import HTTPException, status
    if len(request.operations) > MAX_PUSH_BATCH_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Sync batch size ({len(request.operations)}) exceeds maximum allowed limit of {MAX_PUSH_BATCH_SIZE} operations."
        )

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
            res = apply_patient_operation(db, op, request.device_id, current_user, current_clinic)
        elif op.entity_type == 'assessment':
            res = apply_assessment_operation(db, op, request.device_id, current_user, current_clinic)
        elif op.entity_type == 'referral':
            res = apply_referral_operation(db, op, request.device_id, current_user, current_clinic)
        elif op.entity_type == 'appointment':
            res = apply_appointment_operation(db, op, request.device_id, current_user, current_clinic)
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


MAX_PULL_LIMIT = 200


def process_pull_request(
    db: Session,
    request: SyncPullRequest,
    current_user: Optional[UserModel] = None,
    current_clinic: Optional[Any] = None
) -> SyncPullResponse:
    """
    TASK-006: Cursor-based incremental pull synchronization.
    Streams journal entries created after `last_server_sequence`.
    Enforces maximum pull page limit and clinic tenant isolation.
    """
    effective_limit = min(request.limit, MAX_PULL_LIMIT)
    max_seq = db.query(func.max(SyncJournalModel.server_sequence)).scalar() or 0

    query = db.query(SyncJournalModel).filter(
        SyncJournalModel.server_sequence > request.last_server_sequence
    )

    if current_clinic:
        query = query.filter(SyncJournalModel.clinic_id == current_clinic.id)
    
    # Exclude entries originated by same device if specified
    if request.device_id:
        query = query.filter(
            (SyncJournalModel.device_id != request.device_id) | (SyncJournalModel.device_id == None)
        )

    entries = query.order_by(SyncJournalModel.server_sequence.asc()).limit(effective_limit + 1).all()

    has_more = len(entries) > effective_limit
    page_entries = entries[:effective_limit]


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
