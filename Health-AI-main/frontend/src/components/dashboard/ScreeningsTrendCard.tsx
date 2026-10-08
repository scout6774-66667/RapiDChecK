import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { ScreeningTrendItem } from './types';

interface ScreeningsTrendCardProps {
  data: ScreeningTrendItem[];
  onPeriodChange?: (period: string) => void;
}

export const ScreeningsTrendCard: React.FC<ScreeningsTrendCardProps> = ({
  data,
  onPeriodChange,
}) => {
  const [period, setPeriod] = useState('Last 7 Days');
  const [showDropdown, setShowDropdown] = useState(false);

  return (
    <div className="health-card p-4 sm:p-5 flex flex-col justify-between h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-[#102A56]">Screenings Trend</h3>

        {/* Timeframe Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-[#102A56] bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2 py-1 rounded-lg transition-all"
          >
            <span>{period}</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {showDropdown && (
            <div className="absolute right-0 mt-1 w-32 bg-white rounded-xl shadow-lg border border-slate-100 py-1 z-20 text-[11px]">
              {['Last 7 Days', 'Last 14 Days', 'Last 30 Days'].map((opt) => (
                <button
                  key={opt}
                  onClick={() => {
                    setPeriod(opt);
                    setShowDropdown(false);
                    onPeriodChange?.(opt);
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

      {/* Chart Legend */}
      <div className="flex items-center gap-4 mb-2 text-[11px]">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#0A9F68]"></span>
          <span className="text-slate-600 font-medium">Total</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#EF4444]"></span>
          <span className="text-slate-600 font-medium">High Risk</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#F59E0B]"></span>
          <span className="text-slate-600 font-medium">Moderate Risk</span>
        </div>
      </div>

      {/* Trend Area Chart */}
      <div className="w-full h-44 mt-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
            <defs>
              <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0A9F68" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#0A9F68" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="colorHigh" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#EF4444" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#EF4444" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="colorMod" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#94A3B8', fontSize: 10 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#94A3B8', fontSize: 10 }}
              domain={[0, 40]}
              ticks={[0, 10, 20, 30, 40]}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#FFFFFF',
                borderRadius: '0.75rem',
                border: '1px solid #E2E8F0',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                fontSize: '11px',
                padding: '8px 12px',
              }}
            />
            <Area
              type="monotone"
              dataKey="total"
              stroke="#0A9F68"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorTotal)"
            />
            <Area
              type="monotone"
              dataKey="moderateRisk"
              stroke="#F59E0B"
              strokeWidth={1.8}
              fillOpacity={1}
              fill="url(#colorMod)"
            />
            <Area
              type="monotone"
              dataKey="highRisk"
              stroke="#EF4444"
              strokeWidth={1.8}
              fillOpacity={1}
              fill="url(#colorHigh)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
