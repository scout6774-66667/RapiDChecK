import React from 'react';
import type { MapFilterType } from '../../types/map';

interface MapFiltersProps {
  activeFilter: MapFilterType;
  onFilterChange: (filter: MapFilterType) => void;
}

export const MapFilters: React.FC<MapFiltersProps> = ({
  activeFilter,
  onFilterChange,
}) => {
  const filterOptions: Array<{ id: MapFilterType; label: string }> = [
    { id: 'all', label: 'All Locations' },
    { id: 'screened', label: 'Screened' },
    { id: 'high-risk', label: 'High Risk' },
  ];

  return (
    <div className="flex items-center gap-1.5 bg-slate-100/90 p-1 rounded-xl border border-slate-200/80 max-w-full select-none">
      {filterOptions.map((opt) => {
        const isSelected = activeFilter === opt.id;

        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onFilterChange(opt.id)}
            className={`px-3 py-1.5 h-8 sm:h-9 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center justify-center ${
              isSelected
                ? 'bg-[#0A9F68] text-white shadow-xs'
                : 'text-slate-600 hover:text-[#102A56] hover:bg-slate-200/60'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};
