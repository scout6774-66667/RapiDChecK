/**
 * offlineDb.ts — Dexie v4 Durable Local Storage & Outbox Queue
 * =============================================================
 * Implements TASK-004:
 * 1. Dexie Database Version 4 schema migration.
 * 2. Durable Outbox with Operation UUIDs, client sequences, and base server versions.
 * 3. Atomic local transaction boundaries (Domain Record + Outbox Entry in 1 transaction).
 * 4. Soft-delete tombstones and conflict staging.
 * 5. Re-exports canonical clinical evaluator.
 */

import Dexie, { type Table } from 'dexie';
import { evaluateClinicalRisk, WORKFLOW_VERSION, RULESET_VERSION } from '../clinical/evaluator.ts';
import type { TriageState, RiskLevel, UncertaintyState, ReferralStatus, ClinicalResult } from '../clinical/types.ts';

export type SyncState = 'LOCAL' | 'QUEUED' | 'SYNCING' | 'SYNCED' | 'FAILED' | 'CONFLICT';
export type OutboxStatus = 'QUEUED' | 'SENDING' | 'ACKNOWLEDGED' | 'FAILED' | 'CONFLICT';
export type OperationType = 'CREATE' | 'UPDATE' | 'DELETE';
export type EntityType = 'patient' | 'assessment' | 'appointment' | 'referral';

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ─── DOMAIN ENTITY INTERFACES ────────────────────────────────────────────────

export interface LocalPatient {
  id: string; // UUIDv4
  national_health_id?: string;
  name: string;
  age: number;
  gender: string;
  village: string;
  phone: string;
  patient_id?: string;
  server_version: number;
  local_version: number;
  is_deleted: boolean;
  sync_state: SyncState;
  synced?: boolean; // Backward-compatibility flag
  created_at: string;
  updated_at: string;
}

export interface LocalAssessment {
  id: string; // UUIDv4
  patient_id: string;
  patient_name?: string;
  village?: string;
  client_operation_id?: string;
  symptoms: string[];
  symptom_duration_days?: number | null;
  temperature_f?: number | null;
  systolic_bp?: number | null;
  diastolic_bp?: number | null;
  glucose_mg_dl?: number | null;
  heart_rate_bpm?: number | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  bmi?: number | null;
  smoking_status?: string | null;
  alcohol_status?: string | null;
  physical_activity?: string | null;
  family_history: string[];
  risk_level: RiskLevel;
  triage_state: TriageState;
  is_emergency: boolean;
  short_circuit: boolean;
  red_flags: string[];
  uncertainty_state: UncertaintyState;
  risk_score: number | null;
  likely_conditions: string[];
  contributing_factors: string[];
  recommended_action: string;
  referral_status: ReferralStatus;
  server_version: number;
  local_version: number;
  is_deleted: boolean;
  sync_state: SyncState;
  synced?: boolean; // Backward-compatibility flag
  workflow_version: string;
  ruleset_version: string;
  review_state?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface LocalAppointment {
  id: string; // UUIDv4
  patient_name: string;
  patient_phone: string;
  doctor_name: string;
  doctor_specialty: string;
  doctor_address: string;
  appointment_date: string; // ISO "YYYY-MM-DD"
  appointment_time: string; // "10:00 AM"
  notes: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';
  risk_level?: string;
  likely_conditions?: string[];
  server_version: number;
  local_version: number;
  is_deleted: boolean;
  sync_state: SyncState;
  synced?: boolean; // Backward-compatibility flag
  created_at: string;
  updated_at: string;
}

// ─── OUTBOX & SYNC CONTROL INTERFACES ────────────────────────────────────────

export interface OutboxOperation {
  operation_id: string; // UUIDv4
  entity_type: EntityType;
  entity_id: string;
  operation_type: OperationType;
  payload: any;
  base_server_version: number;
  client_sequence: number;
  status: OutboxStatus;
  retry_count: number;
  last_error?: string | null;
  created_at: string;
  updated_at: string;
}

export interface LocalConflict {
  id: string;
  entity_type: EntityType;
  entity_id: string;
  base_version: number;
  server_version: number;
  local_payload: any;
  server_payload: any;
  status: 'PENDING' | 'RESOLVED';
  created_at: string;
}

export interface LocalTombstone {
  id: string;
  entity_type: EntityType;
  entity_id: string;
  deleted_at: string;
  server_version: number;
  sync_state: SyncState;
}

export interface SyncMetadata {
  key: string; // e.g. 'client_sequence', 'last_server_sequence', 'device_id'
  value: string;
  updated_at: string;
}

export interface LocalHealthResourceTag {
  tag_type: string;
  tag_value: string;
}

export interface LocalHealthResourceScope {
  scope_type: string;
  scope_value: string;
}

export interface LocalHealthResource {
  id: string;
  resource_code: string;
  title: string;
  summary: string;
  content: string;
  resource_type: string;
  category_code: string;
  status: string;
  version: string;
  freshness_status: string;
  language: string;
  is_emergency: boolean;
  urgency_level: string;
  source_name: string;
  source_url?: string;
  source_document?: string;
  source_version?: string;
  tags: LocalHealthResourceTag[];
  scopes: LocalHealthResourceScope[];
  created_by: string;
  reviewed_by?: string;
  reviewed_at?: string;
  published_at?: string;
  expires_at?: string;
  last_verified_at?: string;
  change_reason?: string;
  server_version: number;
  is_deleted: boolean;
  created_at: string;
  updated_at?: string;
}

export interface LocalHealthResourceVersion {
  id: string;
  resource_id: string;
  version: string;
  title: string;
  summary: string;
  content: string;
  status: string;
  reviewed_by?: string;
  reviewed_at?: string;
  attestation_hash?: string;
  change_reason?: string;
  created_at: string;
}

export interface LocalHealthResourceCategory {
  id: string;
  code: string;
  name: string;
  parent_code?: string;
  description: string;
  icon: string;
  sort_order: number;
  resource_count: number;
}

// ─── DEXIE DATABASE CLASS DEFINITION ─────────────────────────────────────────

export class RuralHealthDatabase extends Dexie {
  patients!: Table<LocalPatient>;
  assessments!: Table<LocalAssessment>;
  appointments!: Table<LocalAppointment>;
  outbox!: Table<OutboxOperation>;
  conflicts!: Table<LocalConflict>;
  tombstones!: Table<LocalTombstone>;
  sync_metadata!: Table<SyncMetadata>;
  health_resources!: Table<LocalHealthResource>;
  health_resource_versions!: Table<LocalHealthResourceVersion>;

  constructor() {
    super('RuralHealthOfflineDB');

    this.version(1).stores({
      patients: 'id, name, village, phone, synced, created_at',
      assessments: 'id, patient_id, risk_level, referral_status, synced, created_at'
    });

    this.version(2).stores({
      patients: 'id, name, village, phone, synced, created_at',
      assessments: 'id, patient_id, risk_level, referral_status, synced, created_at',
      appointments: 'id, patient_name, doctor_name, appointment_date, status, created_at'
    });

    this.version(3).stores({
      patients: 'id, name, village, phone, synced, created_at',
      assessments: 'id, patient_id, risk_level, referral_status, synced, created_at',
      appointments: 'id, patient_name, doctor_name, appointment_date, status, created_at, synced'
    });

    // Version 4: Comprehensive Durable Outbox & Offline Sync Schema
    this.version(4).stores({
      patients: 'id, national_health_id, name, village, phone, server_version, is_deleted, sync_state, synced, created_at, updated_at',
      assessments: 'id, patient_id, client_operation_id, triage_state, risk_level, referral_status, server_version, is_deleted, sync_state, synced, created_at, updated_at',
      appointments: 'id, patient_name, doctor_name, appointment_date, status, server_version, is_deleted, sync_state, synced, created_at, updated_at',
      outbox: 'operation_id, entity_type, entity_id, operation_type, client_sequence, status, retry_count, created_at, updated_at',
      conflicts: 'id, entity_type, entity_id, status, created_at',
      tombstones: 'id, entity_type, entity_id, sync_state, deleted_at',
      sync_metadata: 'key, updated_at'
    });

    // Version 5: Governed Clinical Health Resources Offline Cache
    this.version(5).stores({
      patients: 'id, national_health_id, name, village, phone, server_version, is_deleted, sync_state, synced, created_at, updated_at',
      assessments: 'id, patient_id, client_operation_id, triage_state, risk_level, referral_status, server_version, is_deleted, sync_state, synced, created_at, updated_at',
      appointments: 'id, patient_name, doctor_name, appointment_date, status, server_version, is_deleted, sync_state, synced, created_at, updated_at',
      outbox: 'operation_id, entity_type, entity_id, operation_type, client_sequence, status, retry_count, created_at, updated_at',
      conflicts: 'id, entity_type, entity_id, status, created_at',
      tombstones: 'id, entity_type, entity_id, sync_state, deleted_at',
      sync_metadata: 'key, updated_at',
      health_resources: 'id, resource_code, category_code, resource_type, status, version, urgency_level, is_emergency, server_version, is_deleted, created_at, updated_at',
      health_resource_versions: 'id, resource_id, version, status, created_at'
    });
  }
}

export const db = new RuralHealthDatabase();

// ─── SEQUENCING & METADATA HELPERS ───────────────────────────────────────────

export async function getNextClientSequence(): Promise<number> {
  const meta = await db.sync_metadata.get('client_sequence');
  const current = meta ? parseInt(meta.value, 10) : 0;
  const next = current + 1;
  await db.sync_metadata.put({
    key: 'client_sequence',
    value: next.toString(),
    updated_at: new Date().toISOString()
  });
  return next;
}

export async function getOrCreateDeviceId(): Promise<string> {
  const meta = await db.sync_metadata.get('device_id');
  if (meta && meta.value) return meta.value;
  const newDeviceId = `device_${generateUUID()}`;
  await db.sync_metadata.put({
    key: 'device_id',
    value: newDeviceId,
    updated_at: new Date().toISOString()
  });
  return newDeviceId;
}

export async function getSyncMetadata(): Promise<{ last_server_sequence: number; device_id: string; last_synced_at?: string }> {
  const seqMeta = await db.sync_metadata.get('last_server_sequence');
  const devMeta = await db.sync_metadata.get('device_id');
  const syncMeta = await db.sync_metadata.get('last_synced_at');

  const deviceId = devMeta?.value || await getOrCreateDeviceId();
  const lastSeq = seqMeta?.value ? parseInt(seqMeta.value, 10) : 0;

  return {
    last_server_sequence: lastSeq,
    device_id: deviceId,
    last_synced_at: syncMeta?.value
  };
}

export async function updateSyncMetadata(updates: {
  last_server_sequence?: number;
  device_id?: string;
  last_synced_at?: string;
}): Promise<void> {
  const now = new Date().toISOString();
  if (updates.last_server_sequence !== undefined) {
    await db.sync_metadata.put({
      key: 'last_server_sequence',
      value: updates.last_server_sequence.toString(),
      updated_at: now
    });
  }
  if (updates.device_id !== undefined) {
    await db.sync_metadata.put({
      key: 'device_id',
      value: updates.device_id,
      updated_at: now
    });
  }
  if (updates.last_synced_at !== undefined) {
    await db.sync_metadata.put({
      key: 'last_synced_at',
      value: updates.last_synced_at,
      updated_at: now
    });
  }
}

// ─── ATOMIC TRANSACTIONAL MUTATION HELPERS (TASK-004) ─────────────────────────

/**
 * Atomically commits a patient record and its outbox CREATE/UPDATE operation.
 */
export async function savePatientAtomic(
  patientData: {
    id?: string;
    national_health_id?: string;
    name: string;
    age: number;
    gender: string;
    village: string;
    phone: string;
    patient_id?: string;
  },
  isNew: boolean = true
): Promise<LocalPatient> {
  const id = patientData.id || generateUUID();
  const now = new Date().toISOString();
  const opId = generateUUID();

  return await db.transaction('rw', [db.patients, db.outbox, db.sync_metadata], async () => {
    const existing = await db.patients.get(id);
    const serverVersion = existing?.server_version ?? 0;
    const localVersion = (existing?.local_version ?? 0) + 1;
    const seq = await getNextClientSequence();

    const record: LocalPatient = {
      ...existing,
      ...patientData,
      id,
      server_version: serverVersion,
      local_version: localVersion,
      is_deleted: false,
      sync_state: 'QUEUED',
      synced: false,
      created_at: existing?.created_at || now,
      updated_at: now
    };

    const outboxOp: OutboxOperation = {
      operation_id: opId,
      entity_type: 'patient',
      entity_id: id,
      operation_type: isNew && !existing ? 'CREATE' : 'UPDATE',
      payload: {
        id: record.id,
        national_health_id: record.national_health_id,
        name: record.name,
        age: record.age,
        gender: record.gender,
        village: record.village,
        phone: record.phone,
        patient_id: record.patient_id
      },
      base_server_version: serverVersion,
      client_sequence: seq,
      status: 'QUEUED',
      retry_count: 0,
      created_at: now,
      updated_at: now
    };

    await db.patients.put(record);
    await db.outbox.put(outboxOp);
    return record;
  });
}

/**
 * Atomically evaluates clinical risk and commits assessment + outbox operation.
 */
export async function saveAssessmentAtomic(
  assessmentInput: {
    id?: string;
    patient_id: string;
    patient_name?: string;
    village?: string;
    symptoms?: string[];
    symptom_duration_days?: number | null;
    temperature_f?: number | null;
    systolic_bp?: number | null;
    diastolic_bp?: number | null;
    glucose_mg_dl?: number | null;
    heart_rate_bpm?: number | null;
    height_cm?: number | null;
    weight_kg?: number | null;
    bmi?: number | null;
    smoking_status?: string | null;
    alcohol_status?: string | null;
    physical_activity?: string | null;
    family_history?: string[];
    notes?: string | null;
  }
): Promise<LocalAssessment> {
  const id = assessmentInput.id || generateUUID();
  const now = new Date().toISOString();
  const opId = generateUUID();

  // 1. Run Canonical Clinical Evaluator
  const clinicalResult: ClinicalResult = evaluateClinicalRisk({
    ...assessmentInput,
    patient_id: assessmentInput.patient_id
  });

  return await db.transaction('rw', [db.assessments, db.outbox, db.sync_metadata], async () => {
    const existing = await db.assessments.get(id);
    const serverVersion = existing?.server_version ?? 0;
    const localVersion = (existing?.local_version ?? 0) + 1;
    const seq = await getNextClientSequence();

    const record: LocalAssessment = {
      id,
      patient_id: assessmentInput.patient_id,
      patient_name: assessmentInput.patient_name,
      village: assessmentInput.village,
      client_operation_id: opId,
      symptoms: assessmentInput.symptoms || [],
      symptom_duration_days: assessmentInput.symptom_duration_days ?? null,
      temperature_f: assessmentInput.temperature_f ?? null,
      systolic_bp: assessmentInput.systolic_bp ?? null,
      diastolic_bp: assessmentInput.diastolic_bp ?? null,
      glucose_mg_dl: assessmentInput.glucose_mg_dl ?? null,
      heart_rate_bpm: assessmentInput.heart_rate_bpm ?? null,
      height_cm: assessmentInput.height_cm ?? null,
      weight_kg: assessmentInput.weight_kg ?? null,
      bmi: assessmentInput.bmi ?? null,
      smoking_status: assessmentInput.smoking_status ?? 'Never',
      alcohol_status: assessmentInput.alcohol_status ?? 'Never',
      physical_activity: assessmentInput.physical_activity ?? 'Moderate',
      family_history: assessmentInput.family_history || [],
      risk_level: clinicalResult.risk_level,
      triage_state: clinicalResult.triage_state,
      is_emergency: clinicalResult.is_emergency,
      short_circuit: clinicalResult.short_circuit,
      red_flags: clinicalResult.red_flags,
      uncertainty_state: clinicalResult.uncertainty_state,
      risk_score: clinicalResult.risk_score,
      likely_conditions: clinicalResult.likely_conditions,
      contributing_factors: clinicalResult.contributing_factors,
      recommended_action: clinicalResult.recommended_action,
      referral_status: clinicalResult.referral_status,
      server_version: serverVersion,
      local_version: localVersion,
      is_deleted: false,
      sync_state: 'QUEUED',
      synced: false,
      workflow_version: WORKFLOW_VERSION,
      ruleset_version: RULESET_VERSION,
      created_at: existing?.created_at || now,
      updated_at: now
    };

    const outboxOp: OutboxOperation = {
      operation_id: opId,
      entity_type: 'assessment',
      entity_id: id,
      operation_type: 'CREATE',
      payload: {
        id: record.id,
        patient_id: record.patient_id,
        symptoms: record.symptoms,
        symptom_duration_days: record.symptom_duration_days,
        temperature_f: record.temperature_f,
        systolic_bp: record.systolic_bp,
        diastolic_bp: record.diastolic_bp,
        glucose_mg_dl: record.glucose_mg_dl,
        heart_rate_bpm: record.heart_rate_bpm,
        height_cm: record.height_cm,
        weight_kg: record.weight_kg,
        bmi: record.bmi,
        smoking_status: record.smoking_status,
        alcohol_status: record.alcohol_status,
        physical_activity: record.physical_activity,
        family_history: record.family_history,
        client_operation_id: opId
      },
      base_server_version: serverVersion,
      client_sequence: seq,
      status: 'QUEUED',
      retry_count: 0,
      created_at: now,
      updated_at: now
    };

    await db.assessments.put(record);
    await db.outbox.put(outboxOp);
    return record;
  });
}

/**
 * Atomically creates/updates an appointment and queues an outbox operation.
 */
export async function saveAppointmentAtomic(
  appointmentData: {
    id?: string;
    patient_name: string;
    patient_phone: string;
    doctor_name: string;
    doctor_specialty?: string;
    doctor_address?: string;
    appointment_date: string;
    appointment_time?: string;
    notes?: string;
    status?: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';
    risk_level?: string;
    likely_conditions?: string[];
  },
  isNew: boolean = true
): Promise<LocalAppointment> {
  const id = appointmentData.id || generateUUID();
  const now = new Date().toISOString();
  const opId = generateUUID();

  return await db.transaction('rw', [db.appointments, db.outbox, db.sync_metadata], async () => {
    const existing = await db.appointments.get(id);
    const serverVersion = existing?.server_version ?? 0;
    const localVersion = (existing?.local_version ?? 0) + 1;
    const seq = await getNextClientSequence();

    const record: LocalAppointment = {
      id,
      patient_name: appointmentData.patient_name,
      patient_phone: appointmentData.patient_phone,
      doctor_name: appointmentData.doctor_name,
      doctor_specialty: appointmentData.doctor_specialty || 'General Physician',
      doctor_address: appointmentData.doctor_address || 'PHC Medical Center',
      appointment_date: appointmentData.appointment_date,
      appointment_time: appointmentData.appointment_time || '10:00 AM',
      notes: appointmentData.notes || '',
      status: appointmentData.status || 'PENDING',
      risk_level: appointmentData.risk_level || 'LOW',
      likely_conditions: appointmentData.likely_conditions || [],
      server_version: serverVersion,
      local_version: localVersion,
      is_deleted: false,
      sync_state: 'QUEUED',
      synced: false,
      created_at: existing?.created_at || now,
      updated_at: now
    };

    const outboxOp: OutboxOperation = {
      operation_id: opId,
      entity_type: 'appointment',
      entity_id: id,
      operation_type: isNew && !existing ? 'CREATE' : 'UPDATE',
      payload: {
        id: record.id,
        patient_name: record.patient_name,
        patient_phone: record.patient_phone,
        doctor_name: record.doctor_name,
        doctor_specialty: record.doctor_specialty,
        doctor_address: record.doctor_address,
        appointment_date: record.appointment_date,
        appointment_time: record.appointment_time,
        notes: record.notes,
        status: record.status,
        risk_level: record.risk_level,
        likely_conditions: record.likely_conditions
      },
      base_server_version: serverVersion,
      client_sequence: seq,
      status: 'QUEUED',
      retry_count: 0,
      created_at: now,
      updated_at: now
    };

    await db.appointments.put(record);
    await db.outbox.put(outboxOp);
    return record;
  });
}

/**
 * Atomically updates referral status and queues an outbox operation.
 */
export async function updateReferralAtomic(
  assessmentId: string,
  newStatus: ReferralStatus
): Promise<LocalAssessment | null> {
  const now = new Date().toISOString();
  const opId = generateUUID();

  return await db.transaction('rw', [db.assessments, db.outbox, db.sync_metadata], async () => {
    const existing = await db.assessments.get(assessmentId);
    if (!existing) return null;

    const serverVersion = existing.server_version;
    const localVersion = existing.local_version + 1;
    const seq = await getNextClientSequence();

    const updated: LocalAssessment = {
      ...existing,
      referral_status: newStatus,
      local_version: localVersion,
      sync_state: 'QUEUED',
      synced: false,
      updated_at: now
    };

    const outboxOp: OutboxOperation = {
      operation_id: opId,
      entity_type: 'referral',
      entity_id: assessmentId,
      operation_type: 'UPDATE',
      payload: {
        assessment_id: assessmentId,
        referral_status: newStatus
      },
      base_server_version: serverVersion,
      client_sequence: seq,
      status: 'QUEUED',
      retry_count: 0,
      created_at: now,
      updated_at: now
    };

    await db.assessments.put(updated);
    await db.outbox.put(outboxOp);
    return updated;
  });
}

/**
 * Soft deletes a patient, records a tombstone, and queues an outbox DELETE op.
 */
export async function deletePatientAtomic(patientId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const opId = generateUUID();

  return await db.transaction('rw', [db.patients, db.tombstones, db.outbox, db.sync_metadata], async () => {
    const existing = await db.patients.get(patientId);
    if (!existing) return false;

    const serverVersion = existing.server_version;
    const seq = await getNextClientSequence();

    // 1. Soft-delete patient
    await db.patients.update(patientId, {
      is_deleted: true,
      sync_state: 'QUEUED',
      synced: false,
      updated_at: now
    });

    // 2. Add tombstone
    await db.tombstones.put({
      id: generateUUID(),
      entity_type: 'patient',
      entity_id: patientId,
      deleted_at: now,
      server_version: serverVersion,
      sync_state: 'QUEUED'
    });

    // 3. Queue Outbox DELETE op
    await db.outbox.put({
      operation_id: opId,
      entity_type: 'patient',
      entity_id: patientId,
      operation_type: 'DELETE',
      payload: { id: patientId },
      base_server_version: serverVersion,
      client_sequence: seq,
      status: 'QUEUED',
      retry_count: 0,
      created_at: now,
      updated_at: now
    });

    return true;
  });
}

/**
 * Soft deletes an appointment, records a tombstone, and queues an outbox DELETE op.
 */
export async function deleteAppointmentAtomic(appointmentId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const opId = generateUUID();

  return await db.transaction('rw', [db.appointments, db.tombstones, db.outbox, db.sync_metadata], async () => {
    const existing = await db.appointments.get(appointmentId);
    if (!existing) return false;

    const serverVersion = existing.server_version;
    const seq = await getNextClientSequence();

    await db.appointments.update(appointmentId, {
      is_deleted: true,
      sync_state: 'QUEUED',
      synced: false,
      updated_at: now
    });

    await db.tombstones.put({
      id: generateUUID(),
      entity_type: 'appointment',
      entity_id: appointmentId,
      deleted_at: now,
      server_version: serverVersion,
      sync_state: 'QUEUED'
    });

    await db.outbox.put({
      operation_id: opId,
      entity_type: 'appointment',
      entity_id: appointmentId,
      operation_type: 'DELETE',
      payload: { id: appointmentId },
      base_server_version: serverVersion,
      client_sequence: seq,
      status: 'QUEUED',
      retry_count: 0,
      created_at: now,
      updated_at: now
    });

    return true;
  });
}

// ─── OUTBOX SYNC LIFECYCLE HELPERS ──────────────────────────────────────────

/**
 * Retrieves pending queued outbox operations in strict monotonic sequence order.
 */
export async function getQueuedOutboxOperations(limit: number = 50): Promise<OutboxOperation[]> {
  return await db.outbox
    .where('status')
    .equals('QUEUED')
    .sortBy('client_sequence')
    .then(items => items.slice(0, limit));
}

/**
 * Acknowledges processed outbox operations, updates local domain server_version & marks SYNCED.
 */
export async function acknowledgeOutboxOperations(
  acks: Array<{ operation_id: string; entity_type: EntityType; entity_id: string; server_version: number }>
): Promise<void> {
  await db.transaction('rw', [db.patients, db.assessments, db.appointments, db.outbox, db.tombstones], async () => {
    for (const ack of acks) {
      await db.outbox.update(ack.operation_id, {
        status: 'ACKNOWLEDGED',
        updated_at: new Date().toISOString()
      });

      if (ack.entity_type === 'patient') {
        const p = await db.patients.get(ack.entity_id);
        if (p) {
          await db.patients.update(ack.entity_id, {
            server_version: ack.server_version,
            sync_state: 'SYNCED',
            synced: true
          });
        }
      } else if (ack.entity_type === 'assessment' || ack.entity_type === 'referral') {
        const a = await db.assessments.get(ack.entity_id);
        if (a) {
          await db.assessments.update(ack.entity_id, {
            server_version: ack.server_version,
            sync_state: 'SYNCED',
            synced: true
          });
        }
      } else if (ack.entity_type === 'appointment') {
        const appt = await db.appointments.get(ack.entity_id);
        if (appt) {
          await db.appointments.update(ack.entity_id, {
            server_version: ack.server_version,
            sync_state: 'SYNCED',
            synced: true
          });
        }
      }
    }
  });
}

/**
 * Marks outbox operation as failed with error details and increments retry count.
 */
export async function markOutboxFailed(operationId: string, errorMessage: string): Promise<void> {
  const op = await db.outbox.get(operationId);
  if (!op) return;
  await db.outbox.update(operationId, {
    status: 'FAILED',
    retry_count: (op.retry_count || 0) + 1,
    last_error: errorMessage,
    updated_at: new Date().toISOString()
  });
}

/**
 * Records a conflict and stages it in the conflicts table.
 */
export async function markOutboxConflict(
  operationId: string,
  conflictData: {
    base_version: number;
    server_version: number;
    server_payload: any;
  }
): Promise<void> {
  const op = await db.outbox.get(operationId);
  if (!op) return;

  await db.transaction('rw', [db.outbox, db.conflicts], async () => {
    await db.outbox.update(operationId, {
      status: 'CONFLICT',
      last_error: `Conflict with server version ${conflictData.server_version}`,
      updated_at: new Date().toISOString()
    });

    await db.conflicts.put({
      id: generateUUID(),
      entity_type: op.entity_type,
      entity_id: op.entity_id,
      base_version: conflictData.base_version,
      server_version: conflictData.server_version,
      local_payload: op.payload,
      server_payload: conflictData.server_payload,
      status: 'PENDING',
      created_at: new Date().toISOString()
    });
  });
}

// ─── ACTIVE (NON-DELETED) FILTER HELPERS ─────────────────────────────────────

export async function getActivePatients(): Promise<LocalPatient[]> {
  return await db.patients.filter(p => !p.is_deleted).toArray();
}

export async function getActiveAssessments(): Promise<LocalAssessment[]> {
  return await db.assessments.filter(a => !a.is_deleted).toArray();
}

export async function getActiveAppointments(): Promise<LocalAppointment[]> {
  return await db.appointments.filter(a => !a.is_deleted).toArray();
}

// Re-export canonical evaluator wrapper
export function evaluateOfflineRisk(data: Partial<LocalAssessment>): ClinicalResult {
  return evaluateClinicalRisk({
    patient_id: data.patient_id || '',
    symptoms: data.symptoms || [],
    symptom_duration_days: data.symptom_duration_days,
    temperature_f: data.temperature_f,
    systolic_bp: data.systolic_bp,
    diastolic_bp: data.diastolic_bp,
    glucose_mg_dl: data.glucose_mg_dl,
    heart_rate_bpm: data.heart_rate_bpm,
    height_cm: data.height_cm,
    weight_kg: data.weight_kg,
    bmi: data.bmi,
    smoking_status: data.smoking_status,
    alcohol_status: data.alcohol_status,
    physical_activity: data.physical_activity,
    family_history: data.family_history || []
  });
}
