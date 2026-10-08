import React, { useState } from 'react';
import { X, Share2, Building2, CheckCircle2, ArrowRight } from 'lucide-react';
import type { ScreeningResultData, PatientFormData, VitalsFormData, SymptomsFormData } from './types';

interface ReferralModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: ScreeningResultData;
  patient: PatientFormData;
  vitals: VitalsFormData;
  symptoms: SymptomsFormData;
  onReferralCreated: (referralData: any) => void;
}

export const ReferralModal: React.FC<ReferralModalProps> = ({
  isOpen,
  onClose,
  result,
  patient,
  vitals,
  symptoms,
  onReferralCreated,
}) => {
  const [facility, setFacility] = useState('Sundarpur Primary Health Centre (PHC)');
  const [urgency, setUrgency] = useState<'Immediate (24 hours)' | 'Routine (3–5 days)'>(
    result.riskLevel === 'HIGH' ? 'Immediate (24 hours)' : 'Routine (3–5 days)'
  );
  const [notes, setNotes] = useState(
    `AI-assisted screening flagged ${result.riskLevel} risk. Key concerns: ${result.potentialRiskIndicators.join(
      ', '
    )}.`
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const referralPayload = {
        patientId: patient.id,
        patientName: patient.name,
        patientAge: patient.age,
        patientGender: patient.gender,
        patientVillage: patient.village,
        assessmentId: result.assessmentId,
        riskLevel: result.riskLevel,
        facility,
        urgency,
        notes,
        symptoms: symptoms.symptoms,
        vitalsSummary: `${vitals.systolicBp}/${vitals.diastolicBp} mmHg, ${vitals.temperatureF}°F`,
        created_at: new Date().toISOString(),
      };

      onReferralCreated(referralPayload);
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1500);
    } catch {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden text-[#102A56]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-[#F8FAFC]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#E7F7F0] text-[#0A9F68] flex items-center justify-center shadow-xs">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-[#102A56]">Create PHC Referral</h3>
              <p className="text-xs text-slate-400 font-medium">
                Refer {patient.name} for clinical physician evaluation
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
        {success ? (
          <div className="p-8 text-center space-y-2">
            <div className="w-14 h-14 rounded-full bg-[#E7F7F0] text-[#0A9F68] mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h4 className="text-base font-bold text-[#102A56]">Referral Successfully Created!</h4>
            <p className="text-xs text-slate-500">
              The record has been linked to the PHC priority queue.
            </p>
          </div>
        ) : (
          <div className="p-5 space-y-4 text-xs">
            {/* Patient Summary Badge */}
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
              <div>
                <p className="font-bold text-[#102A56]">{patient.name}</p>
                <p className="text-[11px] text-slate-500">
                  {patient.age} yrs • {patient.gender} • {patient.village}
                </p>
              </div>
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                  result.riskLevel === 'HIGH'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                {result.riskLevel} RISK
              </span>
            </div>

            {/* Target Facility */}
            <div>
              <label className="block text-slate-700 font-bold mb-1 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-[#0A9F68]" /> Target Healthcare Facility
              </label>
              <select
                value={facility}
                onChange={(e) => setFacility(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-[#F8FAFC] text-xs font-semibold text-[#102A56] focus:border-[#0A9F68] outline-none"
              >
                <option value="Sundarpur Primary Health Centre (PHC)">
                  Sundarpur Primary Health Centre (PHC)
                </option>
                <option value="Rampur Community Health Centre (CHC)">
                  Rampur Community Health Centre (CHC)
                </option>
                <option value="District Civil Hospital">District Civil Hospital</option>
              </select>
            </div>

            {/* Urgency */}
            <div>
              <label className="block text-slate-700 font-bold mb-1">Referral Urgency</label>
              <div className="grid grid-cols-2 gap-2">
                {(['Immediate (24 hours)', 'Routine (3–5 days)'] as const).map((urg) => (
                  <button
                    key={urg}
                    type="button"
                    onClick={() => setUrgency(urg)}
                    className={`py-2 px-3 rounded-xl border font-bold text-xs transition-all ${
                      urgency === urg
                        ? urg.includes('Immediate')
                          ? 'bg-red-500 text-white border-red-500 shadow-xs'
                          : 'bg-[#0A9F68] text-white border-[#0A9F68] shadow-xs'
                        : 'bg-[#F8FAFC] text-slate-600 border-slate-200 hover:bg-white'
                    }`}
                  >
                    {urg}
                  </button>
                ))}
              </div>
            </div>

            {/* Clinical Notes */}
            <div>
              <label className="block text-slate-700 font-bold mb-1">
                ASHA Clinical Notes for Physician
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-200 bg-[#F8FAFC] text-xs font-medium text-[#102A56] focus:border-[#0A9F68] outline-none resize-none"
              />
            </div>
          </div>
        )}

        {/* Footer */}
        {!success && (
          <div className="p-4 border-t border-slate-100 bg-slate-50/60 flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-white"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-[#0A9F68] hover:bg-[#088758] text-white font-bold text-xs transition-all shadow-md shadow-[#0A9F68]/20 flex items-center gap-1.5"
            >
              <span>Confirm & Dispatch Referral</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
