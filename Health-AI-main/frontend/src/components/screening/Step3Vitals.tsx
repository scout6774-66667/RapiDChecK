import React, { useMemo } from 'react';
import {
  Activity,
  Heart,
  Thermometer,
  Droplet,
  Scale,
  Ruler,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';
import type { VitalsFormData } from './types';
import { calculateBmi, validateVitalsPlausibility } from './clinicalRules';

interface Step3VitalsProps {
  data: VitalsFormData;
  onChange: (data: VitalsFormData) => void;
  onNext: () => void;
  onBack: () => void;
}

export const Step3Vitals: React.FC<Step3VitalsProps> = ({
  data,
  onChange,
  onNext,
  onBack,
}) => {
  // Live BMI calculation
  const bmiInfo = useMemo(() => {
    return calculateBmi(data.heightCm, data.weightKg);
  }, [data.heightCm, data.weightKg]);

  // Plausibility warnings
  const warnings = useMemo(() => {
    return validateVitalsPlausibility(data);
  }, [data]);

  const updateField = (field: keyof VitalsFormData, val: any) => {
    onChange({ ...data, [field]: val });
  };

  // Status badges for individual cards
  const getBpStatus = () => {
    if (data.systolicBp === '' || data.diastolicBp === '') {
      return <span className="text-[11px] text-slate-400 font-medium">Not measured</span>;
    }
    const sys = Number(data.systolicBp);
    const dia = Number(data.diastolicBp);
    if (sys >= 140 || dia >= 90) {
      return (
        <span className="text-[11px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200">
          ● Elevated BP
        </span>
      );
    }
    if (sys >= 120 || dia >= 80) {
      return (
        <span className="text-[11px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
          Pre-hypertension
        </span>
      );
    }
    return (
      <span className="text-[11px] font-bold text-[#0A9F68] bg-[#E7F7F0] px-2 py-0.5 rounded border border-[#0A9F68]/20 flex items-center gap-1">
        <CheckCircle2 className="w-3 h-3" /> Normal range
      </span>
    );
  };

  const getTempStatus = () => {
    if (data.temperatureF === '') {
      return <span className="text-[11px] text-slate-400 font-medium">Not measured</span>;
    }
    const t = Number(data.temperatureF);
    if (t >= 100.4) {
      return (
        <span className="text-[11px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200">
          ● Fever recorded
        </span>
      );
    }
    return (
      <span className="text-[11px] font-bold text-[#0A9F68] bg-[#E7F7F0] px-2 py-0.5 rounded border border-[#0A9F68]/20 flex items-center gap-1">
        <CheckCircle2 className="w-3 h-3" /> Normal temp
      </span>
    );
  };

  const getGlucoseStatus = () => {
    if (!data.glucoseMeasured || data.glucoseMgDl === '') {
      return <span className="text-[11px] text-slate-400 font-medium">Not measured</span>;
    }
    const g = Number(data.glucoseMgDl);
    if (g >= 200) {
      return (
        <span className="text-[11px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200">
          ● High glucose
        </span>
      );
    }
    if (g >= 140) {
      return (
        <span className="text-[11px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
          Elevated
        </span>
      );
    }
    return (
      <span className="text-[11px] font-bold text-[#0A9F68] bg-[#E7F7F0] px-2 py-0.5 rounded border border-[#0A9F68]/20 flex items-center gap-1">
        <CheckCircle2 className="w-3 h-3" /> Normal range
      </span>
    );
  };

  return (
    <div className="space-y-5">
      {/* Warnings Banner */}
      {warnings.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-1.5 animate-in fade-in duration-150">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>Check measurement values</span>
          </div>
          {warnings.map((w, i) => (
            <p key={i} className="text-[11px] text-amber-800 pl-6">
              • {w.message}
            </p>
          ))}
        </div>
      )}

      {/* Main Vitals Grid */}
      <div className="bg-white rounded-2xl border border-[#E5EEF1] p-5 sm:p-6 shadow-xs">
        <div className="pb-4 border-b border-slate-100 mb-5">
          <h2 className="text-base sm:text-lg font-bold text-[#102A56]">
            Vitals & Measurements
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Enter clinical measurements recorded during the field visit. Leave blank if not measured.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Card 1: Blood Pressure */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-[#F8FAFC] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-red-100 text-red-600 flex items-center justify-center">
                    <Activity className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-[#102A56]">Blood Pressure</span>
                </div>
                {getBpStatus()}
              </div>

              <div className="grid grid-cols-2 gap-2 mt-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Systolic (mmHg)
                  </label>
                  <input
                    type="number"
                    value={data.systolicBp}
                    onChange={(e) =>
                      updateField('systolicBp', e.target.value ? Number(e.target.value) : '')
                    }
                    placeholder="120"
                    className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 text-sm font-bold text-[#102A56] focus:border-[#0A9F68] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Diastolic (mmHg)
                  </label>
                  <input
                    type="number"
                    value={data.diastolicBp}
                    onChange={(e) =>
                      updateField('diastolicBp', e.target.value ? Number(e.target.value) : '')
                    }
                    placeholder="80"
                    className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 text-sm font-bold text-[#102A56] focus:border-[#0A9F68] outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Temperature */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-[#F8FAFC] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
                    <Thermometer className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-[#102A56]">Body Temperature</span>
                </div>
                {getTempStatus()}
              </div>

              <div className="mt-2">
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Temperature (°F)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={data.temperatureF}
                  onChange={(e) =>
                    updateField('temperatureF', e.target.value ? Number(e.target.value) : '')
                  }
                  placeholder="98.6"
                  className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 text-sm font-bold text-[#102A56] focus:border-[#0A9F68] outline-none"
                />
              </div>
            </div>
          </div>

          {/* Card 3: Heart Rate */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-[#F8FAFC] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
                    <Heart className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-[#102A56]">Heart Rate</span>
                </div>
                <span className="text-[11px] text-slate-400 font-medium">
                  {data.heartRateBpm ? `${data.heartRateBpm} BPM` : 'Not measured'}
                </span>
              </div>

              <div className="mt-2">
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Pulse (BPM)
                </label>
                <input
                  type="number"
                  value={data.heartRateBpm}
                  onChange={(e) =>
                    updateField('heartRateBpm', e.target.value ? Number(e.target.value) : '')
                  }
                  placeholder="72"
                  className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 text-sm font-bold text-[#102A56] focus:border-[#0A9F68] outline-none"
                />
              </div>
            </div>
          </div>

          {/* Card 4: Blood Glucose */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-[#F8FAFC] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                    <Droplet className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-[#102A56]">Blood Glucose</span>
                </div>
                {getGlucoseStatus()}
              </div>

              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] text-slate-500 font-medium">Measurement status:</span>
                <button
                  type="button"
                  onClick={() => updateField('glucoseMeasured', !data.glucoseMeasured)}
                  className={`text-[11px] font-bold px-2 py-0.5 rounded border transition-colors ${
                    data.glucoseMeasured
                      ? 'bg-[#0A9F68] text-white border-[#0A9F68]'
                      : 'bg-slate-200 text-slate-600 border-slate-300'
                  }`}
                >
                  {data.glucoseMeasured ? 'Measured' : 'Not Measured'}
                </button>
              </div>

              {data.glucoseMeasured && (
                <div className="mt-1">
                  <input
                    type="number"
                    value={data.glucoseMgDl}
                    onChange={(e) =>
                      updateField('glucoseMgDl', e.target.value ? Number(e.target.value) : '')
                    }
                    placeholder="100 (mg/dL)"
                    className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 text-sm font-bold text-[#102A56] focus:border-[#0A9F68] outline-none"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Card 5: Height & Weight (BMI) */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-[#F8FAFC] sm:col-span-2 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 text-[#0A9F68] flex items-center justify-center">
                    <Scale className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-[#102A56]">Height, Weight & BMI</span>
                </div>

                {bmiInfo.bmi ? (
                  <span className="text-xs font-bold bg-white text-[#102A56] px-2.5 py-1 rounded-xl border border-slate-200">
                    BMI: <span className="text-[#0A9F68]">{bmiInfo.bmi}</span> ({bmiInfo.category})
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-400 font-medium">BMI Pending</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 mt-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1 flex items-center gap-1">
                    <Ruler className="w-3 h-3 text-slate-400" /> Height (cm)
                  </label>
                  <input
                    type="number"
                    value={data.heightCm}
                    onChange={(e) =>
                      updateField('heightCm', e.target.value ? Number(e.target.value) : '')
                    }
                    placeholder="165"
                    className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 text-sm font-bold text-[#102A56] focus:border-[#0A9F68] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1 flex items-center gap-1">
                    <Scale className="w-3 h-3 text-slate-400" /> Weight (kg)
                  </label>
                  <input
                    type="number"
                    value={data.weightKg}
                    onChange={(e) =>
                      updateField('weightKg', e.target.value ? Number(e.target.value) : '')
                    }
                    placeholder="65"
                    className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 text-sm font-bold text-[#102A56] focus:border-[#0A9F68] outline-none"
                  />
                </div>
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
          <span>Back to Symptoms</span>
        </button>

        <button
          type="button"
          onClick={onNext}
          className="px-5 py-2.5 rounded-xl bg-[#0A9F68] hover:bg-[#088758] text-white font-bold text-xs transition-all shadow-md shadow-[#0A9F68]/25 flex items-center gap-2 group"
        >
          <span>Continue to Risk Factors</span>
          <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>
    </div>
  );
};
