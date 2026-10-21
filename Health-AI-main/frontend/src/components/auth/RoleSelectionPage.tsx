import React, { useState } from 'react';
import { useLanguage } from '../../i18n';
import { useAuth } from '../../auth/AuthContext';
import { AuthHeader } from './AuthHeader';
import logoImg from '../../assets/logo.png';
import {
  HeartHandshake,
  Stethoscope,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ShieldCheck,
  X,
  FileText,
} from 'lucide-react';

export interface RoleSelectionPageProps {
  onSelectPatient: () => void;
  onSelectProfessional: () => void;
  onNavigateHome: () => void;
  onNavigateSignIn: () => void;
}

export const RoleSelectionPage: React.FC<RoleSelectionPageProps> = ({
  onSelectPatient,
  onSelectProfessional,
  onNavigateHome,
  onNavigateSignIn,
}) => {
  const { strings } = useLanguage();
  const { user, isAuthenticated, logout } = useAuth();

  const [selectedRole, setSelectedRole] = useState<'patient' | 'professional' | null>(null);
  const [roleMismatchWarning, setRoleMismatchWarning] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<'terms' | 'privacy' | null>(null);

  const authStrings = strings?.auth || {};

  const handlePatientClick = () => {
    setSelectedRole('patient');
    setRoleMismatchWarning(null);

    // If currently authenticated as a healthcare professional, alert user
    if (isAuthenticated && user && user.role !== 'PATIENT') {
      setRoleMismatchWarning(
        `You are currently signed in as a Healthcare Professional (${user.full_name}, ${user.role}). Would you like to switch accounts or proceed to the patient onboarding?`
      );
      return;
    }

    onSelectPatient();
  };

  const handleProfessionalClick = () => {
    setSelectedRole('professional');
    setRoleMismatchWarning(null);

    // If currently authenticated as a patient, alert user
    if (isAuthenticated && user && user.role === 'PATIENT') {
      setRoleMismatchWarning(
        `You are currently signed in as a Patient (${user.full_name}). Clinical workflows require verified clinician or health worker credentials.`
      );
      return;
    }

    onSelectProfessional();
  };

  const handleSwitchAccount = async () => {
    await logout();
    setRoleMismatchWarning(null);
    if (selectedRole === 'patient') {
      onSelectPatient();
    } else {
      onSelectProfessional();
    }
  };

  return (
    <div className="min-h-screen bg-[#F4FBF8] text-[#12345B] flex flex-col justify-between selection:bg-[#12B981] selection:text-white">
      {/* 1. Header with Consistent RuralHealth AI Styling */}
      <AuthHeader
        currentScreen="signup"
        onNavigateSignIn={onNavigateSignIn}
        onNavigateSignUp={() => {}}
        onNavigateHome={onNavigateHome}
      />

      {/* 2. Main Account Selection Container */}
      <main className="flex-1 flex items-center justify-center p-3.5 sm:p-6 lg:p-8">
        <div className="max-w-5xl w-full grid md:grid-cols-12 bg-white rounded-3xl sm:rounded-[32px] border border-[#DCEBE5] shadow-[0_16px_50px_rgba(20,60,50,0.07)] overflow-hidden">
          {/* Left Branding Panel (approx 42% width) */}
          <div className="md:col-span-5 bg-gradient-to-br from-[#0F355C] via-[#0E425E] to-[#0B5C47] p-6 sm:p-8 lg:p-9 text-white flex flex-col justify-between relative overflow-hidden">
            {/* Ambient Lighting Accents */}
            <div className="absolute -top-12 -right-12 w-48 h-48 bg-[#12B981]/20 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-[#0D9488]/20 rounded-full blur-3xl pointer-events-none"></div>

            {/* Top Branding Section */}
            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md text-[11px] font-bold text-emerald-300 border border-white/15 mb-4">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>RapiDChecK • RuralHealth AI</span>
              </div>

              <h2 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight mb-2">
                Healthcare Support, Made Simple.
              </h2>
              <p className="text-xs sm:text-[13px] text-slate-200 leading-relaxed max-w-sm">
                Empowering rural communities with rapid symptom checks, verified hospital connections, and digital clinical collaboration.
              </p>
            </div>

            {/* Restrained Center Healthcare Artwork Panel */}
            <div className="relative z-10 my-5 sm:my-6">
              <div className="bg-white/95 rounded-2xl p-4 sm:p-5 shadow-lg border border-white/20 backdrop-blur-md flex flex-col items-center text-center">
                <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-2xl overflow-hidden mb-3 bg-emerald-50/60 p-2 flex items-center justify-center">
                  <img
                    src={logoImg}
                    alt="Community health worker assisting a rural resident"
                    className="w-full h-full object-contain drop-shadow-sm select-none"
                    loading="eager"
                  />
                </div>
                <div className="text-xs font-bold text-[#102A56]">
                  Doorstep Care & Community Health
                </div>
                <div className="text-[11px] text-[#52677F] mt-0.5 max-w-[240px]">
                  Connecting citizens, ASHA workers, and medical officers across rural India.
                </div>
              </div>
            </div>

            {/* Bottom Trust Indicators */}
            <div className="relative z-10 pt-4 border-t border-white/15 space-y-2">
              <div className="flex items-center gap-2.5 text-[11px] text-slate-200">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Encrypted medical records & data privacy</span>
              </div>
              <div className="flex items-center gap-2.5 text-[11px] text-slate-200">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Works offline in remote rural sub-centres</span>
              </div>
            </div>
          </div>

          {/* Right Account Selection Area (approx 58% width) */}
          <div className="md:col-span-7 p-6 sm:p-9 lg:p-10 flex flex-col justify-between bg-white">
            <div>
              {/* Back to Home Link */}
              <div className="mb-4">
                <button
                  type="button"
                  onClick={onNavigateHome}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[#126B55] hover:text-[#0A9F68] transition-colors cursor-pointer group"
                >
                  <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
                  <span>{authStrings.backToHome || 'Back to Home'}</span>
                </button>
              </div>

              {/* Main Heading & Supporting Text */}
              <div className="mb-6">
                <h1 className="text-2xl sm:text-3xl font-black text-[#102A56] tracking-tight leading-snug">
                  {authStrings.chooseHowYouWillUse || 'Choose How You’ll Use RapiDChecK'}
                </h1>
                <p className="text-xs sm:text-sm text-[#506780] mt-1.5 leading-relaxed">
                  {authStrings.roleSelectionSubtitle ||
                    'Select the option that best describes you. We’ll guide you to the right healthcare experience.'}
                </p>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <div className="text-xs font-extrabold uppercase tracking-wider text-[#126B55]">
                    {authStrings.identifyAccountType || 'Identify Your Account Type'}
                  </div>
                  <div className="text-[11px] text-[#52677F] font-medium">
                    {authStrings.chooseExperienceToContinue || 'Choose your experience to continue.'}
                  </div>
                </div>
              </div>

              {/* Incompatible Role Mismatch Notice */}
              {roleMismatchWarning && (
                <div
                  role="alert"
                  className="mb-5 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs animate-in fade-in duration-200"
                >
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="flex-1 space-y-2">
                      <p className="font-bold text-amber-950">
                        {authStrings.roleMismatchTitle || 'Account Role Notice'}
                      </p>
                      <p className="leading-relaxed text-amber-800">{roleMismatchWarning}</p>
                      <div className="flex items-center gap-3 pt-1">
                        <button
                          type="button"
                          onClick={handleSwitchAccount}
                          className="px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white font-bold text-[11px] shadow-xs cursor-pointer transition-colors"
                        >
                          Sign Out & Switch Account
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (user?.role === 'PATIENT') {
                              onSelectPatient();
                            } else {
                              onSelectProfessional();
                            }
                          }}
                          className="px-3 py-1.5 rounded-lg bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 font-bold text-[11px] cursor-pointer transition-colors"
                        >
                          Continue with Current Account
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Two Prominent Selection Cards */}
              <div className="space-y-4" role="radiogroup" aria-label="Account type selection">
                {/* ── OPTION ONE: Patient / General User ────────────────── */}
                <div
                  id="role-option-patient"
                  role="radio"
                  aria-checked={selectedRole === 'patient'}
                  tabIndex={0}
                  onClick={handlePatientClick}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handlePatientClick();
                    }
                  }}
                  className={`relative p-5 sm:p-6 rounded-2xl border-2 transition-all cursor-pointer select-none group text-left ${
                    selectedRole === 'patient'
                      ? 'border-[#10B981] bg-[#ECFDF5] ring-2 ring-[#10B981]/25 shadow-md'
                      : 'border-[#CCEADB] bg-[#F7FDF9] hover:bg-[#EFFBF4] hover:border-[#10B981] shadow-2xs hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    {/* Mint Icon Container */}
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-all ${
                        selectedRole === 'patient'
                          ? 'bg-[#10B981] text-white shadow-md shadow-emerald-500/20'
                          : 'bg-[#DCFCE7] text-[#0A9F68] group-hover:bg-[#10B981] group-hover:text-white'
                      }`}
                    >
                      <HeartHandshake className="w-6 h-6 stroke-[2.2]" />
                    </div>

                    {/* Card Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-base sm:text-lg font-black text-[#102A56] tracking-tight">
                          {authStrings.patientRoleTitle || 'I’m a Patient / General User'}
                        </h3>
                        <span
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                            selectedRole === 'patient'
                              ? 'border-[#10B981] bg-[#10B981]'
                              : 'border-slate-300 group-hover:border-[#10B981]'
                          }`}
                        >
                          {selectedRole === 'patient' && (
                            <span className="w-2 h-2 rounded-full bg-white"></span>
                          )}
                        </span>
                      </div>

                      <p className="text-xs sm:text-[13px] text-[#476078] leading-relaxed mt-1.5">
                        {authStrings.patientRoleDesc ||
                          'Check symptoms, access your health information, find nearby hospitals, and connect with healthcare services.'}
                      </p>

                      {/* Prominent Emerald Action Button */}
                      <div className="pt-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all shadow-xs ${
                            selectedRole === 'patient'
                              ? 'bg-[#10B981] text-white ring-2 ring-emerald-300'
                              : 'bg-[#E7F7F0] text-[#0A9F68] group-hover:bg-[#10B981] group-hover:text-white'
                          }`}
                        >
                          <span>{authStrings.continueAsPatient || 'Continue as Patient →'}</span>
                          <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── OPTION TWO: Healthcare Professional ───────────────── */}
                <div
                  id="role-option-professional"
                  role="radio"
                  aria-checked={selectedRole === 'professional'}
                  tabIndex={0}
                  onClick={handleProfessionalClick}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleProfessionalClick();
                    }
                  }}
                  className={`relative p-5 sm:p-6 rounded-2xl border-2 transition-all cursor-pointer select-none group text-left ${
                    selectedRole === 'professional'
                      ? 'border-[#2563EB] bg-[#EFF6FF] ring-2 ring-[#2563EB]/25 shadow-md'
                      : 'border-[#CCE1FA] bg-[#F8FAFC] hover:bg-[#F0F7FF] hover:border-[#2563EB] shadow-2xs hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    {/* Soft Blue Icon Container */}
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-all ${
                        selectedRole === 'professional'
                          ? 'bg-[#2563EB] text-white shadow-md shadow-blue-500/20'
                          : 'bg-[#DBEAFE] text-[#1D4ED8] group-hover:bg-[#2563EB] group-hover:text-white'
                      }`}
                    >
                      <Stethoscope className="w-6 h-6 stroke-[2.2]" />
                    </div>

                    {/* Card Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-base sm:text-lg font-black text-[#102A56] tracking-tight">
                          {authStrings.professionalRoleTitle || 'I’m a Healthcare Professional'}
                        </h3>
                        <span
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                            selectedRole === 'professional'
                              ? 'border-[#2563EB] bg-[#2563EB]'
                              : 'border-slate-300 group-hover:border-[#2563EB]'
                          }`}
                        >
                          {selectedRole === 'professional' && (
                            <span className="w-2 h-2 rounded-full bg-white"></span>
                          )}
                        </span>
                      </div>

                      <p className="text-xs sm:text-[13px] text-[#476078] leading-relaxed mt-1.5">
                        {authStrings.professionalRoleDesc ||
                          'Access clinical workflows, review patient assessments, manage referrals, and support community healthcare.'}
                      </p>

                      {/* Prominent Blue Action Button */}
                      <div className="pt-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all shadow-xs ${
                            selectedRole === 'professional'
                              ? 'bg-[#2563EB] text-white ring-2 ring-blue-300'
                              : 'bg-[#EBF3FE] text-[#1D4ED8] group-hover:bg-[#2563EB] group-hover:text-white'
                          }`}
                        >
                          <span>{authStrings.continueAsProfessional || 'Continue as Professional →'}</span>
                          <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Already have an account shortcut */}
              <div className="mt-6 text-center text-xs text-[#52677F]">
                <span>{authStrings.alreadyHaveAccount || 'Already have a registered account?'} </span>
                <button
                  type="button"
                  onClick={onNavigateSignIn}
                  className="font-bold text-[#126B55] hover:text-[#0FA36B] hover:underline cursor-pointer"
                >
                  {authStrings.signInBtn || 'Sign In to Portal'}
                </button>
              </div>
            </div>

            {/* Bottom Security & Policy Links */}
            <div className="pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-[#52677F]">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#10B981]" />
                <span>Verified RuralHealth Data Protection</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveModal('terms')}
                  className="hover:text-[#126B55] hover:underline cursor-pointer"
                >
                  {authStrings.termsOfService || 'Terms of Service'}
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={() => setActiveModal('privacy')}
                  className="hover:text-[#126B55] hover:underline cursor-pointer"
                >
                  {authStrings.privacyPolicy || 'Privacy Policy'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* 3. Accessible Policy Information Modal */}
      {activeModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 relative">
            <button
              type="button"
              onClick={() => setActiveModal(null)}
              aria-label="Close dialog"
              className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-[#12B981] flex items-center justify-center mb-3">
              <FileText className="w-5 h-5" />
            </div>

            <h3 className="text-lg font-black text-[#102A56] mb-2">
              {activeModal === 'terms' ? 'Terms of Service' : 'Privacy & Data Protection Policy'}
            </h3>
            <p className="text-xs text-[#52677F] leading-relaxed mb-4">
              {activeModal === 'terms'
                ? 'RapiDChecK — RuralHealth AI operates in accordance with national healthcare data governance guidelines, Ayushman Bharat Digital Mission (ABDM), and Primary Health Centre regulatory standards. Accounts are subject to role-based access verification.'
                : 'All patient vital checks, screening records, and teleconsultation schedules are encrypted at rest and in transit. Patient identity records are strictly confidential and only accessible by authorized healthcare workers and treating physicians.'}
            </p>

            <button
              type="button"
              onClick={() => setActiveModal(null)}
              className="w-full py-2.5 rounded-full bg-[#12B981] hover:bg-[#0FA36B] text-white text-xs font-bold cursor-pointer shadow-sm transition-all"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* 4. Minimal Accessible Footer */}
      <footer className="py-3 text-center text-xs text-[#52677F] bg-white/60 border-t border-slate-100">
        © 2026 RuralHealth AI. Healthy Communities • Brighter Futures.
      </footer>
    </div>
  );
};
