import React, { useState, useMemo } from 'react';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { DashboardSidebar, type DashboardNavTab } from './DashboardSidebar';
import { DashboardHeader } from './DashboardHeader';
import { WelcomeHeroBanner } from './WelcomeHeroBanner';
import { KpiCardsRow } from './KpiCardsRow';
import { RiskDistributionCard } from './RiskDistributionCard';
import { ScreeningsTrendCard } from './ScreeningsTrendCard';
import { RecentPatientsTable } from './RecentPatientsTable';
import { TodayTasksCard } from './TodayTasksCard';
import { UpcomingAppointmentsCard } from './UpcomingAppointmentsCard';
import { QuickActionsRow } from './QuickActionsRow';
import { PatientDetailsModal } from './PatientDetailsModal';
import type { PatientTableRow, TaskItem, UpcomingAppointment, ScreeningTrendItem } from './types';
import type { Language } from '../../i18n/translations';
import { db } from '../../db/offlineDb';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '../../auth/AuthContext';

interface RuralHealthDashboardProps {
  lang: Language;
  onLangChange: (lang: Language) => void;
  isOnline: boolean;
  pendingSyncCount: number;
  onSyncTrigger: () => void;
  isSyncing: boolean;
  onNavigateToTab: (tab: DashboardNavTab) => void;
  onStartScreeningPatient?: (patientId?: string) => void;
  onLogout?: () => void;
}

export const RuralHealthDashboard: React.FC<RuralHealthDashboardProps> = ({
  lang,
  onLangChange,
  isOnline,
  pendingSyncCount,
  onSyncTrigger,
  isSyncing,
  onNavigateToTab,
  onStartScreeningPatient,
  onLogout,
}) => {
  const { user } = useAuth();
  const [activeSidebarTab, setActiveSidebarTab] = useState<DashboardNavTab>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientTableRow | null>(null);
  const [trendPeriod, setTrendPeriod] = useState('Last 7 Days');

  // Live queries from Dexie offline database (Single Source of Truth)
  const livePatients = useLiveQuery(() => db.patients.filter((p) => !p.is_deleted).toArray()) || [];
  const liveAssessments = useLiveQuery(() => db.assessments.filter((a) => !a.is_deleted).toArray()) || [];
  const liveAppointments = useLiveQuery(() => db.appointments.filter((a) => !a.is_deleted && a.status !== 'CANCELLED').toArray()) || [];

  // Live queries for synchronization states (Requirement 2.11 & Section 7)
  const outboxQueuedCount =
    useLiveQuery(() => db.outbox.where('status').equals('QUEUED').count()) ?? 0;
  const outboxFailedCount =
    useLiveQuery(() => db.outbox.where('status').equals('FAILED').count()) ?? 0;
  const conflictCount =
    useLiveQuery(() => db.conflicts.where('status').equals('PENDING').count()) ?? 0;
  const lastSyncMeta = useLiveQuery(() => db.sync_metadata.get('last_synced_at'));
  const lastSyncTime = lastSyncMeta?.value;

  // 1 & 2. Derived KPI metrics: Separate unique patients from screening encounters
  const kpis = useMemo(() => {
    const totalRegisteredPatients = livePatients.length;
    const totalScreeningEncounters = liveAssessments.length;

    // Distinct patients with at least 1 screening encounter
    const screenedPatientIds = new Set(
      liveAssessments.map((a) => a.patient_id).filter(Boolean)
    );
    const uniquePatientsScreened = screenedPatientIds.size;
    const repeatScreenings = Math.max(0, totalScreeningEncounters - uniquePatientsScreened);

    const highRisk = liveAssessments.filter(
      (a) => a.risk_level === 'HIGH' || a.risk_level === 'EMERGENCY'
    ).length;
    const referrals = liveAssessments.filter(
      (a) => a.referral_status === 'REFERRED' || a.referral_status === 'APPOINTMENT_REQUESTED'
    ).length;
    const appts = liveAppointments.length;

    return {
      patientsScreened: totalScreeningEncounters,
      patientsScreenedTrend: `${uniquePatientsScreened} unique (${repeatScreenings} repeat) / ${totalRegisteredPatients} registered`,
      highRiskCases: highRisk,
      highRiskTrend: highRisk > 0 ? `${highRisk} flagged cases` : '0 high-risk cases',
      referralsMade: referrals,
      referralsTrend: referrals > 0 ? `${referrals} active` : '0 referrals',
      appointments: appts,
      appointmentsTrend: appts > 0 ? `${appts} scheduled` : '0 appointments',
    };
  }, [livePatients, liveAssessments, liveAppointments]);

  // 3. Select latest valid assessment per patient using reliable timestamps and deterministic tie-breaking
  const latestAssessmentByPatient = useMemo(() => {
    const map = new Map<string, (typeof liveAssessments)[0]>();
    for (const ass of liveAssessments) {
      if (!ass.patient_id) continue;
      const existing = map.get(ass.patient_id);
      if (!existing) {
        map.set(ass.patient_id, ass);
        continue;
      }
      const timeNew = ass.created_at ? new Date(ass.created_at).getTime() : 0;
      const timeOld = existing.created_at ? new Date(existing.created_at).getTime() : 0;
      if (timeNew > timeOld) {
        map.set(ass.patient_id, ass);
      } else if (timeNew === timeOld) {
        // Deterministic tie-breaker: string comparison of assessment ID
        if (String(ass.id) > String(existing.id)) {
          map.set(ass.patient_id, ass);
        }
      }
    }
    return map;
  }, [liveAssessments]);

  // 4 & 5. Reconciled Risk Distribution: Never map unassessed or insufficient data to LOW
  const riskDistribution = useMemo(() => {
    let high = 0;
    let mod = 0;
    let low = 0;
    let review = 0;
    let unassessed = 0;

    livePatients.forEach((p) => {
      const ass = latestAssessmentByPatient.get(p.id);
      if (!ass) {
        unassessed++;
      } else if (ass.risk_level === 'HIGH' || ass.risk_level === 'EMERGENCY') {
        high++;
      } else if (ass.risk_level === 'MODERATE') {
        mod++;
      } else if (ass.risk_level === 'LOW') {
        low++;
      } else {
        // INSUFFICIENT_DATA or unclassified enums: NEVER mapped to LOW
        review++;
      }
    });

    const total = livePatients.length || 1;
    const calcPct = (cnt: number) =>
      livePatients.length > 0 ? Math.round((cnt / total) * 100) : 0;

    return [
      { name: 'High Risk', count: high, percentage: calcPct(high), color: '#EF4444' },
      { name: 'Moderate Risk', count: mod, percentage: calcPct(mod), color: '#F59E0B' },
      { name: 'Low Risk', count: low, percentage: calcPct(low), color: '#10B981' },
      { name: 'Needs Review', count: review, percentage: calcPct(review), color: '#8B5CF6' },
      { name: 'Unassessed', count: unassessed, percentage: calcPct(unassessed), color: '#94A3B8' },
    ];
  }, [livePatients, latestAssessmentByPatient]);

  // 6. Stable date keys containing the year for time-series aggregation; no silent current-date defaulting
  const screeningsTrend: ScreeningTrendItem[] = useMemo(() => {
    if (liveAssessments.length === 0) return [];

    const dateMap = new Map<
      string,
      { displayDate: string; total: number; highRisk: number; moderateRisk: number; lowRisk: number }
    >();

    liveAssessments.forEach((ass) => {
      if (!ass.created_at) return;
      const d = new Date(ass.created_at);
      if (isNaN(d.getTime())) return;

      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const sortKey = `${year}-${month}-${day}`;

      const displayDate = d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });

      if (!dateMap.has(sortKey)) {
        dateMap.set(sortKey, { displayDate, total: 0, highRisk: 0, moderateRisk: 0, lowRisk: 0 });
      }
      const entry = dateMap.get(sortKey)!;
      entry.total += 1;
      if (ass.risk_level === 'HIGH' || ass.risk_level === 'EMERGENCY') entry.highRisk += 1;
      else if (ass.risk_level === 'MODERATE') entry.moderateRisk += 1;
      else if (ass.risk_level === 'LOW') entry.lowRisk += 1;
    });

    const days = trendPeriod === 'Last 14 Days' ? 14 : trendPeriod === 'Last 30 Days' ? 30 : 7;
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));
    const startKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    const endKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    return Array.from(dateMap.entries())
      .filter(([key]) => key >= startKey && key <= endKey)
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
      .map(([, entry]) => ({
        date: entry.displayDate,
        total: entry.total,
        highRisk: entry.highRisk,
        moderateRisk: entry.moderateRisk,
        lowRisk: entry.lowRisk,
      }));
  }, [liveAssessments, trendPeriod]);

  // Patient directory table mapping with explicit UNASSESSED / NEEDS_REVIEW badges
  const patientsList: PatientTableRow[] = useMemo(() => {
    return livePatients.map((p, idx) => {
      const ass = latestAssessmentByPatient.get(p.id);
      let riskLevel: PatientTableRow['riskLevel'] = 'UNASSESSED';
      if (ass) {
        if (ass.risk_level === 'HIGH' || ass.risk_level === 'EMERGENCY') {
          riskLevel = 'HIGH';
        } else if (ass.risk_level === 'MODERATE') {
          riskLevel = 'MODERATE';
        } else if (ass.risk_level === 'LOW') {
          riskLevel = 'LOW';
        } else {
          riskLevel = 'NEEDS_REVIEW';
        }
      }

      return {
        id: p.id,
        customId: p.patient_id || `PT-${String(idx + 1).padStart(3, '0')}`,
        name: p.name,
        age: p.age,
        gender: (p.gender === 'Female' || p.gender === 'F'
          ? 'F'
          : p.gender === 'Male' || p.gender === 'M'
          ? 'M'
          : 'Other') as 'M' | 'F' | 'Other',
        riskLevel,
        keySymptoms:
          ass?.symptoms && ass.symptoms.length > 0
            ? ass.symptoms.join(', ')
            : 'No recorded assessment symptoms',
        status:
          ass?.referral_status === 'REFERRED'
            ? 'REFERRED'
            : ass?.referral_status === 'APPOINTMENT_REQUESTED'
            ? 'APPOINTMENT'
            : ass
            ? 'COMPLETED'
            : 'PENDING',
        phone: p.phone,
        village: p.village,
      };
    });
  }, [livePatients, latestAssessmentByPatient]);

  // Real Dynamic Tasks derived from workflow state
  const dynamicTasks: TaskItem[] = useMemo(() => {
    const list: TaskItem[] = [];

    if (outboxQueuedCount > 0) {
      list.push({
        id: 'task-sync',
        title: `Sync ${outboxQueuedCount} offline record(s) to cloud`,
        timeOrSubtext: 'Pending Dexie outbox mutations',
        status: 'High Priority',
        completed: false,
      });
    }

    if (conflictCount > 0) {
      list.push({
        id: 'task-conflicts',
        title: `Resolve ${conflictCount} synchronization conflict(s)`,
        timeOrSubtext: 'Optimistic concurrency collision requiring review',
        status: 'High Priority',
        completed: false,
      });
    }

    const highRiskAssessments = liveAssessments.filter(
      (a) => a.risk_level === 'HIGH' || a.risk_level === 'EMERGENCY'
    );
    highRiskAssessments.slice(0, 3).forEach((a) => {
      const p = livePatients.find((pt) => pt.id === a.patient_id);
      list.push({
        id: `task-followup-${a.id}`,
        title: `Follow-up: ${p?.name || 'Patient'} (${a.risk_level} Risk)`,
        timeOrSubtext: a.likely_conditions?.[0] || 'Urgent Triage Follow-up Required',
        status: 'High Priority',
        completed: false,
      });
    });

    return list;
  }, [outboxQueuedCount, conflictCount, liveAssessments, livePatients]);

  // Real Upcoming Appointments derived strictly from authorized appointment database
  const dynamicAppointments: UpcomingAppointment[] = useMemo(() => {
    return liveAppointments.map((a) => ({
      id: a.id,
      time: a.appointment_time || 'Schedule Unset',
      patientName: a.patient_name,
      purpose: a.likely_conditions?.[0] || 'Clinical Consultation',
      facility: a.doctor_name || a.doctor_address || 'Primary Health Centre',
      phone: a.patient_phone,
    }));
  }, [liveAppointments]);

  // Filtered patients based on header search
  const filteredPatients = useMemo(() => {
    if (!searchQuery.trim()) return patientsList;
    const q = searchQuery.toLowerCase();
    return patientsList.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.customId.toLowerCase().includes(q) ||
        (p.phone && p.phone.includes(q)) ||
        p.keySymptoms.toLowerCase().includes(q) ||
        (p.village && p.village.toLowerCase().includes(q))
    );
  }, [patientsList, searchQuery]);

  const handleSidebarTabSelect = (tab: DashboardNavTab) => {
    setActiveSidebarTab(tab);
    if (tab !== 'dashboard') {
      onNavigateToTab(tab);
    }
  };

  const handleQuickAction = (
    action: 'add_patient' | 'screen' | 'refer' | 'appointment' | 'chat'
  ) => {
    switch (action) {
      case 'add_patient':
      case 'screen':
        onNavigateToTab('screen');
        break;
      case 'refer':
        onNavigateToTab('referrals');
        break;
      case 'appointment':
        onNavigateToTab('appointments');
        break;
      case 'chat':
        onNavigateToTab('chat');
        break;
    }
  };

  // Formatted last sync time string
  const formattedLastSync = useMemo(() => {
    if (!lastSyncTime) return 'Never synchronized';
    try {
      const d = new Date(lastSyncTime);
      return `Last synced at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    } catch {
      return 'Last synced recently';
    }
  }, [lastSyncTime]);

  return (
    <div className="min-h-screen bg-[#F4F9FA] flex font-sans antialiased text-[#102A56]">
      {/* 1. Left Sidebar (Desktop) */}
      <div className="hidden lg:block shrink-0">
        <DashboardSidebar
          currentTab={activeSidebarTab}
          onSelectTab={handleSidebarTabSelect}
          isOnline={isOnline}
          appointmentCount={liveAppointments.length}
        />
      </div>

      {/* Mobile Drawer Sidebar */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative z-50 animate-in slide-in-from-left duration-200">
            <DashboardSidebar
              currentTab={activeSidebarTab}
              onSelectTab={handleSidebarTabSelect}
              isOnline={isOnline}
              appointmentCount={liveAppointments.length}
              onCloseMobileMenu={() => setMobileMenuOpen(false)}
            />
          </div>
        </div>
      )}

      {/* 2. Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
        {/* Top Header */}
        <DashboardHeader
          lang={lang}
          onLangChange={onLangChange}
          isOnline={isOnline}
          pendingSyncCount={outboxQueuedCount}
          onSyncTrigger={onSyncTrigger}
          isSyncing={isSyncing}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onToggleMobileMenu={() => setMobileMenuOpen(true)}
          onLogout={onLogout}
        />

        {/* Dashboard Content Container */}
        <main className="flex-1 p-4 sm:p-6 lg:p-7 max-w-[1440px] w-full mx-auto">
          {/* Hero Welcome Banner (Authenticated Profile Hydration) */}
          <WelcomeHeroBanner
            userName={user?.full_name}
            facilityName={user?.facility_id}
            blockName={user?.assigned_villages?.[0] ? `${user.assigned_villages[0]} Area` : undefined}
            lang={lang}
          />

          {/* Comprehensive Multi-State Synchronization Status Bar (Requirement 2.11) */}
          <div className="bg-white rounded-2xl border border-[#E5EEF1] p-3.5 sm:p-4 mb-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5 text-xs">
              {/* Backend Connectivity State */}
              <div
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl font-bold border ${
                  isOnline
                    ? 'bg-[#E7F7F0] text-[#0A9F68] border-[#0A9F68]/20'
                    : 'bg-rose-50 text-rose-700 border-rose-200'
                }`}
              >
                {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                <span>{isOnline ? 'Connected to PHC Hub' : 'Offline Mode (Local Storage)'}</span>
              </div>

              {/* Pending Outbox Operations */}
              <div
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl font-medium border ${
                  outboxQueuedCount > 0
                    ? 'bg-amber-50 text-amber-800 border-amber-200 font-bold'
                    : 'bg-slate-50 text-slate-600 border-slate-200'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>
                  {outboxQueuedCount} {outboxQueuedCount === 1 ? 'record' : 'records'} pending sync
                </span>
              </div>

              {/* Failed Outbox Records */}
              {outboxFailedCount > 0 && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl font-bold border bg-rose-50 text-rose-700 border-rose-200">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{outboxFailedCount} failed attempts</span>
                </div>
              )}

              {/* Concurrency Conflicts */}
              {conflictCount > 0 && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl font-bold border bg-purple-50 text-purple-700 border-purple-200">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{conflictCount} unresolved conflicts</span>
                </div>
              )}

              {/* Last Successful Synchronization Timestamp */}
              <div className="inline-flex items-center gap-1.5 text-slate-400 font-medium text-[11px] px-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
                <span>{formattedLastSync}</span>
              </div>
            </div>

            {/* Manual Sync Trigger Button */}
            <button
              onClick={onSyncTrigger}
              disabled={isSyncing || !isOnline}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-[#0A9F68] hover:bg-[#088758] disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs rounded-xl transition shadow-xs shrink-0 cursor-pointer disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Synchronizing...' : 'Sync Changes'}</span>
            </button>
          </div>

          {/* 4 KPI Cards Row */}
          <KpiCardsRow
            kpis={kpis}
            onCardClick={(type) => {
              if (type === 'screened' || type === 'high_risk') onNavigateToTab('patients');
              if (type === 'referrals') onNavigateToTab('referrals');
              if (type === 'appointments') onNavigateToTab('appointments');
            }}
          />

          {/* Analytics Row: 2 Columns (Risk Distribution, Screenings Trend) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            <div className="h-full">
              <RiskDistributionCard
                data={riskDistribution}
                totalPatients={livePatients.length}
              />
            </div>
            <div className="h-full">
              <ScreeningsTrendCard data={screeningsTrend} onPeriodChange={setTrendPeriod} />
            </div>
          </div>

          {/* Lower Section: Recent Patients (~62%) + Tasks & Appointments (~38%) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left Column: Recent Patients Table */}
            <div className="lg:col-span-7 flex flex-col">
              <RecentPatientsTable
                patients={filteredPatients}
                onViewAll={() => onNavigateToTab('patients')}
                onSelectPatient={(p) => setSelectedPatient(p)}
                onStartScreening={(p) => {
                  if (onStartScreeningPatient && p?.id) onStartScreeningPatient(p.id);
                  else onNavigateToTab('screen');
                }}
                onBookAppointment={() => onNavigateToTab('appointments')}
              />
            </div>

            {/* Right Column: Tasks + Appointments */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              <TodayTasksCard
                tasks={dynamicTasks}
                onViewAll={() => onNavigateToTab('patients')}
              />
              <UpcomingAppointmentsCard
                appointments={dynamicAppointments}
                onViewAll={() => onNavigateToTab('appointments')}
                onCallPatient={(phone) => {
                  if (phone) window.open(`tel:${phone}`);
                }}
              />
            </div>
          </div>

          {/* Quick Actions Row */}
          <QuickActionsRow onActionClick={handleQuickAction} />
        </main>
      </div>

      {/* Interactive Patient Details Modal */}
      <PatientDetailsModal
        patient={selectedPatient}
        onClose={() => setSelectedPatient(null)}
        onStartScreening={(p) => {
          setSelectedPatient(null);
          if (onStartScreeningPatient && p?.id) onStartScreeningPatient(p.id);
          else onNavigateToTab('screen');
        }}
        onBookAppointment={() => {
          setSelectedPatient(null);
          onNavigateToTab('appointments');
        }}
      />
    </div>
  );
};
