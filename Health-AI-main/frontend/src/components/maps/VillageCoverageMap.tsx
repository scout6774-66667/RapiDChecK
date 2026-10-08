import React, { useState, useEffect, useMemo } from 'react';
import {
  APIProvider,
  Map,
  InfoWindow,
  useMap,
} from '@vis.gl/react-google-maps';
import { AlertTriangle, WifiOff, RefreshCw, List } from 'lucide-react';
import type { VillageLocation, MapFilterType } from '../../types/map';
import { DEFAULT_MAP_CENTER, DEFAULT_ZOOM } from '../../data/villageLocations';
import { VillageMarker } from './VillageMarker';
import { VillageInfoWindow } from './VillageInfoWindow';
import { MapControls } from './MapControls';

interface VillageCoverageMapProps {
  locations: VillageLocation[];
  activeFilter?: MapFilterType;
  selectedVillage?: VillageLocation | null;
  onSelectVillage?: (village: VillageLocation | null) => void;
  isOffline?: boolean;
  onSwitchToList?: () => void;
}

/**
 * Controller to handle map pan/zoom when a village is selected or filter changes
 */
const MapAutoFitController: React.FC<{
  locations: VillageLocation[];
  selectedVillage?: VillageLocation | null;
}> = ({ locations, selectedVillage }) => {
  const map = useMap();

  // Pan to selected village
  useEffect(() => {
    if (map && selectedVillage) {
      map.panTo({ lat: selectedVillage.latitude, lng: selectedVillage.longitude });
      map.setZoom(13);
    }
  }, [map, selectedVillage]);

  // Fit bounds when locations list changes
  useEffect(() => {
    if (map && locations.length > 0 && !selectedVillage) {
      if (typeof google !== 'undefined' && google.maps && google.maps.LatLngBounds) {
        const bounds = new google.maps.LatLngBounds();
        locations.forEach((loc) => {
          bounds.extend({ lat: loc.latitude, lng: loc.longitude });
        });
        map.fitBounds(bounds, {
          top: 35,
          bottom: 35,
          left: 35,
          right: 35,
        });
      }
    }
  }, [map, locations, selectedVillage]);

  return null;
};

export const VillageCoverageMap: React.FC<VillageCoverageMapProps> = ({
  locations,
  activeFilter = 'all',
  selectedVillage: controlledSelectedVillage,
  onSelectVillage,
  isOffline = false,
  onSwitchToList,
}) => {
  const [internalSelectedVillage, setInternalSelectedVillage] =
    useState<VillageLocation | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  const selectedVillage =
    controlledSelectedVillage !== undefined
      ? controlledSelectedVillage
      : internalSelectedVillage;

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

  const filteredLocations = useMemo(() => {
    if (!activeFilter || activeFilter === 'all') return locations;
    return locations.filter((loc) => {
      if (activeFilter === 'referral' || activeFilter === 'referral-pending') {
        return loc.type === 'referral' || loc.type === 'referral-pending';
      }
      return loc.type === activeFilter;
    });
  }, [locations, activeFilter]);

  const handleMarkerClick = (village: VillageLocation) => {
    if (onSelectVillage) {
      onSelectVillage(village);
    } else {
      setInternalSelectedVillage(village);
    }
  };

  const handleCloseInfoWindow = () => {
    if (onSelectVillage) {
      onSelectVillage(null);
    } else {
      setInternalSelectedVillage(null);
    }
  };

  // 1. Missing API Key Fallback State
  if (!apiKey) {
    return (
      <div className="w-full h-full min-h-[260px] rounded-2xl border border-amber-200 bg-amber-50/70 p-6 flex flex-col items-center justify-center text-center space-y-3">
        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-700">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-xs font-bold text-[#102A56]">
            Google Maps API Key Required
          </h4>
          <p className="text-[11px] text-slate-500 max-w-xs mt-1">
            Google Maps configuration is missing. Please configure{' '}
            <code className="px-1 py-0.5 bg-amber-100/80 rounded text-amber-900 font-mono text-[10px]">
              VITE_GOOGLE_MAPS_API_KEY
            </code>{' '}
            in <span className="font-semibold">.env.local</span>.
          </p>
        </div>
        {onSwitchToList && (
          <button
            type="button"
            onClick={onSwitchToList}
            className="px-3 py-1.5 rounded-xl bg-[#0A9F68] hover:bg-[#088758] text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <List className="w-3.5 h-3.5" />
            <span>View Village Directory List</span>
          </button>
        )}
      </div>
    );
  }

  // 2. Offline Fallback Notice
  if (isOffline) {
    return (
      <div className="w-full h-full min-h-[260px] rounded-2xl border border-slate-200 bg-slate-50 p-6 flex flex-col items-center justify-center text-center space-y-3">
        <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600">
          <WifiOff className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-xs font-bold text-[#102A56]">
            Map Unavailable Offline
          </h4>
          <p className="text-[11px] text-slate-500 max-w-xs mt-1">
            Google Maps requires an active internet connection. Village data
            remains completely accessible in list view.
          </p>
        </div>
        {onSwitchToList && (
          <button
            type="button"
            onClick={onSwitchToList}
            className="px-3 py-1.5 rounded-xl bg-[#0A9F68] hover:bg-[#088758] text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <List className="w-3.5 h-3.5" />
            <span>Switch to Village List</span>
          </button>
        )}
      </div>
    );
  }

  // 3. Map Error State
  if (mapError) {
    return (
      <div className="w-full h-full min-h-[260px] rounded-2xl border border-red-200 bg-red-50/60 p-6 flex flex-col items-center justify-center text-center space-y-3">
        <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-xs font-bold text-red-800">
            Unable to Load Google Maps
          </h4>
          <p className="text-[11px] text-slate-500 max-w-xs mt-1">
            {mapError}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMapError(null)}
          className="px-3 py-1.5 rounded-xl bg-[#102A56] hover:bg-[#1A365D] text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-[240px] rounded-2xl overflow-hidden border border-[#E5EEF1] bg-[#F4F9FA]">
      <APIProvider
        apiKey={apiKey}
        onError={(err: unknown) => {
          const errorMsg =
            err instanceof Error
              ? err.message
              : typeof err === 'string'
              ? err
              : 'Google Maps load error';
          setMapError(errorMsg);
        }}
      >
        <Map
          defaultCenter={{
            lat: DEFAULT_MAP_CENTER.lat,
            lng: DEFAULT_MAP_CENTER.lng,
          }}
          defaultZoom={DEFAULT_ZOOM}
          gestureHandling="greedy"
          disableDefaultUI={true}
          mapId="ruralhealth_village_coverage_map"
          className="w-full h-full"
        >
          {/* Automatic Bounds & Pan Controller */}
          <MapAutoFitController
            locations={filteredLocations}
            selectedVillage={selectedVillage}
          />

          {/* Markers */}
          {filteredLocations.map((loc) => (
            <VillageMarker
              key={loc.id}
              village={loc}
              isSelected={selectedVillage?.id === loc.id}
              onClick={handleMarkerClick}
            />
          ))}

          {/* Info Window on Selected Marker */}
          {selectedVillage && (
            <InfoWindow
              position={{
                lat: selectedVillage.latitude,
                lng: selectedVillage.longitude,
              }}
              onCloseClick={handleCloseInfoWindow}
              pixelOffset={[0, -28]}
            >
              <VillageInfoWindow
                village={selectedVillage}
                onSelect={(v) => handleMarkerClick(v)}
              />
            </InfoWindow>
          )}

          {/* Custom Minimal Controls */}
          <MapControls locations={filteredLocations} onReset={handleCloseInfoWindow} />
        </Map>
      </APIProvider>
    </div>
  );
};
