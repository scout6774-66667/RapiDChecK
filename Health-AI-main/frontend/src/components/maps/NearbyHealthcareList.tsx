import React, { useState } from 'react';
import {
  Building2,
  Navigation,
  Star,
  Clock,
  ChevronRight,
  Search,
  Cross,
  Stethoscope,
  Pill,
  Activity,
  Layers,
} from 'lucide-react';
import type {
  NearbyHealthcareFacility,
  NearbyFacilityCategory,
  NearbyRadiusKm,
  UserLocation,
} from '../../types/location';

interface NearbyHealthcareListProps {
  facilities: NearbyHealthcareFacility[];
  loading?: boolean;
  selectedCategory: NearbyFacilityCategory;
  onSelectCategory: (category: NearbyFacilityCategory) => void;
  radiusKm: NearbyRadiusKm;
  onSelectRadius: (radius: NearbyRadiusKm) => void;
  onSelectFacility: (facility: NearbyHealthcareFacility) => void;
  selectedFacilityId?: string;
  userLocation?: UserLocation | null;
}

export const NearbyHealthcareList: React.FC<NearbyHealthcareListProps> = ({
  facilities,
  loading = false,
  selectedCategory,
  onSelectCategory,
  radiusKm,
  onSelectRadius,
  onSelectFacility,
  selectedFacilityId,
  userLocation,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const categoryOptions: Array<{
    id: NearbyFacilityCategory;
    label: string;
    icon: typeof Building2;
  }> = [
    { id: 'all', label: 'All', icon: Layers },
    { id: 'hospital', label: 'Hospitals', icon: Cross },
    { id: 'phc', label: 'PHCs', icon: Building2 },
    { id: 'clinic', label: 'Clinics', icon: Stethoscope },
    { id: 'pharmacy', label: 'Pharmacies', icon: Pill },
    { id: 'diagnostic', label: 'Diagnostic', icon: Activity },
  ];

  const filtered = facilities.filter((f) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      f.name.toLowerCase().includes(term) ||
      (f.address && f.address.toLowerCase().includes(term))
    );
  });

  const getDirectionsUrl = (facility: NearbyHealthcareFacility) => {
    if (userLocation) {
      return `https://www.google.com/maps/dir/?api=1&origin=${userLocation.latitude},${userLocation.longitude}&destination=${facility.latitude},${facility.longitude}${
        facility.placeId ? `&destination_place_id=${facility.placeId}` : ''
      }`;
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      facility.name
    )}&query_place_id=${facility.placeId || ''}`;
  };

  return (
    <div className="flex flex-col h-full space-y-2.5 select-none min-w-0">
      {/* Search and Radius Control Header */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filter nearby places..."
            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-[#102A56] placeholder-slate-400 focus:outline-hidden focus:border-[#0A9F68] focus:bg-white transition-all"
          />
        </div>

        {/* Radius Selector */}
        <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs shrink-0">
          {([1, 5, 10, 25] as NearbyRadiusKm[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onSelectRadius(r)}
              className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                radiusKm === r
                  ? 'bg-[#0A9F68] text-white shadow-2xs'
                  : 'text-slate-600 hover:text-[#102A56]'
              }`}
            >
              {r} km
            </button>
          ))}
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar text-xs">
        {categoryOptions.map((cat) => {
          const isSelected = selectedCategory === cat.id;
          const Icon = cat.icon;

          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelectCategory(cat.id)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-semibold whitespace-nowrap transition-all cursor-pointer ${
                isSelected
                  ? 'bg-emerald-50 text-[#0A9F68] border border-emerald-300 font-bold'
                  : 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-3 h-3" />
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Facilities List Items */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-72 min-h-[160px]">
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-2">
            <div className="w-6 h-6 border-2 border-[#0A9F68] border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-500 font-medium">
              Finding nearby healthcare within {radiusKm} km...
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-8 px-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-center space-y-2.5">
            <p className="text-xs text-slate-500">
              No healthcare facilities found within {radiusKm} km.
            </p>
            <div className="flex items-center justify-center gap-2">
              {radiusKm < 10 && (
                <button
                  type="button"
                  onClick={() => onSelectRadius(10)}
                  className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-[#0A9F68] hover:bg-emerald-50 cursor-pointer"
                >
                  Expand to 10 km
                </button>
              )}
              {radiusKm < 25 && (
                <button
                  type="button"
                  onClick={() => onSelectRadius(25)}
                  className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-[#0A9F68] hover:bg-emerald-50 cursor-pointer"
                >
                  Expand to 25 km
                </button>
              )}
            </div>
          </div>
        ) : (
          filtered.map((facility) => {
            const isSelected = selectedFacilityId === facility.id;

            return (
              <div
                key={facility.id}
                onClick={() => onSelectFacility(facility)}
                className={`p-3 rounded-2xl border transition-all cursor-pointer flex flex-col space-y-2 ${
                  isSelected
                    ? 'border-[#0A9F68] bg-[#E7F7F0]/70 shadow-xs'
                    : 'border-slate-100 bg-slate-50/70 hover:bg-white hover:border-slate-200 hover:shadow-2xs'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h5 className="text-xs font-bold text-[#102A56] line-clamp-1">
                      {facility.name}
                    </h5>
                    {facility.address && (
                      <p className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">
                        {facility.address}
                      </p>
                    )}
                  </div>

                  <span className="text-[11px] font-bold text-[#0A9F68] shrink-0 bg-emerald-50 px-2 py-0.5 rounded-md">
                    {facility.distanceFormatted}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-200/50">
                  <div className="flex items-center gap-2">
                    {facility.rating && (
                      <span className="flex items-center gap-0.5 text-amber-600 font-bold">
                        <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                        {facility.rating.toFixed(1)}
                      </span>
                    )}

                    {facility.isOpen !== undefined && (
                      <span
                        className={`flex items-center gap-1 font-semibold ${
                          facility.isOpen ? 'text-emerald-600' : 'text-slate-400'
                        }`}
                      >
                        <Clock className="w-3 h-3" />
                        {facility.isOpen ? 'Open' : 'Closed'}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => onSelectFacility(facility)}
                      className="text-[10px] font-bold text-[#102A56] hover:text-[#0A9F68] flex items-center gap-0.5 cursor-pointer"
                    >
                      <span>View</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>

                    <a
                      href={getDirectionsUrl(facility)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 py-0.5 rounded-md bg-[#0A9F68] hover:bg-[#088758] text-white font-bold text-[10px] flex items-center gap-1 transition-all"
                    >
                      <Navigation className="w-2.5 h-2.5" />
                      <span>Directions</span>
                    </a>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
