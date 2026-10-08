import type { VillageLocation } from '../types/map';

/**
 * DEFAULT REGION MAP CENTER
 * 
 * // TODO: Replace with actual deployment region coordinates.
 * Coordinates below are placeholder coordinates representing a rural block district.
 */
export const DEFAULT_MAP_CENTER = {
  lat: 23.2324,
  lng: 87.8615,
};

export const DEFAULT_ZOOM = 12;

/**
 * VILLAGE LOCATIONS & SCREENING AGGREGATES
 * 
 * IMPORTANT:
 * // DEMO COORDINATES ONLY
 * // TODO: Replace demo latitude/longitude with actual village coordinates before production deployment.
 * 
 * Privacy Policy:
 * Individual patient coordinates and sensitive household data are NEVER displayed.
 * Only aggregate village and healthcare facility metrics are presented.
 */
export const VILLAGE_LOCATIONS: VillageLocation[] = [
  {
    id: 'village-001',
    name: 'Sundarpur',
    // TODO: Replace demo latitude/longitude with actual village coordinates.
    latitude: 23.2355,
    longitude: 87.8590,
    type: 'high-risk',
    patientsScreened: 42,
    highRiskCases: 5,
    pendingReferrals: 3,
    block: 'Block A',
    district: 'Purba Bardhaman',
    lastScreenedAt: 'Today, 09:30 AM',
  },
  {
    id: 'village-002',
    name: 'Rampur',
    // TODO: Replace demo latitude/longitude with actual village coordinates.
    latitude: 23.2480,
    longitude: 87.8720,
    type: 'screened',
    patientsScreened: 31,
    highRiskCases: 1,
    pendingReferrals: 1,
    block: 'Block A',
    district: 'Purba Bardhaman',
    lastScreenedAt: 'Today, 10:15 AM',
  },
  {
    id: 'village-003',
    name: 'Kalyanpur',
    // TODO: Replace demo latitude/longitude with actual village coordinates.
    latitude: 23.2190,
    longitude: 87.8460,
    type: 'referral-pending',
    patientsScreened: 28,
    highRiskCases: 2,
    pendingReferrals: 4,
    block: 'Block B',
    district: 'Purba Bardhaman',
    lastScreenedAt: 'Today, 11:00 AM',
  },
  {
    id: 'village-004',
    name: 'Gopalpur',
    // TODO: Replace demo latitude/longitude with actual village coordinates.
    latitude: 23.2270,
    longitude: 87.8850,
    type: 'screened',
    patientsScreened: 36,
    highRiskCases: 0,
    pendingReferrals: 0,
    block: 'Block A',
    district: 'Purba Bardhaman',
    lastScreenedAt: 'Today, 11:45 AM',
  },
  {
    id: 'village-005',
    name: 'Balarampur',
    // TODO: Replace demo latitude/longitude with actual village coordinates.
    latitude: 23.2550,
    longitude: 87.8420,
    type: 'high-risk',
    patientsScreened: 29,
    highRiskCases: 6,
    pendingReferrals: 3,
    block: 'Block B',
    district: 'Purba Bardhaman',
    lastScreenedAt: 'Yesterday',
  },
  {
    id: 'village-006',
    name: 'Shyampur',
    // TODO: Replace demo latitude/longitude with actual village coordinates.
    latitude: 23.2100,
    longitude: 87.8710,
    type: 'screened',
    patientsScreened: 24,
    highRiskCases: 1,
    pendingReferrals: 1,
    block: 'Block A',
    district: 'Purba Bardhaman',
    lastScreenedAt: 'Today, 08:30 AM',
  },
  {
    id: 'village-007',
    name: 'Govindapur',
    // TODO: Replace demo latitude/longitude with actual village coordinates.
    latitude: 23.2420,
    longitude: 87.8920,
    type: 'referral-pending',
    patientsScreened: 19,
    highRiskCases: 3,
    pendingReferrals: 3,
    block: 'Block B',
    district: 'Purba Bardhaman',
    lastScreenedAt: 'Yesterday',
  },
  {
    id: 'fac-001',
    name: 'Sundarpur Primary Health Centre',
    // TODO: Replace demo latitude/longitude with actual facility coordinates.
    latitude: 23.2324,
    longitude: 87.8615,
    type: 'facility',
    facilityType: 'PHC',
    facilityName: 'Sundarpur Block PHC',
    patientsScreened: 148,
    highRiskCases: 18,
    pendingReferrals: 15,
    block: 'Central Hub',
    district: 'Purba Bardhaman',
    lastScreenedAt: 'Active Facility',
  },
  {
    id: 'fac-002',
    name: 'Kalyanpur Health Sub-Centre',
    // TODO: Replace demo latitude/longitude with actual facility coordinates.
    latitude: 23.2160,
    longitude: 87.8430,
    type: 'facility',
    facilityType: 'Clinic',
    facilityName: 'Sub-Centre 02',
    patientsScreened: 62,
    highRiskCases: 8,
    pendingReferrals: 6,
    block: 'Block B Sub-Unit',
    district: 'Purba Bardhaman',
    lastScreenedAt: 'Active Sub-Centre',
  },
];

// Alias for convenience
export const villageLocations = VILLAGE_LOCATIONS;

/**
 * Calculates aggregated village statistics for the dashboard
 */
export function getVillageStatistics(locations: VillageLocation[] = VILLAGE_LOCATIONS) {
  const villages = locations.filter((loc) => loc.type !== 'facility');
  const facilities = locations.filter((loc) => loc.type === 'facility');

  const totalVillages = villages.length;
  const screenedCount = villages.filter((v) => v.type === 'screened').length;
  const highRiskCount = villages.filter((v) => v.type === 'high-risk').length;
  const referralPendingCount = villages.filter(
    (v) => v.type === 'referral' || v.type === 'referral-pending'
  ).length;

  const totalPatientsScreened = locations.reduce((sum, v) => sum + (v.patientsScreened || 0), 0);
  const totalHighRisk = locations.reduce((sum, v) => sum + (v.highRiskCases || 0), 0);
  const totalPendingReferrals = locations.reduce((sum, v) => sum + (v.pendingReferrals || 0), 0);

  const coveredCount = screenedCount + highRiskCount;
  const pendingCoverageCount = totalVillages - coveredCount;
  const coveragePercent = totalVillages > 0 ? Math.round((coveredCount / totalVillages) * 100) : 0;

  return {
    totalVillages,
    screenedCount,
    highRiskCount,
    referralPendingCount,
    facilityCount: facilities.length,
    coveredCount,
    pendingCoverageCount,
    coveragePercent,
    totalPatientsScreened,
    totalHighRisk,
    totalPendingReferrals,
  };
}
