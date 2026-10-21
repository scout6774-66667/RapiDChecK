import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3, Calendar, Download, RefreshCw,
  AlertTriangle, Users, Activity, Share2, CheckCircle2,
  TrendingUp, Building2, Info, ShieldAlert
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { type Language } from '../../i18n/translations';
import { useLanguage } from '../../i18n/LanguageContext';
import { apiFetch } from '../../api/apiConfig';
import {
  getActiveAssessments,
  getActiveReferrals
} from '../../db/offlineDb';

interface AnalysisPageProps {
  lang: Language;
  isOnline: boolean;
}

interface OverviewData {
  total_screening_encounters: number;
  unique_patients_screened: number;
  unique_high_risk_patients: number;
  high_risk_encounters: number;
  moderate_risk_encounters: number;
  low_risk_encounters: number;
  insufficient_data_encounters: number;
  total_operational_referrals: number;
  pending_referrals: number;
  in_progress_referrals: number;
  completed_referrals: number;
  cancelled_referrals: number;
  completion_rate_percent: number;
}

interface TrendPoint {
  date: string;
  encounters: number;
  unique_patients: number;
}

interface RiskDistributionItem {
  tier: string;
  label: string;
  count: number;
  percentage: number;
  color: string;
}

interface ReferralStats {
  total_referrals: number;
  by_status: Record<string, number>;
  by_priority: Record<string, number>;
  by_facility: Record<string, number>;
  completion_rate_percent: number;
}

export const AnalysisPage: React.FC<AnalysisPageProps> = ({
  lang: _lang,
  isOnline
}) => {
  const { strings } = useLanguage();
  // Filter States
  const [dateRange, setDateRange] = useState<'7D' | '30D' | '90D' | 'ALL'>('30D');
  const [selectedFacility, setSelectedFacility] = useState<string>('ALL');

  // Data States
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [riskItems, setRiskItems] = useState<RiskDistributionItem[]>([]);
  const [referralStats, setReferralStats] = useState<ReferralStats | null>(null);
  const [villageData, setVillageData] = useState<{ village: string; count: number }[]>([]);

  // UI States
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Compute date filter boundary
  const getDateBoundary = (range: '7D' | '30D' | '90D' | 'ALL'): string | null => {
    if (range === 'ALL') return null;
    const now = new Date();
    const days = range === '7D' ? 7 : range === '30D' ? 30 : 90;
    const past = new Date(now.getTime() - days * 86400000);
    return past.toISOString();
  };

  // ─── LOAD ANALYTICS DATA ───────────────────────────────────────────────────
  const loadAnalytics = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    const startDate = getDateBoundary(dateRange);

    try {
      if (isOnline) {
        try {
          const params = new URLSearchParams();
          if (startDate) params.set('start_date', startDate);
          if (selectedFacility !== 'ALL') params.set('facility_id', selectedFacility);

          const [ovRes, trRes, rkRes, rfRes] = await Promise.all([
            apiFetch(`/api/analysis/overview?${params.toString()}`, { timeoutMs: 8000 }),
            apiFetch(`/api/analysis/screening-trends?${params.toString()}&days=${dateRange === '7D' ? 7 : dateRange === '30D' ? 30 : 90}`, { timeoutMs: 8000 }),
            apiFetch(`/api/analysis/risk-distribution?${params.toString()}`, { timeoutMs: 8000 }),
            apiFetch(`/api/analysis/referral-statistics?${params.toString()}`, { timeoutMs: 8000 })
          ]);

          if (ovRes.ok && trRes.ok && rkRes.ok && rfRes.ok) {
            const ovData: OverviewData = await ovRes.json();
            const trData: TrendPoint[] = await trRes.json();
            const rkData: { distribution: RiskDistributionItem[] } = await rkRes.json();
            const rfData: ReferralStats = await rfRes.json();

            setOverview(ovData);
            setTrends(trData);
            setRiskItems(rkData.distribution || []);
            setReferralStats(rfData);

            // Fetch assessments for village breakdown
            const localAss = await getActiveAssessments();
            const vMap: Record<string, number> = {};
            localAss.forEach(a => {
              if (a.village && a.village.trim()) {
                vMap[a.village] = (vMap[a.village] || 0) + 1;
              }
            });
            setVillageData(Object.entries(vMap).map(([village, count]) => ({ village, count })).sort((a, b) => b.count - a.count));

            setIsLoading(false);
            return;
          }
        } catch (apiErr) {
          console.warn('[Analysis] Backend fetch failed, falling back to local Dexie records:', apiErr);
        }
      }

      // ─── OFFLINE LOCAL COMPUTATION ─────────────────────────────────────────
      const [allAssessments, allReferrals] = await Promise.all([
        getActiveAssessments(),
        getActiveReferrals()
      ]);

      // Filter assessments by date & facility
      const filteredAss = allAssessments.filter(a => {
        if (startDate && a.created_at && a.created_at < startDate) return false;
        if (selectedFacility !== 'ALL' && (a as any).facility_id !== selectedFacility) return false;
        return true;
      });

      // Filter referrals by date & facility
      const filteredRefs = allReferrals.filter(r => {
        if (startDate && r.created_at && r.created_at < startDate) return false;
        if (selectedFacility !== 'ALL' && r.facility_id !== selectedFacility && r.destination_facility !== selectedFacility) return false;
        return true;
      });

      const totalEncounters = filteredAss.length;
      const uniquePatients = new Set(filteredAss.map(a => a.patient_id)).size;

      const highRiskAss = filteredAss.filter(a => a.risk_level === 'HIGH' || a.risk_level === 'EMERGENCY' || a.is_emergency);
      const uniqueHighRisk = new Set(highRiskAss.map(a => a.patient_id)).size;

      const highCount = highRiskAss.length;
      const modCount = filteredAss.filter(a => a.risk_level === 'MODERATE' && !a.is_emergency).length;
      const lowCount = filteredAss.filter(a => a.risk_level === 'LOW' && !a.is_emergency).length;
      const reviewCount = filteredAss.filter(a => a.risk_level === 'INSUFFICIENT_DATA' || (a as any).risk_level === 'NEEDS_REVIEW').length;

      const totalRefs = filteredRefs.length;
      const pendingRefs = filteredRefs.filter(r => r.status === 'REQUESTED' || r.status === 'APPROVED').length;
      const inProgRefs = filteredRefs.filter(r => r.status === 'REFERRED' || r.status === 'IN_PROGRESS').length;
      const compRefs = filteredRefs.filter(r => r.status === 'COMPLETED').length;
      const cancRefs = filteredRefs.filter(r => r.status === 'CANCELLED').length;

      const denom = totalRefs - cancRefs;
      const compRate = denom > 0 ? Math.round((compRefs / denom) * 1000) / 10 : 0.0;

      setOverview({
        total_screening_encounters: totalEncounters,
        unique_patients_screened: uniquePatients,
        unique_high_risk_patients: uniqueHighRisk,
        high_risk_encounters: highCount,
        moderate_risk_encounters: modCount,
        low_risk_encounters: lowCount,
        insufficient_data_encounters: reviewCount,
        total_operational_referrals: totalRefs,
        pending_referrals: pendingRefs,
        in_progress_referrals: inProgRefs,
        completed_referrals: compRefs,
        cancelled_referrals: cancRefs,
        completion_rate_percent: compRate
      });

      // Risk Distribution
      const pct = (c: number) => totalEncounters > 0 ? Math.round((c / totalEncounters) * 1000) / 10 : 0;
      setRiskItems([
        { tier: 'HIGH_EMERGENCY', label: 'High / Emergency', count: highCount, percentage: pct(highCount), color: '#f43f5e' },
        { tier: 'MODERATE', label: 'Moderate Risk', count: modCount, percentage: pct(modCount), color: '#f59e0b' },
        { tier: 'LOW', label: 'Low Risk', count: lowCount, percentage: pct(lowCount), color: '#10b981' },
        { tier: 'INSUFFICIENT_DATA', label: 'Needs Review / Incomplete', count: reviewCount, percentage: pct(reviewCount), color: '#8b5cf6' }
      ]);

      // Trends
      const dateMap: Record<string, { encounters: number; patients: Set<string> }> = {};
      filteredAss.forEach(a => {
        const d = (a.created_at || '').substring(0, 10);
        if (d) {
          if (!dateMap[d]) dateMap[d] = { encounters: 0, patients: new Set() };
          dateMap[d].encounters++;
          dateMap[d].patients.add(a.patient_id);
        }
      });
      const sortedTrend = Object.entries(dateMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, val]) => ({
          date,
          encounters: val.encounters,
          unique_patients: val.patients.size
        }));
      setTrends(sortedTrend);

      // Referral Stats
      const bySt: Record<string, number> = {};
      const byPr: Record<string, number> = {};
      const byFa: Record<string, number> = {};
      filteredRefs.forEach(r => {
        bySt[r.status] = (bySt[r.status] || 0) + 1;
        byPr[r.priority] = (byPr[r.priority] || 0) + 1;
        byFa[r.destination_facility] = (byFa[r.destination_facility] || 0) + 1;
      });
      setReferralStats({
        total_referrals: totalRefs,
        by_status: bySt,
        by_priority: byPr,
        by_facility: byFa,
        completion_rate_percent: compRate
      });

      // Village breakdown
      const vMap: Record<string, number> = {};
      filteredAss.forEach(a => {
        if (a.village && a.village.trim()) {
          vMap[a.village] = (vMap[a.village] || 0) + 1;
        }
      });
      setVillageData(Object.entries(vMap).map(([village, count]) => ({ village, count })).sort((a, b) => b.count - a.count));
    } catch (err: any) {
      console.error('[Analysis] Error computing analytics:', err);
      setFetchError('Failed to load analytics. Displaying available local records.');
    } finally {
      setIsLoading(false);
    }
  }, [dateRange, selectedFacility, isOnline]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  // ─── EXPORT REPORT HANDLER ─────────────────────────────────────────────────
  const handleExportReport = () => {
    setIsExporting(true);
    try {
      const report = {
        title: 'RuralHealth AI — Clinical Analysis & Population-Health Insights',
        generated_at: new Date().toISOString(),
        filters: {
          date_range: dateRange,
          facility: selectedFacility
        },
        methodology: {
          encounters_definition: 'Total completed screening evaluations matching scope',
          unique_patients_definition: 'Distinct patient identifiers screened at least once in scope',
          referrals_definition: 'Aggregated directly from operational Referral records, not estimated from recommendations'
        },
        overview,
        risk_distribution: riskItems,
        screening_trends: trends,
        referral_statistics: referralStats,
        village_density: villageData
      };

      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ruralhealth_analysis_report_${dateRange}_${new Date().toISOString().substring(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Aggregate report downloaded successfully.');
    } catch (err) {
      console.error('Failed to export report:', err);
      showToast('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  // Prepare Referral Status Pipeline Data for Chart
  const referralPipelineData = referralStats ? [
    { status: 'Requested', count: referralStats.by_status['REQUESTED'] || 0, fill: '#0ea5e9' },
    { status: 'Approved', count: referralStats.by_status['APPROVED'] || 0, fill: '#3b82f6' },
    { status: 'Referred', count: referralStats.by_status['REFERRED'] || 0, fill: '#6366f1' },
    { status: 'In Progress', count: referralStats.by_status['IN_PROGRESS'] || 0, fill: '#f59e0b' },
    { status: 'Completed', count: referralStats.by_status['COMPLETED'] || 0, fill: '#10b981' },
    { status: 'Cancelled', count: referralStats.by_status['CANCELLED'] || 0, fill: '#94a3b8' }
  ] : [];

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
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#E7F7F0] flex items-center justify-center text-[#0A9F68]">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-black text-[#102A56] tracking-tight">{strings.analytics.title}</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {strings.analytics.subtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadAnalytics}
            disabled={isLoading}
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all"
            title="Refresh analytics data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{strings.common.refresh}</span>
          </button>

          <button
            onClick={handleExportReport}
            disabled={isExporting || isLoading}
            className="px-4 py-2.5 rounded-xl bg-[#0A9F68] hover:bg-[#088758] text-white text-xs font-bold flex items-center gap-2 shadow-md shadow-[#0A9F68]/20 transition-all disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>{strings.analytics.downloadReport}</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-[#E5EEF1] shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
            <Calendar className="w-4 h-4 text-[#0A9F68]" />
            <span>Period:</span>
          </div>
          <div className="inline-flex p-1 bg-slate-100 rounded-xl text-xs font-bold">
            {(['7D', '30D', '90D', 'ALL'] as const).map(range => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  dateRange === range
                    ? 'bg-white text-[#102A56] shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {range === '7D' ? 'Last 7 Days' : range === '30D' ? 'Last 30 Days' : range === '90D' ? 'Last 90 Days' : 'All Time'}
              </button>
            ))}
          </div>

          <div className="h-4 w-[1px] bg-slate-200 hidden sm:block"></div>

          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-400" />
            <select
              value={selectedFacility}
              onChange={e => setSelectedFacility(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-[#102A56] bg-white focus:outline-none focus:ring-2 focus:ring-[#0A9F68]/30"
            >
              <option value="ALL">All Facilities</option>
              <option value="PHC_SONPUR">Sonpur PHC</option>
              <option value="SC_SONPUR">Sonpur Sub-Centre</option>
              <option value="hosp_district_cardiac_01">District Super-Specialty Hospital</option>
            </select>
          </div>
        </div>

        <div className="text-[11px] text-slate-400 font-medium">
          Source: {isOnline ? 'Authoritative Database Engine' : 'Offline Local Cache'}
        </div>
      </div>

      {/* Methodology & Denominator Integrity Notice */}
      <div className="bg-[#E7F7F0]/60 border border-[#0A9F68]/30 rounded-2xl p-4 text-xs text-slate-700 flex items-start gap-3">
        <Info className="w-5 h-5 text-[#0A9F68] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-black text-[#102A56]">Analytics & Population-Health Integrity Rules</p>
          <p className="text-[11px] leading-relaxed text-slate-600">
            • <strong>Encounters vs. Patients:</strong> Multiple screenings for the same individual are tracked as encounters while unique patients are deduplicated by patient identifier.
            <br />
            • <strong>Referrals:</strong> Aggregated strictly from real operational <code>ReferralModel</code> records — never inferred from assessment risk suggestions.
            <br />
            • <strong>Read-Only Safety:</strong> The Analysis module provides read-only population intelligence and cannot mutate patient records or operational referrals.
          </p>
        </div>
      </div>

      {/* Error Alert */}
      {fetchError && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-2xl flex items-center justify-between gap-3 text-xs font-semibold">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{fetchError}</span>
          </div>
          <button
            onClick={loadAnalytics}
            className="px-3 py-1 bg-white text-amber-700 border border-amber-300 rounded-xl font-bold hover:bg-amber-100 transition-all"
          >
            Retry
          </button>
        </div>
      )}

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Encounters */}
        <div className="bg-white p-5 rounded-2xl border border-[#E5EEF1] shadow-xs">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">{strings.analytics.totalScreened}</span>
            <Activity className="w-4 h-4 text-[#0A9F68]" />
          </div>
          <p className="text-3xl font-black text-[#102A56] mt-2">
            {isLoading ? '...' : overview?.total_screening_encounters ?? 0}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Total triage evaluations recorded in scope
          </p>
        </div>

        {/* Unique Patients Screened */}
        <div className="bg-white p-5 rounded-2xl border border-[#E5EEF1] shadow-xs">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider text-sky-600">{strings.patients.totalPatients}</span>
            <Users className="w-4 h-4 text-sky-600" />
          </div>
          <p className="text-3xl font-black text-sky-700 mt-2">
            {isLoading ? '...' : overview?.unique_patients_screened ?? 0}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Distinct individuals screened in scope
          </p>
        </div>

        {/* High Risk Unique Patients */}
        <div className="bg-white p-5 rounded-2xl border border-[#E5EEF1] shadow-xs">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-600">{strings.analytics.highRiskRate}</span>
            <ShieldAlert className="w-4 h-4 text-rose-600" />
          </div>
          <p className="text-3xl font-black text-rose-700 mt-2">
            {isLoading ? '...' : overview?.unique_high_risk_patients ?? 0}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {overview?.high_risk_encounters ?? 0} critical/emergency encounters
          </p>
        </div>

        {/* Operational Referral Completion */}
        <div className="bg-white p-5 rounded-2xl border border-[#E5EEF1] shadow-xs">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">{strings.analytics.referralRate}</span>
            <Share2 className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-3xl font-black text-emerald-700 mt-2">
            {isLoading ? '...' : `${overview?.completion_rate_percent ?? 0}%`}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {overview?.completed_referrals ?? 0} of {overview?.total_operational_referrals ?? 0} referrals finalized
          </p>
        </div>
      </div>

      {/* Visualizations Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Screening Trends Over Time */}
        <div className="bg-white p-5 rounded-2xl border border-[#E5EEF1] shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-black text-[#102A56]">Screening Volume & Encounters Trend</h3>
              <p className="text-[11px] text-slate-400">Daily triage encounters vs unique patients</p>
            </div>
            <TrendingUp className="w-4 h-4 text-[#0A9F68]" />
          </div>

          {trends.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-xs">
              <Activity className="w-8 h-8 text-slate-300 mb-2" />
              <span>No screening encounters in selected period</span>
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#102A56', color: '#fff', borderRadius: '12px', fontSize: '11px', border: 'none' }}
                  />
                  <Bar dataKey="encounters" name="Total Encounters" fill="#0A9F68" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="unique_patients" name="Unique Patients" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Chart 2: Risk Distribution Breakdown */}
        <div className="bg-white p-5 rounded-2xl border border-[#E5EEF1] shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-black text-[#102A56]">Clinical Risk Distribution</h3>
              <p className="text-[11px] text-slate-400">Evaluated triage breakdown across verified tiers</p>
            </div>
            <Activity className="w-4 h-4 text-rose-500" />
          </div>

          {riskItems.every(r => r.count === 0) ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-xs">
              <ShieldAlert className="w-8 h-8 text-slate-300 mb-2" />
              <span>No clinical risk data available in this scope</span>
            </div>
          ) : (
            <div className="h-64 flex flex-col sm:flex-row items-center justify-center gap-4">
              <div className="w-48 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={riskItems.filter(r => r.count > 0)}
                      dataKey="count"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={75}
                      paddingAngle={3}
                    >
                      {riskItems.map((entry, idx) => (
                        <Cell key={`cell-${idx}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#102A56', color: '#fff', borderRadius: '12px', fontSize: '11px', border: 'none' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Legend List */}
              <div className="space-y-2 text-xs">
                {riskItems.map(item => (
                  <div key={item.tier} className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="font-semibold text-slate-700">{item.label}:</span>
                    <strong className="text-[#102A56]">{item.count}</strong>
                    <span className="text-slate-400 text-[10px]">({item.percentage}%)</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Chart 3: Operational Referral Status Pipeline */}
        <div className="bg-white p-5 rounded-2xl border border-[#E5EEF1] shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-black text-[#102A56]">Operational Referral Pipeline</h3>
              <p className="text-[11px] text-slate-400">Actual referral entities grouped by current operational status</p>
            </div>
            <Share2 className="w-4 h-4 text-sky-600" />
          </div>

          {referralPipelineData.every(p => p.count === 0) ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-xs">
              <Share2 className="w-8 h-8 text-slate-300 mb-2" />
              <span>No referral records recorded in selected scope</span>
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={referralPipelineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="status" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#102A56', color: '#fff', borderRadius: '12px', fontSize: '11px', border: 'none' }}
                  />
                  <Bar dataKey="count" name="Referral Count" radius={[4, 4, 0, 0]}>
                    {referralPipelineData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Chart 4: Village Screening Density */}
        <div className="bg-white p-5 rounded-2xl border border-[#E5EEF1] shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-black text-[#102A56]">Screening Volume by Village</h3>
              <p className="text-[11px] text-slate-400">Encounter concentration across assigned rural communities</p>
            </div>
            <Building2 className="w-4 h-4 text-[#0A9F68]" />
          </div>

          {villageData.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-xs">
              <Building2 className="w-8 h-8 text-slate-300 mb-2" />
              <span>No village breakdown recorded</span>
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={villageData.slice(0, 6)} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="village" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#102A56', color: '#fff', borderRadius: '12px', fontSize: '11px', border: 'none' }}
                  />
                  <Bar dataKey="count" name="Screenings" fill="#102A56" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
