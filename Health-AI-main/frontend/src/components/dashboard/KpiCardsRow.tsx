import React from 'react';
import { Users, AlertTriangle, Stethoscope, Calendar, TrendingUp } from 'lucide-react';
import type { DashboardKpi } from './types';

interface KpiCardsRowProps {
  kpis: DashboardKpi;
  onCardClick?: (type: 'screened' | 'high_risk' | 'referrals' | 'appointments') => void;
}

export const KpiCardsRow: React.FC<KpiCardsRowProps> = ({ kpis, onCardClick }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
      {/* 1. Patients Screened */}
      <div
        onClick={() => onCardClick?.('screened')}
        className="health-card p-4.5 cursor-pointer hover:border-[#0A9F68]/40 relative overflow-hidden group"
      >
        <div className="flex items-start justify-between">
          <div className="w-10 h-10 rounded-2xl bg-[#E7F7F0] text-[#0A9F68] flex items-center justify-center transition-transform group-hover:scale-105">
            <Users className="w-5 h-5" />
          </div>
          <div className="w-6 h-6 rounded-full bg-[#E7F7F0] text-[#0A9F68] flex items-center justify-center opacity-80">
            <TrendingUp className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="mt-3">
          <div className="text-2xl sm:text-3xl font-extrabold text-[#102A56] tracking-tight">
            {kpis.patientsScreened}
          </div>
          <div className="text-xs font-semibold text-slate-500 mt-0.5">Patients Screened</div>
          <div className="text-[11px] font-bold text-[#0A9F68] mt-1.5 flex items-center gap-1">
            <span>{kpis.patientsScreenedTrend}</span>
          </div>
        </div>
      </div>

      {/* 2. High Risk Cases */}
      <div
        onClick={() => onCardClick?.('high_risk')}
        className="health-card p-4.5 cursor-pointer hover:border-red-300 relative overflow-hidden group"
      >
        <div className="flex items-start justify-between">
          <div className="w-10 h-10 rounded-2xl bg-[#FEF2F2] text-[#EF4444] flex items-center justify-center transition-transform group-hover:scale-105">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="w-6 h-6 rounded-full bg-[#FEF2F2] text-[#EF4444] flex items-center justify-center opacity-80">
            <TrendingUp className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="mt-3">
          <div className="text-2xl sm:text-3xl font-extrabold text-[#102A56] tracking-tight">
            {kpis.highRiskCases}
          </div>
          <div className="text-xs font-semibold text-slate-500 mt-0.5">High Risk Cases</div>
          <div className="text-[11px] font-bold text-[#EF4444] mt-1.5 flex items-center gap-1">
            <span>{kpis.highRiskTrend}</span>
          </div>
        </div>
      </div>

      {/* 3. Referrals Made */}
      <div
        onClick={() => onCardClick?.('referrals')}
        className="health-card p-4.5 cursor-pointer hover:border-blue-300 relative overflow-hidden group"
      >
        <div className="flex items-start justify-between">
          <div className="w-10 h-10 rounded-2xl bg-[#EFF6FF] text-[#3B82F6] flex items-center justify-center transition-transform group-hover:scale-105">
            <Stethoscope className="w-5 h-5" />
          </div>
          <div className="w-6 h-6 rounded-full bg-[#EFF6FF] text-[#3B82F6] flex items-center justify-center opacity-80">
            <TrendingUp className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="mt-3">
          <div className="text-2xl sm:text-3xl font-extrabold text-[#102A56] tracking-tight">
            {kpis.referralsMade}
          </div>
          <div className="text-xs font-semibold text-slate-500 mt-0.5">Referrals Made</div>
          <div className="text-[11px] font-bold text-[#3B82F6] mt-1.5 flex items-center gap-1">
            <span>{kpis.referralsTrend}</span>
          </div>
        </div>
      </div>

      {/* 4. Appointments */}
      <div
        onClick={() => onCardClick?.('appointments')}
        className="health-card p-4.5 cursor-pointer hover:border-purple-300 relative overflow-hidden group"
      >
        <div className="flex items-start justify-between">
          <div className="w-10 h-10 rounded-2xl bg-[#F5F3FF] text-[#8B5CF6] flex items-center justify-center transition-transform group-hover:scale-105">
            <Calendar className="w-5 h-5" />
          </div>
          <div className="w-6 h-6 rounded-full bg-[#F5F3FF] text-[#8B5CF6] flex items-center justify-center opacity-80">
            <TrendingUp className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="mt-3">
          <div className="text-2xl sm:text-3xl font-extrabold text-[#102A56] tracking-tight">
            {kpis.appointments}
          </div>
          <div className="text-xs font-semibold text-slate-500 mt-0.5">Appointments</div>
          <div className="text-[11px] font-bold text-[#8B5CF6] mt-1.5 flex items-center gap-1">
            <span>{kpis.appointmentsTrend}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
