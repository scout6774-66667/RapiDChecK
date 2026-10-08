import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, AlertTriangle,
  Search, Activity, MapPin, Stethoscope,
  ShieldCheck, CheckCircle2, FileSignature, AlertOctagon, X,
  RefreshCw, History, Calendar, Building2, Check
} from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { translations, type Language } from '../i18n/translations';
import {
  type LocalAssessment,
  getActiveAssessments,
  db
} from '../db/offlineDb';
import { useAuth, type UserRole } from '../auth/AuthContext';

interface PhcDashboardProps {
  lang: Language;
  isOnline: boolean;
  defaultRiskFilter?: string;
}

export const PhcDashboard: React.FC<PhcDashboardProps> = ({ lang, isOnline, defaultRiskFilter = 'ALL' }) => {
  const t = translations[lang];
  const { user, switchUser } = useAuth();

  const [assessments, setAssessments] = useState<LocalAssessment[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [riskFilter, setRiskFilter] = useState(defaultRiskFilter);
  const [dateFilter, setDateFilter] = useState<'ALL' | 'TODAY' | '7D' | '30D'>('ALL');
  const [villageFilter, setVillageFilter] = useState('ALL');
  const [facilityFilter, setFacilityFilter] = useState('ALL');
  const [activeTab, setActiveTab] = useState<'REVIEW_QUEUE' | 'ALL' | 'REFERRALS'>('REVIEW_QUEUE');

  const [isLoading, setIsLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [refreshStatus, setRefreshStatus] = useState<string | null>(null);

  // Review Modal State
  const [selectedReviewAssessment, setSelectedReviewAssessment] = useState<LocalAssessment | null>(null);
  const [reviewDecision, setReviewDecision] = useState<'APPROVED' | 'MODIFIED' | 'REJECTED'>('APPROVED');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [modifiedRiskLevel, setModifiedRiskLevel] = useState<'LOW' | 'MODERATE' | 'HIGH'>('MODERATE');
  const [modifiedTriageState, setModifiedTriageState] = useState<'LOW_RISK' | 'MODERATE_RISK' | 'HIGH_RISK' | 'EMERGENCY'>('MODERATE_RISK');
  const [modifiedAction, setModifiedAction] = useState('');
  const [modifiedReferral, setModifiedReferral] = useState<'NOT_REFERRED' | 'REFERRED' | 'APPOINTMENT_REQUESTED' | 'CONSULTATION_COMPLETED'>('REFERRED');
  const [isAttested, setIsAttested] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewSuccessMessage, setReviewSuccessMessage] = useState<string | null>(null);
  const [reviewErrorMessage, setReviewErrorMessage] = useState<string | null>(null);

  // Audit History Modal State
  const [historyAssessment, setHistoryAssessment] = useState<LocalAssessment | null>(null);
  const [auditHistory, setAuditHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  useEffect(() => {
    setRiskFilter(defaultRiskFilter);
  }, [defaultRiskFilter]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      if (isOnline) {
        try {
          const token = localStorage.getItem('rapidcheck_token');
          const res = await fetch('http://127.0.0.1:8000/api/assessments', {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
          });
          if (res.ok) {
            const data = await res.json();
            const validData = (data || []).filter((a: LocalAssessment) => !a.is_deleted);
            setAssessments(validData);
            setLastRefreshed(new Date());
            setRefreshStatus('Refreshed from server');
            setTimeout(() => setRefreshStatus(null), 2500);
            setIsLoading(false);
            return;
          }
        } catch (err) {
          console.warn('Backend query failed, falling back to local Dexie records:', err);
        }
      }

      // Offline / Local Dexie fallback
      const localList = await getActiveAssessments();
      const sorted = localList.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      setAssessments(sorted);
      setLastRefreshed(new Date());
      setRefreshStatus(isOnline ? 'Loaded from local database' : 'Loaded offline cached records');
      setTimeout(() => setRefreshStatus(null), 2500);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      setRefreshStatus('Unable to load data');
      setTimeout(() => setRefreshStatus(null), 3000);
    } finally {
      setIsLoading(false);
    }
  }, [isOnline]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Open Review & Attestation Modal
  const openReviewModal = (assessment: LocalAssessment) => {
    setSelectedReviewAssessment(assessment);
    setReviewDecision('APPROVED');
    setClinicalNotes('');
    setOverrideReason('');
    setModifiedRiskLevel(assessment.risk_level as any || 'MODERATE');
    setModifiedTriageState(assessment.triage_state as any || 'MODERATE_RISK');
    setModifiedAction(assessment.recommended_action || '');
    setModifiedReferral((assessment.referral_status as any) || 'REFERRED');
    setIsAttested(false);
    setReviewSuccessMessage(null);
    setReviewErrorMessage(null);
  };

  // Open Audit History Modal
  const openHistoryModal = async (assessment: LocalAssessment) => {
    setHistoryAssessment(assessment);
    setIsLoadingHistory(true);
    try {
      if (isOnline) {
        const token = localStorage.getItem('rapidcheck_token');
        const res = await fetch(`http://127.0.0.1:8000/api/v2/reviews/${assessment.id}/history`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        if (res.ok) {
          const historyData = await res.json();
          setAuditHistory(historyData);
          setIsLoadingHistory(false);
          return;
        }
      }
      // Offline fallback: construct local history from assessment record
      setAuditHistory([
        {
          id: assessment.id,
          decision: assessment.review_state || 'NOT_REQUIRED',
          clinical_notes: assessment.recommended_action || 'Field triage recorded',
          reviewer_name: assessment.reviewed_by || 'Field Clinician',
          created_at: assessment.reviewed_at || assessment.created_at
        }
      ]);
    } catch {
      setAuditHistory([]);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Quick Referral Status Update
  const updateReferralStatus = async (assessmentId: string, newStatus: string) => {
    try {
      if (isOnline) {
        const token = localStorage.getItem('rapidcheck_token');
        await fetch(`http://127.0.0.1:8000/api/assessments/${assessmentId}/referral`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ referral_status: newStatus })
        });
      }
      // Update local Dexie record
      await db.assessments.update(assessmentId, {
        referral_status: newStatus as any,
        updated_at: new Date().toISOString()
      });
      await loadData();
    } catch (err) {
      console.error('Failed to update referral status:', err);
    }
  };

  // Submit Review & Attestation
  const submitReview = async () => {
    if (!selectedReviewAssessment) return;
    if (!clinicalNotes || clinicalNotes.trim().length < 5) {
      setReviewErrorMessage('Clinical notes explaining your evaluation are mandatory (min 5 characters).');
      return;
    }
    if ((reviewDecision === 'MODIFIED' || reviewDecision === 'REJECTED') && (!overrideReason || overrideReason.trim().length < 5)) {
      setReviewErrorMessage('An explicit clinical override reason is mandatory when modifying or rejecting field triage.');
      return;
    }
    if (!isAttested) {
      setReviewErrorMessage('You must confirm the digital attestation checkbox before signing.');
      return;
    }

    setIsSubmittingReview(true);
    setReviewErrorMessage(null);

    const token = localStorage.getItem('rapidcheck_token');
    const reviewerName = user?.full_name || 'Medical Officer';
    const payload: any = {
      decision: reviewDecision,
      clinical_notes: clinicalNotes,
      override_reason: overrideReason || undefined,
      modified_risk_level: reviewDecision === 'MODIFIED' ? modifiedRiskLevel : undefined,
      modified_triage_state: reviewDecision === 'MODIFIED' ? modifiedTriageState : undefined,
      modified_action: reviewDecision === 'MODIFIED' ? modifiedAction : undefined,
      modified_referral_status: reviewDecision === 'MODIFIED' ? modifiedReferral : undefined
    };

    try {
      if (isOnline) {
        const res = await fetch(`http://127.0.0.1:8000/api/v2/reviews/${selectedReviewAssessment.id}/submit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          const reviewData = await res.json();
          setReviewSuccessMessage(`Clinical Review Signed & Attested (Hash: ${(reviewData.signature_hash || '').substring(0, 16)}...)`);
          await loadData();
          setTimeout(() => {
            setSelectedReviewAssessment(null);
          }, 1500);
          return;
        }
      }

      // Offline local review submission
      const newReviewState = reviewDecision === 'APPROVED' ? 'APPROVED' : reviewDecision === 'MODIFIED' ? 'MODIFIED' : 'REJECTED';
      await db.assessments.update(selectedReviewAssessment.id, {
        review_state: newReviewState,
        reviewed_by: reviewerName,
        reviewed_at: new Date().toISOString(),
        risk_level: (reviewDecision === 'MODIFIED' ? modifiedRiskLevel : selectedReviewAssessment.risk_level) as any,
        triage_state: (reviewDecision === 'MODIFIED' ? modifiedTriageState : selectedReviewAssessment.triage_state) as any,
        recommended_action: reviewDecision === 'MODIFIED' ? modifiedAction : selectedReviewAssessment.recommended_action,
        referral_status: (reviewDecision === 'MODIFIED' ? modifiedReferral : selectedReviewAssessment.referral_status) as any,
        synced: false
      });

      setReviewSuccessMessage('Review locally recorded & signed. Will sync when back online.');
      await loadData();
      setTimeout(() => {
        setSelectedReviewAssessment(null);
      }, 1500);
    } catch (err: any) {
      setReviewErrorMessage(err.message || 'Failed to submit review. Check connection.');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // ─── FILTERING LOGIC ────────────────────────────────────────────────────────
  const now = new Date();
  const filteredByDate = assessments.filter((a) => {
    if (dateFilter === 'ALL') return true;
    if (!a.created_at) return false;
    const itemDate = new Date(a.created_at);
    if (dateFilter === 'TODAY') {
      return itemDate.toDateString() === now.toDateString();
    }
    if (dateFilter === '7D') {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return itemDate >= sevenDaysAgo;
    }
    if (dateFilter === '30D') {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return itemDate >= thirtyDaysAgo;
    }
    return true;
  });

  const filteredByScope = filteredByDate.filter((a) => {
    const matchesVillage = villageFilter === 'ALL' || (a.village && a.village === villageFilter);
    const matchesFacility = facilityFilter === 'ALL' || ((a as any).facility_id && (a as any).facility_id === facilityFilter);
    return matchesVillage && matchesFacility;
  });

  // Extract distinct real villages and facilities for selectors
  const distinctVillages = Array.from(new Set(assessments.map((a) => a.village).filter(Boolean))) as string[];
  const distinctFacilities = Array.from(new Set(assessments.map((a) => (a as any).facility_id).filter(Boolean))) as string[];

  // Real Metrics derived dynamically from filtered data
  const totalPatientsCount = new Set(filteredByScope.map((a) => a.patient_id)).size;
  const highRiskCount = filteredByScope.filter((a) => a.risk_level === 'HIGH').length;
  const modRiskCount = filteredByScope.filter((a) => a.risk_level === 'MODERATE').length;
  const lowRiskCount = filteredByScope.filter((a) => a.risk_level === 'LOW').length;

  const pendingReviewAssessments = filteredByScope.filter((a) =>
    a.review_state === 'REVIEW_REQUIRED' || a.review_state === 'ASSIGNED' || a.review_state === 'IN_REVIEW' ||
    ((a.is_emergency || a.risk_level === 'HIGH' || (a.red_flags && a.red_flags.length > 0)) &&
     a.review_state !== 'APPROVED' && a.review_state !== 'MODIFIED' && a.review_state !== 'REJECTED')
  );

  const referralAssessments = filteredByScope.filter((a) =>
    a.referral_status === 'REFERRED' || a.referral_status === 'APPOINTMENT_REQUESTED' || a.referral_status === 'CONSULTATION_COMPLETED'
  );

  // Chart Data (strictly real counts)
  const totalRiskAssessments = highRiskCount + modRiskCount + lowRiskCount;
  const pieData = totalRiskAssessments > 0 ? [
    ...(highRiskCount > 0 ? [{ name: 'High Risk', value: highRiskCount, color: '#f43f5e' }] : []),
    ...(modRiskCount > 0 ? [{ name: 'Moderate Risk', value: modRiskCount, color: '#f59e0b' }] : []),
    ...(lowRiskCount > 0 ? [{ name: 'Low Risk', value: lowRiskCount, color: '#10b981' }] : [])
  ] : [];

  const villageCountsMap: { [v: string]: number } = {};
  filteredByScope.forEach((a) => {
    if (a.village && a.village.trim()) {
      villageCountsMap[a.village] = (villageCountsMap[a.village] || 0) + 1;
    }
  });

  const villageChartData = Object.entries(villageCountsMap).map(([village, count]) => ({
    village,
    count
  })).sort((a, b) => b.count - a.count);

  // Table Queue Selection
  const targetAssessmentsList =
    activeTab === 'REVIEW_QUEUE' ? pendingReviewAssessments :
    activeTab === 'REFERRALS' ? referralAssessments :
    filteredByScope;

  const filteredAssessments = targetAssessmentsList.filter((a) => {
    const matchesSearch =
      (a.patient_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (a.patient_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (a.village || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (a.symptoms || []).some(s => s.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesRisk = riskFilter === 'ALL' || a.risk_level === riskFilter;
    return matchesSearch && matchesRisk;
  });

  const formatRoleName = (role?: UserRole) => {
    switch (role) {
      case 'PHC_DOCTOR': return 'PHC Medical Officer';
      case 'DISTRICT_OFFICER': return 'District Health Officer (CMO)';
      case 'ASHA_WORKER': return 'ASHA Frontline Health Worker';
      case 'SYSTEM_ADMIN': return 'System Administrator';
      default: return 'Healthcare Practitioner';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

      {/* Header Title & Dynamic Authenticated Role Profile */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 transition-colors">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Stethoscope className="w-7 h-7 text-teal-600" />
              <span>{t.phcTitle}</span>
            </h2>
            <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
              isOnline
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300'
                : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300'
            }`}>
              {isOnline ? 'Online (FastAPI Backend)' : 'Offline (Dexie IndexedDB)'}
            </span>
          </div>
          <p className="text-xs text-slate-500 font-semibold mt-1">
            Governed Clinical Review & Patient Referral Management Center
          </p>
        </div>

        {/* Dynamic Authenticated User Badge & Role Switcher */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 bg-teal-50/80 dark:bg-slate-700 p-2.5 rounded-2xl border border-teal-200/80 dark:border-slate-600">
            <ShieldCheck className="w-5 h-5 text-teal-600 shrink-0" />
            <div className="text-left text-xs">
              <div className="font-extrabold text-slate-900 dark:text-slate-100">
                {user?.full_name || 'Authenticated Healthcare User'}
              </div>
              <div className="text-[11px] text-teal-700 dark:text-teal-400 font-bold">
                {formatRoleName(user?.role)}
                {user?.license_number ? ` • Reg: ${user.license_number}` : ''}
              </div>
            </div>
          </div>

          {/* Role Switcher */}
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-700/60 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-600 text-xs">
            <span className="text-[10px] font-extrabold text-slate-500 px-1">Role:</span>
            <select
              value={user?.role || 'PHC_DOCTOR'}
              onChange={(e) => switchUser(e.target.value as UserRole)}
              className="text-xs font-extrabold px-2.5 py-1 bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-300 rounded-xl shadow-xs border border-slate-200 dark:border-slate-600 outline-none cursor-pointer"
            >
              <option value="PHC_DOCTOR">PHC Doctor</option>
              <option value="ASHA_WORKER">ASHA Worker</option>
              <option value="DISTRICT_OFFICER">District Officer</option>
              <option value="SYSTEM_ADMIN">System Admin</option>
            </select>
          </div>

          {/* Refresh Button */}
          <button
            onClick={loadData}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 rounded-2xl text-xs font-bold shadow-xs transition-all active:scale-95 disabled:opacity-50"
            title="Refresh live dashboard data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-teal-600' : ''}`} />
            <span>{isLoading ? 'Updating...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Live Refresh Status Banner */}
      {refreshStatus && (
        <div className="text-xs font-bold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 p-2.5 rounded-xl border border-teal-200 dark:border-teal-800 flex items-center justify-between animate-in fade-in">
          <span className="flex items-center gap-2">
            <Check className="w-4 h-4 text-teal-600" />
            {refreshStatus}
          </span>
          <span className="text-[10px] text-slate-400 font-medium">
            Last sync: {lastRefreshed.toLocaleTimeString()}
          </span>
        </div>
      )}

      {/* Global Filters Bar */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          {/* Date Filter */}
          <div className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="font-bold text-slate-500">Period:</span>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as any)}
              className="font-bold px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 outline-none"
            >
              <option value="ALL">All Time</option>
              <option value="TODAY">Today</option>
              <option value="7D">Last 7 Days</option>
              <option value="30D">Last 30 Days</option>
            </select>
          </div>

          {/* Village Filter */}
          {distinctVillages.length > 0 && (
            <div className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-slate-400" />
              <span className="font-bold text-slate-500">Village:</span>
              <select
                value={villageFilter}
                onChange={(e) => setVillageFilter(e.target.value)}
                className="font-bold px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 outline-none"
              >
                <option value="ALL">All Villages ({distinctVillages.length})</option>
                {distinctVillages.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
          )}

          {/* Facility Filter */}
          {distinctFacilities.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-slate-400" />
              <span className="font-bold text-slate-500">Facility:</span>
              <select
                value={facilityFilter}
                onChange={(e) => setFacilityFilter(e.target.value)}
                className="font-bold px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 outline-none"
              >
                <option value="ALL">All Facilities</option>
                {distinctFacilities.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="text-[11px] font-bold text-slate-400">
          Displaying {filteredAssessments.length} of {assessments.length} total screening records
        </div>
      </div>

      {/* KPI Cards (100% Calculated Dynamically) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Patients */}
        <button
          onClick={() => {
            setActiveTab('ALL');
            setRiskFilter('ALL');
          }}
          className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 flex items-center gap-3 text-left hover:border-teal-400 transition-all group cursor-pointer"
        >
          <div className="w-11 h-11 rounded-xl bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 flex items-center justify-center font-bold shrink-0 group-hover:scale-105 transition-transform">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100">{totalPatientsCount}</div>
            <div className="text-[11px] text-slate-500 font-bold">Total Patients</div>
          </div>
        </button>

        {/* Pending Doctor Review */}
        <button
          onClick={() => {
            setActiveTab('REVIEW_QUEUE');
            setRiskFilter('ALL');
          }}
          className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 flex items-center gap-3 text-left hover:border-rose-400 transition-all group cursor-pointer"
        >
          <div className="w-11 h-11 rounded-xl bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 flex items-center justify-center font-bold shrink-0 group-hover:scale-105 transition-transform">
            <AlertOctagon className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-black text-rose-600">{pendingReviewAssessments.length}</div>
            <div className="text-[11px] text-slate-500 font-bold">Pending Doctor Review</div>
          </div>
        </button>

        {/* Moderate Risk */}
        <button
          onClick={() => {
            setRiskFilter('MODERATE');
          }}
          className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 flex items-center gap-3 text-left hover:border-amber-400 transition-all group cursor-pointer"
        >
          <div className="w-11 h-11 rounded-xl bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 flex items-center justify-center font-bold shrink-0 group-hover:scale-105 transition-transform">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-black text-amber-600">{modRiskCount}</div>
            <div className="text-[11px] text-slate-500 font-bold">Moderate Risk</div>
          </div>
        </button>

        {/* Low Risk / Routine */}
        <button
          onClick={() => {
            setRiskFilter('LOW');
          }}
          className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 flex items-center gap-3 text-left hover:border-emerald-400 transition-all group cursor-pointer"
        >
          <div className="w-11 h-11 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold shrink-0 group-hover:scale-105 transition-transform">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-black text-emerald-600">{lowRiskCount}</div>
            <div className="text-[11px] text-slate-500 font-bold">Low Risk / Routine</div>
          </div>
        </button>
      </div>

      {/* Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Risk Distribution Breakdown */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">Risk Distribution Breakdown</h3>
            <span className="text-[11px] font-bold text-slate-400">
              {totalRiskAssessments} total assessments
            </span>
          </div>

          {pieData.length > 0 ? (
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="h-52 w-full sm:w-1/2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Legend with percentages */}
              <div className="w-full sm:w-1/2 space-y-2 text-xs">
                {pieData.map((entry) => {
                  const pct = totalRiskAssessments > 0 ? Math.round((entry.value / totalRiskAssessments) * 100) : 0;
                  return (
                    <div key={entry.name} className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-700/50">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                        <span className="font-bold text-slate-700 dark:text-slate-200">{entry.name}</span>
                      </div>
                      <div className="font-black text-slate-900 dark:text-slate-100">
                        {entry.value} <span className="text-[10px] text-slate-400 font-medium">({pct}%)</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="h-52 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
              <Activity className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-xs font-bold text-slate-600 dark:text-slate-400">No risk assessment data available yet.</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Screenings will populate clinical risk distribution here.</p>
            </div>
          )}
        </div>

        {/* Screening Volume by Village */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">Screening Volume by Village</h3>
            <span className="text-[11px] font-bold text-slate-400">
              {villageChartData.length} villages active
            </span>
          </div>

          {villageChartData.length > 0 ? (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={villageChartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <XAxis dataKey="village" stroke="#64748b" fontSize={11} interval={0} angle={-15} textAnchor="end" />
                  <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#0d9488" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-52 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
              <MapPin className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-xs font-bold text-slate-600 dark:text-slate-400">No village screening data available.</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Village screening totals will appear once patient screenings are logged.</p>
            </div>
          )}
        </div>
      </div>

      {/* Tab Navigation & Patient Table */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-700 space-y-4">

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-700">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setActiveTab('REVIEW_QUEUE')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
                activeTab === 'REVIEW_QUEUE'
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-600/20'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              <FileSignature className="w-4 h-4" />
              <span>Doctor Review Queue ({pendingReviewAssessments.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('ALL')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
                activeTab === 'ALL'
                  ? 'bg-teal-600 text-white shadow-md shadow-teal-600/20'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              All Screenings ({filteredByScope.length})
            </button>
            <button
              onClick={() => setActiveTab('REFERRALS')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                activeTab === 'REFERRALS'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              <span>Referrals ({referralAssessments.length})</span>
            </button>
          </div>

          {/* Search & Risk Filters */}
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder={t.searchVillage}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full text-xs font-semibold pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>

            <select
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
              className="text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 outline-none"
            >
              <option value="ALL">All Risk Tiers</option>
              <option value="HIGH">High Risk</option>
              <option value="MODERATE">Moderate Risk</option>
              <option value="LOW">Low Risk</option>
            </select>
          </div>
        </div>

        {/* Screenings & Review Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 font-extrabold uppercase tracking-wider border-b border-slate-200 dark:border-slate-600">
                <th className="p-3">Patient</th>
                <th className="p-3">Village & Date</th>
                <th className="p-3">Triage & Safety</th>
                <th className="p-3">Red Flags / Symptoms</th>
                <th className="p-3">Vitals (BP / Glucose)</th>
                <th className="p-3">Referral</th>
                <th className="p-3">Clinician Review</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700 font-semibold">
              {filteredAssessments.length > 0 ? (
                filteredAssessments.map((ass) => {
                  const isEmergency = Boolean(ass.is_emergency || ass.triage_state === 'EMERGENCY');
                  const needsReview = ass.review_state === 'REVIEW_REQUIRED' || isEmergency || ass.risk_level === 'HIGH';

                  return (
                    <tr key={ass.id} className={`hover:bg-slate-50/80 dark:hover:bg-slate-700/30 transition-all ${isEmergency ? 'bg-rose-50/50 dark:bg-rose-950/20' : ''}`}>
                      <td className="p-3">
                        <div className="font-extrabold text-slate-900 dark:text-slate-100">
                          {ass.patient_name || 'Patient Record'}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          ID: {(ass.patient_id || ass.id).substring(0, 10)}
                        </div>
                      </td>

                      <td className="p-3 text-slate-600 dark:text-slate-300">
                        <div className="inline-flex items-center gap-1 font-bold">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          {ass.village || 'N/A'}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {ass.created_at ? new Date(ass.created_at).toLocaleDateString() : '—'}
                        </div>
                      </td>

                      <td className="p-3">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-black ${
                            isEmergency
                              ? 'bg-rose-600 text-white animate-pulse'
                              : ass.risk_level === 'HIGH'
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                              : ass.risk_level === 'MODERATE'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                          }`}
                        >
                          {isEmergency ? 'EMERGENCY' : ass.risk_level}
                        </span>
                      </td>

                      <td className="p-3 max-w-xs">
                        {ass.red_flags && ass.red_flags.length > 0 ? (
                          <div className="text-[11px] font-bold text-rose-700 dark:text-rose-400">
                            🚩 {ass.red_flags.join(', ')}
                          </div>
                        ) : ass.uncertainty_state && ass.uncertainty_state !== 'COMPLETE' ? (
                          <div className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
                            ⚠️ {ass.uncertainty_state}
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-500">
                            {(ass.likely_conditions || []).slice(0, 2).join(', ') || (ass.symptoms || []).slice(0, 2).join(', ') || 'Routine Check'}
                          </div>
                        )}
                      </td>

                      <td className="p-3 text-slate-600 dark:text-slate-300">
                        <div>BP: <span className="font-bold text-slate-900 dark:text-slate-100">{ass.systolic_bp || '—'}/{ass.diastolic_bp || '—'}</span></div>
                        <div className="text-[10px] text-slate-400">
                          Glu: {ass.glucose_mg_dl || '—'} | Temp: {ass.temperature_f || '—'}°F
                        </div>
                      </td>

                      {/* Referral Status Dropdown */}
                      <td className="p-3">
                        <select
                          value={ass.referral_status || 'NOT_REFERRED'}
                          onChange={(e) => updateReferralStatus(ass.id, e.target.value)}
                          className={`text-[10px] font-extrabold px-2 py-1 rounded-lg border outline-none cursor-pointer ${
                            ass.referral_status === 'REFERRED'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : ass.referral_status === 'APPOINTMENT_REQUESTED'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : ass.referral_status === 'CONSULTATION_COMPLETED'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-50 text-slate-600 border-slate-200'
                          }`}
                        >
                          <option value="NOT_REFERRED">Home Care</option>
                          <option value="REFERRED">Referred to PHC</option>
                          <option value="APPOINTMENT_REQUESTED">Teleconsult</option>
                          <option value="CONSULTATION_COMPLETED">Completed</option>
                        </select>
                      </td>

                      {/* Clinician Review Status */}
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black ${
                            ass.review_state === 'APPROVED'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : ass.review_state === 'MODIFIED'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                              : ass.review_state === 'REJECTED'
                              ? 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
                              : 'bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-950/60 dark:text-rose-300'
                          }`}
                        >
                          {ass.review_state === 'APPROVED' && <CheckCircle2 className="w-3 h-3" />}
                          {ass.review_state || (needsReview ? 'REVIEW REQUIRED' : 'NOT REQUIRED')}
                        </span>
                        {ass.reviewed_by && (
                          <div className="text-[9px] text-slate-400 mt-0.5">
                            By {ass.reviewed_by}
                          </div>
                        )}
                      </td>

                      {/* Action Buttons */}
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openHistoryModal(ass)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
                            title="View audit history & attestations"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openReviewModal(ass)}
                            className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-black shadow-sm flex items-center gap-1"
                          >
                            <FileSignature className="w-3.5 h-3.5" />
                            <span>Review & Attest</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-slate-400 font-semibold">
                    <FileSignature className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                    <p className="text-xs font-bold text-slate-600 dark:text-slate-400">
                      No matching records found in this queue.
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      New patient screening records will appear here for clinical review.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Clinician Review & Attestation Modal */}
      {selectedReviewAssessment && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 dark:border-slate-700 space-y-5 animate-in fade-in duration-200 my-8">

            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300 flex items-center justify-center">
                  <FileSignature className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">
                    Clinician Review & Safety Attestation
                  </h3>
                  <p className="text-xs text-slate-500 font-semibold">
                    Patient: {selectedReviewAssessment.patient_name || 'Patient'} ({selectedReviewAssessment.village || 'Village'})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedReviewAssessment(null)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 flex items-center justify-center hover:bg-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Field Assessment Summary */}
            <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-50 dark:bg-slate-700/50 rounded-2xl text-xs">
              <div>
                <span className="text-slate-500 font-bold block">Frontline Field Triage:</span>
                <span className="font-extrabold text-slate-900 dark:text-slate-100">
                  {selectedReviewAssessment.triage_state} ({selectedReviewAssessment.risk_level} Risk)
                </span>
              </div>
              <div>
                <span className="text-slate-500 font-bold block">Vitals Reported:</span>
                <span className="font-extrabold text-slate-900 dark:text-slate-100">
                  BP: {selectedReviewAssessment.systolic_bp || '—'}/{selectedReviewAssessment.diastolic_bp || '—'} | Temp: {selectedReviewAssessment.temperature_f || '—'}°F
                </span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-500 font-bold block">Reported Red Flags / Symptoms:</span>
                <span className="font-bold text-rose-700 dark:text-rose-400">
                  {(selectedReviewAssessment.red_flags || []).join(', ') || (selectedReviewAssessment.symptoms || []).join(', ') || 'None'}
                </span>
              </div>
            </div>

            {/* Review Decision Radios */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider block">
                Doctor's Clinical Decision
              </label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setReviewDecision('APPROVED')}
                  className={`p-3 rounded-2xl text-xs font-black border text-center transition-all cursor-pointer ${
                    reviewDecision === 'APPROVED'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-800 dark:text-emerald-300 ring-2 ring-emerald-500/20'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  ✓ Approve Field Triage
                </button>
                <button
                  type="button"
                  onClick={() => setReviewDecision('MODIFIED')}
                  className={`p-3 rounded-2xl text-xs font-black border text-center transition-all cursor-pointer ${
                    reviewDecision === 'MODIFIED'
                      ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-800 dark:text-blue-300 ring-2 ring-blue-500/20'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  ✎ Modify Triage / Care
                </button>
                <button
                  type="button"
                  onClick={() => setReviewDecision('REJECTED')}
                  className={`p-3 rounded-2xl text-xs font-black border text-center transition-all cursor-pointer ${
                    reviewDecision === 'REJECTED'
                      ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-500 text-rose-800 dark:text-rose-300 ring-2 ring-rose-500/20'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  ✕ Reject / Invalidate
                </button>
              </div>
            </div>

            {/* Clinical Modification Fields */}
            {reviewDecision === 'MODIFIED' && (
              <div className="grid grid-cols-2 gap-3 p-4 bg-blue-50/60 dark:bg-blue-950/30 rounded-2xl border border-blue-200 dark:border-blue-800">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">Modified Risk Level</label>
                  <select
                    value={modifiedRiskLevel}
                    onChange={(e) => setModifiedRiskLevel(e.target.value as any)}
                    className="w-full text-xs font-bold p-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700"
                  >
                    <option value="LOW">Low Risk</option>
                    <option value="MODERATE">Moderate Risk</option>
                    <option value="HIGH">High Risk</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">Modified Referral Status</label>
                  <select
                    value={modifiedReferral}
                    onChange={(e) => setModifiedReferral(e.target.value as any)}
                    className="w-full text-xs font-bold p-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700"
                  >
                    <option value="NOT_REFERRED">Not Referred (Home Care)</option>
                    <option value="REFERRED">Referred to PHC</option>
                    <option value="APPOINTMENT_REQUESTED">Schedule Teleconsult</option>
                    <option value="CONSULTATION_COMPLETED">Consultation Completed</option>
                  </select>
                </div>
              </div>
            )}

            {/* Clinical Notes (Mandatory) */}
            <div>
              <label className="text-xs font-black text-slate-800 dark:text-slate-200 block mb-1">
                Medical Officer's Clinical Notes <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={2}
                placeholder="Document clinical exam findings, differential rationale, or diagnostic notes..."
                value={clinicalNotes}
                onChange={(e) => setClinicalNotes(e.target.value)}
                className="w-full text-xs p-3 rounded-2xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 font-semibold focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>

            {/* Override Reason (Mandatory if modified/rejected) */}
            {(reviewDecision === 'MODIFIED' || reviewDecision === 'REJECTED') && (
              <div>
                <label className="text-xs font-black text-rose-700 dark:text-rose-400 block mb-1">
                  Override Justification / Clinical Governance Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Explain why frontline field decision is overridden..."
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  className="w-full text-xs p-3 rounded-2xl border border-rose-300 dark:border-rose-700 bg-rose-50/50 dark:bg-rose-950/20 text-slate-900 dark:text-slate-100 font-semibold focus:ring-2 focus:ring-rose-500 outline-none"
                />
              </div>
            )}

            {/* Cryptographic Digital Attestation Statement */}
            <div className="p-4 bg-teal-50 dark:bg-teal-950/40 rounded-2xl border border-teal-200 dark:border-teal-800 flex items-start gap-3">
              <input
                type="checkbox"
                id="attestCheckbox"
                checked={isAttested}
                onChange={(e) => setIsAttested(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
              />
              <label htmlFor="attestCheckbox" className="text-xs text-slate-700 dark:text-slate-300 font-bold cursor-pointer">
                I, <span className="text-teal-900 dark:text-teal-200 font-extrabold">{user?.full_name || 'Medical Officer'}</span>
                {user?.license_number ? ` (Reg: ${user.license_number})` : ''}, hereby clinically attest that I have reviewed the findings for this assessment and accept medical responsibility for this decision.
              </label>
            </div>

            {reviewErrorMessage && (
              <div className="text-xs font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/50 p-3 rounded-xl border border-rose-200">
                {reviewErrorMessage}
              </div>
            )}

            {reviewSuccessMessage && (
              <div className="text-xs font-bold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/50 p-3 rounded-xl border border-emerald-200 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>{reviewSuccessMessage}</span>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSelectedReviewAssessment(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-black text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitReview}
                disabled={isSubmittingReview}
                className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-lg shadow-teal-600/30 flex items-center gap-2 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{isSubmittingReview ? 'Signing...' : 'Sign & Submit Attestation'}</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Audit History Modal */}
      {historyAssessment && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 dark:border-slate-700 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-2.5">
                <History className="w-5 h-5 text-teal-600" />
                <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
                  Clinical Audit Trail & History
                </h3>
              </div>
              <button
                onClick={() => setHistoryAssessment(null)}
                className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 flex items-center justify-center hover:bg-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs space-y-2">
              <div className="p-2.5 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                <div className="font-bold text-slate-700 dark:text-slate-300">Patient: {historyAssessment.patient_name || 'Patient'}</div>
                <div className="text-slate-400 text-[10px]">Assessment ID: {historyAssessment.id}</div>
              </div>

              {isLoadingHistory ? (
                <div className="p-6 text-center text-slate-400 font-semibold">Loading history...</div>
              ) : auditHistory.length > 0 ? (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {auditHistory.map((item, idx) => (
                    <div key={item.id || idx} className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-teal-700 dark:text-teal-400">
                          {item.decision || item.review_state || 'Review Event'}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {item.created_at ? new Date(item.created_at).toLocaleString() : '—'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-300">
                        {item.clinical_notes || item.notes || 'No notes documented.'}
                      </div>
                      {item.reviewer_name && (
                        <div className="text-[10px] text-slate-400">Reviewer: {item.reviewer_name}</div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-slate-400 font-semibold">
                  No prior clinical review entries found for this record.
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setHistoryAssessment(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Data Source Transparency Banner */}
      <div className="text-center pt-2">
        <p className="text-[10px] text-slate-400 font-semibold">
          Data Source: Real Application Records (Dexie v4 IndexedDB / FastAPI PostgreSQL & SQLite) • Medical Authority Governed
        </p>
      </div>

    </div>
  );
};
