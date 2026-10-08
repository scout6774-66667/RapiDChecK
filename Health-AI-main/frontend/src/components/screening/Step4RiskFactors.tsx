import React from 'react';
import { ShieldAlert, Users, HeartPulse, ArrowLeft, ArrowRight } from 'lucide-react';
import type { RiskFactorsFormData } from './types';

interface Step4RiskFactorsProps {
  data: RiskFactorsFormData;
  onChange: (data: RiskFactorsFormData) => void;
  onNext: () => void;
  onBack: () => void;
}

export const Step4RiskFactors: React.FC<Step4RiskFactorsProps> = ({
  data,
  onChange,
  onNext,
  onBack,
}) => {
  const updateMedHistory = (key: keyof RiskFactorsFormData['medicalHistory'], val: any) => {
    onChange({
      ...data,
      medicalHistory: { ...data.medicalHistory, [key]: val },
    });
  };

  const updateFamHistory = (key: keyof RiskFactorsFormData['familyHistory'], val: any) => {
    onChange({
      ...data,
      familyHistory: { ...data.familyHistory, [key]: val },
    });
  };

  const updateLifestyle = (key: keyof RiskFactorsFormData['lifestyle'], val: any) => {
    onChange({
      ...data,
      lifestyle: { ...data.lifestyle, [key]: val },
    });
  };

  const medConditions: { id: keyof RiskFactorsFormData['medicalHistory']; label: string }[] = [
    { id: 'diabetes', label: 'Diabetes' },
    { id: 'hypertension', label: 'Hypertension (High BP)' },
    { id: 'previousTb', label: 'Previous Tuberculosis (TB)' },
    { id: 'heartDisease', label: 'Heart Disease' },
    { id: 'asthma', label: 'Asthma / Chronic Respiratory' },
  ];

  const famConditions: { id: keyof RiskFactorsFormData['familyHistory']; label: string }[] = [
    { id: 'diabetes', label: 'Family History of Diabetes' },
    { id: 'hypertension', label: 'Family History of Hypertension' },
    { id: 'heartDisease', label: 'Family History of Heart Disease' },
  ];

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-[#E5EEF1] p-5 sm:p-6 shadow-xs">
        {/* Header */}
        <div className="pb-4 border-b border-slate-100 mb-5">
          <h2 className="text-base sm:text-lg font-bold text-[#102A56]">
            Health & Risk Factors
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Capture relevant medical history and lifestyle indicators. Select "Unknown" if not sure.
          </p>
        </div>

        {/* Section 1: Medical History */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold text-[#102A56] uppercase tracking-wider">
              Patient Medical History
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {medConditions.map((cond) => {
              const currentVal = data.medicalHistory[cond.id];
              return (
                <div
                  key={cond.id}
                  className="p-3 rounded-xl border border-slate-200 bg-[#F8FAFC] flex items-center justify-between gap-2"
                >
                  <span className="text-xs font-semibold text-[#102A56]">{cond.label}</span>
                  <div className="flex items-center gap-1">
                    {(['Yes', 'No', 'Unknown'] as const).map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => updateMedHistory(cond.id, opt)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                          currentVal === opt
                            ? opt === 'Yes'
                              ? 'bg-rose-500 text-white shadow-2xs'
                              : opt === 'No'
                              ? 'bg-[#0A9F68] text-white shadow-2xs'
                              : 'bg-slate-300 text-slate-700'
                            : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 2: Family History */}
        <div className="mb-6 pt-5 border-t border-slate-100">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold text-[#102A56] uppercase tracking-wider">
              Family History
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {famConditions.map((cond) => {
              const currentVal = data.familyHistory[cond.id];
              return (
                <div
                  key={cond.id}
                  className="p-3 rounded-xl border border-slate-200 bg-[#F8FAFC] flex items-center justify-between gap-2"
                >
                  <span className="text-xs font-semibold text-[#102A56]">{cond.label}</span>
                  <div className="flex items-center gap-1">
                    {(['Yes', 'No', 'Unknown'] as const).map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => updateFamHistory(cond.id, opt)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                          currentVal === opt
                            ? opt === 'Yes'
                              ? 'bg-amber-500 text-white shadow-2xs'
                              : opt === 'No'
                              ? 'bg-[#0A9F68] text-white shadow-2xs'
                              : 'bg-slate-300 text-slate-700'
                            : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 3: Lifestyle */}
        <div className="pt-5 border-t border-slate-100">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-emerald-100 text-[#0A9F68] flex items-center justify-center">
              <HeartPulse className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold text-[#102A56] uppercase tracking-wider">
              Lifestyle Factors
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            {/* Smoking */}
            <div className="p-3 rounded-xl border border-slate-200 bg-[#F8FAFC]">
              <label className="block text-slate-700 font-bold mb-2">Tobacco / Smoking</label>
              <div className="grid grid-cols-2 gap-1.5">
                {(['Never', 'Former', 'Current', 'Unknown'] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => updateLifestyle('smoking', opt)}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all ${
                      data.lifestyle.smoking === opt
                        ? 'bg-[#0A9F68] text-white shadow-2xs'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            {/* Alcohol */}
            <div className="p-3 rounded-xl border border-slate-200 bg-[#F8FAFC]">
              <label className="block text-slate-700 font-bold mb-2">Alcohol Intake</label>
              <div className="grid grid-cols-2 gap-1.5">
                {(['Never', 'Occasional', 'Regular', 'Unknown'] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => updateLifestyle('alcohol', opt)}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all ${
                      data.lifestyle.alcohol === opt
                        ? 'bg-[#0A9F68] text-white shadow-2xs'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            {/* Physical Activity */}
            <div className="p-3 rounded-xl border border-slate-200 bg-[#F8FAFC]">
              <label className="block text-slate-700 font-bold mb-2">Physical Activity</label>
              <div className="grid grid-cols-2 gap-1.5">
                {(['Sedentary', 'Moderate', 'Active', 'Unknown'] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => updateLifestyle('physicalActivity', opt)}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all ${
                      data.lifestyle.physicalActivity === opt
                        ? 'bg-[#0A9F68] text-white shadow-2xs'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-all flex items-center gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Vitals</span>
        </button>

        <button
          type="button"
          onClick={onNext}
          className="px-5 py-2.5 rounded-xl bg-[#0A9F68] hover:bg-[#088758] text-white font-bold text-xs transition-all shadow-md shadow-[#0A9F68]/25 flex items-center gap-2 group"
        >
          <span>Continue to Review</span>
          <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>
    </div>
  );
};
