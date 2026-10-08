import React, { useState } from 'react';
import { MoreHorizontal, ArrowRight, UserCheck, Stethoscope, Calendar } from 'lucide-react';
import type { PatientTableRow } from './types';

interface RecentPatientsTableProps {
  patients: PatientTableRow[];
  onViewAll?: () => void;
  onSelectPatient?: (patient: PatientTableRow) => void;
  onStartScreening?: (patient: PatientTableRow) => void;
  onBookAppointment?: (patient: PatientTableRow) => void;
}

export const RecentPatientsTable: React.FC<RecentPatientsTableProps> = ({
  patients,
  onViewAll,
  onSelectPatient,
  onStartScreening,
  onBookAppointment,
}) => {
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const getRiskBadge = (risk: PatientTableRow['riskLevel']) => {
    switch (risk) {
      case 'HIGH':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#FEF2F2] text-[#EF4444] border border-red-200">
            High
          </span>
        );
      case 'MODERATE':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#FFFBEB] text-[#F59E0B] border border-amber-200">
            Moderate
          </span>
        );
      case 'LOW':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#ECFDF5] text-[#10B981] border border-emerald-200">
            Low
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
            Review
          </span>
        );
    }
  };

  const getStatusBadge = (status: PatientTableRow['status']) => {
    switch (status) {
      case 'REFERRED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#EFF6FF] text-[#3B82F6] border border-blue-200">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6]"></span>
            Referred
          </span>
        );
      case 'APPOINTMENT':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#F5F3FF] text-[#8B5CF6] border border-purple-200">
            <span className="w-1.5 h-1.5 rounded-full bg-[#8B5CF6]"></span>
            Appointment
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#FFFBEB] text-[#F59E0B] border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]"></span>
            Pending
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#ECFDF5] text-[#10B981] border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]"></span>
            Completed
          </span>
        );
      case 'UNDER_REVIEW':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#EFF6FF] text-[#3B82F6] border border-blue-200">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6]"></span>
            Under Review
          </span>
        );
    }
  };

  return (
    <div className="health-card p-4 sm:p-5 flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-[#102A56]">Recent Patients</h3>
        <button
          onClick={onViewAll}
          className="text-xs font-bold text-[#0A9F68] hover:text-[#088758] flex items-center gap-1 transition-all"
        >
          <span>View All</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-[#E5EEF1] text-slate-400 font-semibold text-[11px]">
              <th className="pb-3 font-semibold pl-2">Patient</th>
              <th className="pb-3 font-semibold">Age / Gender</th>
              <th className="pb-3 font-semibold">Risk Level</th>
              <th className="pb-3 font-semibold">Key Symptoms</th>
              <th className="pb-3 font-semibold">Status</th>
              <th className="pb-3 font-semibold text-right pr-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {patients.map((patient) => {
              const initials = patient.name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2);

              return (
                <tr
                  key={patient.id}
                  className="hover:bg-slate-50/70 transition-colors group cursor-pointer"
                  onClick={() => onSelectPatient?.(patient)}
                >
                  {/* Patient Info with Avatar */}
                  <td className="py-3 pl-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#102A56]/10 to-[#0A9F68]/20 text-[#102A56] font-bold text-xs flex items-center justify-center border border-slate-200 shrink-0">
                        {initials}
                      </div>
                      <div>
                        <div className="font-bold text-[#102A56] leading-tight group-hover:text-[#0A9F68] transition-colors">
                          {patient.name}
                        </div>
                        <div className="text-[10px] text-slate-400 font-medium">
                          ID: {patient.customId}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Age / Gender */}
                  <td className="py-3 text-slate-600 font-medium">
                    {patient.age} / {patient.gender}
                  </td>

                  {/* Risk Level Badge */}
                  <td className="py-3">{getRiskBadge(patient.riskLevel)}</td>

                  {/* Key Symptoms */}
                  <td className="py-3 text-slate-600 font-medium max-w-[160px] truncate" title={patient.keySymptoms}>
                    {patient.keySymptoms}
                  </td>

                  {/* Status Badge */}
                  <td className="py-3">{getStatusBadge(patient.status)}</td>

                  {/* Actions Menu */}
                  <td className="py-3 text-right pr-2 relative" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() =>
                        setActiveMenuId(activeMenuId === patient.id ? null : patient.id)
                      }
                      className="p-1 rounded-lg text-slate-400 hover:text-[#102A56] hover:bg-slate-100 transition-all"
                      aria-label="Actions"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>

                    {activeMenuId === patient.id && (
                      <div className="absolute right-2 mt-1 w-44 bg-white rounded-xl shadow-xl border border-slate-100 py-1.5 z-30 text-left animate-in fade-in zoom-in-95 duration-100">
                        <button
                          onClick={() => {
                            setActiveMenuId(null);
                            onSelectPatient?.(patient);
                          }}
                          className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 font-medium"
                        >
                          <UserCheck className="w-3.5 h-3.5 text-slate-500" />
                          View Health Record
                        </button>
                        <button
                          onClick={() => {
                            setActiveMenuId(null);
                            onStartScreening?.(patient);
                          }}
                          className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 font-medium"
                        >
                          <Stethoscope className="w-3.5 h-3.5 text-[#0A9F68]" />
                          Run Assessment
                        </button>
                        <button
                          onClick={() => {
                            setActiveMenuId(null);
                            onBookAppointment?.(patient);
                          }}
                          className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 font-medium"
                        >
                          <Calendar className="w-3.5 h-3.5 text-[#8B5CF6]" />
                          Book Doctor
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
