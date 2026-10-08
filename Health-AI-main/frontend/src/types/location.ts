export interface UserLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export type LocationPermissionState =
  | 'not_requested'
  | 'requesting'
  | 'granted'
  | 'denied'
  | 'unavailable'
  | 'timeout'
  | 'unsupported';

export type NearbyFacilityCategory =
  | 'all'
  | 'hospital'
  | 'phc'
  | 'clinic'
  | 'pharmacy'
  | 'diagnostic';

export type NearbyRadiusKm = 1 | 5 | 10 | 25;

export interface NearbyHealthcareFacility {
  id: string;
  name: string;
  type: 'hospital' | 'phc' | 'clinic' | 'pharmacy' | 'diagnostic' | 'facility';
  latitude: number;
  longitude: number;
  address?: string;
  distanceKm?: number;
  distanceFormatted?: string;
  isOpen?: boolean;
  rating?: number;
  userRatingsTotal?: number;
  phoneNumber?: string;
  placeId?: string;
  types?: string[];
  vicinity?: string;
}
