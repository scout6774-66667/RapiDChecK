import React from 'react';
import { ArrowRight, AlertTriangle, Users, Share2, Building2 } from 'lucide-react';
import type { VillageLocation } from '../../types/map';

interface VillageInfoWindowProps {
  village: VillageLocation;
  onSelect?: (village: VillageLocation) => void;
}

export const VillageInfoWindow: React.FC<VillageInfoWindowProps> = ({
  village,
  onSelect,
}) => {
  const isFacility = village.type === 'facility';
  const isHighRisk = village.type === 'high-risk';
  const isReferral = village.type === 'referral' || village.type === 'referral-pending';

  return (
    <div className="p-2.5 min-w-[210px] max-w-[260px] text-left font-sans select-none">
      {/* Village Header */}
      <div className="flex items-start justify-between gap-1 mb-2">
        <div>
          <h4 className="text-xs font-bold text-[#102A56] leading-tight">
            {village.name}
          </h4>
          <span className="text-[10px] text-slate-500 font-medium">
            {village.block || 'Rural Block'} · {village.district || 'District'}
          </span>
        </div>
      </div>

      {/* Category Status Pill */}
      <div className="mb-2">
        {isHighRisk && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-50 text-red-700 text-[10px] font-bold border border-red-200">
            <AlertTriangle className="w-3 h-3 text-red-500" />
            High Risk Attention
          </span>
        )}
        {isReferral && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[10px] font-bold border border-amber-200">
            <Share2 className="w-3 h-3 text-amber-500" />
            Referrals Pending
          </span>
        )}
        {village.type === 'screened' && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200">
            <Users className="w-3 h-3 text-[#0A9F68]" />
            Screened Today
          </span>
        )}
        {isFacility && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[10px] font-bold border border-blue-200">
            <Building2 className="w-3 h-3 text-blue-500" />
            {village.facilityType || 'PHC'} Facility
          </span>
        )}
      </div>

      {/* Aggregated Metric Cards */}
      <div className="grid grid-cols-3 gap-1.5 p-2 bg-slate-50 rounded-xl border border-slate-100 mb-2.5 text-center">
        <div>
          <div className="text-[9px] text-slate-500 font-medium">Screened</div>
          <div className="text-xs font-bold text-[#102A56]">
            {village.patientsScreened ?? 0}
          </div>
        </div>
        <div>
          <div className="text-[9px] text-slate-500 font-medium">High Risk</div>
          <div className="text-xs font-bold text-red-600">
            {village.highRiskCases ?? 0}
          </div>
        </div>
        <div>
          <div className="text-[9px] text-slate-500 font-medium">Pending</div>
          <div className="text-xs font-bold text-amber-600">
            {village.pendingReferrals ?? 0}
          </div>
        </div>
      </div>

      {/* Action Button */}
      {onSelect && (
        <button
          type="button"
          onClick={() => onSelect(village)}
          className="w-full py-1.5 px-2.5 rounded-lg bg-[#0A9F68] hover:bg-[#088758] text-white text-[11px] font-bold transition-all flex items-center justify-center gap-1 shadow-xs cursor-pointer"
        >
          <span>{isFacility ? 'View Facility Queue' : 'Filter Village Records'}</span>
          <ArrowRight className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};
