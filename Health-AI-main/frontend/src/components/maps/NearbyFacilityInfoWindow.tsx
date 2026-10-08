import React from 'react';
import {
  Building2,
  Navigation,
  Phone,
  Star,
  Clock,
  ExternalLink,
} from 'lucide-react';
import type { NearbyHealthcareFacility, UserLocation } from '../../types/location';

interface NearbyFacilityInfoWindowProps {
  facility: NearbyHealthcareFacility;
  userLocation?: UserLocation | null;
}

export const NearbyFacilityInfoWindow: React.FC<NearbyFacilityInfoWindowProps> = ({
  facility,
  userLocation,
}) => {
  const getDirectionsUrl = () => {
    if (userLocation) {
      return `https://www.google.com/maps/dir/?api=1&origin=${userLocation.latitude},${userLocation.longitude}&destination=${facility.latitude},${facility.longitude}${
        facility.placeId ? `&destination_place_id=${facility.placeId}` : ''
      }`;
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      facility.name
    )}&query_place_id=${facility.placeId || ''}`;
  };

  const getCategoryBadge = () => {
    switch (facility.type) {
      case 'hospital':
        return { label: 'Hospital', color: 'bg-red-50 text-red-700 border-red-200' };
      case 'phc':
        return { label: 'Primary Health Centre', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      case 'clinic':
        return { label: 'Clinic / Doctor', color: 'bg-purple-50 text-purple-700 border-purple-200' };
      case 'pharmacy':
        return { label: 'Pharmacy', color: 'bg-amber-50 text-amber-700 border-amber-200' };
      case 'diagnostic':
        return { label: 'Diagnostic / Lab', color: 'bg-teal-50 text-teal-700 border-teal-200' };
      default:
        return { label: 'Healthcare Facility', color: 'bg-blue-50 text-blue-700 border-blue-200' };
    }
  };

  const badge = getCategoryBadge();

  return (
    <div className="p-2.5 min-w-[220px] max-w-[270px] text-left font-sans select-none">
      {/* Title & Type Badge */}
      <div className="mb-2">
        <h4 className="text-xs font-bold text-[#102A56] leading-tight line-clamp-2">
          {facility.name}
        </h4>
        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${badge.color}`}
          >
            <Building2 className="w-3 h-3" />
            {badge.label}
          </span>
          {facility.distanceFormatted && (
            <span className="text-[10px] font-bold text-[#0A9F68] bg-emerald-50/80 px-1.5 py-0.5 rounded">
              {facility.distanceFormatted}
            </span>
          )}
        </div>
      </div>

      {/* Address */}
      {facility.address && (
        <p className="text-[11px] text-slate-500 mb-2 line-clamp-2">
          {facility.address}
        </p>
      )}

      {/* Rating & Status Row */}
      <div className="flex items-center justify-between text-[11px] text-slate-600 mb-2.5 pb-2 border-b border-slate-100">
        {facility.rating !== undefined ? (
          <div className="flex items-center gap-1 text-amber-600 font-bold">
            <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
            <span>{facility.rating.toFixed(1)}</span>
            {facility.userRatingsTotal && (
              <span className="text-[10px] text-slate-400 font-normal">
                ({facility.userRatingsTotal})
              </span>
            )}
          </div>
        ) : (
          <span className="text-[10px] text-slate-400">Healthcare Service</span>
        )}

        {facility.isOpen !== undefined && (
          <div
            className={`flex items-center gap-1 text-[10px] font-bold ${
              facility.isOpen ? 'text-emerald-600' : 'text-slate-400'
            }`}
          >
            <Clock className="w-3 h-3" />
            <span>{facility.isOpen ? 'Open Now' : 'Closed'}</span>
          </div>
        )}
      </div>

      {/* Action Buttons: Directions & Call */}
      <div className="grid grid-cols-2 gap-1.5">
        <a
          href={getDirectionsUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="py-1.5 px-2 rounded-lg bg-[#0A9F68] hover:bg-[#088758] text-white text-[11px] font-bold transition-all flex items-center justify-center gap-1 shadow-xs"
        >
          <Navigation className="w-3 h-3" />
          <span>Directions</span>
        </a>

        {facility.phoneNumber ? (
          <a
            href={`tel:${facility.phoneNumber}`}
            className="py-1.5 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#102A56] text-[11px] font-bold transition-all flex items-center justify-center gap-1"
          >
            <Phone className="w-3 h-3" />
            <span>Call</span>
          </a>
        ) : (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
              facility.name
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="py-1.5 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition-all flex items-center justify-center gap-1"
          >
            <ExternalLink className="w-3 h-3" />
            <span>Details</span>
          </a>
        )}
      </div>
    </div>
  );
};
