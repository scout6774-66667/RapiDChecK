import React from 'react';
import { Check } from 'lucide-react';
import type { ScreeningStep } from './types';

interface ScreeningStepperProps {
  currentStep: ScreeningStep;
  onStepClick?: (step: ScreeningStep) => void;
  maxStepReached: ScreeningStep;
}

export const ScreeningStepper: React.FC<ScreeningStepperProps> = ({
  currentStep,
  onStepClick,
  maxStepReached,
}) => {
  const steps = [
    { num: 1 as ScreeningStep, label: 'Patient' },
    { num: 2 as ScreeningStep, label: 'Symptoms' },
    { num: 3 as ScreeningStep, label: 'Vitals' },
    { num: 4 as ScreeningStep, label: 'Risk Factors' },
    { num: 5 as ScreeningStep, label: 'Review' },
    { num: 6 as ScreeningStep, label: 'Screening' },
    { num: 7 as ScreeningStep, label: 'Next Steps' },
  ];

  const currentStepObj = steps.find((s) => s.num === currentStep) || steps[0];

  return (
    <div className="bg-white rounded-2xl border border-[#E5EEF1] p-4 sm:p-5 mb-5 shadow-xs">
      {/* Desktop Horizontal Stepper */}
      <div className="hidden md:flex items-center justify-between">
        {steps.map((step, idx) => {
          const isCompleted = step.num < currentStep;
          const isCurrent = step.num === currentStep;
          const isClickable = step.num <= maxStepReached && step.num !== 6;

          return (
            <React.Fragment key={step.num}>
              {/* Step Item */}
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && onStepClick?.(step.num)}
                className={`flex flex-col items-center group transition-all text-center ${
                  isClickable ? 'cursor-pointer' : 'cursor-default opacity-80'
                }`}
              >
                {/* Circle Badge */}
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs transition-all ${
                    isCurrent
                      ? 'bg-[#0A9F68] text-white ring-4 ring-[#0A9F68]/20 shadow-md shadow-[#0A9F68]/30 scale-105'
                      : isCompleted
                      ? 'bg-[#E7F7F0] text-[#0A9F68] border border-[#0A9F68]/30 font-extrabold'
                      : 'bg-slate-100 text-slate-400 border border-slate-200'
                  }`}
                >
                  {isCompleted ? (
                    <Check className="w-4.5 h-4.5 stroke-[2.5]" />
                  ) : (
                    <span>{String(step.num).padStart(2, '0')}</span>
                  )}
                </div>

                {/* Step Label */}
                <span
                  className={`text-[11px] mt-2 transition-colors ${
                    isCurrent
                      ? 'font-bold text-[#102A56]'
                      : isCompleted
                      ? 'font-semibold text-slate-600'
                      : 'font-medium text-slate-400'
                  }`}
                >
                  {step.label}
                </span>
              </button>

              {/* Connecting Line between steps */}
              {idx < steps.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-2 rounded-full transition-colors mb-5 ${
                    step.num < currentStep ? 'bg-[#0A9F68]' : 'bg-slate-200'
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Mobile Collapsed Stepper */}
      <div className="md:hidden">
        <div className="flex items-center justify-between text-xs font-bold text-[#102A56] mb-2">
          <span>
            Step {currentStep} of 7: <span className="text-[#0A9F68]">{currentStepObj.label}</span>
          </span>
          <span className="text-slate-400 text-[11px]">
            {Math.round((currentStep / 7) * 100)}% Complete
          </span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
          <div
            className="bg-[#0A9F68] h-full rounded-full transition-all duration-300"
            style={{ width: `${(currentStep / 7) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
};
