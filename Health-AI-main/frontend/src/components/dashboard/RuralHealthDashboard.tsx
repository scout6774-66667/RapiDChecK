import React, { useState, useMemo } from 'react';
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
  const [activeSidebarTab, setActiveSidebarTab] = useState<DashboardNavTab>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientTableRow | null>(null);

  // Live queries from Dexie offline database (Single Source of Truth)
  const livePatients = useLiveQuery(() => db.patients.toArray()) || [];
  const liveAssessments = useLiveQuery(() => db.assessments.toArray()) || [];
  const liveAppointments = useLiveQuery(() => db.appointments.toArray()) || [];

  // Derived KPI metrics strictly from real records
  const kpis = useMemo(() => {
    const totalPatients = livePatients.length;
    const highRisk = liveAssessments.filter((a) => a.risk_level === 'HIGH' || a.risk_level === 'EMERGENCY').length;
    const referrals = liveAssessments.filter(
      (a) => a.referral_status === 'REFERRED' || a.referral_status === 'APPOINTMENT_REQUESTED'
    ).length;
    const appts = liveAppointments.length;

    return {
      patientsScreened: totalPatients,
      patientsScreenedTrend: totalPatients > 0 ? `${totalPatients} registered` : 'No records yet',
      highRiskCases: highRisk,
      highRiskTrend: highRisk > 0 ? `${highRisk} flagged cases` : '0 high-risk cases',
      referralsMade: referrals,
      referralsTrend: referrals > 0 ? `${referrals} active` : '0 referrals',
      appointments: appts,
      appointmentsTrend: appts > 0 ? `${appts} scheduled` : '0 appointments',
    };
  }, [livePatients, liveAssessments, liveAppointments]);

  // Derived Risk Distribution strictly from real assessments
  const riskDistribution = useMemo(() => {
    const high = liveAssessments.filter((a) => a.risk_level === 'HIGH' || a.risk_level === 'EMERGENCY').length;
    const mod = liveAssessments.filter((a) => a.risk_level === 'MODERATE').length;
    const low = liveAssessments.filter((a) => a.risk_level === 'LOW').length;
    const review = liveAssessments.filter((a) => a.risk_level === 'INSUFFICIENT_DATA').length;
    const total = high + mod + low + review || 1;

    return [
      {
        name: 'High Risk',
        count: high,
        percentage: liveAssessments.length > 0 ? Math.round((high / total) * 100) : 0,
        color: '#EF4444',
      },
      {
        name: 'Moderate Risk',
        count: mod,
        percentage: liveAssessments.length > 0 ? Math.round((mod / total) * 100) : 0,
        color: '#F59E0B',
      },
      {
        name: 'Low Risk',
        count: low,
        percentage: liveAssessments.length > 0 ? Math.round((low / total) * 100) : 0,
        color: '#10B981',
      },
      {
        name: 'Needs Review',
        count: review,
        percentage: liveAssessments.length > 0 ? Math.round((review / total) * 100) : 0,
        color: '#94A3B8',
      },
    ];
  }, [liveAssessments]);

  // Derived Screening Trend strictly from real assessment timestamps
  const screeningsTrend: ScreeningTrendItem[] = useMemo(() => {
    if (liveAssessments.length === 0) return [];

    const dateMap = new Map<string, { total: number; highRisk: number; moderateRisk: number; lowRisk: number }>();

    liveAssessments.forEach((ass) => {
      const d = ass.created_at ? new Date(ass.created_at) : new Date();
      const dateKey = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, { total: 0, highRisk: 0, moderateRisk: 0, lowRisk: 0 });
      }
      const entry = dateMap.get(dateKey)!;
      entry.total += 1;
      if (ass.risk_level === 'HIGH' || ass.risk_level === 'EMERGENCY') entry.highRisk += 1;
      else if (ass.risk_level === 'MODERATE') entry.moderateRisk += 1;
      else if (ass.risk_level === 'LOW') entry.lowRisk += 1;
    });

    return Array.from(dateMap.entries()).map(([date, counts]) => ({
      date,
      ...counts,
    }));
  }, [liveAssessments]);

  // Real Patients table list
  const patientsList: PatientTableRow[] = useMemo(() => {
    return livePatients.map((p, idx) => {
      const ass = liveAssessments.find((a) => a.patient_id === p.id);
      return {
        id: p.id,
        customId: p.patient_id || `PT-${String(idx + 1).padStart(3, '0')}`,
        name: p.name,
        age: p.age,
        gender: (p.gender === 'Female' || p.gender === 'F' ? 'F' : p.gender === 'Male' || p.gender === 'M' ? 'M' : 'Other') as 'M' | 'F' | 'Other',
        riskLevel: (ass?.risk_level === 'HIGH' || ass?.risk_level === 'EMERGENCY' ? 'HIGH' : ass?.risk_level === 'MODERATE' ? 'MODERATE' : 'LOW') as 'HIGH' | 'MODERATE' | 'LOW',
        keySymptoms: ass?.symptoms?.join(', ') || 'Routine screening assessment',
        status: ass?.referral_status === 'REFERRED' ? 'REFERRED' : ass?.referral_status === 'APPOINTMENT_REQUESTED' ? 'APPOINTMENT' : 'COMPLETED',
        phone: p.phone,
        village: p.village,
      };
    });
  }, [livePatients, liveAssessments]);

  // Real Dynamic Tasks derived from workflow state
  const dynamicTasks: TaskItem[] = useMemo(() => {
    const list: TaskItem[] = [];

    if (pendingSyncCount > 0) {
      list.push({
        id: 'task-sync',
        title: `Sync ${pendingSyncCount} offline record(s) to cloud`,
        timeOrSubtext: 'Pending Dexie outbox mutations',
        status: 'High Priority',
        completed: false,
      });
    }

    const highRiskAssessments = liveAssessments.filter((a) => a.risk_level === 'HIGH' || a.risk_level === 'EMERGENCY');
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
  }, [pendingSyncCount, liveAssessments, livePatients]);

  // Real Upcoming Appointments derived from database
  const dynamicAppointments: UpcomingAppointment[] = useMemo(() => {
    return liveAppointments.map((a) => ({
      id: a.id,
      time: a.appointment_time || '10:00 AM',
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

  const handleQuickAction = (action: 'add_patient' | 'screen' | 'refer' | 'appointment' | 'chat') => {
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
          pendingSyncCount={pendingSyncCount}
          onSyncTrigger={onSyncTrigger}
          isSyncing={isSyncing}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onToggleMobileMenu={() => setMobileMenuOpen(true)}
          onLogout={onLogout}
        />

        {/* Dashboard Content Container */}
        <main className="flex-1 p-4 sm:p-6 lg:p-7 max-w-[1440px] w-full mx-auto">
          {/* Hero Welcome Banner */}
          <WelcomeHeroBanner userName="Sunita Devi" blockName="Block A" facilityName="Sundarpur PHC" />

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
                totalPatients={kpis.patientsScreened}
              />
            </div>
            <div className="h-full">
              <ScreeningsTrendCard data={screeningsTrend} />
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
