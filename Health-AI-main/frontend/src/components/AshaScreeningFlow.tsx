import React, { useState } from 'react';
import { 
  UserPlus, Stethoscope, 
  ArrowRight, Activity, Heart, ShieldAlert, 
  Thermometer, Phone, MapPin, Sparkles, Send, AlertCircle,
  Video, ChevronRight, Droplets, Wind, Zap, WifiOff, CheckCircle2
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { VoiceInputButton } from './VoiceInputButton';
import { MedicalDisclaimer } from './MedicalDisclaimer';
import { translations, type Language } from '../i18n/translations';
import { 
  db, 
  type LocalAssessment, 
  savePatientAtomic, 
  saveAssessmentAtomic, 
  updateReferralAtomic, 
  generateUUID 
} from '../db/offlineDb';

interface AshaScreeningFlowProps {
  lang: Language;
  isOnline: boolean;
  onAssessmentComplete: () => void;
  onBookTeleconsult?: () => void;
}
const MascotOverlay = ({ step, riskLevel }: { step: 1 | 2 | 3, riskLevel?: string }) => {
  let mascotSrc = '/mascots/doctor_form.png';
  if (step === 2) {
    mascotSrc = '/mascots/doctor_notepad.png';
  } else if (step === 3) {
    if (riskLevel === 'HIGH' || riskLevel === 'EMERGENCY') mascotSrc = '/mascots/doctor_shocked.png';
    else if (riskLevel === 'MODERATE') mascotSrc = '/mascots/doctor_thinking.png';
    else mascotSrc = '/mascots/doctor_happy.png';
  }

  return (
    <div className="fixed bottom-6 right-20 sm:right-28 z-40 pointer-events-none drop-shadow-[0_10px_15px_rgba(0,0,0,0.15)] animate-fade-in transition-all duration-300 hidden dark:hidden">
      <div className="relative">
        <img src={mascotSrc} alt="Doctor Mascot" className="w-28 sm:w-36 h-28 sm:h-36 object-contain" />
        {step === 1 && (
          <div className="absolute -top-12 -left-16 sm:-left-24 bg-white dark:bg-slate-800 px-3.5 py-2.5 rounded-2xl text-[11px] sm:text-xs font-extrabold text-slate-800 dark:text-slate-200 shadow-xl border border-slate-100 dark:border-slate-700 w-32 sm:w-36 after:content-[''] after:absolute after:bottom-[-6px] after:right-8 after:w-3 after:h-3 after:bg-white dark:after:bg-slate-800 after:border-r after:border-b after:border-slate-100 dark:after:border-slate-700 after:rotate-45 text-center leading-tight">
            Please fill the form!
          </div>
        )}
        {step === 2 && (
          <div className="absolute -top-12 -left-16 sm:-left-24 bg-white dark:bg-slate-800 px-3.5 py-2.5 rounded-2xl text-[11px] sm:text-xs font-extrabold text-slate-800 dark:text-slate-200 shadow-xl border border-slate-100 dark:border-slate-700 w-36 after:content-[''] after:absolute after:bottom-[-6px] after:right-8 after:w-3 after:h-3 after:bg-white dark:after:bg-slate-800 after:border-r after:border-b after:border-slate-100 dark:after:border-slate-700 after:rotate-45 text-center leading-tight">
            I'm noting symptoms...
          </div>
        )}
      </div>
    </div>
  );
};

export const AshaScreeningFlow: React.FC<AshaScreeningFlowProps> = ({
  lang,
  isOnline,
  onAssessmentComplete,
  onBookTeleconsult
}) => {
  const t = translations[lang];

  // Steps: 1 = Patient Reg, 2 = Vitals/Symptoms, 3 = AI Result
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Form State
  const [patientId, setPatientId] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [age, setAge] = useState<number | ''>(45);
  const [gender, setGender] = useState<string>('Female');
  const [village, setVillage] = useState<string>('Sonpur');
  const [phone, setPhone] = useState<string>('9876543210');
  const [customId, setCustomId] = useState<string>('');

  // Validation Error State
  const [errors, setErrors] = useState<{ name?: string; age?: string; village?: string; gender?: string }>({});

  // Assessment Inputs
  const [symptomsText, setSymptomsText] = useState<string>('');
  const [symptomDuration, setSymptomDuration] = useState<number>(3);
  const [tempF, setTempF] = useState<number>(98.6);
  const [systolic, setSystolic] = useState<number>(135);
  const [diastolic, setDiastolic] = useState<number>(85);
  const [glucose, setGlucose] = useState<number>(150);
  const [heartRate, setHeartRate] = useState<number>(78);
  const [heightCm, setHeightCm] = useState<number>(160);
  const [weightKg, setWeightKg] = useState<number>(62);
  const [smoking, setSmoking] = useState<string>('Never');
  const [alcohol, setAlcohol] = useState<string>('Never');
  const [physicalActivity, setPhysicalActivity] = useState<string>('Moderate');
  const [familyHistory, setFamilyHistory] = useState<string[]>(['Diabetes']);

  // Calculated BMI
  const bmi = heightCm > 0 ? Number((weightKg / ((heightCm / 100) ** 2)).toFixed(1)) : 24.2;

  // Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeAssessment, setActiveAssessment] = useState<LocalAssessment | null>(null);
  const [geminiTop3, setGeminiTop3] = useState<{
    ml_predictions: Array<{ rank: number; condition: string; score: number; contributingSymptoms: string[] }>;
    gemini_predictions: Array<{ condition: string; confidence: string; reasoning: string }>;
    search_predictions: Array<{ condition: string; confidence: string; reasoning: string; source: string }>;
    combined_top3: Array<{
      rank: number;
      condition: string;
      combined_score: number;
      ml_score: number | null;
      gemini_score: number | null;
      search_score: number | null;
      ml_rank: number | null;
      gemini_rank: number | null;
      search_rank: number | null;
      reasoning: string;
      source_count: number;
      sources_agree: boolean;
    }>;
    systems_status: { ml_model: boolean; gemini_ai: boolean; search: boolean };
    gemini_urgency?: string;
    gemini_advice?: string;
  } | null>(null);

  // Common symptoms
  const commonSymptoms = [
    'Fever',
    'Cough',
    'Fatigue',
    'Headache',
    'Dizziness',
    'Shortness of breath',
    'Chest discomfort',
    'Frequent urination',
    'Increased thirst',
    'Weakness',
    'Swelling',
    'Nausea'
  ];

  const toggleSymptomPill = (sym: string) => {
    let currentList = symptomsText ? symptomsText.split(',').map(s => s.trim()).filter(Boolean) : [];
    if (currentList.includes(sym)) {
      currentList = currentList.filter(s => s !== sym);
    } else {
      currentList.push(sym);
    }
    setSymptomsText(currentList.join(', '));
  };

  const validatePatientForm = (): boolean => {
    const errs: { name?: string; age?: string; village?: string; gender?: string } = {};
    if (!name.trim()) errs.name = 'Full Name is required';
    if (!age || age <= 0 || age > 120) errs.age = 'Please enter a valid age between 1 and 120';
    if (!village.trim()) errs.village = 'Village / Ward is required';
    if (!gender) errs.gender = 'Gender is required';

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handlePatientSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validatePatientForm()) return;
    const generatedId = patientId || generateUUID();
    setPatientId(generatedId);
    setStep(2);
  };

  const runAnalysis = async () => {
    setIsAnalyzing(true);
    const symptomsList = symptomsText ? symptomsText.split(',').map(s => s.trim()).filter(Boolean) : [];

    const effectivePatientId = patientId || generateUUID();
    const effectiveCustomId = customId || `RH-${effectivePatientId.slice(-4).toUpperCase()}`;

    // 1. Atomically Save Patient to Dexie (TASK-004 Durable Outbox)
    await savePatientAtomic({
      id: effectivePatientId,
      name,
      age: Number(age),
      gender,
      village,
      phone,
      patient_id: effectiveCustomId
    });

    const payload = {
      patient_id: effectivePatientId,
      patient_name: name,
      village,
      symptoms: symptomsList,
      symptom_duration_days: Number(symptomDuration),
      temperature_f: tempF ? Number(tempF) : null,
      systolic_bp: systolic ? Number(systolic) : null,
      diastolic_bp: diastolic ? Number(diastolic) : null,
      glucose_mg_dl: glucose ? Number(glucose) : null,
      heart_rate_bpm: heartRate ? Number(heartRate) : null,
      height_cm: heightCm ? Number(heightCm) : null,
      weight_kg: weightKg ? Number(weightKg) : null,
      bmi: Number(bmi),
      smoking_status: smoking,
      alcohol_status: alcohol,
      physical_activity: physicalActivity,
      family_history: familyHistory
    };

    // 2. Atomically Save Assessment to Dexie with Canonical Engine & Outbox (TASK-004)
    const localAssessment = await saveAssessmentAtomic(payload);

    // 3. If online, opportunistically run informational ML & attempt immediate server sync
    if (isOnline) {
      if (symptomsList.length > 0) {
        try {
          await fetch('http://127.0.0.1:8000/api/ml/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symptoms: symptomsList })
          });
        } catch (mlErr) {
          console.warn('Informational ML predict failed (non-fatal):', mlErr);
        }

        try {
          const geminiRes = await fetch('http://127.0.0.1:8000/api/ml/gemini-predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symptoms: symptomsList })
          });
          if (geminiRes.ok) {
            const geminiData = await geminiRes.json();
            setGeminiTop3(geminiData);
          }
        } catch (geminiErr) {
          console.warn('Gemini predict failed (non-fatal):', geminiErr);
        }
      }

      // Online register + assess
      try {
        await fetch('http://127.0.0.1:8000/api/patients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: effectivePatientId,
            name,
            age: Number(age),
            gender,
            village,
            phone,
            patient_id: effectiveCustomId
          })
        });

        await fetch('http://127.0.0.1:8000/api/assess', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        // Update local sync status to SYNCED
        await db.patients.update(effectivePatientId, { sync_state: 'SYNCED', synced: true });
        await db.assessments.update(localAssessment.id, { sync_state: 'SYNCED', synced: true });
      } catch (syncErr) {
        console.warn('Online sync failed, outbox queued for automatic retry', syncErr);
      }
    }

    setActiveAssessment(localAssessment);
    setIsAnalyzing(false);
    setStep(3);
    onAssessmentComplete();

    if (localAssessment.risk_level === 'HIGH' || localAssessment.is_emergency) {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 }
      });
    }
  };

  const updateReferral = async (newStatus: 'REFERRED' | 'APPOINTMENT_REQUESTED' | 'CONSULTATION_COMPLETED') => {
    if (!activeAssessment) return;

    // Atomically update referral status with outbox entry (TASK-004)
    const updated = await updateReferralAtomic(activeAssessment.id, newStatus);
    if (updated) {
      setActiveAssessment(updated);
    }

    if (isOnline) {
      try {
        await fetch(`http://127.0.0.1:8000/api/assessments/${activeAssessment.id}/referral`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ referral_status: newStatus })
        });
        await db.assessments.update(activeAssessment.id, { sync_state: 'SYNCED', synced: true });
      } catch (err) {
        console.warn('Referral sync pending in outbox', err);
      }
    }

    confetti({
      particleCount: 70,
      spread: 70,
      origin: { y: 0.7 }
    });
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">

      {/* Offline Status Indicator */}
      {!isOnline && (
        <div className="mb-4 bg-gradient-to-r from-amber-500 to-orange-500 dark:from-amber-600 dark:to-orange-600 text-white px-5 py-3 rounded-2xl flex items-center gap-3 shadow-md">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <WifiOff className="w-5 h-5" />
          </div>
          <div>
            <p className="font-black text-sm">Offline Mode Active</p>
            <p className="text-xs font-medium text-white/80">Using local risk engine. ML predictions require server connection.</p>
          </div>
        </div>
      )}

      <MascotOverlay step={step} riskLevel={activeAssessment?.risk_level} />

      {/* Wizard Progress Bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-400 mb-2">
          <span className={`flex items-center gap-1 ${step >= 1 ? 'text-emerald-700 font-extrabold' : ''}`}>
            <UserPlus className="w-4 h-4" /> 1. {t.regTitle}
          </span>
          <span className={`flex items-center gap-1 ${step >= 2 ? 'text-emerald-700 font-extrabold' : ''}`}>
            <Stethoscope className="w-4 h-4" /> 2. {t.assessmentTitle}
          </span>
          <span className={`flex items-center gap-1 ${step >= 3 ? 'text-emerald-700 font-extrabold' : ''}`}>
            <Activity className="w-4 h-4" /> 3. {t.riskResultTitle}
          </span>
        </div>
        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden shadow-inner">
          <div
            className="bg-gradient-to-r from-emerald-500 to-teal-400 h-2 transition-all duration-300 rounded-full"
            style={{ width: step === 1 ? '33%' : step === 2 ? '66%' : '100%' }}
          ></div>
        </div>
      </div>

      {/* STEP 1: PATIENT REGISTRATION */}
      {step === 1 && (
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-100 dark:border-slate-700 transition-colors">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100 dark:border-slate-700">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 flex items-center justify-center font-bold">
              <UserPlus className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-slate-900">{t.regTitle}</h2>
              <p className="text-xs text-slate-500 font-medium">Step 1 of 3: Enter patient demographical details</p>
            </div>
          </div>

          <form onSubmit={handlePatientSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  {t.fullName} *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
                  }}
                  placeholder="e.g. Ramesh Kumar / Devi"
                  className={`w-full text-base font-semibold px-4 py-3 rounded-xl border ${
                    errors.name ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/30' : 'border-slate-300 dark:border-slate-600'
                  } bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 outline-none transition-all`}
                />
                {errors.name && (
                  <p className="text-xs font-bold text-rose-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> {errors.name}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  {t.village} *
                </label>
                <div className="relative">
                  <MapPin className="w-5 h-5 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    value={village}
                    onChange={(e) => {
                      setVillage(e.target.value);
                      if (errors.village) setErrors((prev) => ({ ...prev, village: undefined }));
                    }}
                    placeholder="e.g. Sonpur, Rampur, Belur"
                    className={`w-full text-base font-semibold pl-11 pr-4 py-3 rounded-xl border ${
                      errors.village ? 'border-rose-500 bg-rose-50' : 'border-slate-300'
                    } focus:ring-2 focus:ring-emerald-500 outline-none transition-all`}
                  />
                </div>
                {errors.village && (
                  <p className="text-xs font-bold text-rose-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> {errors.village}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  {t.age} *
                </label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={age}
                  onChange={(e) => {
                    setAge(e.target.value ? Number(e.target.value) : '');
                    if (errors.age) setErrors((prev) => ({ ...prev, age: undefined }));
                  }}
                  className={`w-full text-base font-semibold px-4 py-3 rounded-xl border ${
                    errors.age ? 'border-rose-500 bg-rose-50' : 'border-slate-300'
                  } focus:ring-2 focus:ring-emerald-500 outline-none transition-all`}
                />
                {errors.age && (
                  <p className="text-xs font-bold text-rose-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> {errors.age}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  {t.gender} *
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="w-full text-base font-semibold px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none transition-all bg-white"
                >
                  <option value="Female">{t.female}</option>
                  <option value="Male">{t.male}</option>
                  <option value="Other">{t.other}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  {t.phone}
                </label>
                <div className="relative">
                  <Phone className="w-5 h-5 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="10-digit mobile number"
                    className="w-full text-base font-semibold pl-11 pr-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  {t.optionalId}
                </label>
                <input
                  type="text"
                  value={customId}
                  onChange={(e) => setCustomId(e.target.value)}
                  placeholder="e.g. ABHA ID or RH-102"
                  className="w-full text-base font-semibold px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                />
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="submit"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-base rounded-2xl shadow-lg shadow-emerald-600/30 hover:scale-[1.02] active:scale-95 transition-all"
              >
                <span>{t.registerBtn}</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STEP 2: CLINICAL VITALS & SYMPTOMS */}
      {step === 2 && (
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-100 dark:border-slate-700 transition-colors">
          
          {/* Header info */}
          <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-teal-100 text-teal-800 flex items-center justify-center font-bold">
                <Stethoscope className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">{t.assessmentTitle}</h2>
                <p className="text-xs text-slate-500 font-medium">Patient: <span className="font-bold text-slate-800">{name}</span> ({age}y, {village})</p>
              </div>
            </div>

            <button
              onClick={() => setStep(1)}
              className="text-xs font-bold text-slate-500 hover:text-slate-800 underline"
            >
              Edit Patient
            </button>
          </div>

          <div className="space-y-6">
            
            {/* Symptoms Input with Voice Support */}
            <div className="bg-slate-50 dark:bg-slate-700/50 p-5 rounded-2xl border border-slate-200 dark:border-slate-600">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  {t.symptomsLabel}
                </label>
                <VoiceInputButton
                  lang={lang}
                  isOnline={isOnline}
                  onTranscript={(transcript) => {
                    setSymptomsText((prev) => (prev ? `${prev}, ${transcript}` : transcript));
                  }}
                />
              </div>

              <textarea
                rows={3}
                value={symptomsText}
                onChange={(e) => setSymptomsText(e.target.value)}
                placeholder={t.symptomsPlaceholder}
                className="w-full text-sm font-semibold p-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all"
              ></textarea>

              {/* Touch-Friendly Symptom Tag Pills */}
              <div className="mt-3">
                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Touch-Friendly Symptoms Select:</p>
                <div className="flex flex-wrap gap-2">
                  {commonSymptoms.map((sym) => {
                    const isSelected = symptomsText.includes(sym);
                    return (
                      <button
                        key={sym}
                        type="button"
                        onClick={() => toggleSymptomPill(sym)}
                        className={`text-xs font-bold px-3.5 py-2 rounded-xl transition-all border ${
                          isSelected
                            ? 'bg-teal-700 text-white border-teal-800 shadow-md scale-105'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {sym} {isSelected ? '✓' : '+'}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Vitals Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  {t.symptomDuration}
                </label>
                <input
                  type="number"
                  min={1}
                  value={symptomDuration}
                  onChange={(e) => setSymptomDuration(Number(e.target.value))}
                  className="w-full text-base font-semibold px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  {t.temp}
                </label>
                <div className="relative">
                  <Thermometer className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="number"
                    step="0.1"
                    value={tempF}
                    onChange={(e) => setTempF(Number(e.target.value))}
                    className="w-full text-base font-semibold pl-9 pr-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-teal-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  {t.glucose}
                </label>
                <input
                  type="number"
                  value={glucose}
                  onChange={(e) => setGlucose(Number(e.target.value))}
                  className="w-full text-base font-semibold px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  {t.bpSystolic}
                </label>
                <input
                  type="number"
                  value={systolic}
                  onChange={(e) => setSystolic(Number(e.target.value))}
                  className="w-full text-base font-semibold px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  {t.bpDiastolic}
                </label>
                <input
                  type="number"
                  value={diastolic}
                  onChange={(e) => setDiastolic(Number(e.target.value))}
                  className="w-full text-base font-semibold px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  {t.heartRate}
                </label>
                <input
                  type="number"
                  value={heartRate}
                  onChange={(e) => setHeartRate(Number(e.target.value))}
                  className="w-full text-base font-semibold px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-500 outline-none"
                />
              </div>
            </div>

            {/* Height, Weight & Computed BMI */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-800/30">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  {t.height}
                </label>
                <input
                  type="number"
                  value={heightCm}
                  onChange={(e) => setHeightCm(Number(e.target.value))}
                  className="w-full text-base font-semibold px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  {t.weight}
                </label>
                <input
                  type="number"
                  value={weightKg}
                  onChange={(e) => setWeightKg(Number(e.target.value))}
                  className="w-full text-base font-semibold px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-500 outline-none"
                />
              </div>

              <div className="flex flex-col justify-center">
                <span className="block text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                  {t.bmiLabel}
                </span>
                <div className="text-xl font-black text-emerald-900 dark:text-emerald-100 mt-1 flex items-center gap-2">
                  <span>{bmi} kg/m²</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    bmi >= 30 ? 'bg-rose-200 text-rose-800' : bmi >= 25 ? 'bg-amber-200 text-amber-800' : 'bg-emerald-200 text-emerald-800'
                  }`}>
                    {bmi >= 30 ? 'Obese' : bmi >= 25 ? 'Overweight' : 'Normal'}
                  </span>
                </div>
              </div>
            </div>

            {/* Habits & Physical Activity */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  {t.smoking}
                </label>
                <select
                  value={smoking}
                  onChange={(e) => setSmoking(e.target.value)}
                  className="w-full text-sm font-semibold p-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-500 outline-none"
                >
                  <option value="Never">Never</option>
                  <option value="Former">Former Smoker</option>
                  <option value="Current">Current Tobacco User</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  {t.alcohol}
                </label>
                <select
                  value={alcohol}
                  onChange={(e) => setAlcohol(e.target.value)}
                  className="w-full text-sm font-semibold p-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-500 outline-none"
                >
                  <option value="Never">Never</option>
                  <option value="Occasional">Occasional</option>
                  <option value="Regular">Regular Consumption</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  Physical Activity
                </label>
                <select
                  value={physicalActivity}
                  onChange={(e) => setPhysicalActivity(e.target.value)}
                  className="w-full text-sm font-semibold p-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-500 outline-none"
                >
                  <option value="Active">Active / Heavy Labour</option>
                  <option value="Moderate">Moderate Daily Activity</option>
                  <option value="Sedentary">Sedentary / Inactive</option>
                </select>
              </div>
            </div>

            {/* Family History Checkboxes */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                {t.familyHistory}
              </label>
              <div className="flex flex-wrap gap-4">
                {['Diabetes', 'Hypertension', 'Tuberculosis (TB)', 'Heart Disease', 'Asthma'].map((item) => (
                  <label key={item} className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={familyHistory.includes(item)}
                      onChange={(e) => {
                        if (e.target.checked) setFamilyHistory([...familyHistory, item]);
                        else setFamilyHistory(familyHistory.filter(f => f !== item));
                      }}
                      className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                    />
                    <span>{item}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Analysis Trigger Button */}
            <div className="pt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-6 py-3 rounded-xl border border-slate-300 dark:border-slate-600 font-bold text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Back
              </button>

              <button
                type="button"
                onClick={runAnalysis}
                disabled={isAnalyzing}
                className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold text-base rounded-2xl shadow-xl shadow-emerald-600/30 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
              >
                {isAnalyzing ? (
                  <>
                    <Activity className="w-5 h-5 animate-spin" />
                    <span>Evaluating Risk...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5 text-amber-300 animate-pulse" />
                    <span>{t.analyzeBtn}</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* STEP 3: EXPLAINABLE AI RISK RESULT */}
      {step === 3 && activeAssessment && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-100 dark:border-slate-700 transition-colors">
            
            {/* Patient Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-700">
              <div>
                <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">ASHA Patient Screening Card</span>
                <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-0.5">{name}</h2>
                <p className="text-xs font-semibold text-slate-500 mt-1">
                  Age {age} • {gender} • Village: <span className="text-slate-800 font-bold">{village}</span> • Mobile: {phone}
                </p>
              </div>

              {/* Risk Level Badge */}
              <div className={`px-6 py-3 rounded-2xl text-center border shadow-lg ${
                activeAssessment.risk_level === 'HIGH'
                  ? 'bg-rose-50 border-rose-300 text-rose-900 shadow-rose-200'
                  : activeAssessment.risk_level === 'MODERATE'
                  ? 'bg-amber-50 border-amber-300 text-amber-900 shadow-amber-200'
                  : 'bg-emerald-50 border-emerald-300 text-emerald-900 shadow-emerald-200'
              }`}>
                <span className="block text-[10px] font-black uppercase tracking-widest opacity-80">Screening Classification</span>
                <span className="text-lg font-black tracking-tight flex items-center justify-center gap-1.5">
                  {activeAssessment.risk_level === 'HIGH' && <ShieldAlert className="w-5 h-5 text-rose-600 animate-bounce" />}
                  {activeAssessment.risk_level === 'HIGH' ? t.highRisk : activeAssessment.risk_level === 'MODERATE' ? t.modRisk : t.lowRisk}
                </span>
                <span className="text-xs font-bold opacity-75">
                  Score: {activeAssessment.risk_score != null ? `${Math.round(activeAssessment.risk_score * 100)}%` : 'Uncertain (Data Gaps)'}
                </span>
              </div>
            </div>

            {/* ════════════════════════════════════════════════════════════════════
                 UNIFIED CERTIFIED BEST OUTPUT — ML + Gemini + Search TALLIED
               ════════════════════════════════════════════════════════════════════ */}
            {geminiTop3 && geminiTop3.combined_top3.length > 0 && (
              <div className="my-6 bg-gradient-to-br from-white via-indigo-50/50 to-blue-50/50 p-6 rounded-3xl border-2 border-indigo-300 shadow-xl">
                {/* ── Header ───────────────────────────────────────────────────── */}
                <div className="flex items-center justify-between mb-4 pb-4 border-b-2 border-indigo-100">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg">
                      <Sparkles className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                        CERTIFIED BEST OUTPUT
                        <span className="text-[9px] font-black px-2 py-0.5 bg-emerald-500 text-white rounded-full animate-pulse">VERIFIED</span>
                      </h3>
                      <p className="text-[10px] text-slate-500 font-semibold">
                        ML Model + Gemini AI + Medical Search — 3-Source Tallied Result
                      </p>
                    </div>
                  </div>
                  {/* System Status Badges */}
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${geminiTop3.systems_status.ml_model ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      <span className="text-[9px] font-bold text-slate-600">🤖 ML Model</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${geminiTop3.systems_status.gemini_ai ? 'bg-blue-500' : 'bg-slate-300'}`} />
                      <span className="text-[9px] font-bold text-slate-600">💎 Gemini AI</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${geminiTop3.systems_status.search ? 'bg-violet-500' : 'bg-slate-300'}`} />
                      <span className="text-[9px] font-bold text-slate-600">🔍 Medical Search</span>
                    </div>
                  </div>
                </div>

                {/* ── Top 3 Disease Cards ──────────────────────────────────────── */}
                <div className="space-y-4">
                  {geminiTop3.combined_top3.map((pred) => {
                    const barWidth = Math.min(pred.combined_score * 100 * 1.2, 100);
                    const isHighConfidence = pred.combined_score > 0.5;
                    const sourcesPresent = pred.source_count || 0;
                    const bothAgree = pred.sources_agree;

                    return (
                      <div key={pred.rank} className={`relative bg-white rounded-2xl p-5 border-2 transition-all ${
                        sourcesPresent >= 3 ? 'border-emerald-400 shadow-lg shadow-emerald-100'
                        : bothAgree ? 'border-emerald-200 shadow-md shadow-emerald-50'
                        : 'border-slate-100'
                      }`}>
                        {/* Rank + Disease Name + Score */}
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-lg ${
                              pred.rank === 1 ? 'bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-lg shadow-red-200'
                              : pred.rank === 2 ? 'bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-200'
                              : 'bg-gradient-to-br from-blue-500 to-indigo-500 text-white shadow-lg shadow-blue-200'
                            }`}>
                              {pred.rank}
                            </div>
                            <div>
                              <p className="font-black text-lg text-slate-900 capitalize">{pred.condition}</p>
                              <div className="flex items-center gap-2 mt-1">
                                {sourcesPresent >= 3 && (
                                  <span className="text-[9px] font-black px-2 py-0.5 bg-emerald-500 text-white rounded-full flex items-center gap-0.5">
                                    <CheckCircle2 className="w-2.5 h-2.5" /> ALL 3 SOURCES AGREE
                                  </span>
                                )}
                                {bothAgree && sourcesPresent < 3 && (
                                  <span className="text-[9px] font-black px-2 py-0.5 bg-emerald-500 text-white rounded-full flex items-center gap-0.5">
                                    <CheckCircle2 className="w-2.5 h-2.5" /> {sourcesPresent} SOURCES AGREE
                                  </span>
                                )}
                                {isHighConfidence && (
                                  <span className="text-[9px] font-black px-2 py-0.5 bg-red-100 text-red-700 rounded-full">
                                    HIGH RISK
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <span className="text-2xl font-black text-slate-900">
                            {(pred.combined_score * 100).toFixed(0)}%
                          </span>
                        </div>

                        {/* Combined Score Bar */}
                        <div className="w-full bg-slate-100 rounded-full h-3 mb-4 overflow-hidden">
                          <div
                            className={`h-3 rounded-full transition-all duration-700 ${
                              pred.rank === 1 ? 'bg-gradient-to-r from-red-500 to-rose-500'
                              : pred.rank === 2 ? 'bg-gradient-to-r from-amber-500 to-orange-500'
                              : 'bg-gradient-to-r from-blue-500 to-indigo-500'
                            }`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>

                        {/* ── ALL 3 SOURCE SCORES ─────────────────────────────── */}
                        <div className="grid grid-cols-3 gap-2">
                          {/* ML Model Score */}
                          <div className="bg-emerald-50 rounded-xl p-2.5 border border-emerald-100">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[8px] font-black uppercase tracking-wider text-emerald-700">🤖 ML</span>
                              {pred.ml_rank && <span className="text-[8px] font-bold text-emerald-600">#{pred.ml_rank}</span>}
                            </div>
                            <div className="flex items-center gap-1">
                              <div className="flex-1 bg-emerald-200 rounded-full h-1.5 overflow-hidden">
                                <div className="h-1.5 bg-emerald-500 rounded-full" style={{ width: `${pred.ml_score ? Math.min(pred.ml_score * 100 * 1.2, 100) : 0}%` }} />
                              </div>
                              <span className="text-[10px] font-black text-emerald-800">
                                {pred.ml_score ? `${(pred.ml_score * 100).toFixed(0)}%` : '—'}
                              </span>
                            </div>
                          </div>

                          {/* Gemini Score */}
                          <div className="bg-blue-50 rounded-xl p-2.5 border border-blue-100">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[8px] font-black uppercase tracking-wider text-blue-700">💎 Gemini</span>
                              {pred.gemini_rank && <span className="text-[8px] font-bold text-blue-600">#{pred.gemini_rank}</span>}
                            </div>
                            <div className="flex items-center gap-1">
                              <div className="flex-1 bg-blue-200 rounded-full h-1.5 overflow-hidden">
                                <div className="h-1.5 bg-blue-500 rounded-full" style={{ width: `${pred.gemini_score ? Math.min(pred.gemini_score * 100 * 1.2, 100) : 0}%` }} />
                              </div>
                              <span className="text-[10px] font-black text-blue-800">
                                {pred.gemini_score ? `${(pred.gemini_score * 100).toFixed(0)}%` : '—'}
                              </span>
                            </div>
                          </div>

                          {/* Search Score */}
                          <div className="bg-violet-50 rounded-xl p-2.5 border border-violet-100">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[8px] font-black uppercase tracking-wider text-violet-700">🔍 Search</span>
                              {pred.search_rank && <span className="text-[8px] font-bold text-violet-600">#{pred.search_rank}</span>}
                            </div>
                            <div className="flex items-center gap-1">
                              <div className="flex-1 bg-violet-200 rounded-full h-1.5 overflow-hidden">
                                <div className="h-1.5 bg-violet-500 rounded-full" style={{ width: `${pred.search_score ? Math.min(pred.search_score * 100 * 1.2, 100) : 0}%` }} />
                              </div>
                              <span className="text-[10px] font-black text-violet-800">
                                {pred.search_score ? `${(pred.search_score * 100).toFixed(0)}%` : '—'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Reasoning */}
                        {pred.reasoning && (
                          <p className="text-[10px] text-slate-500 mt-2 italic">💡 {pred.reasoning}</p>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* ── Gemini Urgency + Advice ──────────────────────────────────── */}
                {geminiTop3.gemini_urgency && (
                  <div className="mt-4 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl p-3 border border-purple-100">
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="w-3.5 h-3.5 text-purple-600" />
                      <span className="text-[10px] font-black uppercase tracking-wider text-purple-800">
                        Urgency: {geminiTop3.gemini_urgency}
                      </span>
                    </div>
                    {geminiTop3.gemini_advice && (
                      <p className="text-[10px] text-slate-600 leading-relaxed">{geminiTop3.gemini_advice}</p>
                    )}
                  </div>
                )}

                {/* ── Disclaimer ──────────────────────────────────────────────── */}
                <p className="text-[9px] text-slate-400 text-center mt-4 font-medium">
                  ⚕️ AI-assisted screening only — not a medical diagnosis. Always consult a healthcare professional.
                </p>
              </div>
            )}

            {/* Explainability Breakdown & Likely Conditions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-6">
              
              {/* Contributing Risk Factors */}
              <div className="bg-slate-50 dark:bg-slate-700/50 p-5 rounded-2xl border border-slate-200 dark:border-slate-600">
                <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-800 flex items-center gap-2 mb-3">
                  <Activity className="w-4 h-4 text-emerald-600" />
                  {t.contributingFactors}
                </h3>
                <ul className="space-y-2">
                  {activeAssessment.contributing_factors.map((factor, idx) => (
                    <li key={idx} className="text-xs font-semibold text-slate-700 flex items-start gap-2 bg-white p-2.5 rounded-xl border border-slate-200/60 shadow-sm">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1 shrink-0"></span>
                      <span>{factor}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Triage Recommendation */}
              <div className="space-y-4">
                <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-md">
                  <h3 className="text-xs font-extrabold uppercase tracking-widest text-emerald-400 flex items-center gap-2 mb-2">
                    <Activity className="w-4 h-4" />
                    {t.recommendedAction}
                  </h3>
                  <p className="text-xs font-medium leading-relaxed text-slate-200">
                    {activeAssessment.recommended_action}
                  </p>
                </div>
              </div>
            </div>



            {/* ── OBJECTIFIED DISEASE RISK CARD ─────────────────────────── */}
            <ObjectifiedRiskCard
              conditions={activeAssessment.likely_conditions || []}
              riskLevel={activeAssessment.risk_level}
              riskScore={activeAssessment.risk_score}
              onBookTeleconsult={onBookTeleconsult}
            />

            {/* Healthcare Safety Disclaimer Component */}
            <MedicalDisclaimer lang={lang} />

            {/* Referral Trigger Actions */}
            <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="w-full sm:w-auto px-6 py-3 rounded-xl border border-slate-300 font-bold text-xs text-slate-700 hover:bg-slate-50"
              >
                Re-assess Vitals
              </button>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => updateReferral('REFERRED')}
                  disabled={activeAssessment.referral_status === 'REFERRED' || activeAssessment.referral_status === 'CONSULTATION_COMPLETED'}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-sm rounded-xl shadow-md shadow-rose-600/30 transition-all disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>
                    {activeAssessment.referral_status === 'REFERRED'
                      ? t.referred
                      : activeAssessment.referral_status === 'CONSULTATION_COMPLETED'
                      ? t.consultationCompleted
                      : t.initiateReferral}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStep(1);
                    setName('');
                    setPatientId('');
                    setSymptomsText('');
                    setErrors({});
                  }}
                  className="w-full sm:w-auto px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm rounded-xl shadow-md"
                >
                  + New Assessment
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// OBJECTIFIED RISK DISEASE CARD
// Maps ML/rule-based conditions → specialist, urgency, recommended tests
// ────────────────────────────────────────────────────────────────────────────

interface ObjectifiedRiskCardProps {
  conditions: string[];
  riskLevel: string;
  riskScore: number | null;
  onBookTeleconsult?: () => void;
}

interface SpecialistInfo {
  specialty: string;
  icon: React.ReactNode;
  urgency: 'URGENT' | 'SOON' | 'ROUTINE';
  urgencyLabel: string;
  urgencyColor: string;
  tests: string[];
  gradientClass: string;
  borderClass: string;
}

function mapConditionsToSpecialist(conditions: string[], riskLevel: string): SpecialistInfo {
  const text = conditions.join(' ').toLowerCase();

  if (text.includes('tb') || text.includes('tuberculosis') || text.includes('sputum')) {
    return {
      specialty: 'Pulmonologist / TB Specialist',
      icon: <Wind className="w-5 h-5" />,
      urgency: riskLevel === 'HIGH' ? 'URGENT' : 'SOON',
      urgencyLabel: riskLevel === 'HIGH' ? '⚠ Urgent — Within 24 Hours' : '📅 Within 3–5 Days',
      urgencyColor: riskLevel === 'HIGH' ? 'text-rose-700 bg-rose-100' : 'text-amber-700 bg-amber-100',
      tests: ['Sputum Smear Microscopy (AFB)', 'CBNAAT / GeneXpert MTB/RIF', 'Chest X-Ray (PA View)', 'Mantoux / TST Test'],
      gradientClass: 'from-amber-500 to-orange-500',
      borderClass: 'border-amber-200 bg-amber-50'
    };
  }
  if (text.includes('diabet')) {
    return {
      specialty: 'Endocrinologist / Diabetologist',
      icon: <Droplets className="w-5 h-5" />,
      urgency: riskLevel === 'HIGH' ? 'URGENT' : 'SOON',
      urgencyLabel: riskLevel === 'HIGH' ? '⚠ Urgent — Within 24 Hours' : '📅 Within 3–5 Days',
      urgencyColor: riskLevel === 'HIGH' ? 'text-rose-700 bg-rose-100' : 'text-amber-700 bg-amber-100',
      tests: ['Fasting Blood Glucose (FBG)', 'HbA1c (Glycated Haemoglobin)', 'Post-Prandial Blood Glucose', 'Urine Micro-Albumin'],
      gradientClass: 'from-blue-500 to-cyan-500',
      borderClass: 'border-blue-200 bg-blue-50'
    };
  }
  if (text.includes('cardiovascular') || text.includes('chest')) {
    return {
      specialty: 'Cardiologist',
      icon: <Heart className="w-5 h-5" />,
      urgency: 'URGENT',
      urgencyLabel: '🚨 URGENT — Immediate Evaluation',
      urgencyColor: 'text-rose-700 bg-rose-100',
      tests: ['12-Lead ECG', 'Echocardiogram', 'Troponin I/T Test', 'Chest X-Ray'],
      gradientClass: 'from-rose-500 to-red-500',
      borderClass: 'border-rose-200 bg-rose-50'
    };
  }
  if (text.includes('hypertension') || text.includes('blood pressure')) {
    return {
      specialty: 'Cardiologist / Internal Medicine',
      icon: <Heart className="w-5 h-5" />,
      urgency: riskLevel === 'HIGH' ? 'URGENT' : 'SOON',
      urgencyLabel: riskLevel === 'HIGH' ? '⚠ Urgent — Within 24 Hours' : '📅 Within 3–5 Days',
      urgencyColor: riskLevel === 'HIGH' ? 'text-rose-700 bg-rose-100' : 'text-amber-700 bg-amber-100',
      tests: ['Ambulatory Blood Pressure Monitor (ABPM)', 'ECG', 'Serum Creatinine & eGFR', 'Urine Routine Analysis'],
      gradientClass: 'from-rose-500 to-pink-500',
      borderClass: 'border-rose-200 bg-rose-50'
    };
  }
  if (text.includes('anemia') || text.includes('nutritional')) {
    return {
      specialty: 'General Physician / Haematologist',
      icon: <Droplets className="w-5 h-5" />,
      urgency: 'SOON',
      urgencyLabel: '📅 Within 3–5 Days',
      urgencyColor: 'text-amber-700 bg-amber-100',
      tests: ['Complete Blood Count (CBC)', 'Serum Iron & TIBC', 'Serum Ferritin', 'Peripheral Blood Smear'],
      gradientClass: 'from-purple-500 to-violet-500',
      borderClass: 'border-purple-200 bg-purple-50'
    };
  }
  // Default
  return {
    specialty: 'General Physician (MBBS / MD)',
    icon: <Stethoscope className="w-5 h-5" />,
    urgency: 'ROUTINE',
    urgencyLabel: '✓ Routine — Within 1 Week',
    urgencyColor: 'text-emerald-700 bg-emerald-100',
    tests: ['Complete Blood Count (CBC)', 'Urine Routine & Microscopy', 'Blood Glucose (Fasting)', 'Chest X-Ray (if symptomatic)'],
    gradientClass: 'from-emerald-500 to-teal-500',
    borderClass: 'border-emerald-200 bg-emerald-50'
  };
}

const ObjectifiedRiskCard: React.FC<ObjectifiedRiskCardProps> = ({
  conditions,
  riskLevel,
  riskScore,
  onBookTeleconsult
}) => {
  const info = mapConditionsToSpecialist(conditions, riskLevel);

  return (
    <div className={`rounded-2xl border-2 p-5 ${info.borderClass} mt-2`}>
      {/* Card Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${info.gradientClass} text-white flex items-center justify-center shadow-sm`}>
            {info.icon}
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Objectified Risk → Specialist</p>
            <h4 className="font-extrabold text-slate-900 text-sm">{info.specialty}</h4>
          </div>
        </div>
        <span className={`text-[11px] font-black px-3 py-1.5 rounded-full ${info.urgencyColor}`}>
          {info.urgencyLabel}
        </span>
      </div>

      {/* Conditions detected */}
      <div className="mb-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Detected Risk Conditions</p>
        <div className="flex flex-wrap gap-1.5">
          {conditions.map((cond, i) => (
            <span key={i} className="text-[11px] font-bold bg-white text-slate-700 px-2.5 py-1.5 rounded-xl border border-slate-200 shadow-sm leading-tight">
              {cond.length > 50 ? cond.slice(0, 48) + '…' : cond}
            </span>
          ))}
        </div>
      </div>

      {/* Recommended Tests */}
      <div className="mb-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1">
          <Zap className="w-3 h-3 text-amber-500" />
          Recommended Diagnostic Tests
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {info.tests.map((test, i) => (
            <div key={i} className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 border border-slate-200 shadow-sm">
              <span className="w-5 h-5 rounded-full bg-gradient-to-br from-emerald-400 to-teal-400 text-white text-[9px] font-black flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              <span className="text-xs font-semibold text-slate-700">{test}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Risk Score Bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">AI Risk Confidence Score</p>
          <span className={`text-xs font-black ${
            riskLevel === 'HIGH' ? 'text-rose-700' : riskLevel === 'MODERATE' ? 'text-amber-700' : 'text-emerald-700'
          }`}>{riskScore !== null ? `${Math.round(riskScore * 100)}%` : 'N/A'}</span>
        </div>
        <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 bg-gradient-to-r ${
              riskLevel === 'HIGH' ? 'from-rose-500 to-red-400' : riskLevel === 'MODERATE' ? 'from-amber-400 to-orange-400' : 'from-emerald-400 to-teal-400'
            }`}
            style={{ width: `${riskScore !== null ? Math.round(riskScore * 100) : 0}%` }}
          />
        </div>
      </div>

      {/* CTA */}
      {onBookTeleconsult && (
        <button
          type="button"
          onClick={onBookTeleconsult}
          className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-extrabold text-sm text-white bg-gradient-to-r ${info.gradientClass} shadow-lg hover:scale-[1.02] active:scale-95 transition-all`}
        >
          <Video className="w-4 h-4" />
          Book Teleconsult with Nearest {info.specialty.split(' / ')[0]}
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

