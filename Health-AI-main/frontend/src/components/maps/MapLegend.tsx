import React from 'react';
import { Users, AlertTriangle, Share2, Building2 } from 'lucide-react';
import type { VillageLocation, MapFilterType } from '../../types/map';

interface MapLegendProps {
  locations: VillageLocation[];
  activeFilter?: MapFilterType;
  onFilterChange?: (filter: MapFilterType) => void;
}

export const MapLegend: React.FC<MapLegendProps> = ({
  locations,
  activeFilter = 'all',
  onFilterChange,
}) => {
  const screenedCount = locations.filter((l) => l.type === 'screened').length;
  const highRiskCount = locations.filter((l) => l.type === 'high-risk').length;
  const referralCount = locations.filter(
    (l) => l.type === 'referral' || l.type === 'referral-pending'
  ).length;
  const facilityCount = locations.filter((l) => l.type === 'facility').length;

  const items: Array<{
    id: MapFilterType;
    label: string;
    count: number;
    color: string;
    icon: typeof Users;
  }> = [
    {
      id: 'screened',
      label: 'Screened Today',
      count: screenedCount,
      color: 'bg-[#10B981]',
      icon: Users,
    },
    {
      id: 'high-risk',
      label: 'High Risk',
      count: highRiskCount,
      color: 'bg-[#EF4444]',
      icon: AlertTriangle,
    },
    {
      id: 'referral-pending',
      label: 'Referral Pending',
      count: referralCount,
      color: 'bg-[#F59E0B]',
      icon: Share2,
    },
    {
      id: 'facility',
      label: 'Healthcare Facility',
      count: facilityCount,
      color: 'bg-[#3B82F6]',
      icon: Building2,
    },
  ];

  return (
    <div className="flex flex-col justify-between h-full bg-slate-50/80 p-3.5 rounded-2xl border border-slate-100/90 select-none min-w-0">
      {/* Legend Header */}
      <div className="mb-2.5">
        <h4 className="text-[11px] font-bold text-[#102A56] uppercase tracking-wider">
          Status Legend
        </h4>
        <p className="text-[10px] text-slate-400 font-medium">
          Click to filter
        </p>
      </div>

      {/* Legend Rows Grid */}
      <div className="flex flex-col gap-2 flex-1 justify-center">
        {items.map((item) => {
          const isSelected =
            activeFilter === item.id ||
            (item.id === 'referral-pending' && activeFilter === 'referral');
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onFilterChange?.(isSelected ? 'all' : item.id)}
              className={`w-full grid grid-cols-[14px_1fr_auto_16px] items-center gap-2 p-2 rounded-xl transition-all text-left cursor-pointer ${
                isSelected
                  ? 'bg-emerald-50 text-[#0A9F68] font-bold border border-emerald-200/80 shadow-2xs'
                  : 'hover:bg-white hover:shadow-2xs text-slate-600 border border-transparent'
              }`}
            >
              {/* Col 1: Marker Dot */}
              <span className={`w-2.5 h-2.5 rounded-full ${item.color} justify-self-center`} />

              {/* Col 2: Label */}
              <span className="text-xs font-semibold text-[#102A56] truncate">
                {item.label}
              </span>

              {/* Col 3: Count */}
              <span className="text-xs font-bold text-slate-600 justify-self-end tabular-nums">
                {item.count}
              </span>

              {/* Col 4: Icon */}
              <Icon className="w-3.5 h-3.5 text-slate-400 justify-self-end" />
            </button>
          );
        })}
      </div>

      {/* Show All Reset CTA */}
      {activeFilter !== 'all' && (
        <button
          type="button"
          onClick={() => onFilterChange?.('all')}
          className="mt-2 text-[10px] text-[#0A9F68] hover:text-[#088758] font-bold text-left underline cursor-pointer"
        >
          Show All Locations
        </button>
      )}
    </div>
  );
};
