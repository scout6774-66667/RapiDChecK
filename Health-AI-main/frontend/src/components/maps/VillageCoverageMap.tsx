import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  APIProvider,
  Map,
  InfoWindow,
  useMap,
} from '@vis.gl/react-google-maps';
import { AlertTriangle, WifiOff, RefreshCw, List, ShieldCheck } from 'lucide-react';
import type { VillageLocation, MapFilterType } from '../../types/map';
import type {
  UserLocation,
  NearbyHealthcareFacility,
  NearbyFacilityCategory,
  NearbyRadiusKm,
} from '../../types/location';
import { DEFAULT_MAP_CENTER, DEFAULT_ZOOM } from '../../data/villageLocations';
import { VillageMarker } from './VillageMarker';
import { VillageInfoWindow } from './VillageInfoWindow';
import { CurrentLocationMarker } from './CurrentLocationMarker';
import { NearbyFacilityMarker } from './NearbyFacilityMarker';
import { NearbyFacilityInfoWindow } from './NearbyFacilityInfoWindow';
import { MapControls } from './MapControls';
import { useNearbyPlaces } from '../../hooks/useNearbyPlaces';

interface VillageCoverageMapProps {
  locations?: VillageLocation[];
  activeFilter?: MapFilterType;
  selectedVillage?: VillageLocation | null;
  onSelectVillage?: (village: VillageLocation | null) => void;
  isOffline?: boolean;
  onSwitchToList?: () => void;
  // Nearby Healthcare Props
  mapMode?: 'villages' | 'nearby';
  userLocation?: UserLocation | null;
  nearbyCategory?: NearbyFacilityCategory;
  nearbyRadiusKm?: NearbyRadiusKm;
  selectedNearbyFacility?: NearbyHealthcareFacility | null;
  onSelectNearbyFacility?: (facility: NearbyHealthcareFacility | null) => void;
  onNearbyFacilitiesLoaded?: (facilities: NearbyHealthcareFacility[]) => void;
}

/**
 * Controller to handle immediate exact map centering on user location or selected items
 */
const MapCenterController: React.FC<{
  locations: VillageLocation[];
  selectedVillage?: VillageLocation | null;
  userLocation?: UserLocation | null;
  selectedNearbyFacility?: NearbyHealthcareFacility | null;
  mapMode: 'villages' | 'nearby';
}> = ({
  locations,
  selectedVillage,
  userLocation,
  selectedNearbyFacility,
  mapMode,
}) => {
  const map = useMap();
  const lastCenteredLocationRef = useRef<string | null>(null);

  // 1. Immediately pan and zoom (16) on user's exact current device coordinates
  useEffect(() => {
    if (map && userLocation && mapMode === 'nearby') {
      const locKey = `${userLocation.latitude},${userLocation.longitude}`;
      if (lastCenteredLocationRef.current !== locKey && !selectedNearbyFacility) {
        lastCenteredLocationRef.current = locKey;
        map.panTo({
          lat: userLocation.latitude,
          lng: userLocation.longitude,
        });
        map.setZoom(16); // High-detail street/building level as requested
      }
    }
  }, [map, userLocation, mapMode, selectedNearbyFacility]);

  // 2. Pan to selected nearby facility if clicked
  useEffect(() => {
    if (map && selectedNearbyFacility && mapMode === 'nearby') {
      map.panTo({
        lat: selectedNearbyFacility.latitude,
        lng: selectedNearbyFacility.longitude,
      });
      map.setZoom(16);
    }
  }, [map, selectedNearbyFacility, mapMode]);

  // 3. Pan to selected village if in village mode
  useEffect(() => {
    if (map && selectedVillage && mapMode === 'villages') {
      map.panTo({ lat: selectedVillage.latitude, lng: selectedVillage.longitude });
      map.setZoom(13);
    }
  }, [map, selectedVillage, mapMode]);

  // 4. Initial village mode bounds fit (only if in village mode without selected village)
  useEffect(() => {
    if (map && mapMode === 'villages' && locations.length > 0 && !selectedVillage) {
      if (typeof google !== 'undefined' && google.maps?.LatLngBounds) {
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
  }, [map, mapMode, locations, selectedVillage]);

  return null;
};

/**
 * Subcomponent to fetch and bridge Google Places inside APIProvider
 */
const PlacesDataBridge: React.FC<{
  userLocation: UserLocation | null;
  radiusKm: NearbyRadiusKm;
  category: NearbyFacilityCategory;
  isOffline: boolean;
  onLoaded?: (facilities: NearbyHealthcareFacility[]) => void;
  children: (data: {
    facilities: NearbyHealthcareFacility[];
    loading: boolean;
    error: string | null;
  }) => React.ReactNode;
}> = ({ userLocation, radiusKm, category, isOffline, onLoaded, children }) => {
  const { facilities, loading, error } = useNearbyPlaces({
    userLocation,
    radiusKm,
    category,
    isOffline,
  });

  useEffect(() => {
    if (onLoaded) {
      onLoaded(facilities);
    }
  }, [facilities, onLoaded]);

  return <>{children({ facilities, loading, error })}</>;
};

export const VillageCoverageMap: React.FC<VillageCoverageMapProps> = ({
  locations = [],
  activeFilter = 'all',
  selectedVillage: controlledSelectedVillage,
  onSelectVillage,
  isOffline = false,
  onSwitchToList,
  mapMode = 'villages',
  userLocation,
  nearbyCategory = 'all',
  nearbyRadiusKm = 5,
  selectedNearbyFacility: controlledSelectedNearbyFacility,
  onSelectNearbyFacility,
  onNearbyFacilitiesLoaded,
}) => {
  const [internalSelectedVillage, setInternalSelectedVillage] =
    useState<VillageLocation | null>(null);
  const [internalSelectedFacility, setInternalSelectedFacility] =
    useState<NearbyHealthcareFacility | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  const selectedVillage =
    controlledSelectedVillage !== undefined
      ? controlledSelectedVillage
      : internalSelectedVillage;

  const selectedNearbyFacility =
    controlledSelectedNearbyFacility !== undefined
      ? controlledSelectedNearbyFacility
      : internalSelectedFacility;

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

  const handleFacilityClick = (facility: NearbyHealthcareFacility) => {
    if (onSelectNearbyFacility) {
      onSelectNearbyFacility(facility);
    } else {
      setInternalSelectedFacility(facility);
    }
  };

  const handleCloseVillageInfoWindow = () => {
    if (onSelectVillage) {
      onSelectVillage(null);
    } else {
      setInternalSelectedVillage(null);
    }
  };

  const handleCloseFacilityInfoWindow = () => {
    if (onSelectNearbyFacility) {
      onSelectNearbyFacility(null);
    } else {
      setInternalSelectedFacility(null);
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
            <span>View Directory List</span>
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
            Live Google Maps and Places require an active internet connection.
            Cached village data remains accessible in list mode.
          </p>
        </div>
        {onSwitchToList && (
          <button
            type="button"
            onClick={onSwitchToList}
            className="px-3 py-1.5 rounded-xl bg-[#0A9F68] hover:bg-[#088758] text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <List className="w-3.5 h-3.5" />
            <span>Switch to List View</span>
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
    <div className="relative w-full h-full min-h-[260px] rounded-2xl overflow-hidden border border-[#E5EEF1] bg-[#F4F9FA]">
      {/* Developer Diagnostic Overlay (Development Mode Only) */}
      {import.meta.env.DEV && userLocation && (
        <div className="absolute top-2 left-2 z-30 bg-slate-900/85 backdrop-blur-md text-white p-2 rounded-xl text-[10px] font-mono shadow-lg border border-slate-700/60 pointer-events-none max-w-xs space-y-0.5">
          <div className="flex items-center gap-1 font-bold text-emerald-400">
            <ShieldCheck className="w-3 h-3" />
            <span>GPS Diagnostic (Dev Only)</span>
          </div>
          <div>Lat: {userLocation.latitude.toFixed(6)}</div>
          <div>Lng: {userLocation.longitude.toFixed(6)}</div>
          <div>Accuracy: ~{Math.round(userLocation.accuracy || 0)} m</div>
        </div>
      )}

      <APIProvider
        apiKey={apiKey}
        libraries={['places', 'marker']}
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
            lat: userLocation ? userLocation.latitude : DEFAULT_MAP_CENTER.lat,
            lng: userLocation ? userLocation.longitude : DEFAULT_MAP_CENTER.lng,
          }}
          defaultZoom={userLocation ? 16 : DEFAULT_ZOOM}
          gestureHandling="greedy"
          disableDefaultUI={true}
          mapId="ruralhealth_village_coverage_map"
          className="w-full h-full"
        >
          <PlacesDataBridge
            userLocation={userLocation || null}
            radiusKm={nearbyRadiusKm}
            category={nearbyCategory}
            isOffline={isOffline}
            onLoaded={onNearbyFacilitiesLoaded}
          >
            {({ facilities }) => (
              <>
                {/* Immediate Center Controller */}
                <MapCenterController
                  locations={filteredLocations}
                  selectedVillage={selectedVillage}
                  userLocation={userLocation}
                  selectedNearbyFacility={selectedNearbyFacility}
                  mapMode={mapMode}
                />

                {/* 1. Village Markers (when in villages mode) */}
                {mapMode === 'villages' &&
                  filteredLocations.map((loc) => (
                    <VillageMarker
                      key={loc.id}
                      village={loc}
                      isSelected={selectedVillage?.id === loc.id}
                      onClick={handleMarkerClick}
                    />
                  ))}

                {/* 2. Current User Device Location Marker with Accuracy Circle */}
                {userLocation && (
                  <CurrentLocationMarker location={userLocation} />
                )}

                {/* 3. Nearby Healthcare Facility Markers */}
                {mapMode === 'nearby' &&
                  facilities.map((fac) => (
                    <NearbyFacilityMarker
                      key={fac.id}
                      facility={fac}
                      isSelected={selectedNearbyFacility?.id === fac.id}
                      onClick={handleFacilityClick}
                    />
                  ))}

                {/* Info Window on Selected Village */}
                {mapMode === 'villages' && selectedVillage && (
                  <InfoWindow
                    position={{
                      lat: selectedVillage.latitude,
                      lng: selectedVillage.longitude,
                    }}
                    onCloseClick={handleCloseVillageInfoWindow}
                    pixelOffset={[0, -28]}
                  >
                    <VillageInfoWindow
                      village={selectedVillage}
                      onSelect={(v) => handleMarkerClick(v)}
                    />
                  </InfoWindow>
                )}

                {/* Info Window on Selected Nearby Facility */}
                {mapMode === 'nearby' && selectedNearbyFacility && (
                  <InfoWindow
                    position={{
                      lat: selectedNearbyFacility.latitude,
                      lng: selectedNearbyFacility.longitude,
                    }}
                    onCloseClick={handleCloseFacilityInfoWindow}
                    pixelOffset={[0, -28]}
                  >
                    <NearbyFacilityInfoWindow
                      facility={selectedNearbyFacility}
                      userLocation={userLocation}
                    />
                  </InfoWindow>
                )}

                {/* Map Controls */}
                <MapControls
                  locations={filteredLocations}
                  onReset={() => {
                    handleCloseVillageInfoWindow();
                    handleCloseFacilityInfoWindow();
                  }}
                />
              </>
            )}
          </PlacesDataBridge>
        </Map>
      </APIProvider>
    </div>
  );
};
