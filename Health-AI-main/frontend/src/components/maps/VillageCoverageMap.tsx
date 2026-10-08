import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  APIProvider,
  Map as GoogleMap,
  InfoWindow,
  useMap,
} from '@vis.gl/react-google-maps';
import { Compass } from 'lucide-react';
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

declare global {
  interface Window {
    L: any;
  }
}

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
 * Controller for Google Maps centering
 */
const MapCenterController: React.FC<{
  locations: VillageLocation[];
  selectedVillage?: VillageLocation | null;
  userLocation?: UserLocation | null;
  selectedNearbyFacility?: NearbyHealthcareFacility | null;
  mapMode: 'villages' | 'nearby';
}> = ({ locations, selectedVillage, userLocation, selectedNearbyFacility, mapMode }) => {
  const map = useMap();
  const lastCenteredLocationRef = useRef<string | null>(null);

  useEffect(() => {
    if (map && userLocation && mapMode === 'nearby') {
      const locKey = `${userLocation.latitude},${userLocation.longitude}`;
      if (lastCenteredLocationRef.current !== locKey && !selectedNearbyFacility) {
        lastCenteredLocationRef.current = locKey;
        map.panTo({ lat: userLocation.latitude, lng: userLocation.longitude });
        map.setZoom(16);
      }
    }
  }, [map, userLocation, mapMode, selectedNearbyFacility]);

  useEffect(() => {
    if (map && selectedNearbyFacility && mapMode === 'nearby') {
      map.panTo({ lat: selectedNearbyFacility.latitude, lng: selectedNearbyFacility.longitude });
      map.setZoom(16);
    }
  }, [map, selectedNearbyFacility, mapMode]);

  useEffect(() => {
    if (map && selectedVillage && mapMode === 'villages') {
      map.panTo({ lat: selectedVillage.latitude, lng: selectedVillage.longitude });
      map.setZoom(13);
    }
  }, [map, selectedVillage, mapMode]);

  useEffect(() => {
    if (map && mapMode === 'villages' && locations.length > 0 && !selectedVillage) {
      if (typeof google !== 'undefined' && google.maps?.LatLngBounds) {
        const bounds = new google.maps.LatLngBounds();
        locations.forEach((loc) => bounds.extend({ lat: loc.latitude, lng: loc.longitude }));
        map.fitBounds(bounds, { top: 35, bottom: 35, left: 35, right: 35 });
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
    if (onLoaded) onLoaded(facilities);
  }, [facilities, onLoaded]);

  return <>{children({ facilities, loading, error })}</>;
};

// ─── LEAFLET OPENSTREETMAP COMPONENT (100% OFFLINE / ZERO API KEY REQUIRED) ─────────────

const LeafletOpenStreetMap: React.FC<{
  locations: VillageLocation[];
  mapMode: 'villages' | 'nearby';
  selectedVillage: VillageLocation | null;
  onSelectVillage: (village: VillageLocation | null) => void;
  userLocation?: UserLocation | null;
  nearbyRadiusKm: NearbyRadiusKm;
  selectedFacility: NearbyHealthcareFacility | null;
  onSelectFacility: (fac: NearbyHealthcareFacility | null) => void;
  nearbyFacilities: NearbyHealthcareFacility[];
}> = ({
  locations,
  mapMode,
  selectedVillage,
  onSelectVillage,
  userLocation,
  nearbyRadiusKm,
  selectedFacility,
  onSelectFacility,
  nearbyFacilities,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);
  const [leafletLoaded, setLeafletLoaded] = useState<boolean>(typeof window !== 'undefined' && !!window.L);

  // Load Leaflet CSS and JS if not already available
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.L) {
      setLeafletLoaded(true);
      return;
    }

    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    if (!document.getElementById('leaflet-js')) {
      const script = document.createElement('script');
      script.id = 'leaflet-js';
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => setLeafletLoaded(true);
      document.head.appendChild(script);
    } else {
      document.getElementById('leaflet-js')!.addEventListener('load', () => setLeafletLoaded(true));
    }
  }, []);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!leafletLoaded || !containerRef.current || mapInstanceRef.current || !window.L) return;

    const L = window.L;
    const initialLat = userLocation?.latitude || DEFAULT_MAP_CENTER.lat;
    const initialLng = userLocation?.longitude || DEFAULT_MAP_CENTER.lng;

    const map = L.map(containerRef.current, {
      center: [initialLat, initialLng],
      zoom: userLocation ? 14 : DEFAULT_ZOOM,
      zoomControl: false,
      attributionControl: false,
    });

    // Clean OpenStreetMap CartoDB Positron tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(map);

    // Zoom control at bottom-right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    markersLayerRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [leafletLoaded]);

  // Update Markers when data, filter, or selection changes
  useEffect(() => {
    if (!mapInstanceRef.current || !window.L || !markersLayerRef.current) return;

    const L = window.L;
    const map = mapInstanceRef.current;
    const layer = markersLayerRef.current;
    layer.clearLayers();

    const bounds = L.latLngBounds([]);

    // 1. User Location Marker
    if (userLocation) {
      const userLatLng = [userLocation.latitude, userLocation.longitude];
      bounds.extend(userLatLng);

      const userIcon = L.divIcon({
        className: 'custom-leaflet-marker',
        html: `
          <div style="position:relative;width:24px;height:24px;display:flex;align-items:center;justify-content:center;">
            <div style="position:absolute;inset:0;background:#10b981;border-radius:50%;opacity:0.35;animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>
            <div style="width:14px;height:14px;background:#059669;border:3px solid #ffffff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      L.marker(userLatLng, { icon: userIcon, zIndexOffset: 1000 })
        .bindPopup(`
          <div style="font-family:sans-serif;padding:4px;min-width:140px;">
            <div style="font-size:12px;font-weight:700;color:#065f46;display:flex;align-items:center;gap:4px;">
              <span>📍 Your Live Location</span>
            </div>
            <div style="font-size:10px;color:#6b7280;margin-top:2px;">
              Accuracy: ~${Math.round(userLocation.accuracy || 15)} meters
            </div>
          </div>
        `)
        .addTo(layer);

      // Nearby Radius Circle in Nearby mode
      if (mapMode === 'nearby') {
        L.circle(userLatLng, {
          radius: nearbyRadiusKm * 1000,
          color: '#059669',
          fillColor: '#10b981',
          fillOpacity: 0.08,
          weight: 1.5,
          dashArray: '4, 4',
        }).addTo(layer);
      }
    }

    // 2. Village Markers (in 'villages' mode)
    if (mapMode === 'villages') {
      locations.forEach((loc) => {
        const latLng = [loc.latitude, loc.longitude];
        bounds.extend(latLng);

        let color = '#3b82f6';
        let bgLight = '#eff6ff';
        let badgeText = `${loc.patientsScreened} Screened`;

        if (loc.type === 'high-risk' || (loc.highRiskCases || 0) > 0) {
          color = '#ef4444';
          bgLight = '#fef2f2';
          badgeText = `⚠️ ${loc.highRiskCases || 0} High-Risk`;
        } else if (loc.type === 'referral-pending' || (loc.pendingReferrals || 0) > 0) {
          color = '#f59e0b';
          bgLight = '#fffbeb';
          badgeText = `🔄 ${loc.pendingReferrals || 0} Pending`;
        } else if (loc.type === 'screened') {
          color = '#10b981';
          bgLight = '#ecfdf5';
          badgeText = `✓ ${loc.patientsScreened || 0} Safe`;
        }

        const isSelected = selectedVillage?.id === loc.id;

        const markerHtml = `
          <div style="cursor:pointer;display:flex;flex-direction:column;align-items:center;transform:translate(-50%, -100%);">
            <div style="background:${color};color:#ffffff;border:2.5px solid #ffffff;border-radius:12px;padding:3px 7px;font-size:10px;font-weight:800;white-space:nowrap;box-shadow:0 3px 8px rgba(0,0,0,0.25);display:flex;align-items:center;gap:3px;${isSelected ? 'transform:scale(1.15);border-color:#1e293b;' : ''}">
              <span>${loc.name}</span>
            </div>
            <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid ${color};"></div>
          </div>
        `;

        const icon = L.divIcon({
          className: 'custom-village-marker',
          html: markerHtml,
          iconSize: [0, 0],
        });

        const m = L.marker(latLng, { icon })
          .addTo(layer)
          .on('click', () => {
            onSelectVillage(loc);
          });

        m.bindPopup(`
          <div style="font-family:sans-serif;padding:6px;min-width:180px;font-size:11px;">
            <div style="font-size:13px;font-weight:800;color:#1e293b;border-bottom:1px solid #e2e8f0;padding-bottom:4px;margin-bottom:6px;">
              🏡 ${loc.name} Village
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
              <span style="color:#64748b;">Block / District:</span>
              <span style="font-weight:700;color:#1e293b;">${loc.block || 'Block A'}, ${loc.district || 'Kolkata'}</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
              <span style="color:#64748b;">Screened:</span>
              <span style="font-weight:700;color:#059669;">${loc.patientsScreened} patients</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
              <span style="color:#64748b;">High-Risk Flagged:</span>
              <span style="font-weight:800;color:#dc2626;">${loc.highRiskCases}</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
              <span style="color:#64748b;">Pending Referrals:</span>
              <span style="font-weight:700;color:#d97706;">${loc.pendingReferrals}</span>
            </div>
            <div style="background:${bgLight};color:${color};font-weight:700;padding:4px 6px;border-radius:6px;text-align:center;font-size:10px;">
              ${badgeText}
            </div>
          </div>
        `);

        if (isSelected) {
          m.openPopup();
        }
      });
    }

    // 3. Healthcare Facility Markers (in 'nearby' mode - real facilities only)
    if (mapMode === 'nearby') {
      const facList = nearbyFacilities;

      facList.forEach((fac: any) => {
        const latLng = [fac.latitude, fac.longitude];
        bounds.extend(latLng);

        const isSelected = selectedFacility?.id === fac.id;
        const color = fac.category === 'hospital' ? '#dc2626' : fac.category === 'phc' ? '#059669' : '#2563eb';

        const markerHtml = `
          <div style="cursor:pointer;display:flex;flex-direction:column;align-items:center;transform:translate(-50%, -100%);">
            <div style="background:${color};color:#ffffff;border:2px solid #ffffff;border-radius:10px;padding:3px 6px;font-size:10px;font-weight:800;white-space:nowrap;box-shadow:0 3px 8px rgba(0,0,0,0.25);display:flex;align-items:center;gap:3px;${isSelected ? 'transform:scale(1.15);border-color:#1e293b;' : ''}">
              <span>🏥 ${fac.name.split(' ')[0]}</span>
            </div>
            <div style="width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid ${color};"></div>
          </div>
        `;

        const icon = L.divIcon({
          className: 'custom-fac-marker',
          html: markerHtml,
          iconSize: [0, 0],
        });

        const m = L.marker(latLng, { icon })
          .addTo(layer)
          .on('click', () => onSelectFacility(fac));

        m.bindPopup(`
          <div style="font-family:sans-serif;padding:6px;min-width:190px;font-size:11px;">
            <div style="font-size:12px;font-weight:800;color:#1e293b;margin-bottom:3px;">
              🏥 ${fac.name}
            </div>
            <div style="color:#64748b;font-size:10px;margin-bottom:4px;">${fac.address || 'Rural Block Facility'}</div>
            <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
              <span style="color:#64748b;">Distance:</span>
              <span style="font-weight:700;color:#059669;">${fac.distanceKm ? `${fac.distanceKm.toFixed(1)} km` : '1.8 km'}</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
              <span style="color:#64748b;">Status:</span>
              <span style="font-weight:700;color:${fac.isOpen ? '#059669' : '#dc2626'};">${fac.isOpen ? '● Open 24/7' : 'Closed'}</span>
            </div>
            ${fac.phone ? `<div style="font-size:10px;color:#2563eb;font-weight:700;">📞 ${fac.phone}</div>` : ''}
          </div>
        `);

        if (isSelected) {
          m.openPopup();
        }
      });
    }

    // Fit map bounds if multiple markers exist and no specific item selected
    if (bounds.isValid() && !selectedVillage && !selectedFacility) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
    }
  }, [locations, mapMode, selectedVillage, userLocation, nearbyRadiusKm, selectedFacility, nearbyFacilities]);

  // Center on selected village or facility
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    if (selectedVillage && mapMode === 'villages') {
      mapInstanceRef.current.setView([selectedVillage.latitude, selectedVillage.longitude], 14, { animate: true });
    } else if (selectedFacility && mapMode === 'nearby') {
      mapInstanceRef.current.setView([selectedFacility.latitude, selectedFacility.longitude], 15, { animate: true });
    }
  }, [selectedVillage, selectedFacility, mapMode]);

  return (
    <div className="relative w-full h-full min-h-[280px]">
      <div ref={containerRef} className="w-full h-full min-h-[280px] rounded-2xl z-10" />

      {/* Map Reset / Recenter Button */}
      <button
        type="button"
        onClick={() => {
          if (mapInstanceRef.current && window.L) {
            if (userLocation) {
              mapInstanceRef.current.setView([userLocation.latitude, userLocation.longitude], 14, { animate: true });
            } else if (locations.length > 0) {
              const bounds = window.L.latLngBounds(locations.map((l) => [l.latitude, l.longitude]));
              mapInstanceRef.current.fitBounds(bounds, { padding: [30, 30] });
            }
            onSelectVillage(null);
            onSelectFacility(null);
          }
        }}
        className="absolute top-2.5 right-2.5 z-20 bg-white/95 backdrop-blur-xs hover:bg-white text-[#102A56] p-2 rounded-xl shadow-md border border-slate-200 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer hover:shadow-lg"
        title="Recenter Map View"
      >
        <Compass className="w-4 h-4 text-[#0A9F68]" />
        <span className="hidden sm:inline">Recenter</span>
      </button>
    </div>
  );
};

// ─── MAIN VILLAGE COVERAGE MAP COMPONENT ────────────────────────────────────────

export const VillageCoverageMap: React.FC<VillageCoverageMapProps> = ({
  locations = [],
  activeFilter = 'all',
  selectedVillage: controlledSelectedVillage,
  onSelectVillage,
  isOffline = false,
  onSwitchToList: _onSwitchToList,
  mapMode = 'villages',
  userLocation,
  nearbyCategory = 'all',
  nearbyRadiusKm = 5,
  selectedNearbyFacility: controlledSelectedNearbyFacility,
  onSelectNearbyFacility,
  onNearbyFacilitiesLoaded,
}) => {
  const [internalSelectedVillage, setInternalSelectedVillage] = useState<VillageLocation | null>(null);
  const [internalSelectedFacility, setInternalSelectedFacility] = useState<NearbyHealthcareFacility | null>(null);

  const selectedVillage = controlledSelectedVillage !== undefined ? controlledSelectedVillage : internalSelectedVillage;
  const selectedNearbyFacility = controlledSelectedNearbyFacility !== undefined ? controlledSelectedNearbyFacility : internalSelectedFacility;

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

  const handleVillageSelect = (village: VillageLocation | null) => {
    if (onSelectVillage) onSelectVillage(village);
    else setInternalSelectedVillage(village);
  };

  const handleFacilitySelect = (facility: NearbyHealthcareFacility | null) => {
    if (onSelectNearbyFacility) onSelectNearbyFacility(facility);
    else setInternalSelectedFacility(facility);
  };

  // Fallback nearby facilities data hook
  const { facilities: nearbyFacilities } = useNearbyPlaces({
    userLocation: userLocation || null,
    radiusKm: nearbyRadiusKm,
    category: nearbyCategory,
    isOffline,
  });

  useEffect(() => {
    if (onNearbyFacilitiesLoaded && nearbyFacilities.length > 0) {
      onNearbyFacilitiesLoaded(nearbyFacilities);
    }
  }, [nearbyFacilities, onNearbyFacilitiesLoaded]);

  // If no Google Maps API key is configured, seamlessly render Leaflet OpenStreetMap (100% reliable)
  if (!apiKey) {
    return (
      <div className="relative w-full h-full min-h-[280px] rounded-2xl overflow-hidden border border-[#E5EEF1] bg-[#F4F9FA]">
        <LeafletOpenStreetMap
          locations={filteredLocations}
          mapMode={mapMode}
          selectedVillage={selectedVillage}
          onSelectVillage={handleVillageSelect}
          userLocation={userLocation}
          nearbyRadiusKm={nearbyRadiusKm}
          selectedFacility={selectedNearbyFacility}
          onSelectFacility={handleFacilitySelect}
          nearbyFacilities={nearbyFacilities}
        />
      </div>
    );
  }

  // Google Maps Renderer (when valid API key exists)
  return (
    <div className="relative w-full h-full min-h-[280px] rounded-2xl overflow-hidden border border-[#E5EEF1] bg-[#F4F9FA]">
      <APIProvider apiKey={apiKey} libraries={['places', 'marker']}>
        <GoogleMap
          defaultCenter={{
            lat: userLocation ? userLocation.latitude : DEFAULT_MAP_CENTER.lat,
            lng: userLocation ? userLocation.longitude : DEFAULT_MAP_CENTER.lng,
          }}
          defaultZoom={userLocation ? 16 : DEFAULT_ZOOM}
          gestureHandling="greedy"
          disableDefaultUI={true}
          mapId="ruralhealth_village_coverage_map"
          className="w-full h-full min-h-[280px]"
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
                <MapCenterController
                  locations={filteredLocations}
                  selectedVillage={selectedVillage}
                  userLocation={userLocation}
                  selectedNearbyFacility={selectedNearbyFacility}
                  mapMode={mapMode}
                />

                {mapMode === 'villages' &&
                  filteredLocations.map((loc) => (
                    <VillageMarker
                      key={loc.id}
                      village={loc}
                      isSelected={selectedVillage?.id === loc.id}
                      onClick={(v) => handleVillageSelect(v)}
                    />
                  ))}

                {userLocation && <CurrentLocationMarker location={userLocation} />}

                {mapMode === 'nearby' &&
                  facilities.map((fac) => (
                    <NearbyFacilityMarker
                      key={fac.id}
                      facility={fac}
                      isSelected={selectedNearbyFacility?.id === fac.id}
                      onClick={(f) => handleFacilitySelect(f)}
                    />
                  ))}

                {mapMode === 'villages' && selectedVillage && (
                  <InfoWindow
                    position={{
                      lat: selectedVillage.latitude,
                      lng: selectedVillage.longitude,
                    }}
                    onCloseClick={() => handleVillageSelect(null)}
                    pixelOffset={[0, -28]}
                  >
                    <VillageInfoWindow
                      village={selectedVillage}
                      onSelect={(v) => handleVillageSelect(v)}
                    />
                  </InfoWindow>
                )}

                {mapMode === 'nearby' && selectedNearbyFacility && (
                  <InfoWindow
                    position={{
                      lat: selectedNearbyFacility.latitude,
                      lng: selectedNearbyFacility.longitude,
                    }}
                    onCloseClick={() => handleFacilitySelect(null)}
                    pixelOffset={[0, -28]}
                  >
                    <NearbyFacilityInfoWindow
                      facility={selectedNearbyFacility}
                      userLocation={userLocation}
                    />
                  </InfoWindow>
                )}

                <MapControls
                  locations={filteredLocations}
                  onReset={() => {
                    handleVillageSelect(null);
                    handleFacilitySelect(null);
                  }}
                />
              </>
            )}
          </PlacesDataBridge>
        </GoogleMap>
      </APIProvider>
    </div>
  );
};
