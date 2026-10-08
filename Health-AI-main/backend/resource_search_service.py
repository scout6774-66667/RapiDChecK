"""
resource_search_service.py — Deterministic & Multi-Attribute Search Engine
==========================================================================
Implements Section 11 & Algorithm 5 of the Health Resources Implementation Plan:
1. Multi-attribute deterministic search across titles, summaries, contents, tags, categories, roles, and conditions.
2. Tokenized relevance ranking and filtering.
3. Pagination, sorting, and category metadata facets.
"""

from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, text
from database import HealthResourceModel, HealthResourceCategoryModel, HealthResourceTagModel
from health_resource_schemas import (
    ResourceSearchRequest,
    ResourceSearchResponse,
    HealthResourceResponse,
    HealthResourceTagSchema,
    HealthResourceScopeSchema
)
from resource_recommendation_service import calculate_freshness_status


def model_to_response(res: HealthResourceModel) -> HealthResourceResponse:
    """Converts HealthResourceModel into HealthResourceResponse with calculated freshness."""
    tags_list = [
        HealthResourceTagSchema(tag_type=t.tag_type, tag_value=t.tag_value)
        for t in (res.tags or [])
    ]
    scopes_list = [
        HealthResourceScopeSchema(scope_type=s.scope_type, scope_value=s.scope_value)
        for s in (res.scopes or [])
    ]
    freshness = calculate_freshness_status(res)

    return HealthResourceResponse(
        id=res.id,
        resource_code=res.resource_code,
        title=res.title,
        summary=res.summary,
        content=res.content,
        resource_type=res.resource_type, # type: ignore
        category_code=res.category_code,
        status=res.status, # type: ignore
        version=res.version,
        freshness_status=freshness, # type: ignore
        language=res.language,
        is_emergency=bool(res.is_emergency),
        urgency_level=res.urgency_level, # type: ignore
        source_name=res.source_name,
        source_url=res.source_url,
        source_document=res.source_document,
        source_version=res.source_version,
        created_by=res.created_by,
        updated_by=res.updated_by,
        reviewed_by=res.reviewed_by,
        reviewed_at=res.reviewed_at,
        published_at=res.published_at,
        expires_at=res.expires_at,
        last_verified_at=res.last_verified_at,
        change_reason=res.change_reason,
        server_version=res.server_version,
        is_deleted=res.is_deleted,
        created_at=res.created_at,
        updated_at=res.updated_at,
        tags=tags_list,
        scopes=scopes_list
    )


def search_health_resources(
    db: Session,
    params: ResourceSearchRequest,
    user_role: str = "ASHA_WORKER"
) -> ResourceSearchResponse:
    """
    Performs deterministic multi-attribute search and filtering over governed health resources.
    """
    query = db.query(HealthResourceModel).filter(HealthResourceModel.is_deleted == 0)

    # Status filter: Only admins / doctors can view unapproved drafts if requested
    if not (params.include_all_statuses and user_role in ["SYSTEM_ADMIN", "PHC_DOCTOR"]):
        query = query.filter(HealthResourceModel.status == "PUBLISHED")

    # Category filter
    if params.category_code:
        query = query.filter(HealthResourceModel.category_code == params.category_code.upper())

    # Resource type filter
    if params.resource_type:
        query = query.filter(HealthResourceModel.resource_type == params.resource_type)

    # Urgency filter
    if params.urgency_level:
        query = query.filter(HealthResourceModel.urgency_level == params.urgency_level.upper())

    # Language filter
    if params.language:
        query = query.filter(HealthResourceModel.language == params.language.lower())

    # Tag-based filters (Condition, Symptom, Role)
    if params.condition:
        cond_lower = params.condition.lower()
        res_ids_with_cond = [
            r[0] for r in db.query(HealthResourceTagModel.resource_id).filter(
                HealthResourceTagModel.tag_type == "condition",
                HealthResourceTagModel.tag_value.ilike(f"%{cond_lower}%")
            ).distinct().all()
        ]
        query = query.filter(HealthResourceModel.id.in_(res_ids_with_cond))

    if params.symptom:
        symp_lower = params.symptom.lower()
        res_ids_with_symp = [
            r[0] for r in db.query(HealthResourceTagModel.resource_id).filter(
                HealthResourceTagModel.tag_type == "symptom",
                HealthResourceTagModel.tag_value.ilike(f"%{symp_lower}%")
            ).distinct().all()
        ]
        query = query.filter(HealthResourceModel.id.in_(res_ids_with_symp))

    if params.role:
        role_upper = params.role.upper()
        res_ids_with_role = [
            r[0] for r in db.query(HealthResourceTagModel.resource_id).filter(
                HealthResourceTagModel.tag_type == "role",
                HealthResourceTagModel.tag_value.ilike(f"%{role_upper}%")
            ).distinct().all()
        ]
        query = query.filter(HealthResourceModel.id.in_(res_ids_with_role))

    # Free text search query matching Title, Summary, Content, Resource Code
    if params.query and params.query.strip():
        q_term = f"%{params.query.strip().lower()}%"
        query = query.filter(
            or_(
                HealthResourceModel.title.ilike(q_term),
                HealthResourceModel.summary.ilike(q_term),
                HealthResourceModel.content.ilike(q_term),
                HealthResourceModel.resource_code.ilike(q_term),
                HealthResourceModel.source_name.ilike(q_term)
            )
        )

    total_matches = query.count()

    # Pagination & Ordering (Emergencies and newer resources first)
    results = query.order_by(
        HealthResourceModel.is_emergency.desc(),
        HealthResourceModel.updated_at.desc()
    ).offset(params.offset).limit(params.limit).all()

    resource_responses = [model_to_response(r) for r in results]

    applied_filters = {
        "category_code": params.category_code,
        "resource_type": params.resource_type,
        "role": params.role,
        "condition": params.condition,
        "symptom": params.symptom,
        "urgency_level": params.urgency_level,
        "language": params.language
    }

    return ResourceSearchResponse(
        total=total_matches,
        resources=resource_responses,
        query=params.query,
        applied_filters={k: v for k, v in applied_filters.items() if v is not None}
    )
