import React, { useState, useRef } from 'react';
import {
  Thermometer,
  Wind,
  Heart,
  Activity,
  AlertCircle,
  Plus,
  Mic,
  Square,
  Check,
  ArrowRight,
  ArrowLeft,
  X,
  Sparkles,
} from 'lucide-react';
import type { SymptomsFormData } from './types';

interface Step2SymptomsProps {
  data: SymptomsFormData;
  onChange: (data: SymptomsFormData) => void;
  onNext: () => void;
  onBack: () => void;
}

const COMMON_SYMPTOMS = [
  { id: 'fever', label: 'Fever', icon: Thermometer, color: 'text-rose-500' },
  { id: 'cough', label: 'Cough', icon: Wind, color: 'text-amber-500' },
  { id: 'breathlessness', label: 'Breathlessness', icon: Wind, color: 'text-red-500' },
  { id: 'chest_pain', label: 'Chest Pain', icon: Heart, color: 'text-red-600' },
  { id: 'headache', label: 'Headache', icon: Activity, color: 'text-indigo-500' },
  { id: 'fatigue', label: 'Fatigue', icon: Activity, color: 'text-amber-600' },
  { id: 'dizziness', label: 'Dizziness', icon: Activity, color: 'text-purple-500' },
  { id: 'abdominal_pain', label: 'Abdominal Pain', icon: AlertCircle, color: 'text-orange-500' },
  { id: 'joint_pain', label: 'Joint Pain', icon: Activity, color: 'text-blue-500' },
  { id: 'vomiting', label: 'Vomiting', icon: AlertCircle, color: 'text-emerald-600' },
  { id: 'diarrhea', label: 'Diarrhea', icon: AlertCircle, color: 'text-teal-600' },
  { id: 'weakness', label: 'Weakness', icon: Activity, color: 'text-slate-600' },
  { id: 'nausea', label: 'Nausea', icon: AlertCircle, color: 'text-amber-500' },
  { id: 'body_pain', label: 'Body Pain', icon: Activity, color: 'text-indigo-600' },
];

const DURATION_OPTIONS = [
  'Today',
  '1–3 days',
  '4–7 days',
  '1–2 weeks',
  'More than 2 weeks',
  'Unknown',
];

export const Step2Symptoms: React.FC<Step2SymptomsProps> = ({
  data,
  onChange,
  onNext,
  onBack,
}) => {
  const [customInput, setCustomInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [voicePendingText, setVoicePendingText] = useState('');
  const [voiceError, setVoiceError] = useState('');
  const recognitionRef = useRef<any>(null);

  const toggleSymptom = (label: string) => {
    const exists = data.symptoms.includes(label);
    const updated = exists
      ? data.symptoms.filter((s) => s !== label)
      : [...data.symptoms, label];

    onChange({ ...data, symptoms: updated });
  };

  const handleAddCustom = () => {
    if (!customInput.trim()) return;
    if (!data.symptoms.includes(customInput.trim())) {
      onChange({ ...data, symptoms: [...data.symptoms, customInput.trim()] });
    }
    setCustomInput('');
  };

  // Voice recognition support
  const handleStartVoice = () => {
    setVoiceError('');
    setVoicePendingText('');

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setVoiceError('Voice input not supported in this browser. Please type or select symptoms.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-IN';

      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((res: any) => res[0].transcript)
          .join('');
        setVoicePendingText(transcript);
      };
      recognition.onerror = () => {
        setIsListening(false);
        setVoiceError('Voice recognition error. Please speak again or select symptoms.');
      };
      recognition.onend = () => setIsListening(false);

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
      setVoiceError('Could not start speech recognition.');
    }
  };

  const handleStopVoice = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  };

  const handleAcceptVoice = () => {
    if (!voicePendingText.trim()) return;
    const tokens = voicePendingText.split(/,|and|\./i).map((s) => s.trim()).filter(Boolean);
    const newSymptoms = [...data.symptoms];
    tokens.forEach((t) => {
      if (t && !newSymptoms.includes(t)) {
        newSymptoms.push(t);
      }
    });
    onChange({ ...data, symptoms: newSymptoms, voiceTranscript: voicePendingText });
    setVoicePendingText('');
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-[#E5EEF1] p-5 sm:p-6 shadow-xs">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[#102A56]">
              Symptoms & Health Concerns
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Select the symptoms reported by the patient.
            </p>
          </div>

          {/* Voice Input Button */}
          <div>
            {!isListening ? (
              <button
                type="button"
                onClick={handleStartVoice}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#E7F7F0] text-[#0A9F68] hover:bg-[#0A9F68] hover:text-white font-bold text-xs transition-all shadow-xs border border-[#0A9F68]/30"
              >
                <Mic className="w-4 h-4" />
                <span>🎙 Describe Symptoms</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStopVoice}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-red-50 text-red-600 border border-red-300 font-bold text-xs animate-pulse"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Listening... Stop Recording</span>
              </button>
            )}
          </div>
        </div>

        {/* Voice Transcription Review Card */}
        {voicePendingText && (
          <div className="mt-4 p-4 rounded-2xl bg-[#F0FDF4] border border-[#86EFAC] text-xs space-y-2 animate-in fade-in duration-150">
            <div className="flex items-center justify-between font-bold text-[#102A56]">
              <span className="flex items-center gap-1.5 text-[#0A9F68]">
                <Sparkles className="w-4 h-4" /> Voice Transcription Confirmation
              </span>
              <button
                type="button"
                onClick={() => setVoicePendingText('')}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 bg-white rounded-xl border border-[#BBF7D0] text-sm text-[#102A56] font-medium">
              "{voicePendingText}"
            </div>
            <p className="text-[11px] text-slate-500">
              Please review with the patient before accepting into the screening record.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleAcceptVoice}
                className="px-3 py-1.5 rounded-lg bg-[#0A9F68] text-white font-bold text-xs hover:bg-[#088758] flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Use this information</span>
              </button>
              <button
                type="button"
                onClick={() => setVoicePendingText('')}
                className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 font-bold text-xs hover:bg-slate-200"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {voiceError && (
          <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center justify-between">
            <span>{voiceError}</span>
            <button
              type="button"
              onClick={() => setVoiceError('')}
              className="text-amber-600 font-bold hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Symptom Touch Chips */}
        <div className="pt-4">
          <label className="block text-xs font-bold text-slate-700 mb-2.5">
            Reported Symptoms ({data.symptoms.length} selected)
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
            {COMMON_SYMPTOMS.map((s) => {
              const isSelected = data.symptoms.includes(s.label);
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleSymptom(s.label)}
                  className={`p-3 rounded-2xl border text-left transition-all flex items-center justify-between group ${
                    isSelected
                      ? 'bg-[#E7F7F0] border-[#0A9F68] ring-2 ring-[#0A9F68]/20 shadow-xs text-[#0A9F68] font-bold'
                      : 'bg-[#F8FAFC] border-slate-200 hover:border-slate-300 hover:bg-white text-slate-700 font-medium'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${isSelected ? 'text-[#0A9F68]' : s.color}`} />
                    <span className="text-xs">{s.label}</span>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-[#0A9F68] stroke-[3]" />}
                </button>
              );
            })}
          </div>

          {/* Add custom symptom */}
          <div className="mt-3.5 flex items-center gap-2 max-w-md">
            <input
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddCustom())}
              placeholder="Add other symptom (e.g. skin rash, swelling)..."
              className="flex-1 px-3.5 py-2 rounded-xl border border-slate-200 bg-[#F8FAFC] focus:bg-white text-xs text-[#102A56] focus:border-[#0A9F68] outline-none"
            />
            <button
              type="button"
              onClick={handleAddCustom}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#102A56] font-bold text-xs flex items-center gap-1 border border-slate-200"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </div>
        </div>

        {/* Symptom Duration & Severity */}
        {data.symptoms.length > 0 && (
          <div className="mt-6 pt-5 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-5 text-xs animate-in fade-in duration-150">
            {/* Duration */}
            <div>
              <label className="block text-slate-700 font-bold mb-1.5">
                Symptom Duration <span className="text-slate-400 font-normal">(How long have these symptoms persisted?)</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {DURATION_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => onChange({ ...data, duration: opt })}
                    className={`py-2 px-2.5 rounded-xl border text-center font-bold text-[11px] transition-all ${
                      data.duration === opt
                        ? 'bg-[#0A9F68] text-white border-[#0A9F68] shadow-xs'
                        : 'bg-[#F8FAFC] text-slate-600 border-slate-200 hover:bg-white'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            {/* Severity */}
            <div>
              <label className="block text-slate-700 font-bold mb-1.5">
                Severity Reported by Patient
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['Mild', 'Moderate', 'Severe'] as const).map((sev) => (
                  <button
                    key={sev}
                    type="button"
                    onClick={() => onChange({ ...data, severity: sev })}
                    className={`py-2 px-2.5 rounded-xl border text-center font-bold text-[11px] transition-all ${
                      data.severity === sev
                        ? sev === 'Severe'
                          ? 'bg-[#EF4444] text-white border-[#EF4444] shadow-xs'
                          : sev === 'Moderate'
                          ? 'bg-[#F59E0B] text-white border-[#F59E0B] shadow-xs'
                          : 'bg-[#0A9F68] text-white border-[#0A9F68] shadow-xs'
                        : 'bg-[#F8FAFC] text-slate-600 border-slate-200 hover:bg-white'
                    }`}
                  >
                    {sev}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-all flex items-center gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Patient</span>
        </button>

        <button
          type="button"
          onClick={onNext}
          className="px-5 py-2.5 rounded-xl bg-[#0A9F68] hover:bg-[#088758] text-white font-bold text-xs transition-all shadow-md shadow-[#0A9F68]/25 flex items-center gap-2 group"
        >
          <span>Continue to Vitals</span>
          <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>
    </div>
  );
};
