import React, { useState, useMemo } from 'react';
import { Map as MapIcon, List as ListIcon, Compass } from 'lucide-react';
import type { VillageLocation, MapFilterType } from '../../types/map';
import type {
  NearbyHealthcareFacility,
  NearbyFacilityCategory,
  NearbyRadiusKm,
} from '../../types/location';
import { VILLAGE_LOCATIONS, getVillageStatistics } from '../../data/villageLocations';
import { useCurrentLocation } from '../../hooks/useCurrentLocation';
import {
  VillageCoverageMap,
  VillageList,
  MapLegend,
  MapFilters,
  NearbyHealthcareControls,
  NearbyHealthcareList,
} from '../maps';

interface VillageCoverageCardProps {
  markers?: any[];
  locations?: VillageLocation[];
  onSelectVillage?: (villageName: string) => void;
  isOffline?: boolean;
}

export const VillageCoverageCard: React.FC<VillageCoverageCardProps> = ({
  locations = VILLAGE_LOCATIONS,
  onSelectVillage,
  isOffline = false,
}) => {
  // Mode: 'villages' (Village Coverage Analytics) vs 'nearby' (Live GPS Nearby Healthcare)
  const [mapMode, setMapMode] = useState<'villages' | 'nearby'>('villages');
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');

  // Village Coverage state
  const [activeFilter, setActiveFilter] = useState<MapFilterType>('all');
  const [selectedVillage, setSelectedVillage] = useState<VillageLocation | null>(null);

  // User Current Location Hook
  const {
    location: userLocation,
    permissionState,
    requestLocation,
    error: locationError,
  } = useCurrentLocation();

  // Nearby Healthcare state
  const [nearbyCategory, setNearbyCategory] =
    useState<NearbyFacilityCategory>('all');
  const [nearbyRadiusKm, setNearbyRadiusKm] = useState<NearbyRadiusKm>(5);
  const [nearbyFacilities, setNearbyFacilities] = useState<
    NearbyHealthcareFacility[]
  >([]);
  const [selectedNearbyFacility, setSelectedNearbyFacility] =
    useState<NearbyHealthcareFacility | null>(null);

  const stats = useMemo(() => getVillageStatistics(locations), [locations]);

  // Handle Village Click
  const handleVillageClick = (village: VillageLocation | null) => {
    setSelectedVillage(village);
    if (village) {
      if (viewMode === 'list') {
        setViewMode('map');
      }
      if (onSelectVillage) {
        onSelectVillage(village.name);
      }
    }
  };

  // Handle Nearby Facility Click
  const handleFacilityClick = (facility: NearbyHealthcareFacility | null) => {
    setSelectedNearbyFacility(facility);
    if (facility && viewMode === 'list') {
      setViewMode('map');
    }
  };

  return (
    <div className="health-card p-4 sm:p-5 flex flex-col justify-between h-full select-none w-full max-w-full box-border overflow-hidden">
      {/* 1. Top Section: Mode Switcher, Location Trigger & Mode Controls */}
      <div className="space-y-3 mb-3.5 min-w-0">
        <NearbyHealthcareControls
          mapMode={mapMode}
          onSelectMapMode={(mode) => setMapMode(mode)}
          permissionState={permissionState}
          onRequestLocation={requestLocation}
          errorMessage={locationError}
        />

        {/* Sub-Header: Mode-specific filters & View Mode Toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-100 min-w-0">
          {/* Left Title / Badge */}
          <div className="flex items-center gap-2 shrink-0">
            {mapMode === 'villages' ? (
              <>
                <h3 className="text-xs sm:text-sm font-bold text-[#102A56]">
                  Village Coverage
                </h3>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-50 text-[#0A9F68] text-[10px] sm:text-xs font-bold border border-emerald-200/80 whitespace-nowrap">
                  {stats.coveragePercent}% Block Covered
                </span>
              </>
            ) : (
              <div className="flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-[#0A9F68]" />
                <h3 className="text-xs sm:text-sm font-bold text-[#102A56]">
                  Nearby Healthcare Discovery
                </h3>
                {userLocation && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-bold border border-blue-200">
                    Live GPS
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Right Controls: Filters & Map/List Toggle */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap min-w-0">
            {mapMode === 'villages' && (
              <div className="min-w-0">
                <MapFilters
                  activeFilter={activeFilter}
                  onFilterChange={(f) => setActiveFilter(f)}
                />
              </div>
            )}

            {/* Map / List Toggle */}
            <div className="flex items-center bg-slate-100/90 p-0.5 rounded-xl border border-slate-200/80 shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('map')}
                className={`flex items-center gap-1 px-2.5 py-1 sm:h-8 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'map'
                    ? 'bg-[#0A9F68] text-white shadow-xs'
                    : 'text-slate-600 hover:text-[#102A56]'
                }`}
              >
                <MapIcon className="w-3.5 h-3.5" />
                <span>Map</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1 px-2.5 py-1 sm:h-8 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-[#0A9F68] text-white shadow-xs'
                    : 'text-slate-600 hover:text-[#102A56]'
                }`}
              >
                <ListIcon className="w-3.5 h-3.5" />
                <span>List</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Main Content Grid: Google Map (Left) + Legend / Nearby Facilities (Right) */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_210px] lg:grid-cols-[1fr_240px] gap-3 items-stretch flex-1 min-w-0 min-h-[320px] sm:min-h-[380px]">
        {/* Map / List Area */}
        <div className="h-[340px] sm:h-[400px] md:h-full min-h-[300px] rounded-2xl overflow-hidden relative border border-[#E5EEF1] min-w-0">
          {viewMode === 'map' ? (
            <VillageCoverageMap
              locations={locations}
              activeFilter={activeFilter}
              selectedVillage={selectedVillage}
              onSelectVillage={handleVillageClick}
              isOffline={isOffline}
              onSwitchToList={() => setViewMode('list')}
              mapMode={mapMode}
              userLocation={userLocation}
              nearbyCategory={nearbyCategory}
              nearbyRadiusKm={nearbyRadiusKm}
              selectedNearbyFacility={selectedNearbyFacility}
              onSelectNearbyFacility={handleFacilityClick}
              onNearbyFacilitiesLoaded={setNearbyFacilities}
            />
          ) : mapMode === 'villages' ? (
            <VillageList
              locations={locations}
              onSelectVillage={(v) => handleVillageClick(v)}
              selectedVillageId={selectedVillage?.id}
            />
          ) : (
            <NearbyHealthcareList
              facilities={nearbyFacilities}
              selectedCategory={nearbyCategory}
              onSelectCategory={setNearbyCategory}
              radiusKm={nearbyRadiusKm}
              onSelectRadius={setNearbyRadiusKm}
              onSelectFacility={handleFacilityClick}
              selectedFacilityId={selectedNearbyFacility?.id}
              userLocation={userLocation}
            />
          )}
        </div>

        {/* Right Panel: Status Legend (Village Mode) OR Nearby Healthcare List (Nearby Mode) */}
        <div className="min-w-0 h-full overflow-hidden">
          {mapMode === 'villages' ? (
            <MapLegend
              locations={locations}
              activeFilter={activeFilter}
              onFilterChange={(f) => setActiveFilter(f)}
            />
          ) : (
            <NearbyHealthcareList
              facilities={nearbyFacilities}
              selectedCategory={nearbyCategory}
              onSelectCategory={setNearbyCategory}
              radiusKm={nearbyRadiusKm}
              onSelectRadius={setNearbyRadiusKm}
              onSelectFacility={handleFacilityClick}
              selectedFacilityId={selectedNearbyFacility?.id}
              userLocation={userLocation}
            />
          )}
        </div>
      </div>

      {/* 3. Bottom 4-Column Statistics Grid */}
      <div className="mt-3.5 pt-3 border-t border-slate-100/90 grid grid-cols-2 sm:grid-cols-4 gap-3 text-left min-w-0">
        {/* Stat 1: Total Villages */}
        <div className="p-2.5 rounded-xl bg-slate-50/60 border border-slate-100/80">
          <div className="text-[11px] text-slate-500 font-medium">
            Total Villages
          </div>
          <div className="text-lg sm:text-xl font-bold text-[#102A56] mt-0.5">
            {stats.totalVillages}
          </div>
        </div>

        {/* Stat 2: Covered Villages */}
        <div className="p-2.5 rounded-xl bg-emerald-50/50 border border-emerald-100/80">
          <div className="text-[11px] text-slate-500 font-medium">
            Covered
          </div>
          <div className="text-lg sm:text-xl font-bold text-[#0A9F68] mt-0.5">
            {stats.coveredCount}{' '}
            <span className="text-xs font-semibold text-emerald-600">
              ({stats.coveragePercent}%)
            </span>
          </div>
        </div>

        {/* Stat 3: Pending Villages */}
        <div className="p-2.5 rounded-xl bg-amber-50/50 border border-amber-100/80">
          <div className="text-[11px] text-slate-500 font-medium">
            Pending
          </div>
          <div className="text-lg sm:text-xl font-bold text-amber-600 mt-0.5">
            {stats.pendingCoverageCount}
          </div>
        </div>

        {/* Stat 4: PHC Facilities */}
        <div className="p-2.5 rounded-xl bg-blue-50/50 border border-blue-100/80">
          <div className="text-[11px] text-slate-500 font-medium">
            {mapMode === 'nearby' && nearbyFacilities.length > 0
              ? 'Nearby Found'
              : 'PHC Facilities'}
          </div>
          <div className="text-lg sm:text-xl font-bold text-blue-600 mt-0.5">
            {mapMode === 'nearby' && nearbyFacilities.length > 0
              ? `${nearbyFacilities.length} Places`
              : `${stats.facilityCount} Active`}
          </div>
        </div>
      </div>
    </div>
  );
};
