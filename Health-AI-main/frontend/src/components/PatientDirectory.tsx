import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users, Search, MapPin, Phone, Pencil, Trash2, X,
  AlertTriangle, CheckCircle2, ChevronRight, Loader2,
  Calendar, Activity, ShieldAlert, RefreshCw, UserCog,
  Thermometer, Heart, Droplets, Stethoscope, WifiOff, Clock,
  Lock, ShieldCheck, ChevronDown
} from 'lucide-react';
import { translations, type Language } from '../i18n/translations';
import { 
  db, 
  type LocalPatient, 
  type LocalAssessment,
  savePatientAtomic,
  saveAssessmentAtomic,
  deletePatientAtomic,
  getActivePatients,
  getActiveAssessments
} from '../db/offlineDb';
import { apiFetch } from '../api/apiConfig';
import { useAuth, type UserRole } from '../auth/AuthContext';

interface PatientDirectoryProps {
  lang: Language;
  isOnline: boolean;
}

interface EditPatientForm {
  name: string;
  age: string;
  gender: string;
  village: string;
  phone: string;
}

interface EditAssessmentForm {
  symptoms: string;              // comma-separated
  symptom_duration_days: string;
  temperature_f: string;
  systolic_bp: string;
  diastolic_bp: string;
  glucose_mg_dl: string;
  heart_rate_bpm: string;
  height_cm: string;
  weight_kg: string;
  smoking_status: string;
  alcohol_status: string;
  physical_activity: string;
  family_history: string;        // comma-separated
}

function Toast({ msg, type }: { msg: string; type: 'success' | 'error' | 'info' }) {
  return (
    <div className={`fixed top-5 left-1/2 -translate-x-1/2 z-[99999] px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 text-sm font-bold animate-fade-in pointer-events-none ${
      type === 'success' 
        ? 'bg-emerald-600 text-white' 
        : type === 'info' 
        ? 'bg-amber-600 text-white' 
        : 'bg-rose-600 text-white'
    }`}>
      {type === 'success' ? (
        <CheckCircle2 className="w-4 h-4 shrink-0" />
      ) : type === 'info' ? (
        <Clock className="w-4 h-4 shrink-0" />
      ) : (
        <AlertTriangle className="w-4 h-4 shrink-0" />
      )}
      {msg}
    </div>
  );
}

// ─── FORM INPUT HELPERS ───────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const inp = "w-full text-sm font-semibold px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-400 outline-none bg-white transition-all";
const sel = `${inp} cursor-pointer`;

// ─── DUPLICATE DETECTION TYPES & NORMALIZERS ─────────────────────────────────

export type DuplicateMatchKind =
  | 'PROBABLE_DUPLICATE'         // Both normalized name AND normalized phone match
  | 'SHARED_PHONE'              // Same phone, different name (Household mobile)
  | 'SHARED_NAME';              // Same name, different phone/village (Common name)

export interface MatchedRecordSummary {
  id: string;
  patient_id?: string;
  name: string;
  age: number;
  gender: string;
  village: string;
  phone: string;
  facility_id?: string | null;
}

export interface DuplicateAnalysisResult {
  matchKind: DuplicateMatchKind;
  matches: MatchedRecordSummary[];
  primaryReason: string;
}

export function normalizePhoneNumber(rawPhone: string): string {
  if (!rawPhone) return '';
  const digits = rawPhone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return digits;
}

export function normalizePatientName(rawName: string): string {
  if (!rawName) return '';
  return rawName
    .toLowerCase()
    .trim()
    .replace(/^(smt\.|srimati|mrs\.|mr\.|ms\.|shri|dr\.)\s+/i, '')
    .replace(/\s+/g, ' ');
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export const PatientDirectory: React.FC<PatientDirectoryProps> = ({ lang, isOnline }) => {
  const t = translations[lang];
  const { user, hasPermission, switchUser } = useAuth();
  const canDelete = hasPermission('patients:delete') || user?.role === 'SYSTEM_ADMIN' || user?.role === 'PHC_DOCTOR';

  const [patients,    setPatients]    = useState<LocalPatient[]>([]);
  const [assessments, setAssessments] = useState<LocalAssessment[]>([]);
  const [searchTerm,  setSearchTerm]  = useState('');
  const [isLoading,   setIsLoading]   = useState(true);
  const [expandedDupId, setExpandedDupId] = useState<string | null>(null);

  // ── Panels ──────────────────────────────────────────────────────────────────
  const [viewPatient,    setViewPatient]    = useState<LocalPatient | null>(null);
  const [editingPatient, setEditingPatient] = useState<LocalPatient | null>(null);
  const [deletingPatient, setDeletingPatient] = useState<LocalPatient | null>(null);

  // Edit forms
  const [pForm,  setPForm]  = useState<EditPatientForm>({ name: '', age: '', gender: 'Male', village: '', phone: '' });
  const [aForms, setAForms] = useState<Record<string, EditAssessmentForm>>({});
  const [activeAssessmentEdit, setActiveAssessmentEdit] = useState<string | null>(null);

  const [isSaving,  setIsSaving]  = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [formError,  setFormError]  = useState('');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ─── LOAD DATA ──────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setIsLoading(true);
    if (isOnline) {
      try {
        const [pRes, aRes] = await Promise.all([
          apiFetch('/api/patients', { timeoutMs: 8000 }),
          apiFetch('/api/assessments', { timeoutMs: 8000 })
        ]);
        if (pRes.ok && aRes.ok) {
          const [p, a] = await Promise.all([pRes.json(), aRes.json()]);
          setPatients(p.filter((pt: LocalPatient) => !pt.is_deleted));
          setAssessments(a.filter((at: LocalAssessment) => !at.is_deleted));
          setIsLoading(false);
          return;
        }
      } catch { /* fall to IndexedDB */ }
    }
    const [p, a] = await Promise.all([getActivePatients(), getActiveAssessments()]);
    setPatients(p);
    setAssessments(a);
    setIsLoading(false);
  }, [isOnline]);

  useEffect(() => { loadData(); }, [loadData]);

  // Group patients by phone or normalized name to detect potential duplicate registrations
  const duplicateMap = useMemo(() => {
    const phoneCounts = new Map<string, number>();
    const nameCounts = new Map<string, number>();
    patients.forEach(p => {
      const cleanPhone = normalizePhoneNumber(p.phone) || p.phone.replace(/\D/g, '');
      if (cleanPhone.length >= 6) {
        phoneCounts.set(cleanPhone, (phoneCounts.get(cleanPhone) || 0) + 1);
      }
      const cleanName = normalizePatientName(p.name) || p.name.trim().toLowerCase();
      if (cleanName.length >= 3) {
        nameCounts.set(cleanName, (nameCounts.get(cleanName) || 0) + 1);
      }
    });

    const dupSet = new Set<string>();
    patients.forEach(p => {
      const cleanPhone = normalizePhoneNumber(p.phone) || p.phone.replace(/\D/g, '');
      const cleanName = normalizePatientName(p.name) || p.name.trim().toLowerCase();
      if ((cleanPhone.length >= 6 && (phoneCounts.get(cleanPhone) || 0) > 1) ||
          (cleanName.length >= 3 && (nameCounts.get(cleanName) || 0) > 1)) {
        dupSet.add(p.id);
      }
    });
    return dupSet;
  }, [patients]);

  // Refined clinical duplicate and shared contact analysis
  const duplicateAnalysisMap = useMemo(() => {
    const analysis = new Map<string, DuplicateAnalysisResult>();

    patients.forEach(currentPatient => {
      const curPhone = normalizePhoneNumber(currentPatient.phone);
      const curName = normalizePatientName(currentPatient.name);

      const exactMatches: MatchedRecordSummary[] = [];
      const sharedPhoneMatches: MatchedRecordSummary[] = [];
      const sharedNameMatches: MatchedRecordSummary[] = [];

      patients.forEach(other => {
        if (other.id === currentPatient.id) return;

        const otherPhone = normalizePhoneNumber(other.phone);
        const otherName = normalizePatientName(other.name);

        const isSamePhone = curPhone.length >= 10 && otherPhone.length >= 10 && curPhone === otherPhone;
        const isSameName = curName.length >= 3 && otherName.length >= 3 && curName === otherName;

        const summary: MatchedRecordSummary = {
          id: other.id,
          patient_id: other.patient_id,
          name: other.name,
          age: other.age,
          gender: other.gender,
          village: other.village,
          phone: other.phone,
          facility_id: other.facility_id
        };

        if (isSamePhone && isSameName) {
          exactMatches.push(summary);
        } else if (isSamePhone && !isSameName) {
          sharedPhoneMatches.push(summary);
        } else if (isSameName && !isSamePhone) {
          sharedNameMatches.push(summary);
        }
      });

      if (exactMatches.length > 0) {
        analysis.set(currentPatient.id, {
          matchKind: 'PROBABLE_DUPLICATE',
          matches: exactMatches,
          primaryReason: `Probable duplicate registration. Both patient name ('${currentPatient.name}') and mobile number (${currentPatient.phone}) match existing record(s).`
        });
      } else if (sharedPhoneMatches.length > 0) {
        analysis.set(currentPatient.id, {
          matchKind: 'SHARED_PHONE',
          matches: sharedPhoneMatches,
          primaryReason: `Shared household mobile number (${currentPatient.phone}). Multiple family members commonly share one mobile phone in rural households. Requires clinical verification of patient identity.`
        });
      } else if (sharedNameMatches.length > 0) {
        analysis.set(currentPatient.id, {
          matchKind: 'SHARED_NAME',
          matches: sharedNameMatches,
          primaryReason: `Shared patient name ('${currentPatient.name}'). Common names frequently occur across villages. Verify age, gender, and village to distinguish patients.`
        });
      }
    });

    return analysis;
  }, [patients]);

  // Deterministically sorted assessments per patient (timestamp desc, id tie-breaker)
  const getSortedPatientAssessments = useCallback((patientId: string) => {
    return assessments
      .filter(a => a.patient_id === patientId)
      .sort((a, b) => {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        if (timeB !== timeA) return timeB - timeA;
        return String(b.id).localeCompare(String(a.id));
      });
  }, [assessments]);

  const filtered = patients.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.village.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.phone.includes(searchTerm) ||
    (p.patient_id && p.patient_id.toLowerCase().includes(searchTerm.toLowerCase())) ||
    p.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // ─── OPEN EDIT PATIENT ──────────────────────────────────────────────────────
  const openEditPatient = (p: LocalPatient, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setFormError('');
    setEditingPatient(p);
    setActiveAssessmentEdit(null);
    setPForm({ name: p.name, age: String(p.age), gender: p.gender, village: p.village, phone: p.phone });

    // Pre-fill assessment forms
    const patientAssessments = assessments.filter(a => a.patient_id === p.id);
    const forms: Record<string, EditAssessmentForm> = {};
    patientAssessments.forEach(a => {
      forms[a.id] = {
        symptoms:              (a.symptoms || []).join(', '),
        symptom_duration_days: a.symptom_duration_days != null ? String(a.symptom_duration_days) : '',
        temperature_f:         a.temperature_f != null ? String(a.temperature_f) : '',
        systolic_bp:           a.systolic_bp != null ? String(a.systolic_bp) : '',
        diastolic_bp:          a.diastolic_bp != null ? String(a.diastolic_bp) : '',
        glucose_mg_dl:         a.glucose_mg_dl != null ? String(a.glucose_mg_dl) : '',
        heart_rate_bpm:        a.heart_rate_bpm != null ? String(a.heart_rate_bpm) : '',
        height_cm:             a.height_cm != null ? String(a.height_cm) : '',
        weight_kg:             a.weight_kg != null ? String(a.weight_kg) : '',
        smoking_status:        a.smoking_status ?? 'Never',
        alcohol_status:        a.alcohol_status ?? 'Never',
        physical_activity:     a.physical_activity ?? 'Moderate',
        family_history:        (a.family_history || []).join(', ')
      };
    });
    setAForms(forms);
  };

  // ─── SAVE EDIT ──────────────────────────────────────────────────────────────
  const saveEdit = async () => {
    if (!editingPatient) return;
    if (!pForm.name.trim() || !pForm.village.trim() || !pForm.phone.trim()) {
      setFormError('Name, village, and phone are required.'); return;
    }
    const age = parseInt(pForm.age, 10);
    if (isNaN(age) || age < 1 || age > 120) {
      setFormError('Please enter a valid age (1–120).'); return;
    }

    setIsSaving(true); setFormError('');

    try {
      // 1. Atomically save patient + queue outbox UPDATE operation
      const savedPatient = await savePatientAtomic({
        id: editingPatient.id,
        national_health_id: editingPatient.national_health_id,
        name: pForm.name.trim(),
        age,
        gender: pForm.gender,
        village: pForm.village.trim(),
        phone: pForm.phone.trim(),
        patient_id: editingPatient.patient_id
      }, false);

      // 2. Save any edited assessments atomically with clinical re-evaluation
      for (const [aId, af] of Object.entries(aForms)) {
        const origAssessment = assessments.find(a => a.id === aId);
        if (!origAssessment) continue;
        await saveAssessmentAtomic({
          id: aId,
          patient_id: editingPatient.id,
          patient_name: savedPatient.name,
          village: savedPatient.village,
          symptoms: af.symptoms.split(',').map(s => s.trim()).filter(Boolean),
          symptom_duration_days: af.symptom_duration_days !== '' && !isNaN(parseInt(af.symptom_duration_days)) ? parseInt(af.symptom_duration_days) : null,
          temperature_f: af.temperature_f !== '' && !isNaN(parseFloat(af.temperature_f)) ? parseFloat(af.temperature_f) : null,
          systolic_bp: af.systolic_bp !== '' && !isNaN(parseInt(af.systolic_bp)) ? parseInt(af.systolic_bp) : null,
          diastolic_bp: af.diastolic_bp !== '' && !isNaN(parseInt(af.diastolic_bp)) ? parseInt(af.diastolic_bp) : null,
          glucose_mg_dl: af.glucose_mg_dl !== '' && !isNaN(parseFloat(af.glucose_mg_dl)) ? parseFloat(af.glucose_mg_dl) : null,
          heart_rate_bpm: af.heart_rate_bpm !== '' && !isNaN(parseInt(af.heart_rate_bpm)) ? parseInt(af.heart_rate_bpm) : null,
          height_cm: af.height_cm !== '' && !isNaN(parseFloat(af.height_cm)) ? parseFloat(af.height_cm) : null,
          weight_kg: af.weight_kg !== '' && !isNaN(parseFloat(af.weight_kg)) ? parseFloat(af.weight_kg) : null,
          smoking_status: af.smoking_status,
          alcohol_status: af.alcohol_status,
          physical_activity: af.physical_activity,
          family_history: af.family_history.split(',').map(s => s.trim()).filter(Boolean)
        });
      }

      // 3. Push to backend if online
      if (isOnline) {
        try {
          await apiFetch(`/api/patients/${encodeURIComponent(editingPatient.id)}`, {
            method: 'PUT',
            body: JSON.stringify({
              id: savedPatient.id,
              name: savedPatient.name,
              age: savedPatient.age,
              gender: savedPatient.gender,
              village: savedPatient.village,
              phone: savedPatient.phone
            }),
            timeoutMs: 8000,
          });
          await db.patients.update(editingPatient.id, { sync_state: 'SYNCED', synced: true });
        } catch { /* sync later via outbox */ }
      }

      // 4. Update React state
      setPatients(prev => prev.map(p => p.id === editingPatient.id ? savedPatient : p));
      const activeA = await getActiveAssessments();
      setAssessments(activeA);

      setEditingPatient(null);
      showToast(`✓ ${savedPatient.name}'s record updated.`);
    } catch {
      setFormError('Save failed. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // ─── DELETE ─────────────────────────────────────────────────────────────────
  const confirmDelete = async () => {
    if (!deletingPatient) return;

    if (!canDelete) {
      showToast('Permission denied: Patient record deletion requires PHC Doctor or Administrator authorization.', 'error');
      setDeletingPatient(null);
      return;
    }

    if (user?.role !== 'SYSTEM_ADMIN' && user?.facility_id && deletingPatient.facility_id && deletingPatient.facility_id !== user.facility_id) {
      showToast(`Access denied: Patient is registered to facility '${deletingPatient.facility_id}'. You are authorized for '${user.facility_id}'.`, 'error');
      setDeletingPatient(null);
      return;
    }

    setIsDeleting(true);
    let serverDeleteConfirmed = false;
    let localDeleteSuccess = false;

    // ── Step 1: Delete from backend FIRST (when online) ──────────────────────
    let backendNetworkError = false;
    if (isOnline) {
      try {
        const patientTargetId = deletingPatient.id || deletingPatient.patient_id || '';
        const res = await apiFetch(`/api/patients/${encodeURIComponent(patientTargetId)}`, {
          method: 'DELETE',
          timeoutMs: 10000,
        });

        if (res.ok) {
          serverDeleteConfirmed = true;
        } else {
          const errorData = await res.json().catch(() => ({}));
          const errorDetail = errorData.detail || '';

          if (res.status === 401) {
            showToast('Authentication session expired. Please sign in again.', 'error');
            setIsDeleting(false);
            return;
          } else if (res.status === 403) {
            showToast(errorDetail || 'Permission denied: Deleting patient records requires PHC Doctor or Administrator authorization.', 'error');
            setIsDeleting(false);
            return;
          } else if (res.status === 404) {
            // Patient was already removed or not found on server — safe to proceed with local cleanup
            serverDeleteConfirmed = true;
            showToast('Patient record not found on server or already archived. Local directory updated.', 'info');
          } else if (res.status >= 500) {
            showToast('Server database error during deletion. The record was not deleted.', 'error');
            setIsDeleting(false);
            return;
          } else {
            showToast(errorDetail || `Deletion rejected by server (HTTP ${res.status}).`, 'error');
            setIsDeleting(false);
            return;
          }
        }
      } catch (networkErr: any) {
        backendNetworkError = true;
        console.warn('Backend unreachable — queuing offline outbox tombstone:', networkErr);
      }
    }

    // ── Step 2: Atomic Soft-Delete + Tombstone + Outbox in IndexedDB ───────────
    try {
      localDeleteSuccess = await deletePatientAtomic(deletingPatient.id);
    } catch (err) {
      console.error('IndexedDB atomic delete error:', err);
      showToast('Local database deletion failed. Please try again.', 'error');
      setIsDeleting(false);
      return;
    }

    // ── Step 3: Update React state only after confirmed deletion ──────────────
    if (localDeleteSuccess || serverDeleteConfirmed) {
      const deletedId = deletingPatient.id;
      const patientName = deletingPatient.name;

      setPatients(prev => prev.filter(p => p.id !== deletedId));
      setAssessments(prev => prev.filter(a => a.patient_id !== deletedId));

      if (viewPatient?.id === deletedId) setViewPatient(null);
      if (editingPatient?.id === deletedId) setEditingPatient(null);

      setDeletingPatient(null);
      setIsDeleting(false);

      if (isOnline && serverDeleteConfirmed) {
        showToast(`✓ Clinical record for ${patientName} archived on server and locally.`, 'success');
      } else if (backendNetworkError) {
        showToast('Backend unavailable. Deletion has been safely queued offline for synchronization.', 'info');
      } else {
        showToast(`Offline: Deletion for ${patientName} safely queued in outbox. Will sync when reconnected.`, 'info');
      }
    } else {
      setIsDeleting(false);
      showToast('Could not delete patient record. Please try again.', 'error');
    }
  };

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* Offline Warning Banner */}
      {!isOnline && (
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-5 py-3 rounded-2xl flex items-center gap-3 shadow-md">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <WifiOff className="w-5 h-5" />
          </div>
          <div>
            <p className="font-black text-sm">Offline Mode</p>
            <p className="text-xs font-medium text-white/80">Patient data saved locally. Changes sync when connection restores.</p>
          </div>
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div>
          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <Users className="w-7 h-7 text-emerald-600" />
            {t.rolePatients}
          </h2>
          <p className="text-xs text-slate-500 font-semibold mt-1">
            {patients.length} registered ·{' '}
            <span className="font-black text-indigo-700">IndexedDB</span>
            {isOnline && <> + <span className="font-black text-emerald-700">SQLite backend</span></>}
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button onClick={loadData} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center shrink-0" title="Reload">
            <RefreshCw className="w-4 h-4 text-slate-600" />
          </button>
          <div className="relative flex-1 sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text" placeholder={t.searchVillage} value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full text-xs font-semibold pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
        </div>
      </div>

      {/* ── Active User Role & Facility Control Bar ──────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 text-xs transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 flex items-center justify-center text-teal-700 dark:text-teal-300 font-black shrink-0">
            <UserCog className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-slate-900 dark:text-slate-100">{user?.full_name || 'Dr. Rajesh Sharma, MBBS'}</span>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
                {user?.role || 'PHC_DOCTOR'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
              Assigned Facility: <span className="font-bold text-teal-700 dark:text-teal-400">{user?.facility_id || 'PHC_SONPUR'}</span>
              {user?.license_number ? ` · Reg: ${user.license_number}` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Authorization Status Pill */}
          {canDelete ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Deletion Authorized {user?.role === 'SYSTEM_ADMIN' ? '(Global)' : `(Facility: ${user?.facility_id || 'PHC_SONPUR'})`}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-bold" title="Frontline health workers cannot delete clinical patient records">
              <Lock className="w-3.5 h-3.5 text-amber-600" />
              <span>Deletion Restricted ({user?.role === 'ASHA_WORKER' ? 'ASHA Field Worker: Screen Only' : 'Read-Only Role'})</span>
            </div>
          )}

          {/* Quick Role Switcher */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-700/60 px-2 py-1 rounded-xl border border-slate-200 dark:border-slate-600 text-xs">
            <span className="text-[10px] font-bold text-slate-500">Switch Role:</span>
            <select
              value={user?.role || 'PHC_DOCTOR'}
              onChange={async (e) => {
                const target = e.target.value as UserRole;
                await switchUser(target);
                showToast(`Switched active role to ${target}`, 'info');
              }}
              className="text-xs font-extrabold px-2 py-0.5 bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-300 rounded-lg shadow-xs border border-slate-200 dark:border-slate-600 outline-none cursor-pointer"
            >
              <option value="PHC_DOCTOR">PHC Doctor (Dr. Sharma)</option>
              <option value="ASHA_WORKER">ASHA Worker (Anita Roy)</option>
              <option value="DISTRICT_OFFICER">District Officer (Dr. Patel)</option>
              <option value="SYSTEM_ADMIN">System Admin (Central Ops)</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Storage info banner ──────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl px-5 py-3.5 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-xs font-semibold shadow-lg">
        <span className="text-indigo-300 font-black text-[10px] uppercase tracking-widest">📦 Data Saved In:</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" /><b className="text-white">IndexedDB</b> — browser, offline-capable</span>
        <span className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400 animate-pulse'}`} /><b className="text-white">SQLite backend</b> — {isOnline ? 'synced live' : 'OFFLINE — syncs when connected'}</span>
        <span className="text-indigo-400 ml-auto text-[10px]">Delete removes from BOTH simultaneously</span>
      </div>

      {/* ── Loading skeletons ────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="bg-white p-5 rounded-3xl border border-slate-100 animate-pulse space-y-3">
              <div className="flex justify-between"><div className="h-4 bg-slate-200 rounded w-1/2" /><div className="h-5 w-16 bg-slate-100 rounded-full" /></div>
              <div className="h-3 bg-slate-100 rounded w-2/3" /><div className="h-3 bg-slate-100 rounded w-1/2" />
              <div className="flex justify-end gap-2 pt-2"><div className="h-7 w-16 bg-slate-100 rounded-xl" /><div className="h-7 w-16 bg-slate-100 rounded-xl" /></div>
            </div>
          ))}
        </div>
      )}

      {/* ── Patient Cards ────────────────────────────────────────────────────── */}
      {!isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
          {filtered.length > 0 ? filtered.map(patient => {
            const sortedAssessments = getSortedPatientAssessments(patient.id);
            const latest = sortedAssessments[0];
            const isPotentialDuplicate = duplicateMap.has(patient.id);
            const displayId = patient.patient_id || patient.id.slice(0, 8).toUpperCase();

            return (
              <div key={patient.id} onClick={() => setViewPatient(patient)}
                className="bg-white dark:bg-slate-800 p-5 rounded-3xl shadow-sm hover:shadow-md border border-slate-100 dark:border-slate-700 hover:border-emerald-200 dark:hover:border-emerald-700 transition-all cursor-pointer">
                {/* Name + ID + Risk badge */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="font-extrabold text-base text-slate-900 truncate">{patient.name}</h3>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                        {displayId}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">{patient.age} yrs · {patient.gender}</p>
                  </div>
                  {latest ? (
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black shrink-0 ml-2 border ${
                      latest.risk_level === 'HIGH' || latest.risk_level === 'EMERGENCY' || latest.triage_state === 'EMERGENCY'
                        ? 'bg-rose-100 text-rose-800 border-rose-300'
                        : latest.risk_level === 'MODERATE'
                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                        : latest.risk_level === 'LOW' && latest.uncertainty_state !== 'INSUFFICIENT_DATA'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : 'bg-purple-100 text-purple-800 border-purple-300'}`}>
                      {latest.uncertainty_state === 'INSUFFICIENT_DATA'
                        ? 'NEEDS REVIEW'
                        : latest.risk_level === 'INSUFFICIENT_DATA' ? 'NEEDS REVIEW' : latest.risk_level}
                    </span>
                  ) : (
                    <span className="bg-slate-100 text-slate-600 border border-slate-300 px-2.5 py-1 rounded-full text-[10px] font-bold ml-2">Unassessed</span>
                  )}
                </div>

                {/* Refined Clinical Duplicate & Contact Verification Notice */}
                {isPotentialDuplicate && (() => {
                  const dupAnalysis = duplicateAnalysisMap.get(patient.id);
                  const isExpanded = expandedDupId === patient.id;

                  if (!dupAnalysis) {
                    return (
                      <div className="mb-2.5 flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl text-[10px] font-bold">
                        <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                        <span className="truncate">Potential Duplicate (matches phone or name)</span>
                      </div>
                    );
                  }

                  const isProbable = dupAnalysis.matchKind === 'PROBABLE_DUPLICATE';
                  const isPhone = dupAnalysis.matchKind === 'SHARED_PHONE';

                  return (
                    <div className="mb-2.5 space-y-1.5" onClick={e => e.stopPropagation()}>
                      <div
                        onClick={() => setExpandedDupId(isExpanded ? null : patient.id)}
                        className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl text-[10px] font-bold border transition-all cursor-pointer ${
                          isProbable
                            ? 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100'
                            : isPhone
                            ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                            : 'bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100'
                        }`}
                        title="Click to inspect potential matches and context"
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          {isProbable ? (
                            <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
                          ) : isPhone ? (
                            <Phone className="w-3 h-3 text-amber-600 shrink-0" />
                          ) : (
                            <Users className="w-3 h-3 text-indigo-600 shrink-0" />
                          )}
                          <span className="truncate">
                            {isProbable
                              ? '⚠️ Probable Duplicate (Name & Phone Match)'
                              : isPhone
                              ? `📞 Shared Household Phone (${dupAnalysis.matches.length} other)`
                              : `👤 Common Name Match (${dupAnalysis.matches.length} other)`}
                          </span>
                        </div>
                        <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>

                      {/* Expandable Context & Potential Matches Tray */}
                      {isExpanded && (
                        <div className="p-2.5 bg-slate-50 dark:bg-slate-700/60 rounded-xl border border-slate-200 dark:border-slate-600 text-[10px] space-y-2 animate-in fade-in">
                          <p className="font-semibold text-slate-700 dark:text-slate-300 leading-snug">
                            {dupAnalysis.primaryReason}
                          </p>
                          <div className="space-y-1">
                            <p className="font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-[9px]">
                              Matched Records ({dupAnalysis.matches.length}):
                            </p>
                            {dupAnalysis.matches.map(m => (
                              <div key={m.id} className="p-1.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 flex items-center justify-between text-slate-700 dark:text-slate-200">
                                <div>
                                  <span className="font-bold">{m.name}</span> ({m.age}y {m.gender})
                                  <span className="text-slate-400 ml-1.5">ID: {m.patient_id || m.id.slice(0, 8).toUpperCase()}</span>
                                </div>
                                <div className="text-slate-500 dark:text-slate-400 font-mono text-[9px]">
                                  {m.village} · {m.facility_id || 'PHC'}
                                </div>
                              </div>
                            ))}
                          </div>
                          <p className="text-[9px] text-amber-700 dark:text-amber-400 font-semibold italic">
                            Notice: Clinical records are never automatically merged or deleted. Verify identity with patient.
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Details */}
                <div className="space-y-1.5 text-xs text-slate-600 font-semibold mb-4">
                  <div className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0" /><span className="truncate">{patient.village}</span></div>
                  <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" /><span>{patient.phone}</span></div>
                  <div className="flex items-center gap-2"><Activity className="w-3.5 h-3.5 text-indigo-400 shrink-0" /><span>{sortedAssessments.length} assessment{sortedAssessments.length !== 1 ? 's' : ''}</span></div>
                </div>

                {/* Buttons — stopPropagation to avoid card click */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2" onClick={e => e.stopPropagation()}>
                  <button onClick={() => setViewPatient(patient)}
                    className="flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-emerald-700">
                    <ChevronRight className="w-3.5 h-3.5" />History
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={e => openEditPatient(patient, e)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 active:scale-95 transition-all"
                    >
                      <Pencil className="w-3 h-3" />Edit
                    </button>
                    {(() => {
                      const isForeignFacility = user?.role !== 'SYSTEM_ADMIN' && Boolean(user?.facility_id && patient.facility_id && patient.facility_id !== user.facility_id);
                      const restrictionReason = !canDelete
                        ? (user?.role === 'ASHA_WORKER'
                            ? 'Frontline health workers cannot delete clinical records. PHC Doctor or Administrator authorization required.'
                            : user?.role === 'DISTRICT_OFFICER'
                            ? 'District Officers have read-only audit permissions. Patient deletion requires PHC Doctor authorization.'
                            : 'Patient deletion requires PHC Doctor or Administrator authorization')
                        : isForeignFacility
                        ? `Cannot delete patient registered to another facility (${patient.facility_id})`
                        : null;

                      return (
                        <div className="relative group/del">
                          <button
                            disabled={!canDelete || isForeignFacility}
                            onClick={e => {
                              e.stopPropagation();
                              if (!canDelete) {
                                showToast(restrictionReason || 'Permission denied: Patient record deletion requires PHC Doctor or Administrator authorization.', 'error');
                                return;
                              }
                              if (isForeignFacility) {
                                showToast(`Access denied: Patient is registered to facility '${patient.facility_id}'. You are authorized for '${user?.facility_id}'.`, 'error');
                                return;
                              }
                              setDeletingPatient(patient);
                            }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-extrabold border transition-all ${
                              !canDelete || isForeignFacility
                                ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                                : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 active:scale-95'
                            }`}
                            title={
                              !canDelete
                                ? 'Patient deletion requires PHC Doctor or Administrator authorization'
                                : isForeignFacility
                                ? `Cannot delete patient registered to another facility (${patient.facility_id})`
                                : 'Delete patient record'
                            }
                            aria-disabled={!canDelete || isForeignFacility}
                          >
                            {(!canDelete || isForeignFacility) ? (
                              <Lock className="w-3 h-3 text-slate-400 shrink-0" />
                            ) : (
                              <Trash2 className="w-3 h-3 shrink-0" />
                            )}
                            Delete
                          </button>
                          {restrictionReason && (
                            <div className="hidden group-hover/del:block absolute right-0 bottom-full mb-1.5 z-30 w-56 p-2 bg-slate-900 text-white text-[10px] font-semibold rounded-xl shadow-xl border border-slate-700 pointer-events-none">
                              {restrictionReason}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            );
          }) : (
            <div className="col-span-full bg-white p-10 rounded-3xl text-center border border-slate-100">
              <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-400 font-semibold text-sm">
                {searchTerm ? 'No patients match your search.' : 'No registered patients. Register via + New Assessment.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          VIEW HISTORY MODAL
       ════════════════════════════════════════════════════════════════════════ */}
      {viewPatient && !editingPatient && !deletingPatient && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[90vh] transition-colors">
            <div className="flex items-start justify-between p-6 pb-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
              <div>
                <h3 className="text-xl font-black text-slate-900">{viewPatient.name}</h3>
                <p className="text-xs text-slate-500 font-semibold mt-0.5">
                  {viewPatient.age} yrs · {viewPatient.gender} · {viewPatient.village} · {viewPatient.phone}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { setViewPatient(null); openEditPatient(viewPatient); }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100">
                  <Pencil className="w-3.5 h-3.5" />Edit
                </button>
                {(() => {
                  const isForeignFacility = user?.role !== 'SYSTEM_ADMIN' && Boolean(user?.facility_id && viewPatient.facility_id && viewPatient.facility_id !== user.facility_id);
                  const restrictionReason = !canDelete
                    ? (user?.role === 'ASHA_WORKER'
                        ? 'Frontline health workers cannot delete clinical records. PHC Doctor or Administrator authorization required.'
                        : user?.role === 'DISTRICT_OFFICER'
                        ? 'District Officers have read-only audit permissions. Patient deletion requires PHC Doctor authorization.'
                        : 'Patient deletion requires PHC Doctor or Administrator authorization')
                    : isForeignFacility
                    ? `Cannot delete patient registered to another facility (${viewPatient.facility_id})`
                    : null;

                  return (
                    <div className="relative group/delmodal">
                      <button
                        disabled={!canDelete || isForeignFacility}
                        onClick={() => {
                          if (!canDelete) {
                            showToast(restrictionReason || 'Permission denied: Patient record deletion requires PHC Doctor or Administrator authorization.', 'error');
                            return;
                          }
                          if (isForeignFacility) {
                            showToast(`Access denied: Patient is registered to facility '${viewPatient.facility_id}'. You are authorized for '${user?.facility_id}'.`, 'error');
                            return;
                          }
                          setDeletingPatient(viewPatient);
                          setViewPatient(null);
                        }}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                          !canDelete || isForeignFacility
                            ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                            : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                        }`}
                        title={
                          !canDelete
                            ? 'Patient deletion requires PHC Doctor or Administrator authorization'
                            : isForeignFacility
                            ? `Cannot delete patient registered to another facility (${viewPatient.facility_id})`
                            : 'Delete patient record'
                        }
                        aria-disabled={!canDelete || isForeignFacility}
                      >
                        {(!canDelete || isForeignFacility) ? (
                          <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5 shrink-0" />
                        )}
                        Delete
                      </button>
                      {restrictionReason && (
                        <div className="hidden group-hover/delmodal:block absolute right-0 bottom-full mb-1.5 z-30 w-56 p-2 bg-slate-900 text-white text-[10px] font-semibold rounded-xl shadow-xl border border-slate-700 pointer-events-none">
                          {restrictionReason}
                        </div>
                      )}
                    </div>
                  );
                })()}
                <button onClick={() => setViewPatient(null)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
                  <X className="w-4 h-4 text-slate-600" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-indigo-500" />
                  Screening History ({getSortedPatientAssessments(viewPatient.id).length})
                </h4>
                <span className="text-[10px] font-mono font-bold text-slate-400">
                  ID: {viewPatient.patient_id || viewPatient.id.slice(0, 8)}
                </span>
              </div>
              {getSortedPatientAssessments(viewPatient.id).length > 0 ? (
                getSortedPatientAssessments(viewPatient.id).map((ass, idx) => {
                  const isEmerg = Boolean(ass.is_emergency || ass.risk_level === 'EMERGENCY' || ass.triage_state === 'EMERGENCY');
                  return (
                    <div key={ass.id} className="bg-slate-50 dark:bg-slate-700/50 rounded-2xl border border-slate-200 dark:border-slate-600 p-4 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-700 dark:text-slate-200">
                            {ass.created_at ? new Date(ass.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Unknown date'}
                          </span>
                          {idx === 0 && (
                            <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300">
                              LATEST
                            </span>
                          )}
                          <span className="text-[10px] font-mono text-slate-400">
                            #{ass.id.slice(0, 8)}
                          </span>
                        </div>
                        <span className={`px-2.5 py-1 rounded-full font-black text-[10px] ${
                          isEmerg ? 'bg-red-100 text-red-800 border border-red-300 dark:bg-red-950/60 dark:text-red-300'
                          : ass.risk_level === 'HIGH' ? 'bg-rose-100 text-rose-800 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300'
                          : ass.risk_level === 'MODERATE' ? 'bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300'
                          : ass.risk_level === 'INSUFFICIENT_DATA' ? 'bg-purple-100 text-purple-800 border border-purple-200 dark:bg-purple-950/60 dark:text-purple-300'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300'}`}>
                          {isEmerg ? 'EMERGENCY' : ass.risk_level} · {ass.risk_score != null ? `${Math.round(ass.risk_score * 100)}%` : 'Clinical'}
                        </span>
                      </div>
                      <p className="text-slate-700 dark:text-slate-300 font-semibold">Symptoms: {(ass.symptoms || []).join(', ') || 'None reported'}</p>
                      <p className="text-slate-600 dark:text-slate-400 font-medium">BP: {ass.systolic_bp || '—'}/{ass.diastolic_bp || '—'} · Glucose: {ass.glucose_mg_dl || '—'} mg/dL · Temp: {ass.temperature_f || '—'}°F · HR: {ass.heart_rate_bpm || '—'} bpm</p>
                      {(ass.likely_conditions || []).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {ass.likely_conditions.slice(0, 3).map((c, i) => (
                            <span key={i} className="text-[10px] font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-600">{c.slice(0, 55)}</span>
                          ))}
                        </div>
                      )}
                      {ass.referral_status && (
                        <div className="text-[10px] font-bold text-slate-500">
                          Referral Status: <span className="text-indigo-600 dark:text-indigo-400">{ass.referral_status}</span>
                        </div>
                      )}
                      <div className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800 font-semibold">
                        Action: {ass.recommended_action || 'Routine care and monitoring'}
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-slate-400 font-semibold text-center py-6">No assessments for this patient yet.</p>
              )}
            </div>
            <div className="p-5 pt-0 border-t border-slate-100 dark:border-slate-700 shrink-0 flex justify-end">
              <button onClick={() => setViewPatient(null)}
                className="px-6 py-2.5 bg-slate-900 hover:bg-slate-700 text-white text-xs font-bold rounded-xl mt-4">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          FULL EDIT MODAL — Patient demographics + all assessments
       ════════════════════════════════════════════════════════════════════════ */}
      {editingPatient && (
        <div className="fixed inset-0 z-[60] bg-slate-950/60 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">            <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[92vh] transition-colors">

            {/* Edit header */}
            <div className="bg-gradient-to-r from-indigo-700 to-violet-700 px-6 py-5 text-white flex items-start justify-between shrink-0 rounded-t-3xl">
              <div>
                <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest mb-0.5">Edit Patient Record</p>
                <h3 className="font-black text-xl leading-tight">{editingPatient.name}</h3>
              </div>
              <button onClick={() => { setEditingPatient(null); setFormError(''); }}
                className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {formError && (
                <div className="flex items-center gap-2 bg-rose-50 text-rose-700 text-xs font-bold px-4 py-3 rounded-xl border border-rose-200">
                  <AlertTriangle className="w-4 h-4 shrink-0" />{formError}
                </div>
              )}

              {/* ── Patient Demographics Section ─────────────────────────────── */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <UserCog className="w-4 h-4 text-indigo-600" />
                  </div>
                  <h4 className="text-sm font-extrabold text-slate-800">Patient Demographics</h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Full Name *">
                    <input value={pForm.name} onChange={e => setPForm(f => ({ ...f, name: e.target.value }))} className={inp} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Age *">
                      <input type="number" min={1} max={120} value={pForm.age} onChange={e => setPForm(f => ({ ...f, age: e.target.value }))} className={inp} />
                    </Field>
                    <Field label="Gender">
                      <select value={pForm.gender} onChange={e => setPForm(f => ({ ...f, gender: e.target.value }))} className={sel}>
                        <option>Male</option><option>Female</option><option>Other</option>
                      </select>
                    </Field>
                  </div>
                  <Field label="Village / Location *">
                    <input value={pForm.village} onChange={e => setPForm(f => ({ ...f, village: e.target.value }))} className={inp} />
                  </Field>
                  <Field label="Mobile Number *">
                    <input value={pForm.phone} onChange={e => setPForm(f => ({ ...f, phone: e.target.value }))} className={inp} />
                  </Field>
                </div>
              </section>

              {/* ── Assessment Records Section ───────────────────────────────── */}
              {getSortedPatientAssessments(editingPatient.id).length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
                      <Stethoscope className="w-4 h-4 text-emerald-600" />
                    </div>
                    <h4 className="text-sm font-extrabold text-slate-800">
                      Screening Assessments ({getSortedPatientAssessments(editingPatient.id).length})
                    </h4>
                  </div>

                  <div className="space-y-3">
                    {getSortedPatientAssessments(editingPatient.id).map((ass, idx) => {
                      const af = aForms[ass.id] || {};
                      const isExpanded = activeAssessmentEdit === ass.id;
                      const isEmerg = Boolean(ass.is_emergency || ass.risk_level === 'EMERGENCY' || ass.triage_state === 'EMERGENCY');
                      return (
                        <div key={ass.id} className="border border-slate-200 rounded-2xl overflow-hidden">
                          {/* Assessment row header */}
                          <button
                            type="button"
                            onClick={() => setActiveAssessmentEdit(isExpanded ? null : ass.id)}
                            className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 text-left transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <span className={`w-6 h-6 rounded-full text-[10px] font-black flex items-center justify-center ${
                                isEmerg ? 'bg-red-100 text-red-800'
                                : ass.risk_level === 'HIGH' ? 'bg-rose-100 text-rose-800'
                                : ass.risk_level === 'MODERATE' ? 'bg-amber-100 text-amber-800'
                                : ass.risk_level === 'INSUFFICIENT_DATA' ? 'bg-purple-100 text-purple-800'
                                : 'bg-emerald-100 text-emerald-800'}`}>
                                {idx + 1}
                              </span>
                              <span className="text-xs font-bold text-slate-700">
                                {new Date(ass.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                {' · '}<span className="font-black">{isEmerg ? 'EMERGENCY' : ass.risk_level}</span>
                                {idx === 0 && <span className="ml-1.5 text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">LATEST</span>}
                              </span>
                            </div>
                            <span className="text-[11px] font-bold text-indigo-600">
                              {isExpanded ? '▲ Collapse' : '▼ Edit this assessment'}
                            </span>
                          </button>

                          {/* Editable fields */}
                          {isExpanded && af && (
                            <div className="px-4 pb-5 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white">
                              <Field label="Symptoms (comma-separated)">
                                <input value={af.symptoms || ''} onChange={e => setAForms(f => ({ ...f, [ass.id]: { ...f[ass.id], symptoms: e.target.value } }))} placeholder="fever, cough, fatigue..." className={inp} />
                              </Field>
                              <Field label="Duration (days)">
                                <input type="number" min={1} value={af.symptom_duration_days || ''} onChange={e => setAForms(f => ({ ...f, [ass.id]: { ...f[ass.id], symptom_duration_days: e.target.value } }))} className={inp} />
                              </Field>

                              <Field label="Temperature (°F)">
                                <div className="relative">
                                  <Thermometer className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                                  <input type="number" step="0.1" value={af.temperature_f || ''} onChange={e => setAForms(f => ({ ...f, [ass.id]: { ...f[ass.id], temperature_f: e.target.value } }))} className={`${inp} pl-9`} />
                                </div>
                              </Field>
                              <Field label="Heart Rate (bpm)">
                                <div className="relative">
                                  <Heart className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                                  <input type="number" value={af.heart_rate_bpm || ''} onChange={e => setAForms(f => ({ ...f, [ass.id]: { ...f[ass.id], heart_rate_bpm: e.target.value } }))} className={`${inp} pl-9`} />
                                </div>
                              </Field>

                              <Field label="Systolic BP (mmHg)">
                                <input type="number" value={af.systolic_bp || ''} onChange={e => setAForms(f => ({ ...f, [ass.id]: { ...f[ass.id], systolic_bp: e.target.value } }))} className={inp} />
                              </Field>
                              <Field label="Diastolic BP (mmHg)">
                                <input type="number" value={af.diastolic_bp || ''} onChange={e => setAForms(f => ({ ...f, [ass.id]: { ...f[ass.id], diastolic_bp: e.target.value } }))} className={inp} />
                              </Field>

                              <Field label="Blood Glucose (mg/dL)">
                                <div className="relative">
                                  <Droplets className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                                  <input type="number" step="0.1" value={af.glucose_mg_dl || ''} onChange={e => setAForms(f => ({ ...f, [ass.id]: { ...f[ass.id], glucose_mg_dl: e.target.value } }))} className={`${inp} pl-9`} />
                                </div>
                              </Field>
                              <div className="grid grid-cols-2 gap-2">
                                <Field label="Height (cm)">
                                  <input type="number" value={af.height_cm || ''} onChange={e => setAForms(f => ({ ...f, [ass.id]: { ...f[ass.id], height_cm: e.target.value } }))} className={inp} />
                                </Field>
                                <Field label="Weight (kg)">
                                  <input type="number" value={af.weight_kg || ''} onChange={e => setAForms(f => ({ ...f, [ass.id]: { ...f[ass.id], weight_kg: e.target.value } }))} className={inp} />
                                </Field>
                              </div>

                              <Field label="Smoking Status">
                                <select value={af.smoking_status || 'Never'} onChange={e => setAForms(f => ({ ...f, [ass.id]: { ...f[ass.id], smoking_status: e.target.value } }))} className={sel}>
                                  <option>Never</option><option>Former</option><option>Current</option>
                                </select>
                              </Field>
                              <Field label="Alcohol Status">
                                <select value={af.alcohol_status || 'Never'} onChange={e => setAForms(f => ({ ...f, [ass.id]: { ...f[ass.id], alcohol_status: e.target.value } }))} className={sel}>
                                  <option>Never</option><option>Occasional</option><option>Regular</option>
                                </select>
                              </Field>
                              <Field label="Physical Activity">
                                <select value={af.physical_activity || 'Moderate'} onChange={e => setAForms(f => ({ ...f, [ass.id]: { ...f[ass.id], physical_activity: e.target.value } }))} className={sel}>
                                  <option>Sedentary</option><option>Moderate</option><option>Active</option>
                                </select>
                              </Field>
                              <Field label="Family History (comma-separated)">
                                <input value={af.family_history || ''} onChange={e => setAForms(f => ({ ...f, [ass.id]: { ...f[ass.id], family_history: e.target.value } }))} placeholder="diabetes, hypertension..." className={inp} />
                              </Field>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>

            {/* Footer buttons */}
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3 shrink-0">
              <button onClick={() => { setEditingPatient(null); setFormError(''); }}
                className="flex-1 px-4 py-3 rounded-2xl border border-slate-300 font-bold text-slate-700 text-sm hover:bg-slate-50 flex items-center justify-center gap-2">
                <X className="w-4 h-4" />Cancel
              </button>
              <button onClick={saveEdit} disabled={isSaving}
                className="flex-1 px-4 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-extrabold text-sm shadow-lg disabled:opacity-60 flex items-center justify-center gap-2 active:scale-95 transition-all">
                {isSaving
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</>
                  : <><UserCog className="w-4 h-4" />Save All Changes</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          ARCHIVE & DELETE CONFIRM MODAL
        ════════════════════════════════════════════════════════════════════════ */}
      {deletingPatient && (
        <div className="fixed inset-0 z-[70] bg-slate-950/70 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-sm w-full shadow-2xl overflow-hidden transition-colors border border-slate-100 dark:border-slate-700">
            <div className="bg-gradient-to-r from-rose-600 to-red-700 px-6 py-5 text-white flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-rose-200 uppercase tracking-widest">Confirm Deletion</p>
                <h3 className="font-black text-lg">Archive & Delete Patient?</h3>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-2xl p-4">
                <p className="text-sm font-black text-rose-800 dark:text-rose-300">{deletingPatient.name}</p>
                <p className="text-xs font-semibold text-rose-700 dark:text-rose-400 mt-0.5">
                  Age {deletingPatient.age} · {deletingPatient.village} · {deletingPatient.phone}
                </p>
                <p className="text-xs font-bold text-rose-600 dark:text-rose-400 mt-1.5">
                  {assessments.filter(a => a.patient_id === deletingPatient.id).length} clinical assessment(s) and associated referrals will also be archived.
                </p>
              </div>

              <div className="flex items-start gap-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-2xl p-3.5 leading-relaxed">
                <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  <b>Clinical Soft-Deletion & Retention Notice:</b><br />
                  This record and all screening history will be removed from active clinical directories, searches, and dashboard metrics. In accordance with healthcare data retention governance, records and audit trails are securely retained in the backend archive with tombstones {isOnline ? 'on the server' : 'and queued for synchronization'}. Standard clinical users cannot un-archive deleted records; administrative database restoration is required for recovery.
                </span>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setDeletingPatient(null)}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-3 rounded-2xl border border-slate-300 dark:border-slate-600 font-bold text-slate-700 dark:text-slate-200 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  <X className="w-4 h-4" />Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-3 rounded-2xl bg-gradient-to-r from-rose-600 to-red-600 text-white font-extrabold text-sm shadow-lg hover:shadow-rose-500/25 disabled:opacity-60 flex items-center justify-center gap-2 active:scale-95 transition-all"
                >
                  {isDeleting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Archiving…</>
                  ) : (
                    <><Trash2 className="w-4 h-4" />Confirm Deletion</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
