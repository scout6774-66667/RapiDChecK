import type {
  DashboardKpi,
  RiskDistributionItem,
  ScreeningTrendItem,
  VillageMarker,
  PatientTableRow,
  TaskItem,
  UpcomingAppointment,
} from './types';

export const initialKpis: DashboardKpi = {
  patientsScreened: 0,
  patientsScreenedTrend: 'No records yet',
  highRiskCases: 0,
  highRiskTrend: '0 cases',
  referralsMade: 0,
  referralsTrend: '0 referrals',
  appointments: 0,
  appointmentsTrend: '0 appointments',
};

export const initialRiskDistribution: RiskDistributionItem[] = [
  { name: 'High Risk', count: 0, percentage: 0, color: '#EF4444' },
  { name: 'Moderate Risk', count: 0, percentage: 0, color: '#F59E0B' },
  { name: 'Low Risk', count: 0, percentage: 0, color: '#10B981' },
  { name: 'Needs Review', count: 0, percentage: 0, color: '#94A3B8' },
];

export const initialScreeningsTrend: ScreeningTrendItem[] = [];

export const initialVillageMarkers: VillageMarker[] = [];

export const initialRecentPatients: PatientTableRow[] = [];

export const initialTasks: TaskItem[] = [];

export const initialUpcomingAppointments: UpcomingAppointment[] = [];
