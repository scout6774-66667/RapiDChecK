import React, { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useLanguage } from '../../i18n/LanguageContext';
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
  HeartHandshake,
  Check,
  Loader2,
  Sparkles,
  Building2,
  Phone,
} from 'lucide-react';

export interface SignUpPageProps {
  onSuccess: (email: string) => void;
  onNavigateSignIn: (email?: string) => void;
  onNavigateHome: () => void;
}

export const SignUpPage: React.FC<SignUpPageProps> = ({
  onSuccess,
  onNavigateSignIn,
  onNavigateHome,
}) => {
  const { registerUser, isLoading } = useAuth();
  const { strings } = useLanguage();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Field-level error states
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [clinicNameError, setClinicNameError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Success state from actual backend response
  const [createdUser, setCreatedUser] = useState<{
    id: string;
    email: string;
    full_name: string;
    role: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateEmailFormat = (val: string): boolean => {
    const trimmed = val.trim();
    if (!trimmed) return false;
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
    return emailRegex.test(trimmed);
  };

  const handleNameBlur = () => {
    const trimmed = fullName.trim();
    if (!trimmed) {
      setNameError('Please enter your full name.');
    } else if (trimmed.length < 2) {
      setNameError('Full name must be at least 2 characters.');
    } else {
      setNameError(null);
    }
  };

  const handleEmailBlur = () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setEmailError('Please enter your email address.');
    } else if (!validateEmailFormat(trimmed)) {
      setEmailError('Please enter a valid email address (e.g. name@domain.com).');
    } else {
      setEmailError(null);
    }
  };

  const handleClinicNameBlur = () => {
    const trimmed = clinicName.trim();
    if (!trimmed) {
      setClinicNameError('Please enter your clinic or healthcare facility name.');
    } else if (trimmed.length < 3) {
      setClinicNameError('Clinic name must be at least 3 characters.');
    } else {
      setClinicNameError(null);
    }
  };

  const handlePasswordBlur = () => {
    if (!password) {
      setPasswordError('Please enter a password.');
    } else if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters in length.');
    } else {
      setPasswordError(null);
    }
  };

  const handleConfirmPasswordBlur = () => {
    if (!confirmPassword) {
      setConfirmPasswordError('Please confirm your password.');
    } else if (confirmPassword !== password) {
      setConfirmPasswordError('Passwords do not match.');
    } else {
      setConfirmPasswordError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    let hasError = false;

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setNameError('Please enter your full name.');
      hasError = true;
    } else if (trimmedName.length < 2) {
      setNameError('Full name must be at least 2 characters.');
      hasError = true;
    } else {
      setNameError(null);
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setEmailError('Please enter your email address.');
      hasError = true;
    } else if (!validateEmailFormat(trimmedEmail)) {
      setEmailError('Please enter a valid email address.');
      hasError = true;
    } else {
      setEmailError(null);
    }

    const trimmedClinic = clinicName.trim();
    if (!trimmedClinic) {
      setClinicNameError('Please enter your clinic or healthcare facility name.');
      hasError = true;
    } else if (trimmedClinic.length < 3) {
      setClinicNameError('Clinic name must be at least 3 characters.');
      hasError = true;
    } else {
      setClinicNameError(null);
    }

    if (!password) {
      setPasswordError('Please enter a password.');
      hasError = true;
    } else if (password.length < 8) {
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
      const res = await registerUser({
        full_name: trimmedName,
        email: trimmedEmail,
        password,
        clinic_name: trimmedClinic,
        phone: phone.trim() || undefined,
      });

      if (res.success && res.data) {
        setCreatedUser(res.data);
        onSuccess(trimmedEmail);
      } else {
        if (res.status === 409) {
          setEmailError('An account with this email address already exists. Please sign in instead.');
          setGeneralError('Duplicate account: An account with this email address already exists.');
        } else if (res.status === 400) {
          setGeneralError(res.error || 'Invalid registration details. Please check the form.');
        } else if (res.status === 0) {
          setGeneralError(res.error || 'Network error: Unable to connect to the healthcare server.');
        } else {
          setGeneralError(res.error || 'Registration failed. Please try again.');
        }
      }
    } catch {
      setGeneralError('An unexpected network error occurred. Please verify your connection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4FBF8] text-[#12345B] flex flex-col justify-between selection:bg-[#12B981] selection:text-white">
      {/* 1. Header with Visual Reference Styling */}
      <AuthHeader
        currentScreen="signup"
        onNavigateSignIn={() => onNavigateSignIn(email)}
        onNavigateSignUp={() => {}}
        onNavigateHome={onNavigateHome}
      />

      {/* 2. Main Registration Container */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="max-w-4xl w-full grid md:grid-cols-12 bg-white rounded-3xl border border-[#DCEBE5] shadow-[0_12px_40px_rgba(20,60,50,0.06)] overflow-hidden">
          {/* Left Context & Trust Panel */}
          <div className="md:col-span-5 bg-gradient-to-br from-[#102A56] via-[#0F355C] to-[#0B5C44] p-6 sm:p-8 text-white flex flex-col justify-between relative overflow-hidden">
            {/* Ambient Lighting */}
            <div className="absolute top-0 right-0 w-48 h-48 bg-[#12B981]/20 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#0D9488]/20 rounded-full blur-3xl pointer-events-none"></div>

            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md text-[11px] font-bold text-emerald-300 border border-white/15 mb-5">
                <HeartHandshake className="w-3.5 h-3.5" />
                <span>Join RuralHealth AI</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight leading-snug mb-3">
                Empowering Frontline Healthcare
              </h2>
              <p className="text-xs text-slate-200 leading-relaxed">
                Join thousands of community healthcare workers and clinicians delivering doorstep vital checks and AI-assisted triage to rural villages.
              </p>
            </div>

            <div className="relative z-10 space-y-2.5 my-6">
              <div className="flex items-center gap-2.5 text-xs text-slate-200 bg-white/8 backdrop-blur-md p-3 rounded-2xl border border-white/10">
                <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
                <span>Standard Frontline Health Worker provisioning</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-slate-200 bg-white/8 backdrop-blur-md p-3 rounded-2xl border border-white/10">
                <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
                <span>Immediate access to offline screening tools</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-slate-200 bg-white/8 backdrop-blur-md p-3 rounded-2xl border border-white/10">
                <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
                <span>Automatic data synchronization upon reconnection</span>
              </div>
            </div>

            {/* Governance & Privacy Notice */}
            <div className="relative z-10 pt-4 border-t border-white/15 text-[11px] text-slate-300">
              <span className="font-semibold text-emerald-300">Clinical Governance:</span> Public accounts are provisioned with standard frontline roles. Medical officer & admin privileges are provisioned via PHC administration.
            </div>
          </div>

          {/* Right Form Card Panel */}
          <div className="md:col-span-7 p-6 sm:p-9 flex flex-col justify-between bg-white">
            {createdUser ? (
              /* Success State: Rendered based on actual backend response */
              <div className="py-6 flex flex-col items-center text-center animate-in fade-in duration-300">
                <div className="w-16 h-16 rounded-full bg-emerald-100 text-[#12B981] flex items-center justify-center mb-4 shadow-sm">
                  <Check className="w-8 h-8 stroke-[3]" />
                </div>

                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200 mb-3">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Account Provisioned</span>
                </div>

                <h2 className="text-2xl font-black text-[#102A56] tracking-tight mb-2">
                  Account Created Successfully!
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 max-w-sm mb-6 leading-relaxed">
                  Welcome to RuralHealth AI, <strong className="text-[#102A56]">{createdUser.full_name}</strong>. Your account has been registered with role <strong className="text-[#126B55]">{createdUser.role}</strong>.
                </p>

                <div className="w-full bg-slate-50 rounded-2xl border border-slate-200 p-4 text-left text-xs space-y-2 mb-6">
                  <div className="flex justify-between py-1 border-b border-slate-200/60">
                    <span className="text-slate-500 font-medium">Full Name</span>
                    <span className="font-bold text-[#102A56]">{createdUser.full_name}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60">
                    <span className="text-slate-500 font-medium">Registered Email</span>
                    <span className="font-bold text-[#102A56]">{createdUser.email}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60">
                    <span className="text-slate-500 font-medium">Clinic Workspace</span>
                    <span className="font-bold text-[#126B55]">{clinicName || "Community Health Center"}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60">
                    <span className="text-slate-500 font-medium">Assigned Access</span>
                    <span className="font-bold text-[#102A56]">
                      {createdUser.role === 'CLINIC_OWNER' ? 'Clinic Owner / Medical Lead' : createdUser.role}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500 font-medium">Account ID</span>
                    <span className="font-mono text-slate-600 text-[11px] truncate max-w-[180px]">{createdUser.id}</span>
                  </div>
                </div>

                <button
                  type="button"
                  id="signup-proceed-to-signin"
                  onClick={() => onNavigateSignIn(createdUser.email)}
                  className="w-full py-3.5 rounded-full bg-[#12B981] hover:bg-[#0FA36B] text-white font-bold text-sm shadow-[0_4px_16px_rgba(18,185,129,0.25)] hover:shadow-[0_6px_22px_rgba(18,185,129,0.35)] transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Sign In to Your Workspace</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              /* Active Registration Form */
              <div>
                <div className="mb-6">
                  <h1 className="text-2xl sm:text-3xl font-black text-[#102A56] tracking-tight">
                    {strings.auth.signUpTitle || "Create your account."}
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-500 mt-1.5">
                    {strings.auth.signUpSubtitle}
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

                {/* Form with all required fields */}
                <form onSubmit={handleSubmit} noValidate className="space-y-3.5">
                  {/* 1. Full Name */}
                  <div>
                    <label
                      htmlFor="signup-name"
                      className="block text-xs font-bold text-slate-700 mb-1"
                    >
                      {strings.auth.fullName} <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <User className="w-4 h-4" />
                      </div>
                      <input
                        id="signup-name"
                        type="text"
                        name="name"
                        autoComplete="name"
                        required
                        value={fullName}
                        onChange={(e) => {
                          setFullName(e.target.value);
                          if (nameError) setNameError(null);
                        }}
                        onBlur={handleNameBlur}
                        placeholder="e.g. Dr. P. K. Sarkar"
                        disabled={isSubmitting || isLoading}
                        aria-invalid={Boolean(nameError)}
                        aria-describedby={nameError ? 'signup-name-error' : undefined}
                        className={`w-full pl-10 pr-3.5 py-2.5 bg-slate-50/80 hover:bg-white focus:bg-white text-sm text-[#102A56] rounded-2xl border transition-all outline-none ${
                          nameError
                            ? 'border-rose-400 ring-2 ring-rose-100 focus:border-rose-500'
                            : 'border-slate-200 focus:border-[#12B981] focus:ring-2 focus:ring-[#12B981]/20'
                        }`}
                      />
                    </div>
                    {nameError && (
                      <p
                        id="signup-name-error"
                        role="alert"
                        className="mt-1 text-xs text-rose-600 font-medium flex items-center gap-1"
                      >
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        <span>{nameError}</span>
                      </p>
                    )}
                  </div>

                  {/* 2. Professional Email Address */}
                  <div>
                    <label
                      htmlFor="signup-email"
                      className="block text-xs font-bold text-slate-700 mb-1"
                    >
                      {strings.auth.emailOrUsername} <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        id="signup-email"
                        type="email"
                        name="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (emailError) setEmailError(null);
                        }}
                        onBlur={handleEmailBlur}
                        placeholder="e.g. dr.sarkar@health.in"
                        disabled={isSubmitting || isLoading}
                        aria-invalid={Boolean(emailError)}
                        aria-describedby={emailError ? 'signup-email-error' : undefined}
                        className={`w-full pl-10 pr-3.5 py-2.5 bg-slate-50/80 hover:bg-white focus:bg-white text-sm text-[#102A56] rounded-2xl border transition-all outline-none ${
                          emailError
                            ? 'border-rose-400 ring-2 ring-rose-100 focus:border-rose-500'
                            : 'border-slate-200 focus:border-[#12B981] focus:ring-2 focus:ring-[#12B981]/20'
                        }`}
                      />
                    </div>
                    {emailError && (
                      <p
                        id="signup-email-error"
                        role="alert"
                        className="mt-1 text-xs text-rose-600 font-medium flex items-center gap-1"
                      >
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        <span>{emailError}</span>
                      </p>
                    )}
                  </div>

                  {/* 3. Clinic or Healthcare Facility Name */}
                  <div>
                    <label
                      htmlFor="signup-clinic"
                      className="block text-xs font-bold text-slate-700 mb-1"
                    >
                      Clinic or Healthcare Facility Name <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <input
                        id="signup-clinic"
                        type="text"
                        name="clinic"
                        required
                        value={clinicName}
                        onChange={(e) => {
                          setClinicName(e.target.value);
                          if (clinicNameError) setClinicNameError(null);
                        }}
                        onBlur={handleClinicNameBlur}
                        placeholder="e.g. Sarkar Community Health Clinic"
                        disabled={isSubmitting || isLoading}
                        aria-invalid={Boolean(clinicNameError)}
                        aria-describedby={clinicNameError ? 'signup-clinic-error' : undefined}
                        className={`w-full pl-10 pr-3.5 py-2.5 bg-slate-50/80 hover:bg-white focus:bg-white text-sm text-[#102A56] rounded-2xl border transition-all outline-none ${
                          clinicNameError
                            ? 'border-rose-400 ring-2 ring-rose-100 focus:border-rose-500'
                            : 'border-slate-200 focus:border-[#12B981] focus:ring-2 focus:ring-[#12B981]/20'
                        }`}
                      />
                    </div>
                    {clinicNameError && (
                      <p
                        id="signup-clinic-error"
                        role="alert"
                        className="mt-1 text-xs text-rose-600 font-medium flex items-center gap-1"
                      >
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        <span>{clinicNameError}</span>
                      </p>
                    )}
                  </div>

                  {/* 4. Contact Phone (Optional) */}
                  <div>
                    <label
                      htmlFor="signup-phone"
                      className="block text-xs font-bold text-slate-700 mb-1"
                    >
                      Contact Phone <span className="text-slate-400 font-normal">(Optional)</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Phone className="w-4 h-4" />
                      </div>
                      <input
                        id="signup-phone"
                        type="tel"
                        name="phone"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="e.g. +91 98765 43210"
                        disabled={isSubmitting || isLoading}
                        className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50/80 hover:bg-white focus:bg-white text-sm text-[#102A56] rounded-2xl border border-slate-200 focus:border-[#12B981] focus:ring-2 focus:ring-[#12B981]/20 transition-all outline-none"
                      />
                    </div>
                  </div>

                  {/* 3. Password */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label
                        htmlFor="signup-password"
                        className="block text-xs font-bold text-slate-700"
                      >
                        {strings.auth.password} <span className="text-rose-500">*</span>
                      </label>
                      <span className="text-[11px] text-slate-400 font-medium">Min 8 characters</span>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        id="signup-password"
                        type={showPassword ? 'text' : 'password'}
                        name="password"
                        autoComplete="new-password"
                        required
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (passwordError) setPasswordError(null);
                        }}
                        onBlur={handlePasswordBlur}
                        placeholder="••••••••"
                        disabled={isSubmitting || isLoading}
                        aria-invalid={Boolean(passwordError)}
                        aria-describedby={passwordError ? 'signup-password-error' : undefined}
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
                      <p
                        id="signup-password-error"
                        role="alert"
                        className="mt-1 text-xs text-rose-600 font-medium flex items-center gap-1"
                      >
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        <span>{passwordError}</span>
                      </p>
                    )}
                  </div>

                  {/* 4. Confirm Password */}
                  <div>
                    <label
                      htmlFor="signup-confirm-password"
                      className="block text-xs font-bold text-slate-700 mb-1"
                    >
                      {strings.auth.confirmPassword} <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        id="signup-confirm-password"
                        type={showConfirmPassword ? 'text' : 'password'}
                        name="confirmPassword"
                        autoComplete="new-password"
                        required
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          if (confirmPasswordError) setConfirmPasswordError(null);
                        }}
                        onBlur={handleConfirmPasswordBlur}
                        placeholder="••••••••"
                        disabled={isSubmitting || isLoading}
                        aria-invalid={Boolean(confirmPasswordError)}
                        aria-describedby={confirmPasswordError ? 'signup-confirm-error' : undefined}
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
                      <p
                        id="signup-confirm-error"
                        role="alert"
                        className="mt-1 text-xs text-rose-600 font-medium flex items-center gap-1"
                      >
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        <span>{confirmPasswordError}</span>
                      </p>
                    )}
                  </div>

                  {/* Primary Emerald CTA */}
                  <button
                    type="submit"
                    id="signup-submit-button"
                    disabled={isSubmitting || isLoading}
                    className="w-full py-3.5 rounded-full bg-[#12B981] hover:bg-[#0FA36B] disabled:opacity-70 disabled:cursor-not-allowed text-white font-bold text-sm shadow-[0_4px_16px_rgba(18,185,129,0.25)] hover:shadow-[0_6px_22px_rgba(18,185,129,0.35)] transition-all flex items-center justify-center gap-2 cursor-pointer mt-4"
                  >
                    {isSubmitting || isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{strings.common.loading}</span>
                      </>
                    ) : (
                      <>
                        <span>{strings.auth.signUpBtn}</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>

                {/* Switch to Sign In */}
                <div className="mt-5 text-center text-xs text-slate-500">
                  <span>{strings.auth.alreadyHaveAccount} </span>
                  <button
                    type="button"
                    id="signup-switch-to-signin"
                    onClick={() => onNavigateSignIn(email)}
                    className="font-bold text-[#126B55] hover:text-[#0FA36B] hover:underline cursor-pointer"
                  >
                    {strings.auth.signInBtn}
                  </button>
                </div>
              </div>
            )}

            {/* Bottom Security Note */}
            <div className="pt-5 border-t border-slate-100 text-center text-[11px] text-slate-400">
              RuralHealth AI Platform • Frontline Community Screening Network
            </div>
          </div>
        </div>
      </main>

      {/* 3. Minimal Footer */}
      <footer className="py-3 text-center text-xs text-slate-400 bg-white/60 border-t border-slate-100">
        © 2026 RuralHealth AI. Healthy Communities • Brighter Futures.
      </footer>
    </div>
  );
};
