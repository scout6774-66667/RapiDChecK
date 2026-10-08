import React from 'react';
import { X, Stethoscope, Calendar, Phone, MapPin, CheckCircle2 } from 'lucide-react';
import type { PatientTableRow } from './types';

interface PatientDetailsModalProps {
  patient: PatientTableRow | null;
  onClose: () => void;
  onStartScreening: (patient: PatientTableRow) => void;
  onBookAppointment: (patient: PatientTableRow) => void;
}

export const PatientDetailsModal: React.FC<PatientDetailsModalProps> = ({
  patient,
  onClose,
  onStartScreening,
  onBookAppointment,
}) => {
  if (!patient) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden text-[#102A56]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-[#F8FAFC]">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#0A9F68] to-[#10B981] text-white font-extrabold text-sm flex items-center justify-center shadow-md">
              {patient.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h3 className="text-base font-extrabold text-[#102A56] leading-tight">
                {patient.name}
              </h3>
              <p className="text-xs text-slate-400 font-semibold">
                ID: {patient.customId} • {patient.age} yrs • {patient.gender === 'M' ? 'Male' : 'Female'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-200/60 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs">
          {/* Risk Level Badge & Status */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
            <div>
              <p className="text-[10px] text-slate-400 font-semibold uppercase">Risk Assessment</p>
              <p
                className={`text-sm font-black ${
                  patient.riskLevel === 'HIGH'
                    ? 'text-[#EF4444]'
                    : patient.riskLevel === 'MODERATE'
                    ? 'text-[#F59E0B]'
                    : 'text-[#0A9F68]'
                }`}
              >
                {patient.riskLevel} RISK
              </p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-semibold uppercase text-right">Status</p>
              <p className="text-xs font-bold text-[#3B82F6]">{patient.status.replace('_', ' ')}</p>
            </div>
          </div>

          {/* Details */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-slate-600">
              <Phone className="w-4 h-4 text-slate-400" />
              <span>{patient.phone || 'Phone not provided'}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <MapPin className="w-4 h-4 text-slate-400" />
              <span>{patient.village || 'Sundarpur Block'}</span>
            </div>
          </div>

          {/* Key Symptoms */}
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase mb-1">Observed Symptoms</p>
            <div className="p-2.5 bg-amber-50/70 border border-amber-100 rounded-xl text-amber-900 font-medium">
              {patient.keySymptoms || 'No immediate severe symptoms reported.'}
            </div>
          </div>

          {/* Decision support note */}
          <div className="p-2.5 bg-blue-50/60 border border-blue-100 rounded-xl text-[11px] text-blue-900">
            <p className="font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
              <span>Clinical Decision Support Platform</span>
            </p>
            <p className="text-slate-500 mt-0.5">
              Screening assistance only. Refer for physician evaluation if high risk is indicated.
            </p>
          </div>
        </div>

        {/* Actions Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/60 flex items-center justify-end gap-2">
          <button
            onClick={() => onBookAppointment(patient)}
            className="px-3.5 py-2 rounded-xl border border-purple-200 text-purple-700 bg-purple-50 font-bold hover:bg-purple-100 transition-colors flex items-center gap-1.5 text-xs"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Book Doctor</span>
          </button>
          <button
            onClick={() => onStartScreening(patient)}
            className="px-4 py-2 rounded-xl bg-[#0A9F68] hover:bg-[#088758] text-white font-bold transition-all shadow-md shadow-[#0A9F68]/20 flex items-center gap-1.5 text-xs"
          >
            <Stethoscope className="w-3.5 h-3.5" />
            <span>Start Screening</span>
          </button>
        </div>
      </div>
    </div>
  );
};
