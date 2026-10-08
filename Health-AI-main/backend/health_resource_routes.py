"""
health_resource_routes.py — FastAPI Endpoints for Governed Health Resources
=============================================================================
Implements Section 21 of the Health Resources Implementation Plan:
1. Public / Frontline Retrieval: GET /api/v2/health-resources, GET /categories, GET /{id}
2. Recommendation Engine: POST /api/v2/health-resources/recommend
3. Deterministic Search: POST /api/v2/health-resources/search
4. Clinician & Admin Governance:
   POST /api/v2/admin/health-resources
   PUT  /api/v2/admin/health-resources/{id}
   POST /api/v2/admin/health-resources/{id}/review
   POST /api/v2/admin/health-resources/{id}/publish
   POST /api/v2/admin/health-resources/{id}/revoke
   POST /api/v2/admin/health-resources/ingest
   GET  /api/v2/health-resources/{id}/versions
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from database import get_db, UserModel
from auth_service import get_current_user, require_roles
from health_resource_schemas import (
    HealthResourceCreate,
    HealthResourceUpdate,
    HealthResourceResponse,
    HealthResourceCategoryResponse,
    HealthResourceVersionResponse,
    ResourceRecommendRequest,
    ResourceRecommendationBundle,
    ResourceSearchRequest,
    ResourceSearchResponse,
    ResourcePublishRequest,
    ResourceReviewSubmitRequest,
    ResourceRevokeRequest,
    ResourceIngestRequest,
    ResourceIngestResponse
)
from health_resources_service import (
    list_categories,
    get_resource_by_id,
    create_resource,
    update_resource,
    submit_resource_for_review,
    publish_resource,
    revoke_resource,
    get_resource_versions
)
from resource_context_service import extract_resource_context
from resource_recommendation_service import generate_recommendations
from resource_search_service import search_health_resources
from resource_ingestion_service import ingest_clinical_document

router = APIRouter(prefix="/api/v2", tags=["Health Resources"])


# ─── 1. PUBLIC / FRONTLINE ENDPOINTS ─────────────────────────────────────────

@router.get("/health-resources/categories", response_model=List[HealthResourceCategoryResponse])
def get_categories_endpoint(db: Session = Depends(get_db)):
    """Retrieves all clinical resource categories with count of published guidelines."""
    return list_categories(db)


@router.get("/health-resources", response_model=ResourceSearchResponse)
def list_health_resources_endpoint(
    query: Optional[str] = None,
    category_code: Optional[str] = None,
    resource_type: Optional[str] = None,
    role: Optional[str] = None,
    condition: Optional[str] = None,
    symptom: Optional[str] = None,
    urgency_level: Optional[str] = None,
    language: Optional[str] = "en",
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db)
):
    """Browses and filters published health resources."""
    search_req = ResourceSearchRequest(
        query=query,
        category_code=category_code,
        resource_type=resource_type,
        role=role,
        condition=condition,
        symptom=symptom,
        urgency_level=urgency_level,
        language=language,
        include_all_statuses=False,
        limit=limit,
        offset=offset
    )
    return search_health_resources(db, search_req, user_role="ASHA_WORKER")


@router.get("/health-resources/{resource_id}", response_model=HealthResourceResponse)
def get_resource_detail_endpoint(
    resource_id: str,
    db: Session = Depends(get_db)
):
    """Retrieves single resource with tags, scopes, source provenance, and freshness."""
    return get_resource_by_id(db, resource_id, user=None)


@router.get("/health-resources/{resource_id}/versions", response_model=List[HealthResourceVersionResponse])
def get_resource_version_history_endpoint(
    resource_id: str,
    db: Session = Depends(get_db)
):
    """Retrieves immutable publication version history and attestation hashes."""
    return get_resource_versions(db, resource_id)


# ─── 2. RECOMMENDATION & SEARCH ENGINES ──────────────────────────────────────

@router.post("/health-resources/recommend", response_model=ResourceRecommendationBundle)
def recommend_health_resources_endpoint(
    req: ResourceRecommendRequest,
    db: Session = Depends(get_db)
):
    """
    Context Extraction + Safety Gate + Deterministic Ranking.
    Evaluates clinical emergency conditions and returns prioritized resource bundle.
    """
    context = extract_resource_context(
        db=db,
        patient_id=req.patient_id,
        assessment_id=req.assessment_id,
        requested_topic=req.requested_topic,
        language=req.language or "en",
        raw_context=req.raw_context
    )
    return generate_recommendations(db, context)


@router.post("/health-resources/search", response_model=ResourceSearchResponse)
def search_health_resources_post_endpoint(
    req: ResourceSearchRequest,
    db: Session = Depends(get_db)
):
    """Dedicated multi-attribute deterministic search."""
    return search_health_resources(db, req, user_role="ASHA_WORKER")


# ─── 3. ADMIN & CLINICAL GOVERNANCE ENDPOINTS ────────────────────────────────

@router.post(
    "/admin/health-resources",
    response_model=HealthResourceResponse
)
def create_resource_endpoint(
    data: HealthResourceCreate,
    current_user: UserModel = Depends(require_roles("SYSTEM_ADMIN", "PHC_DOCTOR")),
    db: Session = Depends(get_db)
):
    """Creates a new health resource in DRAFT status with audit tracking."""
    return create_resource(db, data, current_user)


@router.put(
    "/admin/health-resources/{resource_id}",
    response_model=HealthResourceResponse
)
def update_resource_endpoint(
    resource_id: str,
    data: HealthResourceUpdate,
    current_user: UserModel = Depends(require_roles("SYSTEM_ADMIN", "PHC_DOCTOR")),
    db: Session = Depends(get_db)
):
    """Updates an existing health resource with optimistic concurrency."""
    return update_resource(db, resource_id, data, current_user)


@router.post(
    "/admin/health-resources/{resource_id}/review",
    response_model=HealthResourceResponse
)
def submit_review_endpoint(
    resource_id: str,
    current_user: UserModel = Depends(require_roles("SYSTEM_ADMIN", "PHC_DOCTOR")),
    db: Session = Depends(get_db)
):
    """Submits a draft resource for clinical review (DRAFT -> CLINICAL_REVIEW)."""
    return submit_resource_for_review(db, resource_id, current_user)


@router.post(
    "/admin/health-resources/{resource_id}/publish",
    response_model=HealthResourceResponse
)
def publish_resource_endpoint(
    resource_id: str,
    req: ResourcePublishRequest,
    current_user: UserModel = Depends(require_roles("SYSTEM_ADMIN", "PHC_DOCTOR")),
    db: Session = Depends(get_db)
):
    """
    Approves and Publishes a resource atomically with cryptographic attestation,
    version snapshotting, audit logging, and sync journal recording.
    """
    return publish_resource(db, resource_id, req, current_user)


@router.post(
    "/admin/health-resources/{resource_id}/revoke",
    response_model=HealthResourceResponse
)
def revoke_resource_endpoint(
    resource_id: str,
    req: ResourceRevokeRequest,
    current_user: UserModel = Depends(require_roles("SYSTEM_ADMIN", "PHC_DOCTOR")),
    db: Session = Depends(get_db)
):
    """Revokes a resource with mandatory justification and sync journal recording."""
    return revoke_resource(db, resource_id, req, current_user)


@router.post(
    "/admin/health-resources/ingest",
    response_model=ResourceIngestResponse
)
def ingest_resource_endpoint(
    req: ResourceIngestRequest,
    current_user: UserModel = Depends(require_roles("SYSTEM_ADMIN", "PHC_DOCTOR")),
    db: Session = Depends(get_db)
):
    """
    Ingestion pipeline: extracts metadata, tags, and creates DRAFT resource.
    AI extraction NEVER auto-publishes without clinical review.
    """
    return ingest_clinical_document(db, req, current_user.username)
