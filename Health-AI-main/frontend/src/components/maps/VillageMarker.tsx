import React from 'react';
import { AdvancedMarker } from '@vis.gl/react-google-maps';
import { Users, AlertTriangle, Share2, Building2 } from 'lucide-react';
import type { VillageLocation } from '../../types/map';

interface VillageMarkerProps {
  village: VillageLocation;
  isSelected?: boolean;
  onClick?: (village: VillageLocation) => void;
}

export const VillageMarker: React.FC<VillageMarkerProps> = ({
  village,
  isSelected,
  onClick,
}) => {
  const isFacility = village.type === 'facility';
  const isHighRisk = village.type === 'high-risk';
  const isReferral = village.type === 'referral' || village.type === 'referral-pending';

  return (
    <AdvancedMarker
      position={{ lat: village.latitude, lng: village.longitude }}
      onClick={() => onClick?.(village)}
      title={`${village.name} (${village.patientsScreened || 0} screened)`}
      zIndex={isSelected ? 1000 : isHighRisk ? 500 : 100}
    >
      <div className="relative group cursor-pointer select-none">
        {/* Subtle High Risk Pulse Animation */}
        {isHighRisk && (
          <span className="absolute -inset-1 rounded-full bg-red-400 opacity-75 animate-ping pointer-events-none" />
        )}

        {/* Selected Ring */}
        {isSelected && (
          <span className="absolute -inset-1.5 rounded-full border-2 border-[#102A56] bg-[#102A56]/10 animate-pulse pointer-events-none" />
        )}

        {/* Marker Icon Pin */}
        <div
          className={`relative flex items-center justify-center border-2 border-white shadow-md transition-transform transform group-hover:scale-115 ${
            isFacility
              ? 'w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-blue-500/30'
              : isHighRisk
              ? 'w-7 h-7 rounded-full bg-gradient-to-br from-red-500 to-red-600 text-white shadow-red-500/30'
              : isReferral
              ? 'w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-amber-500/30'
              : 'w-7 h-7 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-emerald-500/30'
          }`}
        >
          {isFacility && <Building2 className="w-4 h-4" />}
          {isHighRisk && <AlertTriangle className="w-3.5 h-3.5" />}
          {isReferral && <Share2 className="w-3.5 h-3.5" />}
          {village.type === 'screened' && <Users className="w-3.5 h-3.5" />}
        </div>
      </div>
    </AdvancedMarker>
  );
};
