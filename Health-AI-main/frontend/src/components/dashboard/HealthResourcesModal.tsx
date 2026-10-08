import React from 'react';
import { X, BookOpen, ShieldCheck } from 'lucide-react';

interface HealthResourcesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HealthResourcesModal: React.FC<HealthResourcesModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const resources = [
    {
      title: 'National Health Mission (NHM) ASHA Guidelines',
      category: 'Protocol & Guidelines',
      desc: 'Standard field protocol for maternal & child health screening and vital sign recording in rural households.',
      tag: 'Official Protocol',
    },
    {
      title: 'Community Screening for Hypertension & Diabetes',
      category: 'NCD Care',
      desc: 'Early symptom checklist, blood glucose thresholds, and triage criteria for PHC physician referrals.',
      tag: 'Clinical Guide',
    },
    {
      title: 'Tuberculosis & Chronic Respiratory Screening',
      category: 'Infectious Diseases',
      desc: 'Sputum sample collection protocol, cough duration evaluation (>14 days), and contact tracing workflow.',
      tag: 'Triage Protocol',
    },
    {
      title: 'Emergency Signs in Antenatal & Postnatal Care',
      category: 'Maternal Health',
      desc: 'High-risk danger signs (severe headache, bleeding, high BP) requiring immediate 108 ambulance dispatch.',
      tag: 'Emergency Checklist',
    },
  ];

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-slate-100 overflow-hidden text-[#102A56]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-[#F8FAFC]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#E7F7F0] text-[#0A9F68] flex items-center justify-center">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-[#102A56]">Clinical Health Resources</h3>
              <p className="text-xs text-slate-400 font-medium">
                Standard Protocols & Decision Support Guidelines for Field Workers
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

        {/* List */}
        <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
          {resources.map((res, i) => (
            <div
              key={i}
              className="p-3.5 rounded-2xl border border-slate-100 hover:border-[#0A9F68]/30 hover:bg-[#F4F9FA] transition-all"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[10px] font-bold text-[#0A9F68] bg-[#E7F7F0] px-2 py-0.5 rounded-md">
                  {res.tag}
                </span>
                <span className="text-[11px] text-slate-400 font-medium">{res.category}</span>
              </div>
              <h4 className="text-xs font-bold text-[#102A56] mt-1">{res.title}</h4>
              <p className="text-[11px] text-slate-500 font-normal mt-0.5 leading-relaxed">
                {res.desc}
              </p>
              <div className="mt-2.5 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    window.dispatchEvent(
                      new CustomEvent('open-health-chat', {
                        detail: { prompt: `Please explain the protocol: "${res.title}" in simple steps for community health workers.` }
                      })
                    );
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#E7F7F0] text-[#0A9F68] hover:bg-[#0A9F68] hover:text-white text-[10px] font-bold transition-all"
                >
                  <span>Ask Local AI to Explain</span>
                  <span>→</span>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-slate-400">
            <ShieldCheck className="w-4 h-4 text-[#0A9F68]" />
            <span>Ministry of Health & Family Welfare guidelines</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#0A9F68] hover:bg-[#088758] text-white font-bold transition-all shadow-xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
