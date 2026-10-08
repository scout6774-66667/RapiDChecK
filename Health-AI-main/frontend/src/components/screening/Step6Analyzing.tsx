import React, { useState, useEffect } from 'react';
import { CheckCircle2, ShieldCheck, WifiOff } from 'lucide-react';

interface Step6AnalyzingProps {
  isOffline: boolean;
  onComplete: () => void;
}

export const Step6Analyzing: React.FC<Step6AnalyzingProps> = ({ isOffline, onComplete }) => {
  const [currentStage, setCurrentStage] = useState(0);

  const stages = [
    'Validating patient identity & age profile',
    'Checking vital signs against clinical plausibility thresholds',
    'Evaluating emergency red-flag safety rules',
    'Running community screening assessment engine',
    'Preparing structured clinical review summary',
  ];

  useEffect(() => {
    const timer1 = setTimeout(() => setCurrentStage(1), 400);
    const timer2 = setTimeout(() => setCurrentStage(2), 900);
    const timer3 = setTimeout(() => setCurrentStage(3), 1400);
    const timer4 = setTimeout(() => setCurrentStage(4), 1900);
    const timer5 = setTimeout(() => onComplete(), 2400);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
      clearTimeout(timer5);
    };
  }, [onComplete]);

  return (
    <div className="bg-white rounded-2xl border border-[#E5EEF1] p-6 sm:p-10 shadow-xs max-w-xl mx-auto text-center">
      {/* Icon */}
      <div className="w-14 h-14 rounded-2xl bg-[#E7F7F0] text-[#0A9F68] mx-auto flex items-center justify-center mb-4 shadow-sm border border-[#0A9F68]/20">
        <ShieldCheck className="w-7 h-7" />
      </div>

      <h2 className="text-lg font-black text-[#102A56]">
        Analyzing Screening Information
      </h2>
      <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
        Evaluating symptoms, measurements, and health factors against clinical safety guidelines.
      </p>

      {/* Offline Screening Badge */}
      {isOffline && (
        <div className="mt-4 p-3 bg-amber-50 rounded-xl border border-amber-200 text-left text-xs text-amber-900 flex items-start gap-2.5">
          <WifiOff className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block">OFFLINE SCREENING MODE</span>
            <span className="text-[11px] text-amber-800">
              Connection unavailable. Evaluating locally using National Health Mission safety rules. Results will sync automatically when network returns.
            </span>
          </div>
        </div>
      )}

      {/* Progress checklist stages */}
      <div className="mt-6 space-y-2.5 text-left max-w-md mx-auto">
        {stages.map((stage, idx) => {
          const isDone = idx < currentStage;
          const isCurrent = idx === currentStage;

          return (
            <div
              key={idx}
              className={`p-2.5 rounded-xl border transition-all flex items-center gap-3 text-xs ${
                isDone
                  ? 'bg-[#F0FDF4] border-[#86EFAC] text-[#0A9F68] font-semibold'
                  : isCurrent
                  ? 'bg-[#F8FAFC] border-[#0A9F68] text-[#102A56] font-bold shadow-2xs'
                  : 'bg-white border-slate-100 text-slate-300'
              }`}
            >
              <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0">
                {isDone ? (
                  <CheckCircle2 className="w-4.5 h-4.5 text-[#0A9F68]" />
                ) : isCurrent ? (
                  <div className="w-3 h-3 rounded-full bg-[#0A9F68] animate-ping" />
                ) : (
                  <div className="w-2 h-2 rounded-full bg-slate-200" />
                )}
              </div>
              <span className="flex-1">{stage}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
