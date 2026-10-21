import React, { useState } from 'react';
import { Info, ChevronDown } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import type { RiskDistributionItem } from './types';
import { useLanguage } from '../../i18n';

interface RiskDistributionCardProps {
  data: RiskDistributionItem[];
  totalPatients?: number;
  period?: string;
  onFilterChange?: (filter: string) => void;
}

export const RiskDistributionCard: React.FC<RiskDistributionCardProps> = ({
  data,
  totalPatients = 0,
  period = 'Current Status',
  onFilterChange,
}) => {
  const { strings } = useLanguage();
  const [filter, setFilter] = useState(period);
  const [showDropdown, setShowDropdown] = useState(false);

  // Keep internal state in sync with external period prop
  React.useEffect(() => {
    if (period) setFilter(period);
  }, [period]);

  const filterOptions = [
    { key: 'Current Status', label: strings?.dashboard?.currentStatus || 'Current Status' },
    { key: 'Last 7 Days', label: strings?.dashboard?.last7Days || 'Last 7 Days' },
    { key: 'Last 30 Days', label: strings?.dashboard?.last30Days || 'Last 30 Days' },
  ];

  const getTranslatedName = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('high')) return strings?.dashboard?.highRisk || name;
    if (lower.includes('mod')) return strings?.dashboard?.moderateRisk || name;
    if (lower.includes('low')) return strings?.dashboard?.lowRisk || name;
    if (lower.includes('unassess')) return strings?.dashboard?.unassessed || name;
    return name;
  };

  return (
    <div className="health-card p-4 sm:p-5 flex flex-col justify-between h-full">
      {/* Card Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-bold text-[#102A56]">
            {strings?.dashboard?.riskDistribution || 'Risk Distribution'}
          </h3>
          <span
            className="text-slate-400 hover:text-slate-600 cursor-help"
            title={strings?.dashboard?.riskDistributionTooltip || 'Distribution of patient risk categories based on latest clinical assessment in selected period'}
          >
            <Info className="w-3.5 h-3.5" />
          </span>
        </div>

        {/* Filter Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-[#102A56] bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2 py-1 rounded-lg transition-all cursor-pointer"
          >
            <span>{filterOptions.find(f => f.key === filter)?.label || filter}</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {showDropdown && (
            <div className="absolute right-0 mt-1 w-32 bg-white rounded-xl shadow-lg border border-slate-100 py-1 z-20 text-[11px]">
              {filterOptions.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => {
                    setFilter(opt.key);
                    setShowDropdown(false);
                    onFilterChange?.(opt.key);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-slate-700 font-medium cursor-pointer"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Body: Donut Chart + Legend */}
      {totalPatients === 0 || data.every((d) => d.count === 0) ? (
        <div className="py-10 flex flex-col items-center justify-center text-center my-auto">
          <p className="text-xs font-bold text-[#102A56]">
            {strings?.patients?.noAssessmentsRecorded || 'No risk assessment data available yet.'}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            {strings?.dashboard?.riskDistributionTooltip || 'Risk distributions are dynamically computed from patient clinical assessments.'}
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
              <span className="text-[10px] font-semibold text-slate-400 mt-0.5">
                {strings?.patients?.totalPatients || 'Total Patients'}
              </span>
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
                  <span className="text-slate-600 font-medium text-[11px]">
                    {getTranslatedName(item.name)}
                  </span>
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
