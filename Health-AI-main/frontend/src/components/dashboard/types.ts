export interface DashboardKpi {
  patientsScreened: number;
  patientsScreenedTrend: string;
  highRiskCases: number;
  highRiskTrend: string;
  referralsMade: number;
  referralsTrend: string;
  appointments: number;
  appointmentsTrend: string;
}

export interface RiskDistributionItem {
  name: string;
  count: number;
  percentage: number;
  color: string;
}

export interface ScreeningTrendItem {
  date: string;
  total: number;
  highRisk: number;
  moderateRisk: number;
  lowRisk?: number;
}

export interface VillageMarker {
  id: string;
  name: string;
  type: 'screened' | 'high_risk' | 'referral' | 'phc';
  x: number; // percentage in SVG coordinate system 0-100
  y: number; // percentage in SVG coordinate system 0-100
  details?: string;
}

export interface PatientTableRow {
  id: string;
  customId: string;
  name: string;
  age: number;
  gender: 'M' | 'F' | 'Other';
  riskLevel: 'HIGH' | 'MODERATE' | 'LOW' | 'NEEDS_REVIEW';
  keySymptoms: string;
  status: 'REFERRED' | 'APPOINTMENT' | 'PENDING' | 'COMPLETED' | 'UNDER_REVIEW';
  avatarUrl?: string;
  phone?: string;
  village?: string;
}

export interface TaskItem {
  id: string;
  title: string;
  timeOrSubtext: string;
  status: 'In Progress' | 'High Priority' | 'Pending' | 'Reminder';
  completed: boolean;
}

export interface UpcomingAppointment {
  id: string;
  time: string;
  patientName: string;
  purpose: string;
  facility: string;
  phone?: string;
  avatarUrl?: string;
}

export interface QuickAction {
  id: string;
  title: string;
  description: string;
  iconName: string;
  bgColor: string;
  iconColor: string;
  targetTab: string;
}
