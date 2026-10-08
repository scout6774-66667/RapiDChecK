import React, { useState, useEffect } from 'react';
import { AdvancedMarker, InfoWindow, useMap } from '@vis.gl/react-google-maps';
import { Navigation, ShieldCheck } from 'lucide-react';
import type { UserLocation } from '../../types/location';

interface CurrentLocationMarkerProps {
  location: UserLocation;
}

/**
 * Renders an accurate Google Maps geographical circle representing device accuracy
 */
const LocationAccuracyCircle: React.FC<{
  center: { lat: number; lng: number };
  radiusMeters: number;
}> = ({ center, radiusMeters }) => {
  const map = useMap();

  useEffect(() => {
    if (!map || !radiusMeters || typeof google === 'undefined' || !google.maps?.Circle) {
      return;
    }

    const circle = new google.maps.Circle({
      map,
      center,
      radius: Math.max(radiusMeters, 15), // minimum visible 15m radius
      fillColor: '#3B82F6',
      fillOpacity: 0.14,
      strokeColor: '#2563EB',
      strokeOpacity: 0.45,
      strokeWeight: 1.5,
      clickable: false,
      zIndex: 50,
    });

    return () => {
      circle.setMap(null);
    };
  }, [map, center.lat, center.lng, radiusMeters]);

  return null;
};

export const CurrentLocationMarker: React.FC<CurrentLocationMarkerProps> = ({
  location,
}) => {
  const [showInfo, setShowInfo] = useState<boolean>(false);

  return (
    <>
      {/* 1. Accuracy Circle on Map */}
      {location.accuracy && (
        <LocationAccuracyCircle
          center={{ lat: location.latitude, lng: location.longitude }}
          radiusMeters={location.accuracy}
        />
      )}

      {/* 2. Blue Current Location Pin */}
      <AdvancedMarker
        position={{ lat: location.latitude, lng: location.longitude }}
        onClick={() => setShowInfo(true)}
        title="Your Current Location"
        zIndex={1500}
      >
        <div className="relative group cursor-pointer flex flex-col items-center select-none">
          {/* Subtle Radar Pulse Ring */}
          <span className="absolute -inset-2 rounded-full bg-blue-400 opacity-60 animate-ping pointer-events-none" />

          {/* Location Badge Pin */}
          <div className="relative flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-sky-400 text-white shadow-xl border-2.5 border-white">
            <Navigation className="w-4 h-4 fill-white text-white rotate-45" />
          </div>

          {/* You are here label badge */}
          <div className="mt-1 px-2 py-0.5 rounded-full bg-[#102A56] text-white text-[9px] font-extrabold tracking-wider shadow-md whitespace-nowrap border border-white/40">
            YOU ARE HERE
          </div>
        </div>
      </AdvancedMarker>

      {/* 3. Current Location Info Window */}
      {showInfo && (
        <InfoWindow
          position={{ lat: location.latitude, lng: location.longitude }}
          onCloseClick={() => setShowInfo(false)}
          pixelOffset={[0, -32]}
        >
          <div className="p-2.5 text-left font-sans select-none min-w-[200px]">
            <div className="flex items-center gap-1.5 text-blue-700 font-bold text-xs mb-1">
              <ShieldCheck className="w-4 h-4" />
              <span>Your Current Location</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Location detected from this device.
            </p>
            {location.accuracy && (
              <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
                <span>Accuracy:</span>
                <span className="font-bold text-blue-600 tabular-nums">
                  approximately {Math.round(location.accuracy)} m
                </span>
              </div>
            )}
          </div>
        </InfoWindow>
      )}
    </>
  );
};
