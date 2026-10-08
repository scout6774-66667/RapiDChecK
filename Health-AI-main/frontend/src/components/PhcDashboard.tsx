import React, { useState, useEffect } from 'react';
import { 
  Users, AlertTriangle, 
  Search, Activity, MapPin, Stethoscope,
  ShieldCheck, CheckCircle2, FileSignature, AlertOctagon, X
} from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { translations, type Language } from '../i18n/translations';
import { 
  type LocalAssessment,
  getActiveAssessments
} from '../db/offlineDb';
import { useAuth } from '../auth/AuthContext';

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
  const [activeTab, setActiveTab] = useState<'ALL' | 'REVIEW_QUEUE'>('REVIEW_QUEUE');

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

  useEffect(() => {
    setRiskFilter(defaultRiskFilter);
  }, [defaultRiskFilter]);

  const loadData = async () => {
    if (isOnline) {
      try {
        const res = await fetch('http://127.0.0.1:8000/api/assessments');
        const data = await res.json();
        setAssessments(data.filter((a: LocalAssessment) => !a.is_deleted));
        return;
      } catch (err) {
        console.warn('Backend offline, loading Dexie local assessments', err);
      }
    }

    const localList = await getActiveAssessments();
    setAssessments(localList.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')));
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [isOnline]);

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
      const res = await fetch(`http://127.0.0.1:8000/api/v2/reviews/${selectedReviewAssessment.id}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ detail: 'Review submission failed' }));
        throw new Error(errorData.detail || 'Review submission failed');
      }

      const reviewData = await res.json();
      setReviewSuccessMessage(`Clinical Review Signed & Attested (Hash: ${reviewData.signature_hash.substring(0, 16)}...)`);
      await loadData();
      setTimeout(() => {
        setSelectedReviewAssessment(null);
      }, 1500);
    } catch (err: any) {
      setReviewErrorMessage(err.message || 'Failed to submit review. Check backend connection.');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Metrics derived dynamically from data
  const totalPatientsCount = new Set(assessments.map((a) => a.patient_id)).size;
  const highRiskCount = assessments.filter((a) => a.risk_level === 'HIGH').length;
  const modRiskCount = assessments.filter((a) => a.risk_level === 'MODERATE').length;
  const lowRiskCount = assessments.filter((a) => a.risk_level === 'LOW').length;
  
  const pendingReviewAssessments = assessments.filter((a) => 
    a.review_state === 'REVIEW_REQUIRED' || a.review_state === 'ASSIGNED' || a.review_state === 'IN_REVIEW' ||
    a.is_emergency || a.risk_level === 'HIGH' || (a.red_flags && a.red_flags.length > 0)
  );

  // Chart Data
  const pieData = [
    { name: 'High Risk', value: highRiskCount || 0, color: '#f43f5e' },
    { name: 'Moderate Risk', value: modRiskCount || 0, color: '#f59e0b' },
    { name: 'Low Risk', value: lowRiskCount || 0, color: '#10b981' }
  ];

  const villagesList = Array.from(new Set(assessments.map((a) => a.village || 'Unknown'))).filter(Boolean);

  const villageChartData = villagesList.map((v) => ({
    village: v,
    count: assessments.filter((a) => a.village === v).length
  }));

  // Filtering
  const targetAssessmentsList = activeTab === 'REVIEW_QUEUE' ? pendingReviewAssessments : assessments;
  const filteredAssessments = targetAssessmentsList.filter((a) => {
    const matchesSearch =
      (a.patient_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (a.village || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRisk = riskFilter === 'ALL' || a.risk_level === riskFilter;
    return matchesSearch && matchesRisk;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      
      {/* Header Title & Role Info */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 transition-colors">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Stethoscope className="w-7 h-7 text-teal-600" />
            <span>{t.phcTitle}</span>
          </h2>
          <p className="text-xs text-slate-500 font-semibold mt-1">
            Governed Clinical Review & Patient Referral Management Center
          </p>
        </div>

        {/* Authenticated Clinician Badge & Role Switcher */}
        <div className="flex items-center gap-3 bg-teal-50 dark:bg-slate-700 p-2.5 rounded-2xl border border-teal-200 dark:border-slate-600">
          <ShieldCheck className="w-5 h-5 text-teal-600" />
          <div className="text-left text-xs">
            <div className="font-extrabold text-slate-900 dark:text-slate-100">{user?.full_name || 'Dr. Rajesh Sharma, MBBS'}</div>
            <div className="text-[11px] text-teal-700 dark:text-teal-400 font-bold">
              {user?.role === 'PHC_DOCTOR' ? 'PHC Medical Officer' : user?.role} | Reg: {user?.license_number || 'MCI-2018-88491'}
            </div>
          </div>
          <button
            onClick={() => switchUser(user?.role === 'PHC_DOCTOR' ? 'ASHA_WORKER' : 'PHC_DOCTOR')}
            className="text-[11px] font-extrabold px-2.5 py-1 bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-300 rounded-lg shadow-sm border border-teal-200 dark:border-slate-600 hover:bg-teal-50"
            title="Switch authenticated profile"
          >
            Switch to {user?.role === 'PHC_DOCTOR' ? 'ASHA' : 'Doctor'}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center font-bold">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-black text-slate-900 dark:text-slate-100">{totalPatientsCount}</div>
            <div className="text-[11px] text-slate-500 font-bold">Total Patients</div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
            <AlertOctagon className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-black text-rose-600">{pendingReviewAssessments.length}</div>
            <div className="text-[11px] text-slate-500 font-bold">Pending Doctor Review</div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-black text-amber-600">{modRiskCount}</div>
            <div className="text-[11px] text-slate-500 font-bold">Moderate Risk</div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-black text-emerald-600">{lowRiskCount}</div>
            <div className="text-[11px] text-slate-500 font-bold">Low Risk / Routine</div>
          </div>
        </div>
      </div>

      {/* Analytics Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-700">
          <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 mb-4">Risk Distribution Breakdown</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value">
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-700">
          <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 mb-4">Screening Volume by Village</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={villageChartData}>
                <XAxis dataKey="village" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#0d9488" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Tab Navigation & Patient Table */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-700 space-y-4">
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('REVIEW_QUEUE')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
                activeTab === 'REVIEW_QUEUE'
                  ? 'bg-rose-600 text-white shadow-md'
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
                  ? 'bg-teal-600 text-white shadow-md'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              All Screenings ({assessments.length})
            </button>
          </div>

          {/* Search & Risk Filters */}
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
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
              className="text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
            >
              <option value="ALL">All Risks</option>
              <option value="HIGH">High Risk</option>
              <option value="MODERATE">Moderate Risk</option>
              <option value="LOW">Low Risk</option>
            </select>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 font-extrabold uppercase tracking-wider border-b border-slate-200 dark:border-slate-600">
                <th className="p-3">Patient</th>
                <th className="p-3">Village</th>
                <th className="p-3">Triage & Safety</th>
                <th className="p-3">Red Flags / Uncertainty</th>
                <th className="p-3">Vitals (BP / Glucose)</th>
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
                      <td className="p-3 font-bold text-slate-900 dark:text-slate-100">
                        {ass.patient_name || 'Patient Record'}
                      </td>
                      <td className="p-3 text-slate-600 dark:text-slate-300">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          {ass.village || 'N/A'}
                        </span>
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-black ${
                            isEmergency
                              ? 'bg-rose-600 text-white animate-pulse'
                              : ass.risk_level === 'HIGH'
                              ? 'bg-rose-100 text-rose-800'
                              : ass.risk_level === 'MODERATE'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
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
                            {(ass.likely_conditions || []).slice(0, 2).join(', ') || 'Routine Check'}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-slate-600 dark:text-slate-300">
                        BP: {ass.systolic_bp || '—'}/{ass.diastolic_bp || '—'} | Glu: {ass.glucose_mg_dl || '—'}
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black ${
                            ass.review_state === 'APPROVED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : ass.review_state === 'MODIFIED'
                              ? 'bg-blue-100 text-blue-800'
                              : ass.review_state === 'REJECTED'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-rose-100 text-rose-800 border border-rose-300'
                          }`}
                        >
                          {ass.review_state === 'APPROVED' && <CheckCircle2 className="w-3 h-3" />}
                          {ass.review_state || (needsReview ? 'REVIEW REQUIRED' : 'NOT REQUIRED')}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => openReviewModal(ass)}
                          className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-black shadow-sm flex items-center gap-1 ml-auto"
                        >
                          <FileSignature className="w-3.5 h-3.5" />
                          <span>Review & Attest</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-slate-400 font-semibold">
                    No matching records found in this queue.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Clinician Review & Attestation Modal (TASK-012) */}
      {selectedReviewAssessment && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 dark:border-slate-700 space-y-5 animate-in fade-in duration-200">
            
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
                    Patient: {selectedReviewAssessment.patient_name || 'Patient'} ({selectedReviewAssessment.village})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedReviewAssessment(null)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 flex items-center justify-center hover:bg-slate-200"
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
                  className={`p-3 rounded-2xl text-xs font-black border text-center transition-all ${
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
                  className={`p-3 rounded-2xl text-xs font-black border text-center transition-all ${
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
                  className={`p-3 rounded-2xl text-xs font-black border text-center transition-all ${
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
                I, <span className="text-teal-900 dark:text-teal-200 font-extrabold">{user?.full_name || 'Dr. Rajesh Sharma, MBBS'}</span> (Reg: {user?.license_number || 'MCI-2018-88491'}), hereby clinically attest that I have reviewed the findings for this assessment and accept medical responsibility for this decision.
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
                className="px-4 py-2.5 rounded-xl text-xs font-black text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitReview}
                disabled={isSubmittingReview}
                className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-lg shadow-teal-600/30 flex items-center gap-2"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{isSubmittingReview ? 'Signing...' : 'Sign & Submit Attestation'}</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
