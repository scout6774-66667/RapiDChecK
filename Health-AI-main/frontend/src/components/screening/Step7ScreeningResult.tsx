import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Share2,
  Calendar,
  RotateCcw,
  Info,
  ChevronDown,
  ChevronUp,
  FileText,
  ShieldCheck,
  Check,
  ArrowRight,
} from 'lucide-react';
import type { ScreeningResultData } from './types';

interface Step7ScreeningResultProps {
  result: ScreeningResultData;
  onReferToPhc: () => void;
  onBookAppointment: () => void;
  onReviewAgain: () => void;
  onFinish: () => void;
}

export const Step7ScreeningResult: React.FC<Step7ScreeningResultProps> = ({
  result,
  onReferToPhc,
  onBookAppointment,
  onReviewAgain,
  onFinish,
}) => {
  const [showModelInfo, setShowModelInfo] = useState(false);

  // Styling based on risk level
  const getRiskTheme = () => {
    switch (result.riskLevel) {
      case 'CRITICAL':
        return {
          bg: 'bg-rose-50/90',
          border: 'border-rose-400',
          text: 'text-rose-900',
          icon: AlertTriangle,
          badgeBg: 'bg-[#E11D48]',
          badgeText: 'text-white',
          title: 'CRITICAL SCREENING RISK',
          subtitle: 'Severe clinical risk flagged. Immediate IDRC hospital matching & emergency triage required.',
        };
      case 'HIGH':
        return {
          bg: 'bg-red-50/80',
          border: 'border-red-200',
          text: 'text-red-700',
          icon: AlertTriangle,
          badgeBg: 'bg-[#EF4444]',
          badgeText: 'text-white',
          title: 'HIGH SCREENING RISK',
          subtitle: 'Clinical review recommended within 24–48 hours at PHC.',
        };
      case 'MODERATE':
        return {
          bg: 'bg-amber-50/80',
          border: 'border-amber-200',
          text: 'text-amber-700',
          icon: AlertTriangle,
          badgeBg: 'bg-[#F59E0B]',
          badgeText: 'text-white',
          title: 'MODERATE SCREENING RISK',
          subtitle: 'Routine PHC assessment recommended within 3–5 days.',
        };
      case 'LOW':
        return {
          bg: 'bg-emerald-50/80',
          border: 'border-emerald-200',
          text: 'text-[#0A9F68]',
          icon: CheckCircle2,
          badgeBg: 'bg-[#0A9F68]',
          badgeText: 'text-white',
          title: 'LOW SCREENING RISK',
          subtitle: 'No immediate acute risk patterns identified. Continue routine monitoring.',
        };
      case 'NEEDS_REVIEW':
        return {
          bg: 'bg-blue-50/80',
          border: 'border-blue-200',
          text: 'text-blue-700',
          icon: Info,
          badgeBg: 'bg-[#3B82F6]',
          badgeText: 'text-white',
          title: 'NEEDS CLINICAL REVIEW',
          subtitle: 'Information is not fully conclusive. Clinical verification advised.',
        };
      case 'INSUFFICIENT_DATA':
      default:
        return {
          bg: 'bg-slate-50',
          border: 'border-slate-200',
          text: 'text-slate-700',
          icon: Info,
          badgeBg: 'bg-slate-500',
          badgeText: 'text-white',
          title: 'INSUFFICIENT DATA',
          subtitle: 'Essential health information was not recorded for evaluation.',
        };
    }
  };

  const theme = getRiskTheme();
  const RiskIcon = theme.icon;
  const isCritical = result.riskScore > 70 || result.riskLevel === 'CRITICAL';
  const displayLevel = result.riskLevel === 'CRITICAL' ? 'Critical' : result.riskLevel === 'HIGH' ? 'High' : result.riskLevel === 'MODERATE' ? 'Moderate' : 'Low';

  return (
    <div className="space-y-5">
      {/* Critical Emergency Banner */}
      {isCritical && (
        <div className="bg-rose-600 text-white p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg border-2 border-rose-400">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <p className="font-black text-sm uppercase tracking-wide">Critical IDRC Referral Workflow Triggered</p>
              <p className="text-xs text-rose-100 font-bold mt-0.5">
                Risk Score: {result.riskScore}/100 — Critical. Immediate facility triage required.
              </p>
            </div>
          </div>
          <button
            onClick={onReferToPhc}
            className="px-4 py-2 bg-white text-rose-700 font-black text-xs rounded-xl hover:bg-rose-50 shadow-sm shrink-0 transition-all flex items-center justify-center gap-1.5"
          >
            <span>Launch IDRC Matching</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 1. Primary Risk Card */}
      <div className={`rounded-2xl border ${theme.border} ${theme.bg} p-5 sm:p-6 shadow-xs`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-black/5">
          <div className="flex items-center gap-3.5">
            <div
              className={`w-12 h-12 rounded-2xl ${theme.badgeBg} ${theme.badgeText} flex items-center justify-center shadow-md shrink-0`}
            >
              <RiskIcon className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`text-xs font-black tracking-wider uppercase px-2 py-0.5 rounded ${theme.badgeBg} ${theme.badgeText}`}
                >
                  {theme.title}
                </span>
                <span className="text-xs font-black px-2.5 py-0.5 rounded bg-white text-[#102A56] border border-black/10 shadow-2xs">
                  Risk Score: {result.riskScore}/100 — {displayLevel}
                </span>
                <span className="text-xs text-slate-500 font-semibold">
                  Patient: {result.patientName}
                </span>
              </div>
              <p className="text-xs sm:text-sm font-semibold text-slate-700 mt-1">
                {theme.subtitle}
              </p>
            </div>
          </div>

          <div className="text-right sm:border-l sm:border-slate-200 sm:pl-4">
            <span className="text-[11px] text-slate-400 font-bold block">Assessed at</span>
            <span className="text-xs font-extrabold text-[#102A56]">{result.timestamp}</span>
          </div>
        </div>

        {/* Potential Risk Indicators */}
        {result.potentialRiskIndicators.length > 0 && (
          <div className="pt-4">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Potential Risk Indicators
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {result.potentialRiskIndicators.map((ind, i) => (
                <div
                  key={i}
                  className="p-2.5 bg-white/90 rounded-xl border border-black/5 text-xs font-semibold text-[#102A56] flex items-center gap-2"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444] shrink-0" />
                  <span>{ind}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommended Action */}
        <div className="mt-4 pt-3.5 border-t border-black/5 flex items-start gap-2.5 text-xs text-slate-700">
          <ShieldCheck className="w-4 h-4 text-[#0A9F68] shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-[#102A56]">Recommended Next Step: </span>
            <span>{result.recommendedAction}</span>
          </div>
        </div>
      </div>

      {/* 2. Explainability: "Why this result?" */}
      <div className="bg-white rounded-2xl border border-[#E5EEF1] p-5 shadow-xs">
        <h3 className="text-sm font-bold text-[#102A56] mb-2.5 flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#0A9F68]" />
          <span>Why did the system suggest this assessment?</span>
        </h3>
        <p className="text-xs text-slate-500 mb-3">
          The decision-support engine highlighted the following clinical factors:
        </p>

        <div className="space-y-2">
          {result.contributingFactors.map((factor, idx) => (
            <div
              key={idx}
              className="p-3 rounded-xl bg-[#F8FAFC] border border-slate-100 flex items-start gap-2.5 text-xs text-slate-700"
            >
              <span className="w-5 h-5 rounded-full bg-[#E7F7F0] text-[#0A9F68] font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                {idx + 1}
              </span>
              <span className="font-medium leading-relaxed">{factor}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Action Buttons & Next Steps */}
      <div className="bg-white rounded-2xl border border-[#E5EEF1] p-5 shadow-xs">
        <h4 className="text-xs font-bold text-[#102A56] uppercase tracking-wider mb-3">
          Next Clinical Actions
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Action 1: Refer to PHC */}
          <button
            type="button"
            onClick={onReferToPhc}
            className="p-3.5 rounded-2xl bg-[#0A9F68] hover:bg-[#088758] text-white font-bold text-xs transition-all shadow-md shadow-[#0A9F68]/20 flex items-center justify-center gap-2 group"
          >
            <Share2 className="w-4 h-4" />
            <span>Refer to PHC</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </button>

          {/* Action 2: Book Appointment */}
          <button
            type="button"
            onClick={onBookAppointment}
            className="p-3.5 rounded-2xl bg-[#F5F3FF] hover:bg-[#EDE9FE] text-[#8B5CF6] border border-purple-200 font-bold text-xs transition-all flex items-center justify-center gap-2"
          >
            <Calendar className="w-4 h-4" />
            <span>Book Consultation</span>
          </button>

          {/* Action 3: Review Assessment */}
          <button
            type="button"
            onClick={onReviewAgain}
            className="p-3.5 rounded-2xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold text-xs transition-all flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4 text-slate-500" />
            <span>Review Assessment</span>
          </button>

          {/* Action 4: Finish */}
          <button
            type="button"
            onClick={onFinish}
            className="p-3.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-all flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4 text-[#0A9F68]" />
            <span>Save & Dashboard</span>
          </button>
        </div>
      </div>

      {/* 4. Model & Rules Transparency (Collapsible) */}
      <div className="bg-white rounded-2xl border border-[#E5EEF1] p-4 shadow-xs">
        <button
          type="button"
          onClick={() => setShowModelInfo(!showModelInfo)}
          className="w-full flex items-center justify-between text-xs font-bold text-slate-600 hover:text-[#102A56]"
        >
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-slate-400" />
            <span>Screening Engine Metadata & Transparency</span>
          </div>
          {showModelInfo ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showModelInfo && (
          <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-500 space-y-1.5 animate-in fade-in duration-150">
            <div className="flex justify-between">
              <span>Assessment Source:</span>
              <span className="font-bold text-[#102A56]">{result.modelVersion}</span>
            </div>
            <div className="flex justify-between">
              <span>Rules Protocol:</span>
              <span className="font-bold text-[#102A56]">{result.rulesVersion}</span>
            </div>
            <div className="flex justify-between">
              <span>Mode:</span>
              <span className="font-bold text-[#102A56]">
                {result.isOffline ? 'Offline Device Evaluation' : 'Online Hybrid Assessment'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Assessment ID:</span>
              <span className="font-mono text-slate-400">{result.assessmentId}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
