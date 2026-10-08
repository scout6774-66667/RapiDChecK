import React from 'react';
import { ArrowRight, Phone } from 'lucide-react';
import type { UpcomingAppointment } from './types';

interface UpcomingAppointmentsCardProps {
  appointments: UpcomingAppointment[];
  onViewAll?: () => void;
  onCallPatient?: (phone?: string) => void;
}

export const UpcomingAppointmentsCard: React.FC<UpcomingAppointmentsCardProps> = ({
  appointments,
  onViewAll,
  onCallPatient,
}) => {
  return (
    <div className="health-card p-4 sm:p-5 flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-[#102A56]">Upcoming Appointments</h3>
        <button
          onClick={onViewAll}
          className="text-xs font-bold text-[#0A9F68] hover:text-[#088758] flex items-center gap-1 transition-all"
        >
          <span>View All</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Appointment Rows or Empty State */}
      {appointments.length === 0 ? (
        <div className="py-7 flex flex-col items-center justify-center text-center">
          <p className="text-xs font-bold text-[#102A56]">No upcoming appointments.</p>
          <p className="text-[11px] text-slate-500 mt-1 max-w-xs">
            Teleconsultation and hospital appointments booked with doctors will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {appointments.map((appt) => {
            const initials = appt.patientName
              .split(' ')
              .map((n) => n[0])
              .join('')
              .slice(0, 2);

            return (
              <div
                key={appt.id}
                className="flex items-center justify-between gap-2 p-2 rounded-xl hover:bg-slate-50 transition-colors"
              >
                {/* Left: Time + Avatar + Name + Facility */}
                <div className="flex items-center gap-3">
                  <div className="text-[11px] font-bold text-[#102A56] w-14 shrink-0">
                    {appt.time}
                  </div>

                  <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#8B5CF6]/20 to-[#3B82F6]/20 text-[#8B5CF6] font-bold text-[11px] flex items-center justify-center border border-purple-200 shrink-0">
                    {initials}
                  </div>

                  <div>
                    <p className="text-xs font-bold text-[#102A56] leading-tight">
                      {appt.patientName}
                    </p>
                    <p className="text-[10px] text-slate-500 font-medium">
                      {appt.purpose} • <span className="text-slate-400">{appt.facility}</span>
                    </p>
                  </div>
                </div>

                {/* Right: Phone Icon */}
                <button
                  onClick={() => onCallPatient?.(appt.phone)}
                  className="w-7 h-7 rounded-full bg-[#E7F7F0] text-[#0A9F68] hover:bg-[#0A9F68] hover:text-white flex items-center justify-center transition-all shrink-0"
                  title={`Call ${appt.patientName}`}
                >
                  <Phone className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
