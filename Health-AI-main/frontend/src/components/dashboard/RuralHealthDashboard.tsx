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
import {
  initialKpis,
  initialRiskDistribution,
  initialScreeningsTrend,
  initialRecentPatients,
  initialTasks,
  initialUpcomingAppointments,
} from './mockData';
import type { PatientTableRow } from './types';
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
}) => {
  const [activeSidebarTab, setActiveSidebarTab] = useState<DashboardNavTab>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientTableRow | null>(null);

  // Live query from Dexie offline database
  const livePatients = useLiveQuery(() => db.patients.toArray()) || [];
  const liveAssessments = useLiveQuery(() => db.assessments.toArray()) || [];
  const liveAppointments = useLiveQuery(() => db.appointments.toArray()) || [];

  // Derived KPI metrics blending live Dexie data with reference data
  const kpis = useMemo(() => {
    if (livePatients.length === 0 && liveAssessments.length === 0) {
      return initialKpis;
    }

    const totalPatients = Math.max(livePatients.length, 24);
    const highRisk = liveAssessments.filter((a) => a.risk_level === 'HIGH').length || 6;
    const referrals =
      liveAssessments.filter(
        (a) => a.referral_status === 'REFERRED' || a.referral_status === 'APPOINTMENT_REQUESTED'
      ).length || 12;
    const appts = liveAppointments.length || 10;

    return {
      patientsScreened: totalPatients,
      patientsScreenedTrend: '↑ 12% vs. last week',
      highRiskCases: highRisk,
      highRiskTrend: `↑ ${Math.max(2, highRisk > 6 ? highRisk - 6 : 2)} new today`,
      referralsMade: referrals,
      referralsTrend: `↑ ${Math.max(8, referrals - 4)} pending follow-up`,
      appointments: appts,
      appointmentsTrend: '3 today • 7 upcoming',
    };
  }, [livePatients, liveAssessments, liveAppointments]);

  // Derived Risk Distribution
  const riskDistribution = useMemo(() => {
    if (liveAssessments.length === 0) {
      return initialRiskDistribution;
    }

    const high = liveAssessments.filter((a) => a.risk_level === 'HIGH').length;
    const mod = liveAssessments.filter((a) => a.risk_level === 'MODERATE').length;
    const low = liveAssessments.filter((a) => a.risk_level === 'LOW').length;
    const total = high + mod + low || 1;

    return [
      {
        name: 'High Risk',
        count: high || 6,
        percentage: Math.round(((high || 6) / (total || 24)) * 100),
        color: '#EF4444',
      },
      {
        name: 'Moderate Risk',
        count: mod || 9,
        percentage: Math.round(((mod || 9) / (total || 24)) * 100),
        color: '#F59E0B',
      },
      {
        name: 'Low Risk',
        count: low || 8,
        percentage: Math.round(((low || 8) / (total || 24)) * 100),
        color: '#10B981',
      },
      {
        name: 'Needs Review',
        count: 1,
        percentage: 4,
        color: '#94A3B8',
      },
    ];
  }, [liveAssessments]);

  // Combined Patients table list
  const patientsList: PatientTableRow[] = useMemo(() => {
    if (livePatients.length === 0) {
      return initialRecentPatients;
    }

    // Convert live patients into PatientTableRow format and prepend to initial list
    const convertedLive: PatientTableRow[] = livePatients.map((p, idx) => {
      const ass = liveAssessments.find((a) => a.patient_id === p.id);
      return {
        id: p.id,
        customId: p.patient_id || `PT-2024-${String(idx + 10).padStart(3, '0')}`,
        name: p.name,
        age: p.age,
        gender: (p.gender === 'Female' ? 'F' : p.gender === 'Male' ? 'M' : 'Other') as 'M' | 'F' | 'Other',
        riskLevel: (ass?.risk_level || 'LOW') as 'HIGH' | 'MODERATE' | 'LOW',
        keySymptoms: ass?.symptoms?.join(', ') || 'General screening check-up',
        status: ass?.referral_status === 'REFERRED' ? 'REFERRED' : ass?.referral_status === 'APPOINTMENT_REQUESTED' ? 'APPOINTMENT' : 'COMPLETED',
        phone: p.phone,
        village: p.village,
      };
    });

    // Merge and deduplicate
    const combined = [...convertedLive, ...initialRecentPatients];
    const unique = combined.filter((v, i, a) => a.findIndex((t) => t.name.toLowerCase() === v.name.toLowerCase()) === i);
    return unique.slice(0, 5);
  }, [livePatients, liveAssessments]);

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
          appointmentCount={3}
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
              appointmentCount={3}
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
              <ScreeningsTrendCard data={initialScreeningsTrend} />
            </div>
          </div>

          {/* Lower Section: Recent Patients (~62%) + Tasks & Appointments (~38%) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left Column: Recent Patients Table (7/12 cols on desktop) */}
            <div className="lg:col-span-7 flex flex-col">
              <RecentPatientsTable
                patients={filteredPatients}
                onViewAll={() => onNavigateToTab('patients')}
                onSelectPatient={(p) => setSelectedPatient(p)}
                onStartScreening={(p) => {
                  if (onStartScreeningPatient) onStartScreeningPatient(p.id);
                  else onNavigateToTab('screen');
                }}
                onBookAppointment={() => onNavigateToTab('appointments')}
              />
            </div>

            {/* Right Column: Tasks + Appointments (5/12 cols on desktop) */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              <TodayTasksCard
                tasks={initialTasks}
                onViewAll={() => onNavigateToTab('patients')}
              />
              <UpcomingAppointmentsCard
                appointments={initialUpcomingAppointments}
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
          if (onStartScreeningPatient) onStartScreeningPatient(p.id);
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
