import React, { useState } from 'react';
import { Building2 } from 'lucide-react';
import type { VillageMarker } from './types';
import { initialVillageMarkers } from './mockData';

interface VillageCoverageCardProps {
  markers?: VillageMarker[];
  onSelectVillage?: (villageName: string) => void;
  isOffline?: boolean;
}

export const VillageCoverageCard: React.FC<VillageCoverageCardProps> = ({
  markers = initialVillageMarkers,
  onSelectVillage,
}) => {
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const [hoveredMarker, setHoveredMarker] = useState<VillageMarker | null>(null);

  return (
    <div className="health-card p-4 sm:p-5 flex flex-col justify-between h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-bold text-[#102A56]">Village Coverage</h3>
        </div>

        {/* Map / List Toggle */}
        <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
          <button
            type="button"
            onClick={() => setViewMode('map')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
              viewMode === 'map'
                ? 'bg-[#0A9F68] text-white shadow-2xs'
                : 'text-slate-600 hover:text-[#102A56]'
            }`}
          >
            Map
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
              viewMode === 'list'
                ? 'bg-[#0A9F68] text-white shadow-2xs'
                : 'text-slate-600 hover:text-[#102A56]'
            }`}
          >
            List
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex items-center gap-3">
        {viewMode === 'map' ? (
          <div className="relative flex-1 h-44 rounded-xl overflow-hidden bg-[#EBF4EC] border border-[#D5EAD8] select-none">
            {/* Stylized Village Landscape SVG */}
            <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                <linearGradient id="riverGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#BAE6FD" />
                  <stop offset="100%" stopColor="#7DD3FC" />
                </linearGradient>
                <pattern id="gridPattern" width="10" height="10" patternUnits="userSpaceOnUse">
                  <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#D1E7D5" strokeWidth="0.5" />
                </pattern>
              </defs>

              {/* Background grid */}
              <rect width="100" height="100" fill="url(#gridPattern)" />

              {/* Natural Field Zones */}
              <path d="M0,0 Q30,20 60,0 L100,0 L100,40 Q70,30 50,50 Q30,60 0,30 Z" fill="#DCF2E1" />
              <path d="M20,100 Q40,70 70,80 Q90,90 100,70 L100,100 Z" fill="#E2F5E7" />

              {/* Meandering River */}
              <path
                d="M 10,0 C 25,30 20,60 40,80 C 50,90 60,100 70,100"
                fill="none"
                stroke="url(#riverGrad)"
                strokeWidth="4"
                strokeLinecap="round"
              />

              {/* Rural Roads / Trails */}
              <path
                d="M 0,45 Q 40,40 65,70 T 100,85"
                fill="none"
                stroke="#E2D9C8"
                strokeWidth="1.5"
                strokeDasharray="2,2"
              />
              <path
                d="M 55,0 Q 60,35 75,50 T 100,40"
                fill="none"
                stroke="#E2D9C8"
                strokeWidth="1.5"
                strokeDasharray="2,2"
              />
            </svg>

            {/* Village Markers Pins */}
            {markers.map((marker) => {
              const isHighRisk = marker.type === 'high_risk';
              const isReferral = marker.type === 'referral';
              const isPhc = marker.type === 'phc';

              return (
                <div
                  key={marker.id}
                  style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
                  onMouseEnter={() => setHoveredMarker(marker)}
                  onMouseLeave={() => setHoveredMarker(null)}
                  onClick={() => onSelectVillage?.(marker.name)}
                  className="absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-transform hover:scale-125 z-10"
                >
                  {isPhc ? (
                    <div className="w-5 h-5 rounded-full bg-[#3B82F6] text-white flex items-center justify-center shadow-md border-2 border-white">
                      <Building2 className="w-3 h-3" />
                    </div>
                  ) : (
                    <div
                      className={`w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm flex items-center justify-center ${
                        isHighRisk
                          ? 'bg-[#EF4444]'
                          : isReferral
                          ? 'bg-[#F59E0B]'
                          : 'bg-[#10B981]'
                      }`}
                    >
                      <span className="w-1 h-1 bg-white rounded-full"></span>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Hover Tooltip on Map */}
            {hoveredMarker && (
              <div
                style={{
                  left: `${Math.min(Math.max(hoveredMarker.x, 15), 80)}%`,
                  top: `${Math.max(hoveredMarker.y - 12, 10)}%`,
                }}
                className="absolute transform -translate-x-1/2 -translate-y-full bg-[#102A56] text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-lg pointer-events-none z-30 whitespace-nowrap"
              >
                {hoveredMarker.name}
              </div>
            )}
          </div>
        ) : (
          /* List View */
          <div className="flex-1 h-44 overflow-y-auto space-y-1.5 pr-1 text-xs">
            {markers.map((m) => (
              <div
                key={m.id}
                onClick={() => onSelectVillage?.(m.name)}
                className="p-2 rounded-xl border border-slate-100 bg-slate-50/70 hover:bg-white flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      m.type === 'high_risk'
                        ? 'bg-[#EF4444]'
                        : m.type === 'referral'
                        ? 'bg-[#F59E0B]'
                        : m.type === 'phc'
                        ? 'bg-[#3B82F6]'
                        : 'bg-[#10B981]'
                    }`}
                  />
                  <span className="font-semibold text-[#102A56]">{m.name}</span>
                </div>
                <span className="text-[10px] text-slate-400 capitalize">
                  {m.type.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Legend on Right Side */}
        <div className="flex flex-col gap-2 shrink-0 text-[11px]">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#10B981]"></span>
            <span className="text-slate-600 font-medium">Screened Today</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444]"></span>
            <span className="text-slate-600 font-medium">High Risk</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]"></span>
            <span className="text-slate-600 font-medium">Referral Pending</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#3B82F6]"></span>
            <span className="text-slate-600 font-medium">PHC / Facility</span>
          </div>
        </div>
      </div>
    </div>
  );
};
