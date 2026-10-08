import React, { useState } from 'react';
import { Info, ChevronDown } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import type { RiskDistributionItem } from './types';

interface RiskDistributionCardProps {
  data: RiskDistributionItem[];
  totalPatients?: number;
  onFilterChange?: (filter: string) => void;
}

export const RiskDistributionCard: React.FC<RiskDistributionCardProps> = ({
  data,
  totalPatients = 24,
  onFilterChange,
}) => {
  const [filter, setFilter] = useState('Today');
  const [showDropdown, setShowDropdown] = useState(false);

  return (
    <div className="health-card p-4 sm:p-5 flex flex-col justify-between h-full">
      {/* Card Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-bold text-[#102A56]">Risk Distribution</h3>
          <span className="text-slate-400 hover:text-slate-600 cursor-help" title="Distribution of patient risk categories based on vitals and AI assessment">
            <Info className="w-3.5 h-3.5" />
          </span>
        </div>

        {/* Filter Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-[#102A56] bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2 py-1 rounded-lg transition-all"
          >
            <span>{filter}</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {showDropdown && (
            <div className="absolute right-0 mt-1 w-28 bg-white rounded-xl shadow-lg border border-slate-100 py-1 z-20 text-[11px]">
              {['Today', 'This Week', 'This Month'].map((opt) => (
                <button
                  key={opt}
                  onClick={() => {
                    setFilter(opt);
                    setShowDropdown(false);
                    onFilterChange?.(opt);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-slate-700 font-medium"
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Body: Donut Chart + Legend */}
      {totalPatients === 0 || data.every((d) => d.count === 0) ? (
        <div className="py-10 flex flex-col items-center justify-center text-center my-auto">
          <p className="text-xs font-bold text-[#102A56]">No risk assessment data available yet.</p>
          <p className="text-[11px] text-slate-500 mt-1">
            Risk distributions are dynamically computed from patient clinical assessments.
          </p>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 my-auto">
          {/* Donut Chart with Center Text */}
          <div className="relative w-40 h-40 flex items-center justify-center shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={68}
                  paddingAngle={3}
                  dataKey="count"
                  stroke="none"
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>

            {/* Centered Counter */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-black text-[#102A56] leading-none">{totalPatients}</span>
              <span className="text-[10px] font-semibold text-slate-400 mt-0.5">Total Patients</span>
            </div>
          </div>

          {/* Legend List */}
          <div className="w-full sm:w-auto flex flex-col gap-2 pl-2 text-xs">
            {data.map((item) => (
              <div key={item.name} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-slate-600 font-medium text-[11px]">{item.name}</span>
                </div>
                <span className="text-[11px] font-bold text-[#102A56]">
                  {item.count} <span className="text-slate-400 font-normal">({item.percentage}%)</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
