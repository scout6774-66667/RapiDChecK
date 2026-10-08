import React, { useState, useMemo } from 'react';
import { Search, ChevronRight, AlertTriangle, Users, Share2, Building2 } from 'lucide-react';
import type { VillageLocation } from '../../types/map';

interface VillageListProps {
  locations: VillageLocation[];
  onSelectVillage: (village: VillageLocation) => void;
  selectedVillageId?: string;
}

export const VillageList: React.FC<VillageListProps> = ({
  locations,
  onSelectVillage,
  selectedVillageId,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return locations;
    const term = searchTerm.toLowerCase();
    return locations.filter(
      (loc) =>
        loc.name.toLowerCase().includes(term) ||
        (loc.block && loc.block.toLowerCase().includes(term)) ||
        (loc.district && loc.district.toLowerCase().includes(term))
    );
  }, [locations, searchTerm]);

  return (
    <div className="flex flex-col h-full space-y-2 select-none">
      {/* Search Input */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search village, facility, or block..."
          className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-[#102A56] placeholder-slate-400 focus:outline-hidden focus:border-[#0A9F68] focus:bg-white transition-all"
        />
      </div>

      {/* List Items */}
      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 max-h-60">
        {filtered.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            No village or facility found matching "{searchTerm}"
          </div>
        ) : (
          filtered.map((loc) => {
            const isSelected = selectedVillageId === loc.id;
            const isHighRisk = loc.type === 'high-risk';
            const isReferral = loc.type === 'referral' || loc.type === 'referral-pending';
            const isFacility = loc.type === 'facility';

            return (
              <div
                key={loc.id}
                onClick={() => onSelectVillage(loc)}
                className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                  isSelected
                    ? 'border-[#0A9F68] bg-[#E7F7F0]/60 shadow-2xs'
                    : 'border-slate-100 bg-slate-50/70 hover:bg-white hover:border-slate-200'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      isFacility
                        ? 'bg-blue-100 text-blue-700'
                        : isHighRisk
                        ? 'bg-red-100 text-red-700'
                        : isReferral
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {isFacility && <Building2 className="w-3.5 h-3.5" />}
                    {isHighRisk && <AlertTriangle className="w-3.5 h-3.5" />}
                    {isReferral && <Share2 className="w-3.5 h-3.5" />}
                    {loc.type === 'screened' && <Users className="w-3.5 h-3.5" />}
                  </div>

                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#102A56] truncate">
                      {loc.name}
                    </div>
                    <div className="text-[10px] text-slate-500 flex items-center gap-2">
                      <span>{loc.patientsScreened ?? 0} screened</span>
                      {(loc.highRiskCases ?? 0) > 0 && (
                        <span className="text-red-600 font-bold">
                          {loc.highRiskCases} high risk
                        </span>
                      )}
                      {(loc.pendingReferrals ?? 0) > 0 && (
                        <span className="text-amber-600 font-semibold">
                          {loc.pendingReferrals} pending
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
