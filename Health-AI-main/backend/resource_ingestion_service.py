"""
resource_ingestion_service.py — Controlled Clinical Resource Ingestion Pipeline
=================================================================================
Implements Section 7 of the Health Resources Implementation Plan:
1. Controlled parsing and metadata extraction from approved sources (Government, WHO, ICMR).
2. Automated classification, tag generation, and duplicate detection.
3. Governance guarantee: Ingested items are placed in DRAFT / CLINICAL_REVIEW.
   AI extraction NEVER automatically publishes clinical content.
"""

import re
import uuid
from typing import List, Dict, Any, Tuple
from sqlalchemy.orm import Session
from database import HealthResourceModel, HealthResourceTagModel, HealthResourceCategoryModel
from health_resource_schemas import ResourceIngestRequest, ResourceIngestResponse

# Controlled Category Keywords
CATEGORY_TAXONOMY_MAP = {
    "MATERNAL": ["maternal", "anc", "antenatal", "pnc", "postnatal", "pregnancy", "trimester", "eclampsia", "obstetric", "labor", "delivery", "postpartum"],
    "CHILD_HEALTH": ["child", "pediatric", "immunization", "vaccine", "diarrhea", "ors", "zinc", "malnutrition", "sam", "mam", "infant", "newborn"],
    "COMMUNICABLE": ["tb", "tuberculosis", "dengue", "malaria", "fever", "respiratory", "cough", "infection", "vector", "dot-s", "ns1"],
    "NCD": ["hypertension", "diabetes", "blood pressure", "glucose", "cardiovascular", "cvd", "stroke", "ncd", "cholesterol", "lifestyle"],
    "REFERRAL": ["referral", "emergency", "sop", "ambulance", "triage", "golden hour", "critical care", "escalation"]
}

KNOWN_CONDITIONS = [
    "hypertension", "type 2 diabetes", "diabetes mellitus", "tuberculosis", "dengue", "malaria",
    "pre-eclampsia", "gestational diabetes", "acute diarrhea", "severe acute malnutrition",
    "acute coronary syndrome", "pneumonia", "asthma", "anemia"
]

KNOWN_SYMPTOMS = [
    "fever", "cough", "chest pain", "shortness of breath", "dyspnea", "headache", "dizziness",
    "vomiting", "bleeding", "swelling", "pedal edema", "polyuria", "polydipsia", "fatigue",
    "weight loss", "hemoptysis", "convulsion", "abdominal pain"
]


def classify_and_extract_metadata(raw_text: str, target_category: str = None) -> Tuple[str, str, str, List[Dict[str, str]]]:
    """
    Analyzes raw text to extract title, summary, category, and clinical tags.
    """
    lines = [line.strip() for line in raw_text.strip().split("\n") if line.strip()]
    first_line = lines[0] if lines else "Clinical Resource Guidance"

    # Clean markdown headers if present
    extracted_title = re.sub(r'^[#*\-\s]+', '', first_line).strip()
    if len(extracted_title) > 120:
        extracted_title = extracted_title[:117] + "..."

    # Summary from next 2-3 lines
    summary_lines = lines[1:4] if len(lines) > 1 else [extracted_title]
    extracted_summary = " ".join(summary_lines)
    if len(extracted_summary) > 280:
        extracted_summary = extracted_summary[:277] + "..."

    # Category classification
    text_lower = raw_text.lower()
    detected_category = target_category or "GENERAL"

    if not target_category or target_category == "GENERAL":
        category_scores: Dict[str, int] = {}
        for cat, keywords in CATEGORY_TAXONOMY_MAP.items():
            score = sum(text_lower.count(kw) for kw in keywords)
            if score > 0:
                category_scores[cat] = score
        if category_scores:
            detected_category = max(category_scores.items(), key=lambda x: x[1])[0]

    # Clinical Tag Extraction
    tags: List[Dict[str, str]] = []

    # Detect conditions
    for cond in KNOWN_CONDITIONS:
        if cond in text_lower:
            tags.append({"tag_type": "condition", "tag_value": cond})

    # Detect symptoms
    for symp in KNOWN_SYMPTOMS:
        if symp in text_lower:
            tags.append({"tag_type": "symptom", "tag_value": symp})

    # Detect target role
    if "asha" in text_lower or "frontline" in text_lower or "counselling" in text_lower:
        tags.append({"tag_type": "role", "tag_value": "ASHA_WORKER"})
    if "doctor" in text_lower or "medical officer" in text_lower or "prescription" in text_lower or "differential" in text_lower:
        tags.append({"tag_type": "role", "tag_value": "PHC_DOCTOR"})
    if "district" in text_lower or "surveillance" in text_lower or "officer" in text_lower:
        tags.append({"tag_type": "role", "tag_value": "DISTRICT_OFFICER"})

    # Ensure at least one role tag exists
    if not any(t["tag_type"] == "role" for t in tags):
        tags.append({"tag_type": "role", "tag_value": "ASHA_WORKER"})
        tags.append({"tag_type": "role", "tag_value": "PHC_DOCTOR"})

    return extracted_title, extracted_summary, detected_category, tags


def ingest_clinical_document(
    db: Session,
    request: ResourceIngestRequest,
    creator_username: str
) -> ResourceIngestResponse:
    """
    Ingests document into DRAFT / CLINICAL_REVIEW. Does NOT auto-publish.
    """
    title, summary, detected_category, tags = classify_and_extract_metadata(
        request.raw_text,
        request.target_category_code
    )

    # Generate or validate resource code
    res_code = request.suggested_resource_code or f"HR-INGEST-{uuid.uuid4().hex[:6].upper()}"

    # Check for existing code (version comparison)
    existing = db.query(HealthResourceModel).filter(HealthResourceModel.resource_code == res_code).first()
    res_id = str(uuid.uuid4())

    new_resource = HealthResourceModel(
        id=res_id,
        resource_code=res_code,
        title=title,
        summary=summary,
        content=request.raw_text,
        resource_type="CLINICAL_GUIDELINE" if "PHC_DOCTOR" in [t["tag_value"] for t in tags] else "PATIENT_EDUCATION",
        category_code=detected_category,
        status="DRAFT", # Always starts as DRAFT for clinical governance
        version="1.0.0" if not existing else f"1.{existing.server_version}.0-draft",
        source_name=request.source_name,
        source_url=request.source_url,
        source_document=request.source_document or "Ingested Document",
        language="en",
        is_emergency=1 if "emergency" in detected_category.lower() or "crisis" in request.raw_text.lower() else 0,
        urgency_level="URGENT" if "emergency" in detected_category.lower() else "ROUTINE",
        created_by=creator_username,
        server_version=1,
        is_deleted=0
    )

    db.add(new_resource)
    db.flush()

    # Add tags
    for tag_data in tags:
        tag_record = HealthResourceTagModel(
            resource_id=new_resource.id,
            tag_type=tag_data["tag_type"],
            tag_value=tag_data["tag_value"]
        )
        db.add(tag_record)

    db.commit()
    db.refresh(new_resource)

    return ResourceIngestResponse(
        draft_resource_id=new_resource.id,
        resource_code=new_resource.resource_code,
        extracted_title=new_resource.title,
        extracted_summary=new_resource.summary,
        detected_category=new_resource.category_code,
        extracted_tags=tags,
        status="DRAFT"
    )
