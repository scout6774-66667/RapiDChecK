import React, { useState } from 'react';
import { DashboardSidebar, type DashboardNavTab } from '../dashboard/DashboardSidebar';
import { DashboardHeader } from '../dashboard/DashboardHeader';
import { ScreeningStepper } from './ScreeningStepper';
import { Step1PatientInfo } from './Step1PatientInfo';
import { Step2Symptoms } from './Step2Symptoms';
import { Step3Vitals } from './Step3Vitals';
import { Step4RiskFactors } from './Step4RiskFactors';
import { Step5Review } from './Step5Review';
import { Step6Analyzing } from './Step6Analyzing';
import { Step7ScreeningResult } from './Step7ScreeningResult';
import { ReferralModal } from './ReferralModal';
import type {
  ScreeningStep,
  PatientFormData,
  SymptomsFormData,
  VitalsFormData,
  RiskFactorsFormData,
  ScreeningResultData,
} from './types';
import { savePatientAtomic, saveAssessmentAtomic, updateReferralAtomic, db, type LocalPatient } from '../../db/offlineDb';
import type { Language } from '../../i18n/translations';
import { Wifi, WifiOff, LogOut, CheckCircle2 } from 'lucide-react';

interface ScreenPatientPageProps {
  lang: Language;
  onLangChange: (lang: Language) => void;
  isOnline: boolean;
  pendingSyncCount: number;
  onSyncTrigger: () => void;
  isSyncing: boolean;
  onNavigateToTab: (tab: DashboardNavTab) => void;
  onBookTeleconsult?: () => void;
  initialPatientId?: string;
}

export const ScreenPatientPage: React.FC<ScreenPatientPageProps> = ({
  lang,
  onLangChange,
  isOnline,
  pendingSyncCount,
  onSyncTrigger,
  isSyncing,
  onNavigateToTab,
  onBookTeleconsult,
}) => {
  const [currentStep, setCurrentStep] = useState<ScreeningStep>(1);
  const [maxStepReached, setMaxStepReached] = useState<ScreeningStep>(1);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [showReferralModal, setShowReferralModal] = useState(false);

  // ── Form State ─────────────────────────────────────────────────────────────
  const [patientData, setPatientData] = useState<PatientFormData>({
    id: `PAT-${Date.now().toString().slice(-6)}`,
    customId: `PT-${Date.now().toString().slice(-4)}`,
    name: '',
    age: '',
    gender: '',
    phone: '',
    village: 'Sundarpur Block',
    preferredLanguage: 'English',
    emergencyContact: '',
    isExisting: false,
  });

  const [symptomsData, setSymptomsData] = useState<SymptomsFormData>({
    symptoms: [],
    duration: '1–3 days',
    severity: 'Mild',
    voiceTranscript: '',
    customSymptom: '',
  });

  const [vitalsData, setVitalsData] = useState<VitalsFormData>({
    systolicBp: '',
    diastolicBp: '',
    temperatureF: '',
    heartRateBpm: '',
    glucoseMgDl: '',
    glucoseMeasured: false,
    heightCm: '',
    weightKg: '',
  });

  const [riskFactorsData, setRiskFactorsData] = useState<RiskFactorsFormData>({
    medicalHistory: {
      diabetes: 'Unknown',
      hypertension: 'Unknown',
      previousTb: 'Unknown',
      heartDisease: 'Unknown',
      asthma: 'Unknown',
      other: '',
    },
    familyHistory: {
      diabetes: 'Unknown',
      hypertension: 'Unknown',
      heartDisease: 'Unknown',
      other: '',
    },
    lifestyle: {
      smoking: 'Never',
      alcohol: 'Never',
      physicalActivity: 'Moderate',
    },
  });

  const [screeningResult, setScreeningResult] = useState<ScreeningResultData | null>(null);

  // Save progress helper
  const triggerLocalSave = async (msg = 'Progress saved locally') => {
    try {
      if (patientData.name.trim()) {
        const localPatient: LocalPatient = {
          id: patientData.id,
          name: patientData.name,
          age: Number(patientData.age) || 30,
          gender: patientData.gender || 'Other',
          village: patientData.village,
          phone: patientData.phone,
          patient_id: patientData.customId,
          server_version: 1,
          local_version: 1,
          is_deleted: false,
          sync_state: 'LOCAL',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          synced: false,
        };
        await db.patients.put(localPatient);
      }

      setSaveToast(msg);
      setTimeout(() => setSaveToast(null), 2500);
    } catch {
      // ignore
    }
  };

  const goToStep = (step: ScreeningStep) => {
    setCurrentStep(step);
    if (step > maxStepReached) {
      setMaxStepReached(step);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    triggerLocalSave('Saved step progress');
  };

  // Run Screening Engine (Step 5 -> 6 -> 7)
  const handleStartScreening = () => {
    goToStep(6);
  };

  const handleAnalysisCompleted = async () => {
    try {
      // 1. Atomically save patient with outbox operation
      const pRecord = await savePatientAtomic(
        {
          id: patientData.id,
          name: patientData.name.trim(),
          age: Number(patientData.age) || 30,
          gender: patientData.gender || 'Other',
          village: patientData.village.trim(),
          phone: patientData.phone.trim(),
          patient_id: patientData.customId,
        },
        !patientData.isExisting
      );

      // 2. Parse vitals strictly as nullable numbers (do not default missing vitals to normal)
      const tempF = vitalsData.temperatureF !== '' && !isNaN(Number(vitalsData.temperatureF)) ? Number(vitalsData.temperatureF) : null;
      const sysBp = vitalsData.systolicBp !== '' && !isNaN(Number(vitalsData.systolicBp)) ? Number(vitalsData.systolicBp) : null;
      const diaBp = vitalsData.diastolicBp !== '' && !isNaN(Number(vitalsData.diastolicBp)) ? Number(vitalsData.diastolicBp) : null;
      const gluc = vitalsData.glucoseMeasured && vitalsData.glucoseMgDl !== '' && !isNaN(Number(vitalsData.glucoseMgDl)) ? Number(vitalsData.glucoseMgDl) : null;
      const hr = vitalsData.heartRateBpm !== '' && !isNaN(Number(vitalsData.heartRateBpm)) ? Number(vitalsData.heartRateBpm) : null;
      const hCm = vitalsData.heightCm !== '' && !isNaN(Number(vitalsData.heightCm)) ? Number(vitalsData.heightCm) : null;
      const wKg = vitalsData.weightKg !== '' && !isNaN(Number(vitalsData.weightKg)) ? Number(vitalsData.weightKg) : null;

      let durationDays: number | null = null;
      if (symptomsData.duration.includes('week') || symptomsData.duration.includes('>2')) durationDays = 14;
      else if (symptomsData.duration.includes('4–7')) durationDays = 5;
      else if (symptomsData.duration.includes('1–3')) durationDays = 2;
      else if (symptomsData.duration.includes('Today')) durationDays = 1;

      // 3. Atomically evaluate clinical risk and save assessment + outbox queue
      const aRecord = await saveAssessmentAtomic({
        patient_id: pRecord.id,
        patient_name: pRecord.name,
        village: pRecord.village,
        symptoms: symptomsData.symptoms,
        symptom_duration_days: durationDays,
        temperature_f: tempF,
        systolic_bp: sysBp,
        diastolic_bp: diaBp,
        glucose_mg_dl: gluc,
        heart_rate_bpm: hr,
        height_cm: hCm,
        weight_kg: wKg,
        bmi: vitalsData.bmi ?? null,
        smoking_status: riskFactorsData.lifestyle.smoking,
        alcohol_status: riskFactorsData.lifestyle.alcohol,
        physical_activity: riskFactorsData.lifestyle.physicalActivity,
        family_history: Object.entries(riskFactorsData.familyHistory)
          .filter(([_, v]) => v === 'Yes')
          .map(([k]) => k),
      });

      // 4. Transform canonical LocalAssessment to UI ScreeningResultData
      const uiRiskLevel: ScreeningResultData['riskLevel'] =
        aRecord.is_emergency || aRecord.risk_level === 'EMERGENCY'
          ? 'CRITICAL'
          : aRecord.risk_level === 'INSUFFICIENT_DATA'
          ? 'INSUFFICIENT_DATA'
          : aRecord.risk_level === 'HIGH'
          ? 'HIGH'
          : aRecord.risk_level === 'MODERATE'
          ? 'MODERATE'
          : 'LOW';

      const res: ScreeningResultData = {
        assessmentId: aRecord.id,
        patientId: pRecord.id,
        patientName: pRecord.name,
        riskLevel: uiRiskLevel,
        riskScore: aRecord.risk_score != null ? Math.round(aRecord.risk_score * 100) : 0,
        likelyConditions: aRecord.likely_conditions,
        contributingFactors: aRecord.contributing_factors,
        recommendedAction: aRecord.recommended_action,
        potentialRiskIndicators: aRecord.red_flags.length > 0 ? aRecord.red_flags : (aRecord.risk_level === 'HIGH' ? ['Elevated Clinical Risk Profile'] : []),
        completenessScore: aRecord.uncertainty_state === 'COMPLETE' ? 100 : (aRecord.uncertainty_state === 'UNCERTAIN' ? 70 : 30),
        missingFields: aRecord.uncertainty_state === 'INSUFFICIENT_DATA' ? ['Vital Signs (BP / Glucose / Temp)'] : [],
        isOffline: !isOnline,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        rulesVersion: aRecord.ruleset_version,
        modelVersion: aRecord.workflow_version,
      };

      setScreeningResult(res);

      // 5. Trigger sync if online
      if (isOnline) {
        onSyncTrigger();
      }
    } catch (err) {
      console.error('Failed to save assessment atomically:', err);
    }

    goToStep(7);
  };

  const handleReferralSaved = async () => {
    try {
      if (screeningResult) {
        await updateReferralAtomic(screeningResult.assessmentId, 'REFERRED');
        if (isOnline) {
          onSyncTrigger();
        }
      }
      setSaveToast('IDRC Referral Created & Queued');
      setTimeout(() => {
        onNavigateToTab('referrals');
      }, 1200);
    } catch {
      // ignore
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F9FA] flex font-sans antialiased text-[#102A56]">
      {/* 1. Left Sidebar (Screen Patients is Active) */}
      <div className="hidden lg:block shrink-0">
        <DashboardSidebar
          currentTab="screen"
          onSelectTab={onNavigateToTab}
          isOnline={isOnline}
          appointmentCount={3}
        />
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative z-50 animate-in slide-in-from-left duration-200">
            <DashboardSidebar
              currentTab="screen"
              onSelectTab={onNavigateToTab}
              isOnline={isOnline}
              appointmentCount={3}
              onCloseMobileMenu={() => setMobileMenuOpen(false)}
            />
          </div>
        </div>
      )}

      {/* 2. Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
        {/* Top Header */}
        <DashboardHeader
          lang={lang}
          onLangChange={onLangChange}
          isOnline={isOnline}
          pendingSyncCount={pendingSyncCount}
          onSyncTrigger={onSyncTrigger}
          isSyncing={isSyncing}
          searchQuery=""
          onSearchChange={() => {}}
          onToggleMobileMenu={() => setMobileMenuOpen(true)}
        />

        {/* Save Toast */}
        {saveToast && (
          <div className="fixed top-20 right-6 z-50 bg-[#102A56] text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow-lg flex items-center gap-2 border border-[#0A9F68] animate-in fade-in slide-in-from-top-1">
            <CheckCircle2 className="w-4 h-4 text-[#0A9F68]" />
            <span>{saveToast}</span>
          </div>
        )}

        {/* Main Screening Content Container */}
        <main className="flex-1 p-4 sm:p-6 lg:p-7 max-w-[1200px] w-full mx-auto">
          {/* Top Page Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-[#102A56] tracking-tight">
                Screen a Patient
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
                Capture essential health information for preliminary screening and timely PHC referral.
              </p>
            </div>

            {/* Status & Exit Controls */}
            <div className="flex items-center gap-2.5 shrink-0">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                  isOnline
                    ? 'bg-[#E7F7F0] text-[#0A9F68] border-[#0A9F68]/30'
                    : 'bg-amber-50 text-amber-700 border-amber-300'
                }`}
              >
                {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                <span>{isOnline ? 'Online • Connected' : 'Offline Mode • Saved locally'}</span>
              </span>

              <button
                type="button"
                onClick={() => onNavigateToTab('dashboard')}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-600 transition-all"
              >
                <LogOut className="w-3.5 h-3.5 text-slate-400" />
                <span>Save & Exit</span>
              </button>
            </div>
          </div>

          {/* Stepper Progress Bar */}
          <ScreeningStepper
            currentStep={currentStep}
            maxStepReached={maxStepReached}
            onStepClick={(s) => goToStep(s)}
          />

          {/* Workflow Steps Content */}
          <div>
            {currentStep === 1 && (
              <Step1PatientInfo
                data={patientData}
                onChange={setPatientData}
                onNext={() => goToStep(2)}
              />
            )}

            {currentStep === 2 && (
              <Step2Symptoms
                data={symptomsData}
                onChange={setSymptomsData}
                onNext={() => goToStep(3)}
                onBack={() => goToStep(1)}
              />
            )}

            {currentStep === 3 && (
              <Step3Vitals
                data={vitalsData}
                onChange={setVitalsData}
                onNext={() => goToStep(4)}
                onBack={() => goToStep(2)}
              />
            )}

            {currentStep === 4 && (
              <Step4RiskFactors
                data={riskFactorsData}
                onChange={setRiskFactorsData}
                onNext={() => goToStep(5)}
                onBack={() => goToStep(3)}
              />
            )}

            {currentStep === 5 && (
              <Step5Review
                patient={patientData}
                symptoms={symptomsData}
                vitals={vitalsData}
                riskFactors={riskFactorsData}
                onEditStep={(s) => goToStep(s)}
                onRunScreening={handleStartScreening}
                onBack={() => goToStep(4)}
              />
            )}

            {currentStep === 6 && (
              <Step6Analyzing
                isOffline={!isOnline}
                onComplete={handleAnalysisCompleted}
              />
            )}

            {currentStep === 7 && screeningResult && (
              <Step7ScreeningResult
                result={screeningResult}
                onReferToPhc={() => setShowReferralModal(true)}
                onBookAppointment={() => onBookTeleconsult?.()}
                onReviewAgain={() => goToStep(5)}
                onFinish={() => onNavigateToTab('dashboard')}
              />
            )}
          </div>
        </main>
      </div>

      {/* Referral Modal */}
      {screeningResult && (
        <ReferralModal
          isOpen={showReferralModal}
          onClose={() => setShowReferralModal(false)}
          result={screeningResult}
          patient={patientData}
          vitals={vitalsData}
          symptoms={symptomsData}
          onReferralCreated={handleReferralSaved}
        />
      )}
    </div>
  );
};
