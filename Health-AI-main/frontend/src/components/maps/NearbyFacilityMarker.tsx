import React from 'react';
import { AdvancedMarker } from '@vis.gl/react-google-maps';
import {
  Building2,
  Cross,
  Stethoscope,
  Pill,
  Activity,
  HeartPulse,
} from 'lucide-react';
import type { NearbyHealthcareFacility } from '../../types/location';

interface NearbyFacilityMarkerProps {
  facility: NearbyHealthcareFacility;
  isSelected?: boolean;
  onClick?: (facility: NearbyHealthcareFacility) => void;
}

export const NearbyFacilityMarker: React.FC<NearbyFacilityMarkerProps> = ({
  facility,
  isSelected,
  onClick,
}) => {
  const getMarkerStyling = () => {
    switch (facility.type) {
      case 'hospital':
        return {
          bg: 'from-red-500 to-rose-600 shadow-red-500/30',
          icon: Cross,
        };
      case 'phc':
        return {
          bg: 'from-emerald-500 to-teal-600 shadow-emerald-500/30',
          icon: Building2,
        };
      case 'clinic':
        return {
          bg: 'from-purple-500 to-indigo-600 shadow-purple-500/30',
          icon: Stethoscope,
        };
      case 'pharmacy':
        return {
          bg: 'from-amber-400 to-orange-500 shadow-amber-500/30',
          icon: Pill,
        };
      case 'diagnostic':
        return {
          bg: 'from-teal-400 to-cyan-600 shadow-teal-500/30',
          icon: Activity,
        };
      default:
        return {
          bg: 'from-blue-500 to-sky-600 shadow-blue-500/30',
          icon: HeartPulse,
        };
    }
  };

  const { bg, icon: Icon } = getMarkerStyling();

  return (
    <AdvancedMarker
      position={{ lat: facility.latitude, lng: facility.longitude }}
      onClick={() => onClick?.(facility)}
      title={`${facility.name} (${facility.distanceFormatted || ''})`}
      zIndex={isSelected ? 1000 : 200}
    >
      <div className="relative group cursor-pointer select-none">
        {/* Selected Ring */}
        {isSelected && (
          <span className="absolute -inset-1.5 rounded-full border-2 border-[#102A56] bg-[#102A56]/15 animate-pulse pointer-events-none" />
        )}

        {/* Marker Icon Pin */}
        <div
          className={`relative flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br ${bg} text-white shadow-md border-2 border-white transition-transform transform group-hover:scale-120`}
        >
          <Icon className="w-3.5 h-3.5" />
        </div>
      </div>
    </AdvancedMarker>
  );
};
