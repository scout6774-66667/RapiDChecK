export type VillageMarkerType =
  | 'screened'
  | 'high-risk'
  | 'referral'
  | 'referral-pending'
  | 'facility';

export interface VillageLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  type: VillageMarkerType;
  patientsScreened?: number;
  highRiskCases?: number;
  pendingReferrals?: number;
  facilityName?: string;
  facilityType?: 'PHC' | 'CHC' | 'Hospital' | 'Clinic';
  block?: string;
  district?: string;
  lastScreenedAt?: string;
}

export type MapFilterType =
  | 'all'
  | 'screened'
  | 'high-risk'
  | 'referral'
  | 'referral-pending'
  | 'facility';

export interface MapCenterConfig {
  lat: number;
  lng: number;
}
