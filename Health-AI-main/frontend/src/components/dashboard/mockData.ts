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
  patientsScreened: 24,
  patientsScreenedTrend: '↑ 12% vs. last week',
  highRiskCases: 6,
  highRiskTrend: '↑ 2 new today',
  referralsMade: 12,
  referralsTrend: '↑ 8 pending follow-up',
  appointments: 10,
  appointmentsTrend: '3 today • 7 upcoming',
};

export const initialRiskDistribution: RiskDistributionItem[] = [
  { name: 'High Risk', count: 6, percentage: 25, color: '#EF4444' },
  { name: 'Moderate Risk', count: 9, percentage: 37, color: '#F59E0B' },
  { name: 'Low Risk', count: 8, percentage: 33, color: '#10B981' },
  { name: 'Needs Review', count: 1, percentage: 4, color: '#94A3B8' },
];

export const initialScreeningsTrend: ScreeningTrendItem[] = [
  { date: '8 Nov', total: 14, highRisk: 4, moderateRisk: 8, lowRisk: 2 },
  { date: '9 Nov', total: 19, highRisk: 6, moderateRisk: 11, lowRisk: 2 },
  { date: '10 Nov', total: 18, highRisk: 5, moderateRisk: 9, lowRisk: 4 },
  { date: '11 Nov', total: 22, highRisk: 6, moderateRisk: 12, lowRisk: 4 },
  { date: '12 Nov', total: 25, highRisk: 7, moderateRisk: 14, lowRisk: 4 },
  { date: '13 Nov', total: 28, highRisk: 8, moderateRisk: 15, lowRisk: 5 },
  { date: '14 Nov', total: 35, highRisk: 9, moderateRisk: 18, lowRisk: 8 },
];

export const initialVillageMarkers: VillageMarker[] = [
  { id: 'v1', name: 'Sundarpur East', type: 'screened', x: 22, y: 38 },
  { id: 'v2', name: 'Sundarpur Central', type: 'screened', x: 38, y: 42 },
  { id: 'v3', name: 'Rampur North', type: 'high_risk', x: 55, y: 39 },
  { id: 'v4', name: 'Kishanpur', type: 'screened', x: 74, y: 41 },
  { id: 'v5', name: 'Balarampur', type: 'referral', x: 30, y: 52 },
  { id: 'v6', name: 'Govindpur', type: 'high_risk', x: 48, y: 56 },
  { id: 'v7', name: 'Sundarpur Main PHC', type: 'phc', x: 64, y: 68 },
  { id: 'v8', name: 'Shantipura', type: 'referral', x: 28, y: 78 },
  { id: 'v9', name: 'Lalpur', type: 'screened', x: 42, y: 84 },
];

export const initialRecentPatients: PatientTableRow[] = [
  {
    id: 'p1',
    customId: 'PT-2024-001',
    name: 'Ramesh Kumar',
    age: 45,
    gender: 'M',
    riskLevel: 'HIGH',
    keySymptoms: 'Fever, Cough, Breathless...',
    status: 'REFERRED',
    phone: '+91 98765 43210',
    village: 'Sundarpur Ward 2',
  },
  {
    id: 'p2',
    customId: 'PT-2024-002',
    name: 'Sita Devi',
    age: 36,
    gender: 'F',
    riskLevel: 'MODERATE',
    keySymptoms: 'Headache, High BP',
    status: 'APPOINTMENT',
    phone: '+91 98765 43211',
    village: 'Sundarpur Ward 1',
  },
  {
    id: 'p3',
    customId: 'PT-2024-003',
    name: 'Ajay Mondal',
    age: 52,
    gender: 'M',
    riskLevel: 'HIGH',
    keySymptoms: 'Chest pain, Fatigue',
    status: 'PENDING',
    phone: '+91 98765 43212',
    village: 'Rampur Colony',
  },
  {
    id: 'p4',
    customId: 'PT-2024-004',
    name: 'Laxmi Kisku',
    age: 28,
    gender: 'F',
    riskLevel: 'LOW',
    keySymptoms: 'Cough, Mild fever',
    status: 'COMPLETED',
    phone: '+91 98765 43213',
    village: 'Kishanpur Village',
  },
  {
    id: 'p5',
    customId: 'PT-2024-005',
    name: 'Biren Tudu',
    age: 60,
    gender: 'M',
    riskLevel: 'MODERATE',
    keySymptoms: 'Joint pain, Diabetes risk',
    status: 'UNDER_REVIEW',
    phone: '+91 98765 43214',
    village: 'Govindpur Para',
  },
];

export const initialTasks: TaskItem[] = [
  {
    id: 't1',
    title: 'Visit Ward 3 – 5 pending households',
    timeOrSubtext: '9:00 AM – 11:00 AM',
    status: 'In Progress',
    completed: false,
  },
  {
    id: 't2',
    title: 'Follow up with 2 high-risk patients',
    timeOrSubtext: '11:00 AM – 12:00 PM',
    status: 'High Priority',
    completed: false,
  },
  {
    id: 't3',
    title: 'Sync data when online',
    timeOrSubtext: 'Synchronize 8 records',
    status: 'Pending',
    completed: false,
  },
  {
    id: 't4',
    title: 'PHC meeting',
    timeOrSubtext: '4:00 PM – 4:30 PM',
    status: 'Reminder',
    completed: false,
  },
];

export const initialUpcomingAppointments: UpcomingAppointment[] = [
  {
    id: 'a1',
    time: '10:00 AM',
    patientName: 'Sita Devi',
    purpose: 'General Check-up',
    facility: 'PHC Sundarpur',
    phone: '+91 98765 43211',
  },
  {
    id: 'a2',
    time: '11:30 AM',
    patientName: 'Ramesh Kumar',
    purpose: 'Specialist Consultation',
    facility: 'District Hospital',
    phone: '+91 98765 43210',
  },
  {
    id: 'a3',
    time: '02:00 PM',
    patientName: 'Mala Hansda',
    purpose: 'Follow-up Visit',
    facility: 'PHC Sundarpur',
    phone: '+91 98765 43215',
  },
];
