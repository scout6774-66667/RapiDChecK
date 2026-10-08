import React, { useState, useMemo } from 'react';
import {
  Users,
  Activity,
  Thermometer,
  ShieldCheck,
  Edit2,
  ArrowLeft,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import type {
  PatientFormData,
  SymptomsFormData,
  VitalsFormData,
  RiskFactorsFormData,
  ScreeningStep,
} from './types';
import { calculateCompleteness, calculateBmi } from './clinicalRules';

interface Step5ReviewProps {
  patient: PatientFormData;
  symptoms: SymptomsFormData;
  vitals: VitalsFormData;
  riskFactors: RiskFactorsFormData;
  onEditStep: (step: ScreeningStep) => void;
  onRunScreening: () => void;
  onBack: () => void;
}

export const Step5Review: React.FC<Step5ReviewProps> = ({
  patient,
  symptoms,
  vitals,
  riskFactors,
  onEditStep,
  onRunScreening,
  onBack,
}) => {
  const [confirmedWithPatient, setConfirmedWithPatient] = useState(false);

  const completeness = useMemo(() => {
    return calculateCompleteness(patient, symptoms, vitals, riskFactors);
  }, [patient, symptoms, vitals, riskFactors]);

  const bmiInfo = useMemo(() => {
    return calculateBmi(vitals.heightCm, vitals.weightKg);
  }, [vitals.heightCm, vitals.weightKg]);

  return (
    <div className="space-y-5">
      {/* Completeness Card */}
      <div className="bg-white rounded-2xl border border-[#E5EEF1] p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-bold text-[#102A56] flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#0A9F68]" />
              <span>Assessment Completeness</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {completeness.score >= 80
                ? 'High data completeness recorded for this screening session.'
                : 'Some non-essential vital indicators are not yet recorded.'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xl font-black text-[#0A9F68]">
              {completeness.score}%
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden mb-2">
          <div
            className="bg-[#0A9F68] h-full rounded-full transition-all duration-300"
            style={{ width: `${completeness.score}%` }}
          />
        </div>

        {completeness.missingFields.length > 0 && (
          <p className="text-[11px] text-slate-400 mt-1.5 flex items-center flex-wrap gap-1.5">
            <span>Missing:</span>
            {completeness.missingFields.map((f, i) => (
              <span key={i} className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-semibold">
                {f}
              </span>
            ))}
          </p>
        )}
      </div>

      {/* Review Sections Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 1. Patient Information */}
        <div className="bg-white rounded-2xl border border-[#E5EEF1] p-4 sm:p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[#0A9F68]" />
                <h4 className="text-xs font-bold text-[#102A56] uppercase tracking-wider">
                  Patient Details
                </h4>
              </div>
              <button
                type="button"
                onClick={() => onEditStep(1)}
                className="text-xs font-bold text-[#0A9F68] hover:text-[#088758] flex items-center gap-1"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
            </div>

            <div className="space-y-1.5 text-xs">
              <p className="font-extrabold text-[#102A56] text-sm">{patient.name}</p>
              <p className="text-slate-600">
                {patient.age} years • {patient.gender} • ID: {patient.customId || 'PT-NEW'}
              </p>
              <p className="text-slate-500">Village: {patient.village}</p>
              {patient.phone && <p className="text-slate-500">Phone: {patient.phone}</p>}
            </div>
          </div>
        </div>

        {/* 2. Symptoms */}
        <div className="bg-white rounded-2xl border border-[#E5EEF1] p-4 sm:p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <div className="flex items-center gap-2">
                <Thermometer className="w-4 h-4 text-amber-500" />
                <h4 className="text-xs font-bold text-[#102A56] uppercase tracking-wider">
                  Reported Symptoms
                </h4>
              </div>
              <button
                type="button"
                onClick={() => onEditStep(2)}
                className="text-xs font-bold text-[#0A9F68] hover:text-[#088758] flex items-center gap-1"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
            </div>

            <div className="space-y-2 text-xs">
              {symptoms.symptoms.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {symptoms.symptoms.map((s, idx) => (
                    <span
                      key={idx}
                      className="bg-[#E7F7F0] text-[#0A9F68] border border-[#0A9F68]/30 px-2 py-0.5 rounded-lg text-[11px] font-bold"
                    >
                      ✓ {s}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 italic">No symptoms selected.</p>
              )}

              <p className="text-slate-600 text-[11px] pt-1">
                Duration: <span className="font-bold text-[#102A56]">{symptoms.duration}</span> • Severity:{' '}
                <span className="font-bold text-[#102A56]">{symptoms.severity}</span>
              </p>
            </div>
          </div>
        </div>

        {/* 3. Vitals */}
        <div className="bg-white rounded-2xl border border-[#E5EEF1] p-4 sm:p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-red-500" />
                <h4 className="text-xs font-bold text-[#102A56] uppercase tracking-wider">
                  Vitals & Measurements
                </h4>
              </div>
              <button
                type="button"
                onClick={() => onEditStep(3)}
                className="text-xs font-bold text-[#0A9F68] hover:text-[#088758] flex items-center gap-1"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-slate-400 text-[10px] block">Blood Pressure</span>
                <span className="font-bold text-[#102A56]">
                  {vitals.systolicBp ? `${vitals.systolicBp}/${vitals.diastolicBp} mmHg` : 'Not measured'}
                </span>
              </div>

              <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-slate-400 text-[10px] block">Temperature</span>
                <span className="font-bold text-[#102A56]">
                  {vitals.temperatureF ? `${vitals.temperatureF}°F` : 'Not measured'}
                </span>
              </div>

              <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-slate-400 text-[10px] block">Heart Rate</span>
                <span className="font-bold text-[#102A56]">
                  {vitals.heartRateBpm ? `${vitals.heartRateBpm} BPM` : 'Not measured'}
                </span>
              </div>

              <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-slate-400 text-[10px] block">Blood Glucose</span>
                <span className="font-bold text-[#102A56]">
                  {vitals.glucoseMeasured && vitals.glucoseMgDl
                    ? `${vitals.glucoseMgDl} mg/dL`
                    : 'Not measured'}
                </span>
              </div>

              {bmiInfo.bmi && (
                <div className="p-2 rounded-xl bg-[#E7F7F0] border border-[#0A9F68]/20 col-span-2">
                  <span className="text-[#0A9F68] text-[10px] block font-semibold">BMI Analysis</span>
                  <span className="font-bold text-[#102A56]">
                    {bmiInfo.bmi} ({bmiInfo.category}) • {vitals.heightCm}cm / {vitals.weightKg}kg
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 4. Risk Factors */}
        <div className="bg-white rounded-2xl border border-[#E5EEF1] p-4 sm:p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-500" />
                <h4 className="text-xs font-bold text-[#102A56] uppercase tracking-wider">
                  Health & Risk Factors
                </h4>
              </div>
              <button
                type="button"
                onClick={() => onEditStep(4)}
                className="text-xs font-bold text-[#0A9F68] hover:text-[#088758] flex items-center gap-1"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
            </div>

            <div className="space-y-1.5 text-xs text-slate-600">
              <p>
                <span className="text-slate-400">Smoking / Tobacco:</span>{' '}
                <span className="font-bold text-[#102A56]">{riskFactors.lifestyle.smoking}</span>
              </p>
              <p>
                <span className="text-slate-400">Diabetes History:</span>{' '}
                <span className="font-bold text-[#102A56]">{riskFactors.medicalHistory.diabetes}</span>
              </p>
              <p>
                <span className="text-slate-400">Hypertension History:</span>{' '}
                <span className="font-bold text-[#102A56]">{riskFactors.medicalHistory.hypertension}</span>
              </p>
              <p>
                <span className="text-slate-400">Previous TB:</span>{' '}
                <span className="font-bold text-[#102A56]">{riskFactors.medicalHistory.previousTb}</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation & CTA */}
      <div className="bg-white rounded-2xl border border-[#E5EEF1] p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <label className="flex items-center gap-3 cursor-pointer select-none text-xs font-bold text-[#102A56]">
          <input
            type="checkbox"
            checked={confirmedWithPatient}
            onChange={(e) => setConfirmedWithPatient(e.target.checked)}
            className="w-4.5 h-4.5 rounded text-[#0A9F68] focus:ring-[#0A9F68] cursor-pointer"
          />
          <span>I have reviewed these screening details and measurements with the patient.</span>
        </label>

        <button
          type="button"
          disabled={!confirmedWithPatient}
          onClick={onRunScreening}
          className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#0A9F68] hover:bg-[#088758] disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-black text-xs transition-all shadow-md shadow-[#0A9F68]/25 flex items-center justify-center gap-2 shrink-0 group"
        >
          <Sparkles className="w-4 h-4" />
          <span>Run AI-Assisted Screening</span>
          <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>

      {/* Back Button */}
      <div>
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-all flex items-center gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Risk Factors</span>
        </button>
      </div>
    </div>
  );
};
