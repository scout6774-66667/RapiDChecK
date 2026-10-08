/**
 * resourceApi.ts — Client API & Offline Dexie Cache for Governed Health Resources
 * =================================================================================
 * Implements client retrieval, deterministic recommendation requests, multi-filter
 * searches, and offline Dexie v5 caching/synchronization.
 */

import { db } from '../db/offlineDb';

const API_BASE_URL = 'http://127.0.0.1:8000/api/v2';

export interface ResourceCategory {
  id: string;
  code: string;
  name: string;
  parent_code?: string;
  description: string;
  icon: string;
  sort_order: number;
  resource_count: number;
}

export interface HealthResourceItem {
  id: string;
  resource_code: string;
  title: string;
  summary: string;
  content: string;
  resource_type: string;
  category_code: string;
  status: string;
  version: string;
  freshness_status: 'FRESH' | 'STALE' | 'EXPIRED' | 'REVOKED';
  language: string;
  is_emergency: boolean;
  urgency_level: 'ROUTINE' | 'MODERATE' | 'URGENT' | 'EMERGENCY';
  source_name: string;
  source_url?: string;
  source_document?: string;
  source_version?: string;
  tags: Array<{ tag_type: string; tag_value: string }>;
  scopes: Array<{ scope_type: string; scope_value: string }>;
  created_by: string;
  reviewed_by?: string;
  reviewed_at?: string;
  published_at?: string;
  expires_at?: string;
  last_verified_at?: string;
  change_reason?: string;
  server_version: number;
  is_deleted: number;
  created_at: string;
  updated_at?: string;
}

export interface RecommendationItem {
  resource_id: string;
  resource_code: string;
  title: string;
  summary: string;
  resource_type: string;
  category_code: string;
  category_name?: string;
  reason: string;
  priority: number;
  urgency: 'ROUTINE' | 'MODERATE' | 'URGENT' | 'EMERGENCY';
  is_emergency: boolean;
  offline_available: boolean;
  version: string;
  freshness_status: string;
  source_name: string;
  source_url?: string;
  match_score: number;
  score_breakdown: Record<string, number>;
}

export interface RecommendationBundle {
  context: Record<string, any>;
  recommendations: RecommendationItem[];
  emergency_override: boolean;
  warnings: string[];
  engine_version: string;
  evaluated_at: string;
}

export interface SearchParams {
  query?: string;
  category_code?: string;
  resource_type?: string;
  role?: string;
  condition?: string;
  symptom?: string;
  urgency_level?: string;
  language?: string;
  limit?: number;
  offset?: number;
}

export interface SearchResponse {
  total: number;
  resources: HealthResourceItem[];
  query?: string;
  applied_filters: Record<string, any>;
}

// ─── 1. CATEGORY RETRIEVAL & OFFLINE CACHING ─────────────────────────────────

export async function fetchResourceCategories(isOnline: boolean = true): Promise<ResourceCategory[]> {
  if (isOnline) {
    try {
      const res = await fetch(`${API_BASE_URL}/health-resources/categories`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const categories: ResourceCategory[] = await res.json();
        // Cache categories locally
        try {
          localStorage.setItem('cached_resource_categories', JSON.stringify(categories));
        } catch {}
        return categories;
      }
    } catch (err) {
      console.warn('[ResourceApi] Online category fetch failed, falling back to cache', err);
    }
  }

  // Offline fallback
  try {
    const cached = localStorage.getItem('cached_resource_categories');
    if (cached) return JSON.parse(cached);
  } catch {}

  // Fallback defaults
  return [
    { id: 'cat_mat', code: 'MATERNAL', name: 'Maternal & Reproductive Health', description: 'ANC, High-Risk Pregnancy & PNC Danger Signs', icon: 'Heart', sort_order: 1, resource_count: 0 },
    { id: 'cat_child', code: 'CHILD_HEALTH', name: 'Child Health & Immunization', description: 'Immunization schedule, ORS/Zinc & Malnutrition', icon: 'Baby', sort_order: 2, resource_count: 0 },
    { id: 'cat_comm', code: 'COMMUNICABLE', name: 'Communicable Diseases', description: 'TB (NTEP), Dengue & Malaria flows', icon: 'Activity', sort_order: 3, resource_count: 0 },
    { id: 'cat_ncd', code: 'NCD', name: 'Non-Communicable Diseases (NCD)', description: 'Hypertension, Type 2 Diabetes & CVD Care', icon: 'ShieldAlert', sort_order: 4, resource_count: 0 },
    { id: 'cat_ref', code: 'REFERRAL', name: 'Emergency & Referral SOPs', description: 'Golden Hour transport & Acute Stabilization', icon: 'AlertTriangle', sort_order: 5, resource_count: 0 },
    { id: 'cat_gen', code: 'GENERAL', name: 'General Frontline Health', description: 'Hygiene, Community Wellness & Diet Advice', icon: 'BookOpen', sort_order: 6, resource_count: 0 },
  ];
}

// ─── 2. RESOURCE LIST / SEARCH WITH OFFLINE DEXIE FALLBACK ───────────────────

export async function searchResources(params: SearchParams, isOnline: boolean = true): Promise<SearchResponse> {
  if (isOnline) {
    try {
      const url = new URL(`${API_BASE_URL}/health-resources`);
      if (params.query) url.searchParams.set('query', params.query);
      if (params.category_code) url.searchParams.set('category_code', params.category_code);
      if (params.resource_type) url.searchParams.set('resource_type', params.resource_type);
      if (params.role) url.searchParams.set('role', params.role);
      if (params.condition) url.searchParams.set('condition', params.condition);
      if (params.symptom) url.searchParams.set('symptom', params.symptom);
      if (params.urgency_level) url.searchParams.set('urgency_level', params.urgency_level);
      if (params.language) url.searchParams.set('language', params.language);
      if (params.limit) url.searchParams.set('limit', String(params.limit));
      if (params.offset) url.searchParams.set('offset', String(params.offset));

      const res = await fetch(url.toString(), {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(6000),
      });

      if (res.ok) {
        const data: SearchResponse = await res.json();
        // Sync items into Dexie offline table
        for (const item of data.resources) {
          try {
            await db.health_resources.put({
              id: item.id,
              resource_code: item.resource_code,
              title: item.title,
              summary: item.summary,
              content: item.content,
              resource_type: item.resource_type,
              category_code: item.category_code,
              status: item.status,
              version: item.version,
              freshness_status: item.freshness_status,
              language: item.language,
              is_emergency: item.is_emergency,
              urgency_level: item.urgency_level,
              source_name: item.source_name,
              source_url: item.source_url,
              source_document: item.source_document,
              source_version: item.source_version,
              tags: item.tags,
              scopes: item.scopes,
              created_by: item.created_by,
              reviewed_by: item.reviewed_by,
              reviewed_at: item.reviewed_at,
              published_at: item.published_at,
              expires_at: item.expires_at,
              last_verified_at: item.last_verified_at,
              change_reason: item.change_reason,
              server_version: item.server_version,
              is_deleted: false,
              created_at: item.created_at,
              updated_at: item.updated_at,
            });
          } catch (e) {
            console.warn('[ResourceApi] Dexie caching error', e);
          }
        }
        return data;
      }
    } catch (err) {
      console.warn('[ResourceApi] Online search failed, using Dexie offline cache', err);
    }
  }

  // Offline search in Dexie table
  try {
    let localItems = await db.health_resources.where('status').equals('PUBLISHED').toArray();
    
    if (params.category_code) {
      localItems = localItems.filter(i => i.category_code === params.category_code);
    }
    if (params.urgency_level) {
      localItems = localItems.filter(i => i.urgency_level === params.urgency_level);
    }
    if (params.query && params.query.trim()) {
      const q = params.query.toLowerCase();
      localItems = localItems.filter(i =>
        i.title.toLowerCase().includes(q) ||
        i.summary.toLowerCase().includes(q) ||
        i.content.toLowerCase().includes(q) ||
        i.resource_code.toLowerCase().includes(q)
      );
    }

    const resources: HealthResourceItem[] = localItems.map(i => ({
      id: i.id,
      resource_code: i.resource_code,
      title: i.title,
      summary: i.summary,
      content: i.content,
      resource_type: i.resource_type,
      category_code: i.category_code,
      status: i.status,
      version: i.version,
      freshness_status: (i.freshness_status as any) || 'FRESH',
      language: i.language || 'en',
      is_emergency: i.is_emergency,
      urgency_level: (i.urgency_level as any) || 'ROUTINE',
      source_name: i.source_name,
      source_url: i.source_url,
      source_document: i.source_document,
      source_version: i.source_version,
      tags: i.tags || [],
      scopes: i.scopes || [],
      created_by: i.created_by,
      reviewed_by: i.reviewed_by,
      reviewed_at: i.reviewed_at,
      published_at: i.published_at,
      expires_at: i.expires_at,
      last_verified_at: i.last_verified_at,
      change_reason: i.change_reason,
      server_version: i.server_version,
      is_deleted: 0,
      created_at: i.created_at,
      updated_at: i.updated_at,
    }));

    return {
      total: resources.length,
      resources,
      query: params.query,
      applied_filters: params as any,
    };
  } catch (err) {
    console.error('[ResourceApi] Offline search exception', err);
    return { total: 0, resources: [], applied_filters: {} };
  }
}

// ─── 3. SINGLE RESOURCE DETAIL ───────────────────────────────────────────────

export async function fetchResourceDetail(resourceId: string, isOnline: boolean = true): Promise<HealthResourceItem | null> {
  if (isOnline) {
    try {
      const res = await fetch(`${API_BASE_URL}/health-resources/${resourceId}`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {}
  }

  // Offline fallback
  const local = await db.health_resources.get(resourceId);
  if (local) {
    return {
      ...local,
      is_deleted: 0,
      freshness_status: (local.freshness_status as any) || 'FRESH',
      urgency_level: (local.urgency_level as any) || 'ROUTINE',
    };
  }
  return null;
}

// ─── 4. CLINICAL RECOMMENDATION REQUEST ──────────────────────────────────────

export async function getRecommendations(
  payload: {
    patient_id?: string;
    assessment_id?: string;
    requested_topic?: string;
    language?: string;
    raw_context?: any;
  },
  isOnline: boolean = true
): Promise<RecommendationBundle> {
  if (isOnline) {
    try {
      const res = await fetch(`${API_BASE_URL}/health-resources/recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(7000),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn('[ResourceApi] Recommendation fetch failed, using offline matcher', err);
    }
  }

  // Offline deterministic fallback
  const localList = await db.health_resources.where('status').equals('PUBLISHED').toArray();
  const recs: RecommendationItem[] = localList.slice(0, 10).map((r, idx) => ({
    resource_id: r.id,
    resource_code: r.resource_code,
    title: r.title,
    summary: r.summary,
    resource_type: r.resource_type,
    category_code: r.category_code,
    category_name: r.category_code,
    reason: r.is_emergency ? 'Emergency protocol match (Offline Cache)' : 'Matched clinical guidance (Offline Cache)',
    priority: r.is_emergency ? 100 : 50 - idx,
    urgency: (r.urgency_level as any) || 'ROUTINE',
    is_emergency: r.is_emergency,
    offline_available: true,
    version: r.version,
    freshness_status: r.freshness_status || 'FRESH',
    source_name: r.source_name,
    source_url: r.source_url,
    match_score: r.is_emergency ? 95 : 60,
    score_breakdown: { offline_cached: 50 },
  }));

  return {
    context: { offline: true, query: payload.requested_topic },
    recommendations: recs,
    emergency_override: recs.some(r => r.is_emergency),
    warnings: ['Operating in OFFLINE mode. Showing cached clinical resources.'],
    engine_version: '2.0.0-offline',
    evaluated_at: new Date().toISOString(),
  };
}
