import React, { useState, useEffect, useCallback } from 'react';
import {
  Share2, Search, Plus, CheckCircle2,
  AlertTriangle, Building2,
  X, RefreshCw, AlertOctagon, Check, Eye
} from 'lucide-react';
import { type Language } from '../../i18n/translations';
import { useLanguage } from '../../i18n/LanguageContext';
import { useAuth } from '../../auth/AuthContext';
import { apiFetch } from '../../api/apiConfig';
import {
  type LocalReferral,
  type ReferralRecordStatus,
  type ReferralPriority,
  getActiveReferrals,
  saveReferralAtomic,
  updateOperationalReferralAtomic,
  getActivePatients,
  type LocalPatient,
  getActiveAssessments,
  type LocalAssessment
} from '../../db/offlineDb';

interface IdrcReferralsPageProps {
  lang: Language;
  isOnline: boolean;
}

export const IdrcReferralsPage: React.FC<IdrcReferralsPageProps> = ({
  lang: _lang,
  isOnline
}) => {
  const { strings } = useLanguage();
  const { user, hasPermission } = useAuth();

  const [referrals, setReferrals] = useState<LocalReferral[]>([]);
  const [patients, setPatients] = useState<LocalPatient[]>([]);
  const [assessments, setAssessments] = useState<LocalAssessment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [facilityFilter, setFacilityFilter] = useState<string>('ALL');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'TODAY' | '7D' | '30D'>('ALL');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedReferral, setSelectedReferral] = useState<LocalReferral | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Create Form State
  const [formPatientId, setFormPatientId] = useState('');
  const [formAssessmentId, setFormAssessmentId] = useState('');
  const [formReason, setFormReason] = useState('');
  const [formPriority, setFormPriority] = useState<ReferralPriority>('ROUTINE');
  const [formDestination, setFormDestination] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // Status Update State
  const [updateStatus, setUpdateStatus] = useState<ReferralRecordStatus>('APPROVED');
  const [updateOutcomeNotes, setUpdateOutcomeNotes] = useState('');
  const [updateNotes, setUpdateNotes] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // ─── LOAD DATA ─────────────────────────────────────────────────────────────
  const loadReferrals = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      // 1. Load active patients & assessments for reference
      const [localPatList, localAssList] = await Promise.all([
        getActivePatients(),
        getActiveAssessments()
      ]);
      setPatients(localPatList);
      setAssessments(localAssList);

      // 2. Try fetching from backend API if online
      if (isOnline) {
        try {
          const res = await apiFetch('/api/referrals', { timeoutMs: 7000 });
          if (res.ok) {
            const data: LocalReferral[] = await res.json();
            const formatted = data.map(r => ({
              ...r,
              sync_state: 'SYNCED' as const,
              synced: true,
              local_version: r.server_version || 1
            }));
            setReferrals(formatted);
            setIsLoading(false);
            return;
          }
        } catch (apiErr) {
          console.warn('[Referrals] Backend fetch failed, falling back to local Dexie:', apiErr);
        }
      }

      // 3. Fallback to local Dexie referrals
      const localRefs = await getActiveReferrals();
      setReferrals(localRefs);
    } catch (err: any) {
      console.error('[Referrals] Failed to load referrals:', err);
      setFetchError('Unable to load referrals. Check network connection or retry.');
    } finally {
      setIsLoading(false);
    }
  }, [isOnline]);

  useEffect(() => {
    loadReferrals();
  }, [loadReferrals]);

  // ─── CREATE REFERRAL HANDLER ───────────────────────────────────────────────
  const handleCreateReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formPatientId) {
      setFormError('Please select a registered patient.');
      return;
    }
    if (!formReason.trim() || formReason.trim().length < 3) {
      setFormError('Referral reason is mandatory (minimum 3 characters).');
      return;
    }
    if (!formDestination.trim()) {
      setFormError('Destination healthcare facility is mandatory.');
      return;
    }

    // Check duplicate active referral
    const activeDuplicate = referrals.find(
      r => r.patient_id === formPatientId &&
           ['REQUESTED', 'APPROVED', 'REFERRED', 'IN_PROGRESS'].includes(r.status) &&
           (formAssessmentId ? r.assessment_id === formAssessmentId : r.destination_facility.toLowerCase() === formDestination.trim().toLowerCase())
    );

    if (activeDuplicate) {
      setFormError(`An active referral (${activeDuplicate.id}) already exists for this patient with status '${activeDuplicate.status}'.`);
      return;
    }

    setIsSubmitting(true);
    const selectedPatient = patients.find(p => p.id === formPatientId);
    const creator = user?.username || 'Frontline Health Worker';

    try {
      // 1. Try online API first if online
      if (isOnline) {
        try {
          const res = await apiFetch('/api/referrals', {
            method: 'POST',
            body: JSON.stringify({
              patient_id: formPatientId,
              assessment_id: formAssessmentId || undefined,
              referral_reason: formReason.trim(),
              priority: formPriority,
              destination_facility: formDestination.trim(),
              facility_id: user?.facility_id || selectedPatient?.facility_id || null,
              notes: formNotes.trim()
            }),
            timeoutMs: 8000
          });

          if (res.ok) {
            showToast('Referral created & synced with destination hospital.');
            setShowCreateModal(false);
            resetCreateForm();
            await loadReferrals();
            setIsSubmitting(false);
            return;
          } else if (res.status === 409) {
            const errData = await res.json().catch(() => ({}));
            setFormError(errData.detail || 'An active referral already exists for this patient.');
            setIsSubmitting(false);
            return;
          }
        } catch (apiErr) {
          console.warn('[Referrals] Online creation failed, staging offline atomic outbox mutation:', apiErr);
        }
      }

      // 2. Offline atomic persistence
      await saveReferralAtomic({
        patient_id: formPatientId,
        patient_name: selectedPatient?.name || 'Unknown Patient',
        patient_phone: selectedPatient?.phone || '',
        patient_village: selectedPatient?.village || '',
        patient_age: selectedPatient?.age,
        patient_gender: selectedPatient?.gender,
        assessment_id: formAssessmentId || null,
        referral_reason: formReason.trim(),
        priority: formPriority,
        destination_facility: formDestination.trim(),
        facility_id: user?.facility_id || selectedPatient?.facility_id || null,
        status: 'REQUESTED',
        notes: formNotes.trim(),
        outcome_notes: '',
        created_by: creator
      });

      showToast('Referral saved locally (queued for server sync).');
      setShowCreateModal(false);
      resetCreateForm();
      await loadReferrals();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save referral.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetCreateForm = () => {
    setFormPatientId('');
    setFormAssessmentId('');
    setFormReason('');
    setFormPriority('ROUTINE');
    setFormDestination('');
    setFormNotes('');
    setFormError(null);
  };

  // ─── STATUS UPDATE HANDLER ─────────────────────────────────────────────────
  const handleStatusUpdate = async (referral: LocalReferral) => {
    setIsSubmitting(true);
    setFormError(null);
    const updater = user?.username || 'Medical Officer';

    try {
      if (isOnline) {
        try {
          const res = await apiFetch(`/api/referrals/${encodeURIComponent(referral.id)}/status`, {
            method: 'PATCH',
            body: JSON.stringify({
              status: updateStatus,
              outcome_notes: updateOutcomeNotes.trim(),
              notes: updateNotes.trim()
            }),
            timeoutMs: 8000
          });

          if (res.ok) {
            showToast(`Referral ${referral.id} transitioned to ${updateStatus}.`);
            setSelectedReferral(null);
            await loadReferrals();
            setIsSubmitting(false);
            return;
          } else {
            const errData = await res.json().catch(() => ({}));
            setFormError(errData.detail || 'Failed to update referral status.');
            setIsSubmitting(false);
            return;
          }
        } catch (apiErr) {
          console.warn('[Referrals] Online update failed, saving offline:', apiErr);
        }
      }

      // Offline atomic status update
      await updateOperationalReferralAtomic(
        referral.id,
        updateStatus,
        updateOutcomeNotes.trim(),
        updateNotes.trim(),
        updater
      );

      showToast(`Referral updated locally (queued for server sync).`);
      setSelectedReferral(null);
      await loadReferrals();
    } catch (err: any) {
      setFormError(err.message || 'Failed to update referral status.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── FILTERING ─────────────────────────────────────────────────────────────
  const now = new Date();
  const filteredReferrals = referrals.filter(r => {
    // Search
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchId = r.id.toLowerCase().includes(q);
      const matchPat = (r.patient_name || '').toLowerCase().includes(q) || (r.patient_id || '').toLowerCase().includes(q);
      const matchPhone = (r.patient_phone || '').includes(q);
      const matchDest = r.destination_facility.toLowerCase().includes(q);
      const matchReason = r.referral_reason.toLowerCase().includes(q);
      if (!matchId && !matchPat && !matchPhone && !matchDest && !matchReason) return false;
    }

    // Status
    if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;

    // Priority
    if (priorityFilter !== 'ALL' && r.priority !== priorityFilter) return false;

    // Facility
    if (facilityFilter !== 'ALL' && r.destination_facility !== facilityFilter && r.facility_id !== facilityFilter) return false;

    // Date
    if (dateFilter !== 'ALL' && r.created_at) {
      const itemDate = new Date(r.created_at);
      if (dateFilter === 'TODAY' && itemDate.toDateString() !== now.toDateString()) return false;
      if (dateFilter === '7D') {
        const d7 = new Date(now.getTime() - 7 * 86400000);
        if (itemDate < d7) return false;
      }
      if (dateFilter === '30D') {
        const d30 = new Date(now.getTime() - 30 * 86400000);
        if (itemDate < d30) return false;
      }
    }

    return true;
  });

  // KPI Metrics computed from real operational records
  const totalCount = referrals.length;
  const requestedCount = referrals.filter(r => r.status === 'REQUESTED').length;
  const activeCount = referrals.filter(r => ['APPROVED', 'REFERRED', 'IN_PROGRESS'].includes(r.status)).length;
  const completedCount = referrals.filter(r => r.status === 'COMPLETED').length;
  const emergencyCount = referrals.filter(r => r.priority === 'EMERGENCY').length;

  // Distinct facilities for filter
  const distinctFacilities = Array.from(new Set(referrals.map(r => r.destination_facility).filter(Boolean)));

  // Helper for priority badge styling
  const getPriorityBadge = (p: ReferralPriority) => {
    switch (p) {
      case 'EMERGENCY':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-rose-100 text-rose-800 border border-rose-300">🚨 EMERGENCY</span>;
      case 'URGENT':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">⚡ URGENT</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">ROUTINE</span>;
    }
  };

  // Helper for status badge styling
  const getStatusBadge = (s: ReferralRecordStatus) => {
    switch (s) {
      case 'REQUESTED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-sky-50 text-sky-700 border border-sky-200">Requested</span>;
      case 'APPROVED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">Approved</span>;
      case 'REFERRED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">Referred</span>;
      case 'IN_PROGRESS':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">In Progress</span>;
      case 'COMPLETED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">✓ Completed</span>;
      case 'CANCELLED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-500 border border-slate-200">Cancelled</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">{s}</span>;
    }
  };

  // Allowed transitions
  const getAllowedTransitions = (current: ReferralRecordStatus): ReferralRecordStatus[] => {
    switch (current) {
      case 'REQUESTED': return ['APPROVED', 'REFERRED', 'CANCELLED'];
      case 'APPROVED': return ['REFERRED', 'IN_PROGRESS', 'CANCELLED'];
      case 'REFERRED': return ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
      case 'IN_PROGRESS': return ['COMPLETED', 'CANCELLED'];
      default: return [];
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-[#102A56] text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-xs font-bold border border-slate-700 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-[#E5EEF1] shadow-xs">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#E7F7F0] flex items-center justify-center text-[#0A9F68]">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-[#102A56] tracking-tight">{strings.referrals.title}</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {strings.referrals.subtitle}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadReferrals}
            disabled={isLoading}
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all"
            title="Refresh referrals from server"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{strings.common.refresh}</span>
          </button>

          {hasPermission('referrals:create') && (
            <button
              onClick={() => {
                resetCreateForm();
                setShowCreateModal(true);
              }}
              className="px-4 py-2.5 rounded-xl bg-[#0A9F68] hover:bg-[#088758] text-white text-xs font-bold flex items-center gap-2 shadow-md shadow-[#0A9F68]/20 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>{strings.referrals.createReferral}</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div className="bg-white p-4 rounded-2xl border border-[#E5EEF1] shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{strings.referrals.allReferrals}</p>
          <p className="text-2xl font-black text-[#102A56] mt-1">{totalCount}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Operational records</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-[#E5EEF1] shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-sky-600">{strings.referrals.pendingReferrals}</p>
          <p className="text-2xl font-black text-sky-700 mt-1">{requestedCount}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Awaiting triage triage</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-[#E5EEF1] shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600">{strings.referrals.inProgressReferrals}</p>
          <p className="text-2xl font-black text-amber-700 mt-1">{activeCount}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Under evaluation</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-[#E5EEF1] shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">{strings.referrals.completedReferrals}</p>
          <p className="text-2xl font-black text-emerald-700 mt-1">{completedCount}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Consultation finalized</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-[#E5EEF1] shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-rose-600">{strings.referrals.highPriority}</p>
          <p className="text-2xl font-black text-rose-700 mt-1">{emergencyCount}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Critical 24/7 transfers</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-[#E5EEF1] shadow-xs space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Search Field */}
          <div className="md:col-span-4 relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder={strings.referrals.searchPlaceholder}
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-xs text-[#102A56] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0A9F68]/30 focus:border-[#0A9F68]"
            />
          </div>

          {/* Status Dropdown */}
          <div className="md:col-span-2">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-[#102A56] bg-white focus:outline-none focus:ring-2 focus:ring-[#0A9F68]/30"
            >
              <option value="ALL">All Statuses</option>
              <option value="REQUESTED">Requested</option>
              <option value="APPROVED">Approved</option>
              <option value="REFERRED">Referred</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          {/* Priority Dropdown */}
          <div className="md:col-span-2">
            <select
              value={priorityFilter}
              onChange={e => setPriorityFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-[#102A56] bg-white focus:outline-none focus:ring-2 focus:ring-[#0A9F68]/30"
            >
              <option value="ALL">All Priorities</option>
              <option value="ROUTINE">Routine</option>
              <option value="URGENT">Urgent</option>
              <option value="EMERGENCY">Emergency</option>
            </select>
          </div>

          {/* Destination Facility Dropdown */}
          <div className="md:col-span-2">
            <select
              value={facilityFilter}
              onChange={e => setFacilityFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-[#102A56] bg-white focus:outline-none focus:ring-2 focus:ring-[#0A9F68]/30"
            >
              <option value="ALL">All Facilities</option>
              {distinctFacilities.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          {/* Date Filter */}
          <div className="md:col-span-2">
            <select
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-[#102A56] bg-white focus:outline-none focus:ring-2 focus:ring-[#0A9F68]/30"
            >
              <option value="ALL">All Time</option>
              <option value="TODAY">Today</option>
              <option value="7D">Last 7 Days</option>
              <option value="30D">Last 30 Days</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
          <span>Showing <strong className="text-[#102A56]">{filteredReferrals.length}</strong> of {totalCount} referral records</span>
          {(searchTerm || statusFilter !== 'ALL' || priorityFilter !== 'ALL' || facilityFilter !== 'ALL' || dateFilter !== 'ALL') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('ALL');
                setPriorityFilter('ALL');
                setFacilityFilter('ALL');
                setDateFilter('ALL');
              }}
              className="text-[#0A9F68] hover:underline font-bold"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Error Alert */}
      {fetchError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-2xl flex items-center justify-between gap-3 text-xs font-semibold">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{fetchError}</span>
          </div>
          <button
            onClick={loadReferrals}
            className="px-3 py-1 bg-white text-rose-700 border border-rose-300 rounded-xl font-bold hover:bg-rose-100 transition-all"
          >
            Retry
          </button>
        </div>
      )}

      {/* Referrals List Table */}
      <div className="bg-white rounded-2xl border border-[#E5EEF1] shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-[#0A9F68]" />
            <p className="text-xs font-semibold">Loading operational referral ledger...</p>
          </div>
        ) : filteredReferrals.length === 0 ? (
          <div className="p-16 text-center text-slate-400 space-y-3">
            <Share2 className="w-10 h-10 mx-auto text-slate-300" />
            <h3 className="text-sm font-bold text-[#102A56]">No Referrals Found</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              No operational referrals match the current search filters. Create a new referral from an eligible patient screening to begin.
            </p>
            {hasPermission('referrals:create') && (
              <button
                onClick={() => {
                  resetCreateForm();
                  setShowCreateModal(true);
                }}
                className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-[#0A9F68] text-white text-xs font-bold rounded-xl hover:bg-[#088758] shadow-sm transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Create First Referral</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-[#F8FAFC] border-b border-slate-100 uppercase tracking-wider text-[11px] font-bold text-slate-500">
                <tr>
                  <th className="py-3.5 px-4">Referral ID</th>
                  <th className="py-3.5 px-4">Patient</th>
                  <th className="py-3.5 px-4">Priority</th>
                  <th className="py-3.5 px-4">Destination Facility</th>
                  <th className="py-3.5 px-4">Referral Reason</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Created</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredReferrals.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-[#102A56]">
                      {r.id}
                      <span className="block text-[10px] font-sans font-medium text-slate-400">
                        {r.sync_state === 'SYNCED' ? '✓ Synced' : '☁️ Pending'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-bold text-[#102A56]">{r.patient_name || 'Patient'}</p>
                      <p className="text-[11px] text-slate-400">{r.patient_phone || r.patient_village || r.patient_id}</p>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {getPriorityBadge(r.priority)}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-800">{r.destination_facility}</p>
                    </td>
                    <td className="py-3 px-4 max-w-xs truncate" title={r.referral_reason}>
                      {r.referral_reason}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {getStatusBadge(r.status)}
                    </td>
                    <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                      <p className="font-medium">{(r.created_at || '').substring(0, 10)}</p>
                      <p className="text-[10px] text-slate-400">by {r.created_by}</p>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        onClick={() => {
                          setSelectedReferral(r);
                          setUpdateStatus(
                            getAllowedTransitions(r.status)[0] || r.status
                          );
                          setUpdateOutcomeNotes(r.outcome_notes || '');
                          setUpdateNotes(r.notes || '');
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-[#E7F7F0] hover:text-[#0A9F68] text-slate-700 font-bold text-xs transition-all"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Manage</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CREATE REFERRAL MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#E7F7F0] text-[#0A9F68] flex items-center justify-center font-bold">
                  <Share2 className="w-4 h-4" />
                </div>
                <h2 className="text-base font-black text-[#102A56]">Create Operational Referral</h2>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateReferral} className="space-y-4 mt-4">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center gap-2">
                  <AlertOctagon className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Patient Selection */}
              <div>
                <label className="block text-xs font-bold text-[#102A56] mb-1">
                  Patient <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formPatientId}
                  onChange={e => {
                    setFormPatientId(e.target.value);
                    setFormAssessmentId('');
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-[#102A56] bg-white focus:outline-none focus:ring-2 focus:ring-[#0A9F68]/30"
                  required
                >
                  <option value="">Select Registered Patient...</option>
                  {patients.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.gender}, {p.age}y) — {p.village} [{p.phone}]
                    </option>
                  ))}
                </select>
              </div>

              {/* Source Screening Assessment (Optional) */}
              {formPatientId && (
                <div>
                  <label className="block text-xs font-bold text-[#102A56] mb-1">
                    Linked Screening Encounter <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <select
                    value={formAssessmentId}
                    onChange={e => setFormAssessmentId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-[#102A56] bg-white focus:outline-none focus:ring-2 focus:ring-[#0A9F68]/30"
                  >
                    <option value="">Direct Referral (No specific encounter)</option>
                    {assessments
                      .filter(a => a.patient_id === formPatientId)
                      .map(a => (
                        <option key={a.id} value={a.id}>
                          Encounter {a.id.substring(0, 10)}... — Risk: {a.risk_level} ({a.created_at?.substring(0, 10)})
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* Priority */}
              <div>
                <label className="block text-xs font-bold text-[#102A56] mb-1">
                  Referral Priority <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['ROUTINE', 'URGENT', 'EMERGENCY'] as ReferralPriority[]).map(pr => (
                    <button
                      type="button"
                      key={pr}
                      onClick={() => setFormPriority(pr)}
                      className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                        formPriority === pr
                          ? pr === 'EMERGENCY'
                            ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                            : pr === 'URGENT'
                            ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                            : 'bg-[#0A9F68] text-white border-[#0A9F68] shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {pr}
                    </button>
                  ))}
                </div>
              </div>

              {/* Destination Facility */}
              <div>
                <label className="block text-xs font-bold text-[#102A56] mb-1">
                  Destination Healthcare Facility <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formDestination}
                  onChange={e => setFormDestination(e.target.value)}
                  placeholder="e.g. District Super-Specialty Hospital & Trauma Centre"
                  list="hospitals-list"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-[#102A56] focus:outline-none focus:ring-2 focus:ring-[#0A9F68]/30"
                  required
                />
                <datalist id="hospitals-list">
                  <option value="District Super-Specialty Hospital & Trauma Centre" />
                  <option value="Barasat Sub-Divisional Hospital & Chest Clinic" />
                  <option value="Apex Advanced Nephrology & Multi-Specialty Care" />
                  <option value="Habra Community Health Centre (CHC)" />
                  <option value="Sonpur Primary Health Centre (PHC)" />
                </datalist>
              </div>

              {/* Referral Reason */}
              <div>
                <label className="block text-xs font-bold text-[#102A56] mb-1">
                  Clinical Referral Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={formReason}
                  onChange={e => setFormReason(e.target.value)}
                  placeholder="Explain why this patient requires higher level referral..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-[#102A56] focus:outline-none focus:ring-2 focus:ring-[#0A9F68]/30"
                  required
                />
              </div>

              {/* Initial Notes */}
              <div>
                <label className="block text-xs font-bold text-[#102A56] mb-1">
                  Coordination Notes <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  placeholder="e.g. Transport arranged via 108 ambulance"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-[#102A56] focus:outline-none focus:ring-2 focus:ring-[#0A9F68]/30"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-[#0A9F68] hover:bg-[#088758] text-white text-xs font-bold shadow-md shadow-[#0A9F68]/20 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Create Referral</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REFERRAL DETAIL & STATUS UPDATE MODAL */}
      {selectedReferral && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-150 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <span className="font-mono font-black text-sm text-[#102A56] bg-slate-100 px-2.5 py-1 rounded-lg">
                  {selectedReferral.id}
                </span>
                {getStatusBadge(selectedReferral.status)}
                {getPriorityBadge(selectedReferral.priority)}
              </div>
              <button
                onClick={() => setSelectedReferral(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Patient Card */}
            <div className="bg-[#F8FAFC] p-4 rounded-xl border border-slate-100 grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase">Patient</p>
                <p className="font-bold text-[#102A56] text-sm mt-0.5">{selectedReferral.patient_name || 'Patient'}</p>
                <p className="text-slate-500">{selectedReferral.patient_gender}, {selectedReferral.patient_age} years</p>
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase">Location & Contact</p>
                <p className="font-medium text-slate-700 mt-0.5">{selectedReferral.patient_village || 'Rural Village'}</p>
                <p className="text-slate-500">{selectedReferral.patient_phone || 'No phone'}</p>
              </div>
            </div>

            {/* Destination Facility & Reason */}
            <div className="space-y-3 text-xs">
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase">Destination Facility</p>
                <p className="font-bold text-slate-800 text-sm mt-0.5 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-[#0A9F68]" />
                  <span>{selectedReferral.destination_facility}</span>
                </p>
              </div>

              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase">Clinical Referral Reason</p>
                <p className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-slate-700 font-medium leading-relaxed mt-1">
                  {selectedReferral.referral_reason}
                </p>
              </div>

              {selectedReferral.notes && (
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase">Initial Notes</p>
                  <p className="text-slate-600 mt-0.5">{selectedReferral.notes}</p>
                </div>
              )}

              {selectedReferral.outcome_notes && (
                <div>
                  <p className="text-[11px] font-bold text-emerald-600 uppercase">Follow-up Outcome Notes</p>
                  <p className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-800 font-medium mt-1">
                    {selectedReferral.outcome_notes}
                  </p>
                </div>
              )}
            </div>

            {/* Status Transition Action (Authorized Users) */}
            {hasPermission('referrals:update') && !['COMPLETED', 'CANCELLED'].includes(selectedReferral.status) && (
              <div className="pt-4 border-t border-slate-100 space-y-3">
                <h3 className="text-xs font-bold text-[#102A56] uppercase tracking-wider">
                  Update Referral Status & Clinical Outcome
                </h3>

                {formError && (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold">
                    {formError}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">
                      New Status
                    </label>
                    <select
                      value={updateStatus}
                      onChange={e => setUpdateStatus(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-[#102A56] bg-white focus:outline-none focus:ring-2 focus:ring-[#0A9F68]/30"
                    >
                      {getAllowedTransitions(selectedReferral.status).map(st => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">
                      Attested Clinician
                    </label>
                    <input
                      type="text"
                      disabled
                      value={user?.full_name || user?.username || 'Medical Officer'}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-500 bg-slate-50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">
                    Outcome & Follow-up Notes
                  </label>
                  <textarea
                    value={updateOutcomeNotes}
                    onChange={e => setUpdateOutcomeNotes(e.target.value)}
                    placeholder="Record patient admission, emergency transfer status, or consultation outcome..."
                    rows={2}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-[#102A56] focus:outline-none focus:ring-2 focus:ring-[#0A9F68]/30"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedReferral(null)}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStatusUpdate(selectedReferral)}
                    disabled={isSubmitting}
                    className="px-4 py-2 rounded-xl bg-[#0A9F68] hover:bg-[#088758] text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-[#0A9F68]/20 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Updating...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Commit Status Update</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
