import React, { useState, useEffect } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { AuthHeader } from './AuthHeader';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Stethoscope,
  Users,
  HelpCircle,
  X,
  Loader2,
} from 'lucide-react';

export interface SignInPageProps {
  onSuccess: () => void;
  onNavigateSignUp: () => void;
  onNavigateHome: () => void;
  initialEmail?: string;
}

export const SignInPage: React.FC<SignInPageProps> = ({
  onSuccess,
  onNavigateSignUp,
  onNavigateHome,
  initialEmail = '',
}) => {
  const { loginWithDetails, isLoading } = useAuth();
  const { strings } = useLanguage();

  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Field validation errors
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Form submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);

  useEffect(() => {
    if (initialEmail) {
      setEmail(initialEmail);
    }
  }, [initialEmail]);

  const validateEmailFormat = (val: string): boolean => {
    const trimmed = val.trim();
    if (!trimmed) return false;
    // Standard RFC-compliant email regex
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
    return emailRegex.test(trimmed);
  };

  const handleEmailBlur = () => {
    if (!email.trim()) {
      setEmailError('Please enter your email address or username.');
    } else if (email.includes('@') && !validateEmailFormat(email)) {
      setEmailError('Please enter a valid email address (e.g. name@domain.com).');
    } else {
      setEmailError(null);
    }
  };

  const handlePasswordBlur = () => {
    if (!password) {
      setPasswordError('Please enter your password.');
    } else {
      setPasswordError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    // Validate fields
    let hasError = false;
    if (!email.trim()) {
      setEmailError('Please enter your email address or username.');
      hasError = true;
    } else if (email.includes('@') && !validateEmailFormat(email)) {
      setEmailError('Please enter a valid email address.');
      hasError = true;
    } else {
      setEmailError(null);
    }

    if (!password) {
      setPasswordError('Please enter your password.');
      hasError = true;
    } else {
      setPasswordError(null);
    }

    if (hasError || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const result = await loginWithDetails(email.trim(), password);

      if (result.success) {
        setIsSuccess(true);
        setTimeout(() => {
          onSuccess();
        }, 600);
      } else {
        setIsSuccess(false);
        if (result.status === 401) {
          setGeneralError('Invalid email/username or password credentials. Please verify your details.');
        } else if (result.status === 429) {
          setGeneralError('Too many failed login attempts. Account temporarily locked for 5 minutes for security.');
        } else if (result.status === 403) {
          setGeneralError('Your user account is deactivated. Please contact your system administrator.');
        } else if (result.status === 0) {
          setGeneralError(result.error || 'Network error: Unable to connect to the healthcare server. Please check your internet connection.');
        } else {
          setGeneralError(result.error || 'Authentication failed. Please try again.');
        }
      }
    } catch {
      setGeneralError('An unexpected network error occurred. Please verify your connection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickFill = (fillEmail: string, fillPass: string) => {
    setEmail(fillEmail);
    setPassword(fillPass);
    setEmailError(null);
    setPasswordError(null);
    setGeneralError(null);
  };

  return (
    <div className="min-h-screen bg-[#F4FBF8] text-[#12345B] flex flex-col justify-between selection:bg-[#12B981] selection:text-white">
      {/* 1. Header with Visual Reference Styling */}
      <AuthHeader
        currentScreen="signin"
        onNavigateSignIn={() => {}}
        onNavigateSignUp={onNavigateSignUp}
        onNavigateHome={onNavigateHome}
      />

      {/* 2. Main Authentication Container */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="max-w-4xl w-full grid md:grid-cols-12 bg-white rounded-3xl border border-[#DCEBE5] shadow-[0_12px_40px_rgba(20,60,50,0.06)] overflow-hidden">
          {/* Left Healthcare Context & Trust Column */}
          <div className="md:col-span-5 bg-gradient-to-br from-[#102A56] via-[#0F355C] to-[#0B5C44] p-6 sm:p-8 text-white flex flex-col justify-between relative overflow-hidden">
            {/* Ambient Backdrops */}
            <div className="absolute top-0 right-0 w-48 h-48 bg-[#12B981]/20 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#0D9488]/20 rounded-full blur-3xl pointer-events-none"></div>

            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md text-[11px] font-bold text-emerald-300 border border-white/15 mb-5">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Authorized Clinical Gateway</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight leading-snug mb-3">
                Bringing Smarter Healthcare to Every Village
              </h2>
              <p className="text-xs text-slate-200 leading-relaxed">
                Secure access for frontline ASHA workers, Primary Health Centre medical officers, and district health supervisors.
              </p>
            </div>

            <div className="relative z-10 space-y-2.5 my-6">
              <div className="flex items-center gap-2.5 text-xs text-slate-200 bg-white/8 backdrop-blur-md p-3 rounded-2xl border border-white/10">
                <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
                <span>Offline-first screening & Dexie storage</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-slate-200 bg-white/8 backdrop-blur-md p-3 rounded-2xl border border-white/10">
                <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
                <span>Role-Based Access for healthcare teams</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-slate-200 bg-white/8 backdrop-blur-md p-3 rounded-2xl border border-white/10">
                <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
                <span>ABDM / IDRC referral coordination</span>
              </div>
            </div>

            {/* Fast 1-Click Role Fillers for Development / Demo */}
            <div className="relative z-10 pt-4 border-t border-white/15">
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300/80 mb-2">
                Quick Test Credentials
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleQuickFill('dr.sharma@phc.in', 'doctor123')}
                  className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-left transition-all border border-white/10 group cursor-pointer"
                >
                  <div className="text-[11px] font-bold text-white group-hover:text-emerald-300 flex items-center gap-1">
                    <Stethoscope className="w-3 h-3 text-emerald-400" />
                    <span>Dr. Sharma</span>
                  </div>
                  <div className="text-[9px] text-slate-300">PHC Doctor</div>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickFill('anita.roy@health.gov.in', 'asha123')}
                  className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-left transition-all border border-white/10 group cursor-pointer"
                >
                  <div className="text-[11px] font-bold text-white group-hover:text-emerald-300 flex items-center gap-1">
                    <Users className="w-3 h-3 text-emerald-400" />
                    <span>Anita Roy</span>
                  </div>
                  <div className="text-[9px] text-slate-300">ASHA Worker</div>
                </button>
              </div>
            </div>
          </div>

          {/* Right Form Card Panel */}
          <div className="md:col-span-7 p-6 sm:p-9 flex flex-col justify-between bg-white">
            <div>
              {/* Form Header */}
              <div className="mb-6">
                <h1 className="text-2xl sm:text-3xl font-black text-[#102A56] tracking-tight">
                  {strings.auth.signInTitle || "Welcome back."}
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-1.5">
                  {strings.auth.signInSubtitle}
                </p>
              </div>

              {/* General Error Banner */}
              {generalError && (
                <div
                  role="alert"
                  className="mb-5 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-start gap-2.5 animate-in fade-in duration-200"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{generalError}</span>
                </div>
              )}

              {/* Sign In Form */}
              <form onSubmit={handleSubmit} noValidate className="space-y-4">
                {/* Email Address Field */}
                <div>
                  <label
                    htmlFor="signin-email"
                    className="block text-xs font-bold text-slate-700 mb-1.5"
                  >
                    {strings.auth.emailOrUsername} <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      id="signin-email"
                      type="text"
                      name="email"
                      autoComplete="username"
                      required
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (emailError) setEmailError(null);
                        if (generalError) setGeneralError(null);
                      }}
                      onBlur={handleEmailBlur}
                      placeholder="e.g. dr.sharma@phc.in or asha.anita"
                      disabled={isSubmitting || isLoading}
                      aria-invalid={Boolean(emailError)}
                      aria-describedby={emailError ? 'signin-email-error' : undefined}
                      className={`w-full pl-10 pr-3.5 py-2.5 sm:py-3 bg-slate-50/80 hover:bg-white focus:bg-white text-sm text-[#102A56] rounded-2xl border transition-all outline-none ${
                        emailError
                          ? 'border-rose-400 ring-2 ring-rose-100 focus:border-rose-500'
                          : 'border-slate-200 focus:border-[#12B981] focus:ring-2 focus:ring-[#12B981]/20'
                      }`}
                    />
                  </div>
                  {emailError && (
                    <p
                      id="signin-email-error"
                      role="alert"
                      className="mt-1.5 text-xs text-rose-600 font-medium flex items-center gap-1"
                    >
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      <span>{emailError}</span>
                    </p>
                  )}
                </div>

                {/* Password Field */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="signin-password"
                      className="block text-xs font-bold text-slate-700"
                    >
                      {strings.auth.password} <span className="text-rose-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowForgotModal(true)}
                      className="text-xs text-[#126B55] hover:text-[#0FA36B] hover:underline font-semibold cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      id="signin-password"
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (passwordError) setPasswordError(null);
                        if (generalError) setGeneralError(null);
                      }}
                      onBlur={handlePasswordBlur}
                      placeholder="••••••••"
                      disabled={isSubmitting || isLoading}
                      aria-invalid={Boolean(passwordError)}
                      aria-describedby={passwordError ? 'signin-password-error' : undefined}
                      className={`w-full pl-10 pr-11 py-2.5 sm:py-3 bg-slate-50/80 hover:bg-white focus:bg-white text-sm text-[#102A56] rounded-2xl border transition-all outline-none ${
                        passwordError
                          ? 'border-rose-400 ring-2 ring-rose-100 focus:border-rose-500'
                          : 'border-slate-200 focus:border-[#12B981] focus:ring-2 focus:ring-[#12B981]/20'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      tabIndex={0}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {passwordError && (
                    <p
                      id="signin-password-error"
                      role="alert"
                      className="mt-1.5 text-xs text-rose-600 font-medium flex items-center gap-1"
                    >
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      <span>{passwordError}</span>
                    </p>
                  )}
                </div>

                {/* Primary Emerald Submit Button */}
                <button
                  type="submit"
                  id="signin-submit-button"
                  disabled={isSubmitting || isLoading || isSuccess}
                  className={`w-full py-3.5 rounded-full text-white font-bold text-sm shadow-[0_4px_16px_rgba(18,185,129,0.25)] hover:shadow-[0_6px_22px_rgba(18,185,129,0.35)] transition-all flex items-center justify-center gap-2 cursor-pointer mt-4 ${
                    isSuccess
                      ? 'bg-emerald-600 ring-2 ring-emerald-400'
                      : 'bg-[#12B981] hover:bg-[#0FA36B] disabled:opacity-70 disabled:cursor-not-allowed'
                  }`}
                >
                  {isSubmitting || isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{strings.common.loading}</span>
                    </>
                  ) : isSuccess ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Authentication Verified! Opening...</span>
                    </>
                  ) : (
                    <>
                      <span>{strings.auth.signInBtn}</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Switch to Registration Experience */}
              <div className="mt-6 text-center text-xs text-slate-500">
                <span>{strings.auth.dontHaveAccount} </span>
                <button
                  type="button"
                  id="signin-switch-to-register"
                  onClick={onNavigateSignUp}
                  className="font-bold text-[#126B55] hover:text-[#0FA36B] hover:underline cursor-pointer"
                >
                  {strings.auth.signUpBtn}
                </button>
              </div>
            </div>

            {/* Bottom Security Note */}
            <div className="pt-6 border-t border-slate-100 text-center text-[11px] text-slate-400">
              RuralHealth AI Platform • End-to-End Encrypted Clinical Records
            </div>
          </div>
        </div>
      </main>

      {/* 3. Accessible Forgot Password Modal */}
      {showForgotModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="forgot-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 relative">
            <button
              type="button"
              onClick={() => setShowForgotModal(false)}
              aria-label="Close dialog"
              className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-[#12B981] flex items-center justify-center mb-4">
              <HelpCircle className="w-6 h-6" />
            </div>

            <h3 id="forgot-modal-title" className="text-lg font-black text-[#102A56] mb-2">
              Password Reset Assistance
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              In accordance with national healthcare data governance guidelines, credentials for RuralHealth AI are centrally managed by your Primary Health Centre (PHC) System Administrator or District Health IT Officer.
            </p>
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1 mb-5">
              <p className="font-semibold text-[#102A56]">To reset your password:</p>
              <p>• Contact your facility supervisor with your Health Worker ID</p>
              <p>• Email central health operations at <strong className="text-[#126B55]">admin@rapidcheck.org</strong></p>
            </div>

            <button
              type="button"
              onClick={() => setShowForgotModal(false)}
              className="w-full py-2.5 rounded-full bg-[#12B981] hover:bg-[#0FA36B] text-white text-xs font-bold shadow-sm"
            >
              Understood
            </button>
          </div>
        </div>
      )}

      {/* 4. Minimal Footer */}
      <footer className="py-3 text-center text-xs text-slate-400 bg-white/60 border-t border-slate-100">
        © 2026 RuralHealth AI. Healthy Communities • Brighter Futures.
      </footer>
    </div>
  );
};
