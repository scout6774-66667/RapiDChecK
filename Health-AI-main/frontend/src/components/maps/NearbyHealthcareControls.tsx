import React from 'react';
import {
  Navigation,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  Building2,
} from 'lucide-react';
import type { LocationPermissionState } from '../../types/location';

interface NearbyHealthcareControlsProps {
  mapMode: 'villages' | 'nearby';
  onSelectMapMode: (mode: 'villages' | 'nearby') => void;
  permissionState: LocationPermissionState;
  onRequestLocation: () => void;
  errorMessage?: string | null;
}

export const NearbyHealthcareControls: React.FC<NearbyHealthcareControlsProps> = ({
  mapMode,
  onSelectMapMode,
  permissionState,
  onRequestLocation,
  errorMessage,
}) => {
  const isRequesting = permissionState === 'requesting';
  const isGranted = permissionState === 'granted';
  const hasError =
    permissionState === 'denied' ||
    permissionState === 'timeout' ||
    permissionState === 'unavailable' ||
    permissionState === 'unsupported';

  return (
    <div className="flex flex-col gap-2 select-none w-full">
      {/* Top Bar: Mode Switcher & Current Location Trigger */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        {/* Mode Toggle: Village Coverage vs Nearby Healthcare */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80 shrink-0">
          <button
            type="button"
            onClick={() => onSelectMapMode('villages')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              mapMode === 'villages'
                ? 'bg-[#102A56] text-white shadow-2xs'
                : 'text-slate-600 hover:text-[#102A56]'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Village Coverage</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectMapMode('nearby');
              if (!isGranted) {
                onRequestLocation();
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              mapMode === 'nearby'
                ? 'bg-[#0A9F68] text-white shadow-2xs'
                : 'text-slate-600 hover:text-[#102A56]'
            }`}
          >
            <MapPin className="w-3.5 h-3.5 text-emerald-300" />
            <span>Nearby Healthcare</span>
          </button>
        </div>

        {/* Use My Location Trigger Button */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              onSelectMapMode('nearby');
              onRequestLocation();
            }}
            disabled={isRequesting}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer ${
              isGranted
                ? 'bg-emerald-50 text-[#0A9F68] border border-emerald-300 hover:bg-emerald-100/70'
                : isRequesting
                ? 'bg-slate-100 text-slate-500 border border-slate-200 cursor-wait'
                : hasError
                ? 'bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100'
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-blue-500/20'
            }`}
          >
            {isRequesting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0A9F68]" />
                <span>Detecting your location...</span>
              </>
            ) : isGranted ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-[#0A9F68]" />
                <span>Current Location Active</span>
              </>
            ) : hasError ? (
              <>
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span>Retry Location</span>
              </>
            ) : (
              <>
                <Navigation className="w-3.5 h-3.5" />
                <span>Use My Current Location</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Permission / Location Error Banner */}
      {hasError && errorMessage && (
        <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200/90 flex items-start justify-between gap-2 text-left">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 font-medium">
              {errorMessage}
            </p>
          </div>
          <button
            type="button"
            onClick={onRequestLocation}
            className="px-2 py-0.5 rounded-lg bg-amber-200/80 hover:bg-amber-300 text-amber-900 font-bold text-[11px] shrink-0 cursor-pointer"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
};
