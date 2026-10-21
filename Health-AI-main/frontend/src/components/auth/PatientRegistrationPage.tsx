import React, { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useLanguage } from '../../i18n';
import { AuthHeader } from './AuthHeader';
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  HeartHandshake,
  Check,
  Loader2,
  Sparkles,
  MapPin,
  Calendar,
  Phone,
} from 'lucide-react';

export interface PatientRegistrationPageProps {
  onSuccess: () => void;
  onNavigateSignIn: (email?: string) => void;
  onNavigateBack: () => void;
  onNavigateHome: () => void;
}

export const PatientRegistrationPage: React.FC<PatientRegistrationPageProps> = ({
  onSuccess,
  onNavigateSignIn,
  onNavigateBack,
  onNavigateHome,
}) => {
  const { registerUser, loginWithDetails, isLoading } = useAuth();
  const { strings } = useLanguage();
  const authStrings = strings?.auth || {};

  const [fullName, setFullName] = useState('');
  const [identifier, setIdentifier] = useState(''); // Email or phone
  const [phone, setPhone] = useState('');
  const [village, setVillage] = useState('Sonpur');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<'Male' | 'Female' | 'Other'>('Female');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Field validation errors
  const [nameError, setNameError] = useState<string | null>(null);
  const [identifierError, setIdentifierError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);

  const validateEmailFormat = (val: string): boolean => {
    const trimmed = val.trim();
    if (!trimmed) return false;
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
    return emailRegex.test(trimmed);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    let hasError = false;

    const trimmedName = fullName.trim();
    if (!trimmedName || trimmedName.length < 2) {
      setNameError('Please enter your full name (minimum 2 characters).');
      hasError = true;
    } else {
      setNameError(null);
    }

    const trimmedId = identifier.trim();
    if (!trimmedId) {
      setIdentifierError('Please enter your email address.');
      hasError = true;
    } else if (!validateEmailFormat(trimmedId)) {
      setIdentifierError('Please enter a valid email address (e.g. name@example.com).');
      hasError = true;
    } else {
      setIdentifierError(null);
    }

    if (!password || password.length < 8) {
      setPasswordError('Password must be at least 8 characters in length.');
      hasError = true;
    } else {
      setPasswordError(null);
    }

    if (!confirmPassword) {
      setConfirmPasswordError('Please confirm your password.');
      hasError = true;
    } else if (confirmPassword !== password) {
      setConfirmPasswordError('Passwords do not match.');
      hasError = true;
    } else {
      setConfirmPasswordError(null);
    }

    if (hasError || isSubmitting) return;

    setIsSubmitting(true);
    try {
      // 1. Call legitimate registerUser with role: 'PATIENT'
      const regRes = await registerUser({
        full_name: trimmedName,
        email: trimmedId,
        password,
        role: 'PATIENT',
        phone: phone.trim() || undefined,
        address: village ? `Village: ${village}` : undefined,
      });

      if (regRes.success) {
        setRegistrationSuccess(true);
        // Automatically authenticate user into session
        const loginRes = await loginWithDetails(trimmedId, password);
        if (loginRes.success) {
          setTimeout(() => {
            onSuccess();
          }, 800);
        } else {
          // If auto login encounters unexpected issue, allow 1-click continuation
          setTimeout(() => {
            onSuccess();
          }, 1200);
        }
      } else {
        if (regRes.status === 409) {
          setIdentifierError('An account with this email address already exists. Please sign in instead.');
          setGeneralError('Duplicate account: This email is already registered.');
        } else {
          setGeneralError(regRes.error || 'Registration failed. Please check your details and try again.');
        }
      }
    } catch {
      setGeneralError('Unable to connect to the registration service. Please verify your connection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4FBF8] text-[#12345B] flex flex-col justify-between selection:bg-[#12B981] selection:text-white">
      {/* 1. Header with Visual Reference Styling */}
      <AuthHeader
        currentScreen="signup"
        onNavigateSignIn={() => onNavigateSignIn(identifier)}
        onNavigateSignUp={() => {}}
        onNavigateHome={onNavigateHome}
      />

      {/* 2. Main Registration Container */}
      <main className="flex-1 flex items-center justify-center p-3.5 sm:p-6 lg:p-8">
        <div className="max-w-4xl w-full grid md:grid-cols-12 bg-white rounded-3xl border border-[#DCEBE5] shadow-[0_12px_40px_rgba(20,60,50,0.06)] overflow-hidden">
          {/* Left Context & Trust Panel */}
          <div className="md:col-span-5 bg-gradient-to-br from-[#0B5C47] via-[#0E4B5E] to-[#102A56] p-6 sm:p-8 text-white flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-[#12B981]/20 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#0D9488]/20 rounded-full blur-3xl pointer-events-none"></div>

            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md text-[11px] font-bold text-emerald-300 border border-white/15 mb-4">
                <HeartHandshake className="w-3.5 h-3.5 text-emerald-400" />
                <span>Patient & Citizen Portal</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight leading-snug mb-2">
                Your Health, in Your Hands
              </h2>
              <p className="text-xs text-slate-200 leading-relaxed">
                Check symptoms from home, connect with nearby doctors, and access your family health records anytime.
              </p>
            </div>

            <div className="relative z-10 space-y-2.5 my-6">
              <div className="flex items-center gap-2.5 text-xs text-slate-200 bg-white/8 backdrop-blur-md p-3 rounded-2xl border border-white/10">
                <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
                <span>Rapid AI symptom triage & red-flag alerts</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-slate-200 bg-white/8 backdrop-blur-md p-3 rounded-2xl border border-white/10">
                <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
                <span>Nearby Primary Health Centres & hospital directory</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-slate-200 bg-white/8 backdrop-blur-md p-3 rounded-2xl border border-white/10">
                <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
                <span>Confidential, secure, and always free for villagers</span>
              </div>
            </div>

            <div className="relative z-10 pt-4 border-t border-white/15 text-[11px] text-slate-300">
              <span className="font-semibold text-emerald-300">Privacy Guaranteed:</span> Your personal health information is strictly confidential and protected by national digital health protocols.
            </div>
          </div>

          {/* Right Form Card Panel */}
          <div className="md:col-span-7 p-6 sm:p-9 flex flex-col justify-between bg-white">
            {registrationSuccess ? (
              /* Success State */
              <div className="py-8 flex flex-col items-center text-center animate-in fade-in duration-300">
                <div className="w-16 h-16 rounded-full bg-emerald-100 text-[#12B981] flex items-center justify-center mb-4 shadow-sm">
                  <Check className="w-8 h-8 stroke-[3]" />
                </div>

                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200 mb-3">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Welcome to RuralHealth AI</span>
                </div>

                <h2 className="text-2xl font-black text-[#102A56] tracking-tight mb-2">
                  Account Created Successfully!
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 max-w-sm mb-6 leading-relaxed">
                  Welcome, <strong className="text-[#102A56]">{fullName}</strong>. Opening your personalized Patient Health Dashboard...
                </p>

                <button
                  type="button"
                  onClick={onSuccess}
                  className="w-full py-3.5 rounded-full bg-[#12B981] hover:bg-[#0FA36B] text-white font-bold text-sm shadow-[0_4px_16px_rgba(18,185,129,0.25)] hover:shadow-[0_6px_22px_rgba(18,185,129,0.35)] transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>{authStrings.continueToPatientDashboard || 'Go to Patient Dashboard →'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              /* Registration Form */
              <div>
                <div className="mb-2">
                  <button
                    type="button"
                    onClick={onNavigateBack}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#126B55] hover:text-[#0A9F68] transition-colors cursor-pointer group mb-3"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
                    <span>Change Account Type</span>
                  </button>
                </div>

                <div className="mb-5">
                  <h1 className="text-2xl sm:text-3xl font-black text-[#102A56] tracking-tight">
                    {authStrings.patientSignUpTitle || 'Create Your Health Account'}
                  </h1>
                  <p className="text-xs sm:text-sm text-[#506780] mt-1">
                    {authStrings.patientSignUpSubtitle ||
                      'Quick citizen access for symptom triage, health records, and hospital connectivity.'}
                  </p>
                </div>

                {generalError && (
                  <div
                    role="alert"
                    className="mb-4 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-start gap-2.5 animate-in fade-in duration-200"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{generalError}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit} noValidate className="space-y-3.5">
                  {/* Full Name */}
                  <div>
                    <label
                      htmlFor="patient-signup-name"
                      className="block text-xs font-bold text-slate-700 mb-1"
                    >
                      {authStrings.fullName || 'Full Legal Name'} <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <User className="w-4 h-4" />
                      </div>
                      <input
                        id="patient-signup-name"
                        type="text"
                        name="name"
                        autoComplete="name"
                        required
                        value={fullName}
                        onChange={(e) => {
                          setFullName(e.target.value);
                          if (nameError) setNameError(null);
                        }}
                        placeholder="e.g. Sunil Das"
                        disabled={isSubmitting || isLoading}
                        aria-invalid={Boolean(nameError)}
                        className={`w-full pl-10 pr-3.5 py-2.5 bg-slate-50/80 hover:bg-white focus:bg-white text-sm text-[#102A56] rounded-2xl border transition-all outline-none ${
                          nameError
                            ? 'border-rose-400 ring-2 ring-rose-100 focus:border-rose-500'
                            : 'border-slate-200 focus:border-[#12B981] focus:ring-2 focus:ring-[#12B981]/20'
                        }`}
                      />
                    </div>
                    {nameError && (
                      <p role="alert" className="mt-1 text-xs text-rose-600 font-medium">
                        {nameError}
                      </p>
                    )}
                  </div>

                  {/* Email Identifier */}
                  <div>
                    <label
                      htmlFor="patient-signup-email"
                      className="block text-xs font-bold text-slate-700 mb-1"
                    >
                      Email Address <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        id="patient-signup-email"
                        type="email"
                        name="email"
                        autoComplete="email"
                        required
                        value={identifier}
                        onChange={(e) => {
                          setIdentifier(e.target.value);
                          if (identifierError) setIdentifierError(null);
                        }}
                        placeholder="e.g. sunil.das@citizen.in"
                        disabled={isSubmitting || isLoading}
                        aria-invalid={Boolean(identifierError)}
                        className={`w-full pl-10 pr-3.5 py-2.5 bg-slate-50/80 hover:bg-white focus:bg-white text-sm text-[#102A56] rounded-2xl border transition-all outline-none ${
                          identifierError
                            ? 'border-rose-400 ring-2 ring-rose-100 focus:border-rose-500'
                            : 'border-slate-200 focus:border-[#12B981] focus:ring-2 focus:ring-[#12B981]/20'
                        }`}
                      />
                    </div>
                    {identifierError && (
                      <p role="alert" className="mt-1 text-xs text-rose-600 font-medium">
                        {identifierError}
                      </p>
                    )}
                  </div>

                  {/* Village & Phone Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="patient-signup-village"
                        className="block text-xs font-bold text-slate-700 mb-1"
                      >
                        {authStrings.villageOrTown || 'Village or Town'}
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                          <MapPin className="w-4 h-4" />
                        </div>
                        <input
                          id="patient-signup-village"
                          type="text"
                          value={village}
                          onChange={(e) => setVillage(e.target.value)}
                          placeholder="e.g. Sonpur or Bishnupur"
                          disabled={isSubmitting || isLoading}
                          className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50/80 hover:bg-white focus:bg-white text-sm text-[#102A56] rounded-2xl border border-slate-200 focus:border-[#12B981] focus:ring-2 focus:ring-[#12B981]/20 transition-all outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="patient-signup-phone"
                        className="block text-xs font-bold text-slate-700 mb-1"
                      >
                        Mobile Phone <span className="text-slate-400 font-normal">(Optional)</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                          <Phone className="w-4 h-4" />
                        </div>
                        <input
                          id="patient-signup-phone"
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="e.g. +91 98765 43210"
                          disabled={isSubmitting || isLoading}
                          className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50/80 hover:bg-white focus:bg-white text-sm text-[#102A56] rounded-2xl border border-slate-200 focus:border-[#12B981] focus:ring-2 focus:ring-[#12B981]/20 transition-all outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Age & Gender Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="patient-signup-age"
                        className="block text-xs font-bold text-slate-700 mb-1"
                      >
                        Age <span className="text-slate-400 font-normal">(Years)</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                          <Calendar className="w-4 h-4" />
                        </div>
                        <input
                          id="patient-signup-age"
                          type="number"
                          min="0"
                          max="120"
                          value={age}
                          onChange={(e) => setAge(e.target.value)}
                          placeholder="e.g. 32"
                          disabled={isSubmitting || isLoading}
                          className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50/80 hover:bg-white focus:bg-white text-sm text-[#102A56] rounded-2xl border border-slate-200 focus:border-[#12B981] focus:ring-2 focus:ring-[#12B981]/20 transition-all outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="patient-signup-gender"
                        className="block text-xs font-bold text-slate-700 mb-1"
                      >
                        Gender
                      </label>
                      <select
                        id="patient-signup-gender"
                        value={gender}
                        onChange={(e) => setGender(e.target.value as 'Male' | 'Female' | 'Other')}
                        disabled={isSubmitting || isLoading}
                        className="w-full px-3.5 py-2.5 bg-slate-50/80 hover:bg-white focus:bg-white text-sm text-[#102A56] rounded-2xl border border-slate-200 focus:border-[#12B981] focus:ring-2 focus:ring-[#12B981]/20 transition-all outline-none"
                      >
                        <option value="Female">Female</option>
                        <option value="Male">Male</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>

                  {/* Password Field */}
                  <div>
                    <label
                      htmlFor="patient-signup-password"
                      className="block text-xs font-bold text-slate-700 mb-1"
                    >
                      {authStrings.password || 'Password'} <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        id="patient-signup-password"
                        type={showPassword ? 'text' : 'password'}
                        name="password"
                        autoComplete="new-password"
                        required
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (passwordError) setPasswordError(null);
                        }}
                        placeholder="Min 8 characters"
                        disabled={isSubmitting || isLoading}
                        aria-invalid={Boolean(passwordError)}
                        className={`w-full pl-10 pr-11 py-2.5 bg-slate-50/80 hover:bg-white focus:bg-white text-sm text-[#102A56] rounded-2xl border transition-all outline-none ${
                          passwordError
                            ? 'border-rose-400 ring-2 ring-rose-100 focus:border-rose-500'
                            : 'border-slate-200 focus:border-[#12B981] focus:ring-2 focus:ring-[#12B981]/20'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {passwordError && (
                      <p role="alert" className="mt-1 text-xs text-rose-600 font-medium">
                        {passwordError}
                      </p>
                    )}
                  </div>

                  {/* Confirm Password Field */}
                  <div>
                    <label
                      htmlFor="patient-signup-confirm-password"
                      className="block text-xs font-bold text-slate-700 mb-1"
                    >
                      {authStrings.confirmPassword || 'Confirm Password'} <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        id="patient-signup-confirm-password"
                        type={showConfirmPassword ? 'text' : 'password'}
                        name="confirmPassword"
                        autoComplete="new-password"
                        required
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          if (confirmPasswordError) setConfirmPasswordError(null);
                        }}
                        placeholder="Re-enter your password"
                        disabled={isSubmitting || isLoading}
                        aria-invalid={Boolean(confirmPasswordError)}
                        className={`w-full pl-10 pr-11 py-2.5 bg-slate-50/80 hover:bg-white focus:bg-white text-sm text-[#102A56] rounded-2xl border transition-all outline-none ${
                          confirmPasswordError
                            ? 'border-rose-400 ring-2 ring-rose-100 focus:border-rose-500'
                            : 'border-slate-200 focus:border-[#12B981] focus:ring-2 focus:ring-[#12B981]/20'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {confirmPasswordError && (
                      <p role="alert" className="mt-1 text-xs text-rose-600 font-medium">
                        {confirmPasswordError}
                      </p>
                    )}
                  </div>

                  {/* Primary CTA Button */}
                  <button
                    type="submit"
                    id="patient-register-submit"
                    disabled={isSubmitting || isLoading}
                    className="w-full py-3.5 rounded-full bg-[#12B981] hover:bg-[#0FA36B] disabled:opacity-70 disabled:cursor-not-allowed text-white font-bold text-sm shadow-[0_4px_16px_rgba(18,185,129,0.25)] hover:shadow-[0_6px_22px_rgba(18,185,129,0.35)] transition-all flex items-center justify-center gap-2 cursor-pointer mt-4"
                  >
                    {isSubmitting || isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Creating Your Account...</span>
                      </>
                    ) : (
                      <>
                        <span>Register as Patient →</span>
                      </>
                    )}
                  </button>
                </form>

                <div className="mt-5 text-center text-xs text-[#52677F]">
                  <span>{authStrings.alreadyHaveAccount || 'Already have a registered account?'} </span>
                  <button
                    type="button"
                    onClick={() => onNavigateSignIn(identifier)}
                    className="font-bold text-[#126B55] hover:text-[#0FA36B] hover:underline cursor-pointer"
                  >
                    {authStrings.signInBtn || 'Sign In to Portal'}
                  </button>
                </div>
              </div>
            )}

            <div className="pt-5 border-t border-slate-100 text-center text-[11px] text-slate-400">
              RuralHealth AI Platform • Patient & Citizen Healthcare Services
            </div>
          </div>
        </div>
      </main>

      {/* 3. Minimal Footer */}
      <footer className="py-3 text-center text-xs text-[#52677F] bg-white/60 border-t border-slate-100">
        © 2026 RuralHealth AI. Healthy Communities • Brighter Futures.
      </footer>
    </div>
  );
};
