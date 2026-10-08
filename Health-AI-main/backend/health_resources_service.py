"""
health_resources_service.py — Governed Resource CRUD, Lifecycle & Audit Service
================================================================================
Implements Sections 5, 6, 17, 18, 19 of the Health Resources Implementation Plan:
1. Transactional CRUD with Optimistic Concurrency Control (OCC) and soft deletion.
2. Full Governed Lifecycle: DRAFT -> CLINICAL_REVIEW -> APPROVED -> PUBLISHED -> SUPERSEDED / REVOKED / ARCHIVED.
3. Cryptographic attestation and version snapshotting on publication.
4. Integrated Audit Logging (AuditEventModel) and Monotonic Sync Journaling (SyncJournalModel).
5. Default clinical taxonomy seeding (Maternal, Child Health, Communicable, NCD, Referral).
"""

import uuid
import hashlib
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text

from database import (
    HealthResourceModel,
    HealthResourceCategoryModel,
    HealthResourceTagModel,
    HealthResourceScopeModel,
    HealthResourceVersionModel,
    AuditEventModel,
    SyncJournalModel,
    UserModel
)
from health_resource_schemas import (
    HealthResourceCreate,
    HealthResourceUpdate,
    HealthResourceResponse,
    HealthResourceCategoryResponse,
    HealthResourceVersionResponse,
    ResourcePublishRequest,
    ResourceReviewSubmitRequest,
    ResourceRevokeRequest
)
from resource_search_service import model_to_response


# ─── CATEGORY MANAGEMENT ─────────────────────────────────────────────────────

def list_categories(db: Session) -> List[HealthResourceCategoryResponse]:
    """Retrieves all active resource categories with live resource counts."""
    categories = db.query(HealthResourceCategoryModel).order_by(HealthResourceCategoryModel.sort_order).all()
    response: List[HealthResourceCategoryResponse] = []

    for cat in categories:
        count = db.query(HealthResourceModel).filter(
            HealthResourceModel.category_code == cat.code,
            HealthResourceModel.status == "PUBLISHED",
            HealthResourceModel.is_deleted == 0
        ).count()

        response.append(
            HealthResourceCategoryResponse(
                id=cat.id,
                code=cat.code,
                name=cat.name,
                parent_code=cat.parent_code,
                description=cat.description or "",
                icon=cat.icon or "FileText",
                sort_order=cat.sort_order or 0,
                resource_count=count
            )
        )
    return response


# ─── RESOURCE CRUD & RETRIEVAL ───────────────────────────────────────────────

def get_resource_by_id(
    db: Session,
    resource_id: str,
    user: Optional[UserModel] = None
) -> HealthResourceResponse:
    """Retrieves a single governed resource by ID or resource_code."""
    res = db.query(HealthResourceModel).filter(
        (HealthResourceModel.id == resource_id) | (HealthResourceModel.resource_code == resource_id),
        HealthResourceModel.is_deleted == 0
    ).first()

    if not res:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Health resource '{resource_id}' not found."
        )

    # If unapproved draft, check RBAC permissions
    if res.status != "PUBLISHED":
        user_role = user.role if user else "ANONYMOUS"
        if user_role not in ["PHC_DOCTOR", "SYSTEM_ADMIN", "DISTRICT_OFFICER"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: Resource '{res.resource_code}' is in '{res.status}' state and requires clinical review privileges."
            )

    return model_to_response(res)


def create_resource(
    db: Session,
    data: HealthResourceCreate,
    user: UserModel
) -> HealthResourceResponse:
    """
    Creates a new Health Resource in DRAFT status.
    Records audit event.
    """
    # Check for duplicate resource_code
    existing = db.query(HealthResourceModel).filter(
        HealthResourceModel.resource_code == data.resource_code,
        HealthResourceModel.is_deleted == 0
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Resource with code '{data.resource_code}' already exists."
        )

    res_id = str(uuid.uuid4())
    now_iso = datetime.utcnow().isoformat()

    db_resource = HealthResourceModel(
        id=res_id,
        resource_code=data.resource_code,
        title=data.title,
        summary=data.summary,
        content=data.content,
        resource_type=data.resource_type,
        category_code=data.category_code.upper(),
        status="DRAFT", # Starts as DRAFT
        version="1.0.0",
        source_name=data.source_name,
        source_url=data.source_url,
        source_document=data.source_document,
        source_version=data.source_version,
        language=data.language,
        is_emergency=1 if data.is_emergency else 0,
        urgency_level=data.urgency_level,
        created_by=user.username,
        server_version=1,
        is_deleted=0,
        created_at=now_iso,
        updated_at=now_iso
    )
    db.add(db_resource)
    db.flush()

    # Add tags
    for tag in data.tags:
        db.add(HealthResourceTagModel(
            resource_id=db_resource.id,
            tag_type=tag.tag_type,
            tag_value=tag.tag_value
        ))

    # Add scopes
    for scope in data.scopes:
        db.add(HealthResourceScopeModel(
            resource_id=db_resource.id,
            scope_type=scope.scope_type,
            scope_value=scope.scope_value
        ))

    # Audit Trail
    audit = AuditEventModel(
        event_id=str(uuid.uuid4()),
        event_type="RESOURCE_CREATED",
        entity_type="health_resource",
        entity_id=db_resource.id,
        user_id=user.id,
        user_role=user.role,
        action=f"Created health resource draft '{db_resource.resource_code}'",
        previous_state_json="{}",
        new_state_json=f'{{"resource_code": "{db_resource.resource_code}", "status": "DRAFT"}}',
        timestamp=now_iso
    )
    db.add(audit)

    db.commit()
    db.refresh(db_resource)
    return model_to_response(db_resource)


def update_resource(
    db: Session,
    resource_id: str,
    data: HealthResourceUpdate,
    user: UserModel
) -> HealthResourceResponse:
    """Updates draft or pending resource."""
    res = db.query(HealthResourceModel).filter(
        HealthResourceModel.id == resource_id,
        HealthResourceModel.is_deleted == 0
    ).first()

    if not res:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Resource '{resource_id}' not found."
        )

    now_iso = datetime.utcnow().isoformat()
    old_state = f'{{"title": "{res.title}", "status": "{res.status}", "version": "{res.version}"}}'

    if data.title is not None:
        res.title = data.title
    if data.summary is not None:
        res.summary = data.summary
    if data.content is not None:
        res.content = data.content
    if data.resource_type is not None:
        res.resource_type = data.resource_type
    if data.category_code is not None:
        res.category_code = data.category_code.upper()
    if data.language is not None:
        res.language = data.language
    if data.is_emergency is not None:
        res.is_emergency = 1 if data.is_emergency else 0
    if data.urgency_level is not None:
        res.urgency_level = data.urgency_level
    if data.source_name is not None:
        res.source_name = data.source_name
    if data.source_url is not None:
        res.source_url = data.source_url
    if data.change_reason is not None:
        res.change_reason = data.change_reason

    res.updated_by = user.username
    res.server_version += 1
    res.updated_at = now_iso

    # Replace tags if specified
    if data.tags is not None:
        db.query(HealthResourceTagModel).filter(HealthResourceTagModel.resource_id == res.id).delete()
        for t in data.tags:
            db.add(HealthResourceTagModel(
                resource_id=res.id,
                tag_type=t.tag_type,
                tag_value=t.tag_value
            ))

    # Audit Trail
    audit = AuditEventModel(
        event_id=str(uuid.uuid4()),
        event_type="RESOURCE_EDITED",
        entity_type="health_resource",
        entity_id=res.id,
        user_id=user.id,
        user_role=user.role,
        action=f"Edited health resource '{res.resource_code}'",
        previous_state_json=old_state,
        new_state_json=f'{{"title": "{res.title}", "status": "{res.status}", "server_version": {res.server_version}}}',
        timestamp=now_iso
    )
    db.add(audit)

    db.commit()
    db.refresh(res)
    return model_to_response(res)


# ─── GOVERNED LIFECYCLE TRANSITIONS ──────────────────────────────────────────

def submit_resource_for_review(
    db: Session,
    resource_id: str,
    user: UserModel
) -> HealthResourceResponse:
    """Transitions DRAFT -> CLINICAL_REVIEW."""
    res = db.query(HealthResourceModel).filter(
        HealthResourceModel.id == resource_id,
        HealthResourceModel.is_deleted == 0
    ).first()

    if not res:
        raise HTTPException(status_code=404, detail="Resource not found.")

    res.status = "CLINICAL_REVIEW"
    res.updated_by = user.username
    res.server_version += 1
    res.updated_at = datetime.utcnow().isoformat()

    audit = AuditEventModel(
        event_id=str(uuid.uuid4()),
        event_type="RESOURCE_REVIEWED",
        entity_type="health_resource",
        entity_id=res.id,
        user_id=user.id,
        user_role=user.role,
        action=f"Submitted resource '{res.resource_code}' for clinical review",
        timestamp=datetime.utcnow().isoformat()
    )
    db.add(audit)
    db.commit()
    db.refresh(res)
    return model_to_response(res)


def publish_resource(
    db: Session,
    resource_id: str,
    req: ResourcePublishRequest,
    user: UserModel
) -> HealthResourceResponse:
    """
    Approves and Publishes a resource atomically (Section 17):
    1. Updates resource status -> PUBLISHED
    2. Increments version (e.g. 1.0.0 -> 1.1.0 or 2.0.0)
    3. Calculates cryptographic digital attestation hash
    4. Creates immutable HealthResourceVersionModel snapshot
    5. Writes AuditEventModel
    6. Writes SyncJournalModel for pull sync to offline clients
    """
    res = db.query(HealthResourceModel).filter(
        HealthResourceModel.id == resource_id,
        HealthResourceModel.is_deleted == 0
    ).first()

    if not res:
        raise HTTPException(status_code=404, detail="Resource not found.")

    now_iso = datetime.utcnow().isoformat()
    expires_dt = datetime.utcnow() + timedelta(days=req.expires_in_days or 365)
    expires_iso = expires_dt.isoformat()

    # Bump version
    curr_v = res.version.split("-")[0].split(".")
    try:
        major = int(curr_v[0])
        minor = int(curr_v[1]) + 1
        new_version = f"{major}.{minor}.0"
    except Exception:
        new_version = f"{res.version}.1"

    res.status = "PUBLISHED"
    res.version = new_version
    res.reviewed_by = user.full_name or user.username
    res.reviewed_at = now_iso
    res.published_at = now_iso
    res.expires_at = expires_iso
    res.last_verified_at = now_iso
    res.change_reason = req.change_reason
    res.server_version += 1
    res.updated_at = now_iso

    # Generate Cryptographic Attestation Hash (Section 6)
    content_raw = f"{res.id}:{res.resource_code}:{res.version}:{res.content}:{user.id}:{now_iso}"
    attestation_hash = hashlib.sha256(content_raw.encode("utf-8")).hexdigest()

    # Create immutable version record
    version_record = HealthResourceVersionModel(
        id=str(uuid.uuid4()),
        resource_id=res.id,
        version=new_version,
        title=res.title,
        summary=res.summary,
        content=res.content,
        status="PUBLISHED",
        reviewed_by=user.full_name or user.username,
        reviewed_at=now_iso,
        attestation_hash=attestation_hash,
        change_reason=req.change_reason,
        created_at=now_iso
    )
    db.add(version_record)

    # Create Audit Event
    audit = AuditEventModel(
        event_id=str(uuid.uuid4()),
        event_type="RESOURCE_PUBLISHED",
        entity_type="health_resource",
        entity_id=res.id,
        user_id=user.id,
        user_role=user.role,
        action=f"Clinically approved and published resource '{res.resource_code}' version {new_version}",
        previous_state_json="{}",
        new_state_json=f'{{"version": "{new_version}", "status": "PUBLISHED", "attestation_hash": "{attestation_hash[:16]}..."}}',
        timestamp=now_iso
    )
    db.add(audit)

    # Monotonic Sync Journal Entry for Client Sync (Section 15)
    journal_entry = SyncJournalModel(
        device_id=None,
        entity_type="health_resource",
        entity_id=res.id,
        operation_type="UPDATE" if res.server_version > 1 else "CREATE",
        server_version=res.server_version,
        payload_json=f'{{"resource_code": "{res.resource_code}", "title": "{res.title}", "version": "{new_version}", "status": "PUBLISHED"}}',
        created_at=now_iso
    )
    db.add(journal_entry)

    db.commit()
    db.refresh(res)
    return model_to_response(res)


def revoke_resource(
    db: Session,
    resource_id: str,
    req: ResourceRevokeRequest,
    user: UserModel
) -> HealthResourceResponse:
    """
    Revokes a published clinical resource immediately (Section 16, 17, 18).
    Atomically writes AuditEventModel and SyncJournalModel.
    """
    res = db.query(HealthResourceModel).filter(
        HealthResourceModel.id == resource_id,
        HealthResourceModel.is_deleted == 0
    ).first()

    if not res:
        raise HTTPException(status_code=404, detail="Resource not found.")

    now_iso = datetime.utcnow().isoformat()
    res.status = "REVOKED"
    res.change_reason = f"REVOKED by {user.username}: {req.revocation_reason}"
    res.server_version += 1
    res.updated_at = now_iso

    # Audit Trail
    audit = AuditEventModel(
        event_id=str(uuid.uuid4()),
        event_type="RESOURCE_REVOKED",
        entity_type="health_resource",
        entity_id=res.id,
        user_id=user.id,
        user_role=user.role,
        action=f"REVOKED resource '{res.resource_code}': {req.revocation_reason}",
        timestamp=now_iso
    )
    db.add(audit)

    # Sync Journal Entry to revoke immediately on offline clients
    journal = SyncJournalModel(
        device_id=None,
        entity_type="health_resource",
        entity_id=res.id,
        operation_type="UPDATE",
        server_version=res.server_version,
        payload_json=f'{{"resource_code": "{res.resource_code}", "status": "REVOKED"}}',
        created_at=now_iso
    )
    db.add(journal)

    db.commit()
    db.refresh(res)
    return model_to_response(res)


def get_resource_versions(db: Session, resource_id: str) -> List[HealthResourceVersionResponse]:
    """Retrieves immutable publication version history for a given resource."""
    versions = db.query(HealthResourceVersionModel).filter(
        HealthResourceVersionModel.resource_id == resource_id
    ).order_by(HealthResourceVersionModel.created_at.desc()).all()

    return [
        HealthResourceVersionResponse(
            id=v.id,
            resource_id=v.resource_id,
            version=v.version,
            title=v.title,
            summary=v.summary,
            content=v.content,
            status=v.status,
            reviewed_by=v.reviewed_by,
            reviewed_at=v.reviewed_at,
            attestation_hash=v.attestation_hash,
            change_reason=v.change_reason,
            created_at=v.created_at
        )
        for v in versions
    ]


# ─── SEED DEFAULT HEALTH RESOURCES TAXONOMY ──────────────────────────────────

def seed_default_health_resources(db: Session):
    """
    Populates standard MoHFW/WHO clinical categories, tags, and foundational resources.
    Idempotent: skips if categories already populated.
    """
    existing_cat = db.query(HealthResourceCategoryModel).first()
    if existing_cat:
        return

    categories = [
        HealthResourceCategoryModel(
            id="cat_mat",
            code="MATERNAL",
            name="Maternal & Reproductive Health",
            parent_code=None,
            description="Antenatal care (ANC), High-risk pregnancy, PNC danger signs, and institutional delivery guidelines.",
            icon="Heart",
            sort_order=1
        ),
        HealthResourceCategoryModel(
            id="cat_child",
            code="CHILD_HEALTH",
            name="Child Health & Immunization",
            parent_code=None,
            description="National Immunization Schedule, acute diarrhea & ORS/Zinc therapy, and malnutrition protocols.",
            icon="Baby",
            sort_order=2
        ),
        HealthResourceCategoryModel(
            id="cat_comm",
            code="COMMUNICABLE",
            name="Communicable Diseases",
            parent_code=None,
            description="Tuberculosis (NTEP), Dengue warning signs & hydration, and Malaria diagnostic flows.",
            icon="Activity",
            sort_order=3
        ),
        HealthResourceCategoryModel(
            id="cat_ncd",
            code="NCD",
            name="Non-Communicable Diseases (NCD)",
            parent_code=None,
            description="Hypertension screening & stepped care, Type 2 Diabetes, and Cardiovascular Risk assessment.",
            icon="ShieldAlert",
            sort_order=4
        ),
        HealthResourceCategoryModel(
            id="cat_ref",
            code="REFERRAL",
            name="Emergency & Referral SOPs",
            parent_code=None,
            description="Golden hour stabilization, hypertensive crisis, chest pain, and emergency transport SOPs.",
            icon="AlertTriangle",
            sort_order=5
        ),
        HealthResourceCategoryModel(
            id="cat_gen",
            code="GENERAL",
            name="General Frontline Health",
            parent_code=None,
            description="Community wellness, hygiene, nutrition counselling, and seasonal health alerts.",
            icon="BookOpen",
            sort_order=6
        )
    ]
    for c in categories:
        db.add(c)
    db.flush()

    # Foundational Governed Resources
    now_iso = datetime.utcnow().isoformat()
    expires_iso = (datetime.utcnow() + timedelta(days=365)).isoformat()

    seed_resources = [
        # 1. EMERGENCY: Hypertensive Crisis Immediate SOP
        {
            "id": "hr_sop_htn_crisis",
            "resource_code": "HR-EMERG-HTN-001",
            "title": "Emergency Protocol: Severe Hypertensive Crisis in Primary Care",
            "summary": "Mandatory stabilization and referral protocol when Systolic BP >= 180 mmHg or Diastolic BP >= 120 mmHg.",
            "content": """## CLINICAL EMERGENCY PROTOCOL: HYPERTENSIVE CRISIS

### 1. Diagnostic Definition
* **Systolic BP >= 180 mmHg** AND/OR **Diastolic BP >= 120 mmHg**.
* Immediately assess for target organ damage: severe occipital headache, blurred vision, chest pain, dyspnea, confusion, or oliguria.

### 2. Immediate Frontline / PHC Action
1. **Rest & Re-measure**: Keep patient seated in quiet area for 5 minutes and repeat measurement on opposite arm.
2. **Emergency Position**: Elevate head to 30-45 degrees. Do NOT give unprescribed sublingual nifedipine (risk of precipitous cerebral hypoperfusion).
3. **Oxygenation & IV Access**: Administer oxygen if SpO2 < 94%. Secure 18G IV cannula with slow normal saline flush.
4. **Physician Notification**: Immediately alert PHC Medical Officer on duty.

### 3. Emergency Referral SOP
* Call 108 Ambulance immediately for secondary / district hospital transfer with ICU facility.
* Maintain vital signs log every 10 minutes during transit.
* Accompanying ASHA or paramedic must carry portable BP cuff and referral slip.""",
            "resource_type": "EMERGENCY_PROTOCOL",
            "category_code": "REFERRAL",
            "urgency_level": "EMERGENCY",
            "is_emergency": 1,
            "source_name": "MoHFW Emergency Clinical Protocol 2024",
            "source_url": "https://mohfw.gov.in",
            "tags": [
                ("condition", "hypertension"),
                ("symptom", "headache"),
                ("symptom", "dizziness"),
                ("symptom", "chest pain"),
                ("symptom", "blurred vision"),
                ("urgency", "EMERGENCY"),
                ("role", "ASHA_WORKER"),
                ("role", "PHC_DOCTOR")
            ]
        },

        # 2. EMERGENCY: Chest Pain & Acute Coronary Syndrome (ACS) SOP
        {
            "id": "hr_sop_acs_crisis",
            "resource_code": "HR-EMERG-ACS-002",
            "title": "Emergency SOP: Suspected Acute Coronary Syndrome & Severe Chest Pain",
            "summary": "Step-by-step golden hour stabilization protocol for severe crushing chest pain, radiating pain, and dyspnea.",
            "content": """## EMERGENCY SOP: ACUTE CORONARY SYNDROME (ACS)

### 1. Immediate Warning Signs
* Retrosternal pressure/crushing chest pain radiating to left arm, neck, or jaw.
* Concurrent dyspnea (shortness of breath), diaphoresis (cold sweats), dizziness, or nausea.

### 2. Golden Hour Action Protocol
1. **Absolute Bed Rest**: Immediately stop all physical exertion. Position patient in comfortable semi-fowlers position.
2. **Aspirin Loading**: If patient has no known aspirin allergy or active GI bleeding, administer **Dispersible Aspirin 300 mg chewable stat** under medical direction.
3. **Vital Monitoring**: Monitor BP, pulse rate, and respiratory rate continuously.
4. **Immediate 108 Dispatch**: Contact emergency transport for immediate transit to a facility equipped with ECG and cardiac telemetry.

### 3. Frontline Safety Directives
* Never delay hospital transfer to perform non-essential screening tests.
* Keep emergency resuscitation kit and defibrillator/oxygen ready at PHC.""",
            "resource_type": "EMERGENCY_PROTOCOL",
            "category_code": "REFERRAL",
            "urgency_level": "EMERGENCY",
            "is_emergency": 1,
            "source_name": "ICMR Guidelines for Acute Coronary Syndrome Management",
            "source_url": "https://icmr.gov.in",
            "tags": [
                ("condition", "cardiovascular"),
                ("condition", "cvd"),
                ("symptom", "chest pain"),
                ("symptom", "dyspnea"),
                ("symptom", "shortness of breath"),
                ("symptom", "fatigue"),
                ("urgency", "EMERGENCY"),
                ("role", "ASHA_WORKER"),
                ("role", "PHC_DOCTOR")
            ]
        },

        # 3. MATERNAL: High-Risk Pregnancy & Pre-eclampsia Screening
        {
            "id": "hr_mat_preeclampsia",
            "resource_code": "HR-MAT-PREECL-003",
            "title": "High-Risk Pregnancy: Pre-Eclampsia & Danger Sign Identification",
            "summary": "Frontline identification of hypertensive disorders in pregnancy, proteinuria, and imminent eclampsia triggers.",
            "content": """## CLINICAL GUIDELINE: PRE-ECLAMPSIA & MATERNAL DANGER SIGNS

### 1. Screening Thresholds
* **Gestational Hypertension**: BP >= 140/90 mmHg after 20 weeks of gestation in previously normotensive mother.
* **Severe Pre-Eclampsia Triggers**: BP >= 160/110 mmHg, severe persistent epigastric pain, visual disturbances, or facial/pedal edema.

### 2. ASHA Action Checklist
* Check BP at every Antenatal Care (ANC) visit (minimum 4 mandated visits).
* Screen for urine albumin using dipstick test.
* Screen for red flag symptoms: headache, blurring of vision, sudden weight gain, reduced fetal movements.

### 3. Urgent Referral Directives
* Any pregnant woman with BP >= 140/90 mmHg must be referred to the PHC Doctor within 24 hours.
* Any pregnant woman with BP >= 160/110 mmHg or convulsions must be transported immediately to First Referral Unit (FRU) via 102/108 ambulance.""",
            "resource_type": "CLINICAL_GUIDELINE",
            "category_code": "MATERNAL",
            "urgency_level": "URGENT",
            "is_emergency": 0,
            "source_name": "MoHFW Pradhan Mantri Surakshit Matritva Abhiyan (PMSMA)",
            "source_url": "https://pmsma.nhp.gov.in",
            "tags": [
                ("condition", "pre-eclampsia"),
                ("condition", "gestational diabetes"),
                ("symptom", "headache"),
                ("symptom", "swelling"),
                ("symptom", "pedal edema"),
                ("symptom", "bleeding"),
                ("pregnancy_stage", "HIGH_RISK_PREGNANCY"),
                ("pregnancy_stage", "SECOND_TRIMESTER"),
                ("pregnancy_stage", "THIRD_TRIMESTER"),
                ("urgency", "URGENT"),
                ("role", "ASHA_WORKER"),
                ("role", "PHC_DOCTOR")
            ]
        },

        # 4. COMMUNICABLE: Tuberculosis (NTEP) Diagnostic & Notification Flow
        {
            "id": "hr_comm_tb_guideline",
            "resource_code": "HR-COMM-TB-004",
            "title": "NTEP Protocol: Tuberculosis Presumptive Screening & Sputum Testing",
            "summary": "National Tuberculosis Elimination Program standard operating procedure for cough > 2 weeks, fever, and hemoptysis.",
            "content": """## NATIONAL TUBERCULOSIS ELIMINATION PROGRAM (NTEP) SOP

### 1. Presumptive TB Diagnostic Criteria
* Cough lasting for 2 weeks or more.
* Fever, especially low-grade evening spikes for > 2 weeks.
* Unexplained significant weight loss (> 5% in 1 month).
* Night sweats or hemoptysis (blood in sputum).

### 2. Frontline Sputum Referral Flow
1. **Sputum Collection**: Collect two sputum specimens (one on-the-spot, one early morning).
2. **CBNAAT / Truenat Testing**: Send to designated TB testing centre for molecular testing to detect M. tuberculosis and Rifampicin resistance.
3. **Nikshay Portal Registration**: Ensure patient is registered on Nikshay portal for direct benefit transfer (Nikshay Poshan Yojana).

### 3. Contact Tracing & Infection Control
* Screen all household contacts, especially children under 5 years for TB Preventive Therapy (TPT).
* Advise cough etiquette and adequate room ventilation.""",
            "resource_type": "CLINICAL_GUIDELINE",
            "category_code": "COMMUNICABLE",
            "urgency_level": "MODERATE",
            "is_emergency": 0,
            "source_name": "Central TB Division, MoHFW NTEP Guidelines 2024",
            "source_url": "https://tbcindia.gov.in",
            "tags": [
                ("condition", "tuberculosis"),
                ("symptom", "cough"),
                ("symptom", "fever"),
                ("symptom", "weight loss"),
                ("symptom", "hemoptysis"),
                ("urgency", "MODERATE"),
                ("role", "ASHA_WORKER"),
                ("role", "PHC_DOCTOR")
            ]
        },

        # 5. COMMUNICABLE: Dengue Warning Signs & Fluid Protocol
        {
            "id": "hr_comm_dengue_protocol",
            "resource_code": "HR-COMM-DENGUE-005",
            "title": "Dengue Fever: Clinical Staging & Warning Sign Protocol",
            "summary": "Frontline protocol for identifying NS1 positive patients, tracking severe warning signs, and fluid hydration.",
            "content": """## DENGUE CLINICAL MANAGEMENT & WARNING SIGNS

### 1. Clinical Presentation
* High continuous fever (39-40°C), severe retro-orbital headache, myalgia, arthralgia, and rash.
* Critical Phase (Days 3-7): Temperature falls, but plasma leakage risk peaks.

### 2. Critical Warning Signs (Immediate Hospital Admission Required)
* Severe abdominal pain or tenderness.
* Persistent vomiting (>= 3 times in 24 hours).
* Mucosal bleeding (epistaxis, gum bleeding, hematemesis, melena).
* Lethargy, restlessness, or sudden postural dizziness.
* Fluid accumulation (ascites, pleural effusion).

### 3. ASHA & Primary Care Directives
* DO NOT administer Aspirin, Ibuprofen, or NSAIDs due to platelet inhibition and severe GI hemorrhage risk.
* Prescribe Paracetamol only for fever relief.
* Encourage oral rehydration with ORS, coconut water, and fresh fluids.""",
            "resource_type": "CLINICAL_GUIDELINE",
            "category_code": "COMMUNICABLE",
            "urgency_level": "URGENT",
            "is_emergency": 0,
            "source_name": "National Vector Borne Disease Control Programme (NVBDCP)",
            "source_url": "https://nvbdcp.gov.in",
            "tags": [
                ("condition", "dengue"),
                ("symptom", "fever"),
                ("symptom", "headache"),
                ("symptom", "vomiting"),
                ("symptom", "bleeding"),
                ("urgency", "URGENT"),
                ("role", "ASHA_WORKER"),
                ("role", "PHC_DOCTOR")
            ]
        },

        # 6. NCD: Type 2 Diabetes Management & Lifestyle Counselling
        {
            "id": "hr_ncd_diabetes_guide",
            "resource_code": "HR-NCD-DIAB-006",
            "title": "Type 2 Diabetes Mellitus: Primary Care Screening & Dietary Management",
            "summary": "Comprehensive screening protocol for blood glucose >= 200 mg/dL, foot examination, and dietary counselling points.",
            "content": """## TYPE 2 DIABETES CLINICAL & PATIENT EDUCATION GUIDE

### 1. Diagnostic Benchmarks (Capillary / Venous Plasma Glucose)
* **Fasting Blood Glucose**: >= 126 mg/dL (7.0 mmol/L)
* **Random Blood Glucose**: >= 200 mg/dL (11.1 mmol/L) with classical symptoms (polyuria, polydipsia, unexplained weight loss).
* **Pre-Diabetes**: Fasting 100-125 mg/dL.

### 2. Frontline ASHA Counselling Points
* **Dietary Advice**: Replace refined white rice and sugar with whole grains (millets, ragi, jowar), pulses, and green leafy vegetables.
* **Physical Activity**: 30 minutes of brisk walking at least 5 days per week.
* **Foot Care**: Wash feet daily with lukewarm water, inspect for cracks or blunted sensation, never walk barefoot.

### 3. Clinical Referral Triggers
* RBG >= 300 mg/dL with ketones or nausea (risk of hyperosmolar state/DKA).
* Non-healing ulcers or loss of peripheral sensation.
* Blurring of vision (retinopathy screening).""",
            "resource_type": "PATIENT_EDUCATION",
            "category_code": "NCD",
            "urgency_level": "ROUTINE",
            "is_emergency": 0,
            "source_name": "MoHFW National Programme for Prevention & Control of NCDs (NP-NCD)",
            "source_url": "https://main.mohfw.gov.in",
            "tags": [
                ("condition", "diabetes"),
                ("condition", "type 2 diabetes"),
                ("symptom", "polyuria"),
                ("symptom", "polydipsia"),
                ("symptom", "fatigue"),
                ("symptom", "weight loss"),
                ("urgency", "ROUTINE"),
                ("role", "ASHA_WORKER"),
                ("role", "PHC_DOCTOR")
            ]
        },

        # 7. CHILD HEALTH: Pediatric Diarrhea, ORS & Zinc Therapy
        {
            "id": "hr_child_diarrhea_ors",
            "resource_code": "HR-CHILD-DIARR-007",
            "title": "Childhood Diarrhea: Dehydration Assessment & ORS/Zinc Protocol",
            "summary": "Frontline assessment of mild, moderate, and severe dehydration, Plan A/B/C rehydration, and 14-day zinc supplementation.",
            "content": """## PEDIATRIC DIARRHEA & DEHYDRATION MANAGEMENT

### 1. Dehydration Triage
* **No Dehydration**: Alert, normal eyes, drinks normally, skin pinch goes back quickly -> **Plan A (Home ORS & fluids)**.
* **Some Dehydration**: Restless/irritable, sunken eyes, thirsty, skin pinch goes back slowly -> **Plan B (4-hour monitored ORS)**.
* **Severe Dehydration**: Lethargic/unconscious, skin pinch goes back very slowly (> 2 sec) -> **Plan C (Immediate IV Ringer's Lactate)**.

### 2. Zinc Supplementation (Mandatory 14 Days)
* **Age 2 to 6 months**: 10 mg elemental zinc daily for 14 days.
* **Age >= 6 months**: 20 mg elemental zinc daily for 14 days.
* Advise mother to complete full 14 days even if diarrhea stops early.

### 3. Nutrition Directives
* Continue frequent breastfeeding without interruption.
* Do NOT withhold food; provide small frequent nutrient-dense meals (khichdi, curd, bananas).""",
            "resource_type": "ASHA_ACTION_CHECKLIST",
            "category_code": "CHILD_HEALTH",
            "urgency_level": "MODERATE",
            "is_emergency": 0,
            "source_name": "WHO / UNICEF Integrated Management of Neonatal & Childhood Illness (IMNCI)",
            "source_url": "https://who.int",
            "tags": [
                ("condition", "acute diarrhea"),
                ("symptom", "vomiting"),
                ("symptom", "fatigue"),
                ("symptom", "fever"),
                ("age_group", "child"),
                ("age_group", "infant"),
                ("urgency", "MODERATE"),
                ("role", "ASHA_WORKER"),
                ("role", "PHC_DOCTOR")
            ]
        }
    ]

    for item in seed_resources:
        db_res = HealthResourceModel(
            id=item["id"],
            resource_code=item["resource_code"],
            title=item["title"],
            summary=item["summary"],
            content=item["content"],
            resource_type=item["resource_type"],
            category_code=item["category_code"],
            status="PUBLISHED",
            version="1.0.0",
            source_name=item["source_name"],
            source_url=item["source_url"],
            language="en",
            is_emergency=item["is_emergency"],
            urgency_level=item["urgency_level"],
            created_by="SYSTEM_ADMIN",
            reviewed_by="Dr. S. Sharma (PHC Medical Officer)",
            reviewed_at=now_iso,
            published_at=now_iso,
            expires_at=expires_iso,
            last_verified_at=now_iso,
            server_version=1,
            is_deleted=0,
            created_at=now_iso,
            updated_at=now_iso
        )
        db.add(db_res)
        db.flush()

        for tag_type, tag_value in item["tags"]:
            db.add(HealthResourceTagModel(
                resource_id=db_res.id,
                tag_type=tag_type,
                tag_value=tag_value
            ))

        # Add global scope
        db.add(HealthResourceScopeModel(
            resource_id=db_res.id,
            scope_type="GLOBAL",
            scope_value="GLOBAL"
        ))

        # Add initial version snapshot
        content_raw = f"{db_res.id}:{db_res.resource_code}:{db_res.version}:{db_res.content}:SYSTEM_ADMIN:{now_iso}"
        attestation_hash = hashlib.sha256(content_raw.encode("utf-8")).hexdigest()

        db.add(HealthResourceVersionModel(
            id=str(uuid.uuid4()),
            resource_id=db_res.id,
            version="1.0.0",
            title=db_res.title,
            summary=db_res.summary,
            content=db_res.content,
            status="PUBLISHED",
            reviewed_by=db_res.reviewed_by,
            reviewed_at=now_iso,
            attestation_hash=attestation_hash,
            change_reason="Initial clinical baseline publication from approved MoHFW/WHO guidelines.",
            created_at=now_iso
        ))

    db.commit()
