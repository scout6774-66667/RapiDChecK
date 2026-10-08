/**
 * SyncManager.ts — Client-Side Synchronization Engine
 * ====================================================
 * Implements TASK-005 & TASK-006:
 * 1. Pushes Dexie v4 Outbox operations to POST /api/v2/sync/push.
 * 2. Processes per-operation server ACKs (APPLIED, DUPLICATE, CONFLICT, REJECTED).
 * 3. Pulls incremental changes from GET/POST /api/v2/sync/pull with server sequences.
 * 4. Applies incoming remote changes (including soft deletes / tombstones) to local Dexie tables.
 * 5. Provides automatic sync listeners on network recovery ('online' event) and periodic interval.
 */

import {
  db,
  getQueuedOutboxOperations,
  acknowledgeOutboxOperations,
  markOutboxConflict,
  markOutboxFailed,
  getSyncMetadata,
  updateSyncMetadata,
  getOrCreateDeviceId,
  type LocalPatient,
  type LocalAssessment,
  type LocalAppointment
} from '../db/offlineDb.ts';

const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000';

export interface SyncPushResultSummary {
  applied: number;
  duplicates: number;
  conflicts: number;
  rejected: number;
  total: number;
}

export interface SyncPullResultSummary {
  appliedCount: number;
  currentServerSequence: number;
  hasMore: boolean;
}

export class SyncManager {
  private static instance: SyncManager;
  private isSyncing = false;
  private syncIntervalId: any = null;
  private listeners: Array<(status: { isSyncing: boolean; lastSyncTime?: string; pendingCount?: number }) => void> = [];

  private constructor() {
    this.initNetworkListeners();
  }

  public static getInstance(): SyncManager {
    if (!SyncManager.instance) {
      SyncManager.instance = new SyncManager();
    }
    return SyncManager.instance;
  }

  public subscribe(callback: (status: { isSyncing: boolean; lastSyncTime?: string; pendingCount?: number }) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  private notify(lastSyncTime?: string, pendingCount?: number) {
    this.listeners.forEach(cb => cb({ isSyncing: this.isSyncing, lastSyncTime, pendingCount }));
  }

  private initNetworkListeners() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('[SyncManager] Network is online. Triggering sync cycle...');
        this.runFullSync().catch(err => console.warn('[SyncManager] Online sync trigger failed:', err));
      });
    }
  }

  public startPeriodicSync(intervalMs: number = 20000) {
    if (this.syncIntervalId) return;
    this.syncIntervalId = setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        this.runFullSync().catch(err => console.warn('[SyncManager] Periodic sync failed:', err));
      }
    }, intervalMs);
  }

  public stopPeriodicSync() {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
  }

  /**
   * Run a full push + pull sync cycle.
   */
  public async runFullSync(): Promise<{ push: SyncPushResultSummary; pull: SyncPullResultSummary }> {
    if (this.isSyncing) {
      console.log('[SyncManager] Sync cycle already running. Skipping.');
      return {
        push: { applied: 0, duplicates: 0, conflicts: 0, rejected: 0, total: 0 },
        pull: { appliedCount: 0, currentServerSequence: 0, hasMore: false }
      };
    }

    this.isSyncing = true;
    this.notify();

    try {
      // 1. Push local mutations
      const pushResult = await this.pushOutboxBatch();

      // 2. Pull server changes
      const pullResult = await this.pullServerChanges();

      const lastSyncTime = new Date().toISOString();
      await updateSyncMetadata({ last_synced_at: lastSyncTime });

      const pendingCount = await db.outbox.where('status').equals('QUEUED').count();
      this.notify(lastSyncTime, pendingCount);

      return { push: pushResult, pull: pullResult };
    } finally {
      this.isSyncing = false;
      this.notify();
    }
  }

  /**
   * Push queued outbox operations to POST /api/v2/sync/push
   */
  public async pushOutboxBatch(batchSize: number = 50): Promise<SyncPushResultSummary> {
    const queuedOps = await getQueuedOutboxOperations(batchSize);
    if (queuedOps.length === 0) {
      return { applied: 0, duplicates: 0, conflicts: 0, rejected: 0, total: 0 };
    }

    const deviceId = await getOrCreateDeviceId();
    const payload = {
      device_id: deviceId,
      operations: queuedOps.map(op => ({
        operation_id: op.operation_id,
        client_sequence: op.client_sequence,
        entity_type: op.entity_type,
        entity_id: op.entity_id,
        operation_type: op.operation_type,
        base_server_version: op.base_server_version ?? null,
        client_timestamp: op.created_at,
        payload: op.payload
      }))
    };

    let summary: SyncPushResultSummary = {
      applied: 0,
      duplicates: 0,
      conflicts: 0,
      rejected: 0,
      total: queuedOps.length
    };

    try {
      const res = await fetch(`${API_BASE_URL}/api/v2/sync/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(`Sync push HTTP error: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      summary.applied = data.applied_count || 0;
      summary.duplicates = data.duplicate_count || 0;
      summary.conflicts = data.conflict_count || 0;
      summary.rejected = data.rejected_count || 0;

      const acksToApply: Array<{ operation_id: string; entity_type: any; entity_id: string; server_version: number }> = [];

      // Process per-operation responses
      for (const opResult of data.results || []) {
        const opId = opResult.operation_id;
        const matchingOutbox = queuedOps.find(o => o.operation_id === opId);
        if (!matchingOutbox) continue;

        if (opResult.status === 'APPLIED' || opResult.status === 'DUPLICATE') {
          acksToApply.push({
            operation_id: opId,
            entity_type: matchingOutbox.entity_type,
            entity_id: matchingOutbox.entity_id,
            server_version: opResult.server_version || 1
          });
        } else if (opResult.status === 'CONFLICT' && opResult.conflict_data) {
          await markOutboxConflict(opId, {
            base_version: opResult.conflict_data.base_server_version ?? matchingOutbox.base_server_version ?? 0,
            server_version: opResult.conflict_data.current_server_version ?? opResult.server_version ?? 0,
            server_payload: opResult.conflict_data.server_payload || {}
          });
        } else if (opResult.status === 'REJECTED') {
          await markOutboxFailed(opId, opResult.error_message || 'Rejected by server');
        }
      }

      if (acksToApply.length > 0) {
        await acknowledgeOutboxOperations(acksToApply);
      }

      return summary;
    } catch (err: any) {
      console.warn('[SyncManager] Failed to push outbox batch:', err);
      return summary;
    }
  }

  /**
   * Pull incremental server changes from GET /api/v2/sync/pull
   */
  public async pullServerChanges(limit: number = 100): Promise<SyncPullResultSummary> {
    const meta = await getSyncMetadata();
    const lastSeq = meta.last_server_sequence || 0;
    const deviceId = meta.device_id;

    let appliedCount = 0;
    let currentServerSeq = lastSeq;
    let hasMore = false;

    try {
      const url = `${API_BASE_URL}/api/v2/sync/pull?since_seq=${lastSeq}&limit=${limit}&device_id=${encodeURIComponent(deviceId)}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Sync pull HTTP error: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      const entries = data.entries || [];
      currentServerSeq = data.current_server_sequence ?? lastSeq;
      hasMore = Boolean(data.has_more);

      if (entries.length > 0) {
        await db.transaction('rw', [db.patients, db.assessments, db.appointments, db.sync_metadata], async () => {
          for (const entry of entries) {
            await this.applyIncomingJournalEntry(entry);
            appliedCount++;
          }
          await updateSyncMetadata({ last_server_sequence: currentServerSeq });
        });
      } else if (currentServerSeq > lastSeq) {
        await updateSyncMetadata({ last_server_sequence: currentServerSeq });
      }

      return {
        appliedCount,
        currentServerSequence: currentServerSeq,
        hasMore
      };
    } catch (err: any) {
      console.warn('[SyncManager] Failed to pull server changes:', err);
      return {
        appliedCount: 0,
        currentServerSequence: lastSeq,
        hasMore: false
      };
    }
  }

  /**
   * Apply incoming journal entry from server to local Dexie table.
   */
  private async applyIncomingJournalEntry(entry: {
    server_sequence: number;
    entity_type: string;
    entity_id: string;
    operation_type: string;
    payload: any;
    server_version: number;
    timestamp: string;
  }) {
    const { entity_type, entity_id, operation_type, payload, server_version } = entry;

    if (entity_type === 'patient') {
      const existing = await db.patients.get(entity_id);
      if (operation_type === 'DELETE') {
        if (existing) {
          await db.patients.update(entity_id, {
            is_deleted: true,
            server_version: server_version,
            sync_state: 'SYNCED',
            synced: true,
            updated_at: new Date().toISOString()
          });
        }
      } else {
        // CREATE or UPDATE
        const patientData: LocalPatient = {
          id: entity_id,
          national_health_id: payload.national_health_id || existing?.national_health_id,
          name: payload.name || existing?.name || '',
          age: Number(payload.age) || existing?.age || 0,
          gender: payload.gender || existing?.gender || '',
          village: payload.village || existing?.village || '',
          phone: payload.phone || existing?.phone || '',
          patient_id: payload.patient_id || existing?.patient_id,
          server_version: server_version,
          local_version: (existing?.local_version ?? 0) + 1,
          is_deleted: Boolean(payload.is_deleted),
          sync_state: 'SYNCED',
          synced: true,
          created_at: payload.created_at || existing?.created_at || new Date().toISOString(),
          updated_at: payload.updated_at || new Date().toISOString()
        };
        await db.patients.put(patientData);
      }
    } else if (entity_type === 'assessment') {
      const existing = await db.assessments.get(entity_id);
      if (operation_type === 'DELETE') {
        if (existing) {
          await db.assessments.update(entity_id, {
            is_deleted: true,
            server_version: server_version,
            sync_state: 'SYNCED',
            synced: true,
            updated_at: new Date().toISOString()
          });
        }
      } else {
        const assessmentData: LocalAssessment = {
          id: entity_id,
          patient_id: payload.patient_id || existing?.patient_id || '',
          patient_name: payload.patient_name || existing?.patient_name,
          village: payload.village || existing?.village,
          symptoms: payload.symptoms || existing?.symptoms || [],
          symptom_duration_days: payload.symptom_duration_days ?? existing?.symptom_duration_days ?? null,
          temperature_f: payload.temperature_f ?? existing?.temperature_f ?? null,
          systolic_bp: payload.systolic_bp ?? existing?.systolic_bp ?? null,
          diastolic_bp: payload.diastolic_bp ?? existing?.diastolic_bp ?? null,
          glucose_mg_dl: payload.glucose_mg_dl ?? existing?.glucose_mg_dl ?? null,
          heart_rate_bpm: payload.heart_rate_bpm ?? existing?.heart_rate_bpm ?? null,
          height_cm: payload.height_cm ?? existing?.height_cm ?? null,
          weight_kg: payload.weight_kg ?? existing?.weight_kg ?? null,
          bmi: payload.bmi ?? existing?.bmi ?? null,
          smoking_status: payload.smoking_status ?? existing?.smoking_status ?? null,
          alcohol_status: payload.alcohol_status ?? existing?.alcohol_status ?? null,
          physical_activity: payload.physical_activity ?? existing?.physical_activity ?? null,
          family_history: payload.family_history || existing?.family_history || [],
          risk_level: payload.risk_level || existing?.risk_level || 'LOW',
          triage_state: payload.triage_state || existing?.triage_state || 'LOW_RISK',
          is_emergency: Boolean(payload.is_emergency),
          short_circuit: Boolean(payload.is_emergency),
          red_flags: payload.red_flags || existing?.red_flags || [],
          uncertainty_state: payload.uncertainty_state || existing?.uncertainty_state || 'COMPLETE',
          risk_score: payload.risk_score ?? existing?.risk_score ?? null,
          likely_conditions: payload.likely_conditions || existing?.likely_conditions || [],
          contributing_factors: payload.contributing_factors || existing?.contributing_factors || [],
          recommended_action: payload.recommended_action || existing?.recommended_action || '',
          referral_status: payload.referral_status || existing?.referral_status || 'NOT_REFERRED',
          server_version: server_version,
          local_version: (existing?.local_version ?? 0) + 1,
          is_deleted: Boolean(payload.is_deleted),
          sync_state: 'SYNCED',
          synced: true,
          workflow_version: payload.workflow_version || existing?.workflow_version || '2.0.0',
          ruleset_version: payload.ruleset_version || existing?.ruleset_version || '2.0.0',
          created_at: payload.created_at || existing?.created_at || new Date().toISOString(),
          updated_at: payload.updated_at || new Date().toISOString()
        };
        await db.assessments.put(assessmentData);
      }
    } else if (entity_type === 'appointment') {
      const existing = await db.appointments.get(entity_id);
      if (operation_type === 'DELETE') {
        if (existing) {
          await db.appointments.update(entity_id, {
            is_deleted: true,
            server_version: server_version,
            sync_state: 'SYNCED',
            synced: true,
            updated_at: new Date().toISOString()
          });
        }
      } else {
        const appointmentData: LocalAppointment = {
          id: entity_id,
          patient_name: payload.patient_name || existing?.patient_name || '',
          patient_phone: payload.patient_phone || existing?.patient_phone || '',
          doctor_name: payload.doctor_name || existing?.doctor_name || '',
          doctor_specialty: payload.doctor_specialty || existing?.doctor_specialty || 'General Physician',
          doctor_address: payload.doctor_address || existing?.doctor_address || '',
          appointment_date: payload.appointment_date || existing?.appointment_date || '',
          appointment_time: payload.appointment_time || existing?.appointment_time || '',
          notes: payload.notes || existing?.notes || '',
          status: payload.status || existing?.status || 'PENDING',
          risk_level: payload.risk_level || existing?.risk_level,
          likely_conditions: payload.likely_conditions || existing?.likely_conditions || [],
          server_version: server_version,
          local_version: (existing?.local_version ?? 0) + 1,
          is_deleted: Boolean(payload.is_deleted),
          sync_state: 'SYNCED',
          synced: true,
          created_at: payload.created_at || existing?.created_at || new Date().toISOString(),
          updated_at: payload.updated_at || new Date().toISOString()
        };
        await db.appointments.put(appointmentData);
      }
    }
  }
}

export const syncManager = SyncManager.getInstance();
