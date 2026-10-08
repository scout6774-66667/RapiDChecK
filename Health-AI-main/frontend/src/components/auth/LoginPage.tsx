import React, { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { RuralHealthLogo } from '../brand/RuralHealthLogo';
import { useLanguage, type Language } from '../../i18n';
import {
  Lock,
  User,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Stethoscope,
  Users,
  Building2,
  AlertCircle,
  Sparkles,
  CheckCircle2,
  Globe,
  ChevronDown,
} from 'lucide-react';

interface LoginPageProps {
  onSuccess: () => void;
  onBackToHome: () => void;
  lang?: Language;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onSuccess,
  onBackToHome,
  lang: propLang,
}) => {
  const { login, isLoading } = useAuth();
  const { language: contextLang, setLanguage } = useLanguage();
  const lang = propLang || contextLang;

  const [showLangMenu, setShowLangMenu] = useState(false);
  const [username, setUsername] = useState('dr.sharma');
  const [password, setPassword] = useState('doctor123');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const getLanguageLabel = (code: Language) => {
    switch (code) {
      case 'hi':
        return 'हिन्दी';
      case 'bn':
        return 'বাংলা';
      case 'en':
      default:
        return 'English';
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!username.trim() || !password.trim()) {
      setErrorMsg(
        lang === 'hi'
          ? 'कृपया उपयोगकर्ता नाम और पासवर्ड दोनों दर्ज करें।'
          : lang === 'bn'
          ? 'অনুগ্রহ করে ব্যবহারকারীর নাম এবং পাসওয়ার্ড উভয়ই লিখুন।'
          : 'Please enter both username and password.'
      );
      return;
    }

    const success = await login(username.trim(), password.trim());
    if (success) {
      onSuccess();
    } else {
      setErrorMsg(
        lang === 'hi'
          ? 'अमान्य क्रेडेंशियल्स। कृपया उपयोगकर्ता नाम और पासवर्ड सत्यापित करें।'
          : lang === 'bn'
          ? 'অবৈধ প্রমাণপত্র। ব্যবহারকারীর নাম এবং পাসওয়ার্ড যাচাই করুন।'
          : 'Invalid credentials. Please verify username and password.'
      );
    }
  };

  const handleQuickLogin = async (demoUser: string, demoPass: string) => {
    setUsername(demoUser);
    setPassword(demoPass);
    setErrorMsg(null);
    const success = await login(demoUser, demoPass);
    if (success) {
      onSuccess();
    } else {
      setErrorMsg(
        lang === 'hi'
          ? 'लॉगिन विफल रहा। सर्वर या क्रेडेंशियल्स जांचें।'
          : lang === 'bn'
          ? 'লগইন ব্যর্থ হয়েছে। সার্ভার বা প্রমাণপত্র পরীক্ষা করুন।'
          : 'Login failed. Check server or credentials.'
      );
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F9FA] text-[#102A56] flex flex-col justify-between selection:bg-[#059669] selection:text-white">
      {/* Top Header with Back Link & Language Dropdown */}
      <header className="bg-white border-b border-[#E5EEF1] px-4 sm:px-8 py-3.5 flex items-center justify-between sticky top-0 z-30 shadow-2xs">
        <button
          onClick={onBackToHome}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold text-slate-600 hover:text-[#102A56] hover:bg-slate-100 transition-all cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>
            {lang === 'hi' ? 'होमपेज पर वापस जाएं' : lang === 'bn' ? 'হোমপেজে ফিরে যান' : 'Back to Homepage'}
          </span>
        </button>

        <RuralHealthLogo size="sm" showTagline={false} />

        <div className="flex items-center gap-3">
          {/* Language Selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowLangMenu(!showLangMenu)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#D7E7E1] hover:border-[#AFCFC3] text-xs font-semibold text-[#27435F] bg-[#F8FCFA] hover:bg-white transition-all cursor-pointer shadow-2xs"
              aria-label="Select language"
            >
              <Globe className="w-3.5 h-3.5 text-[#0FA36B]" />
              <span>{getLanguageLabel(lang)}</span>
              <ChevronDown className="w-3 h-3 text-[#52677F]" />
            </button>

            {showLangMenu && (
              <div className="absolute right-0 mt-2 w-40 bg-white rounded-2xl shadow-xl border border-[#DCEBE5] py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                <button
                  type="button"
                  onClick={() => {
                    setLanguage('en');
                    setShowLangMenu(false);
                  }}
                  className={`w-full text-left px-4 py-2 text-xs font-semibold hover:bg-[#F0F8F5] ${
                    lang === 'en' ? 'text-[#0FA36B] font-bold bg-[#E8F8F2]' : 'text-[#27435F]'
                  }`}
                >
                  English
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLanguage('hi');
                    setShowLangMenu(false);
                  }}
                  className={`w-full text-left px-4 py-2 text-xs font-semibold hover:bg-[#F0F8F5] ${
                    lang === 'hi' ? 'text-[#0FA36B] font-bold bg-[#E8F8F2]' : 'text-[#27435F]'
                  }`}
                >
                  हिन्दी (Hindi)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLanguage('bn');
                    setShowLangMenu(false);
                  }}
                  className={`w-full text-left px-4 py-2 text-xs font-semibold hover:bg-[#F0F8F5] ${
                    lang === 'bn' ? 'text-[#0FA36B] font-bold bg-[#E8F8F2]' : 'text-[#27435F]'
                  }`}
                >
                  বাংলা (Bengali)
                </button>
              </div>
            )}
          </div>

          <div className="text-xs font-semibold text-slate-500 hidden sm:flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#059669]" />
            <span>
              {lang === 'hi'
                ? 'सुरक्षित क्लिनिकल गेटवे'
                : lang === 'bn'
                ? 'সুরক্ষিত ক্লিনিকাল গেটওয়ে'
                : 'Secure Clinical Gateway'}
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="max-w-4xl w-full grid md:grid-cols-12 bg-white rounded-3xl border border-[#E5EEF1] shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          {/* Left Hero / Context Panel */}
          <div className="md:col-span-5 bg-gradient-to-br from-[#102A56] via-[#0F3660] to-[#065F46] p-6 sm:p-8 text-white flex flex-col justify-between relative overflow-hidden">
            {/* Ambient Lighting */}
            <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-400/15 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-400/15 rounded-full blur-3xl pointer-events-none"></div>

            <div className="relative z-10">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-[11px] font-bold text-emerald-300 border border-white/15 mb-4">
                <Sparkles className="w-3.5 h-3.5" />
                Community Health Portal
              </div>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight mb-3">
                Bringing Smarter Healthcare to Every Village
              </h2>
              <p className="text-xs text-slate-200 leading-relaxed">
                Sign in to access patient screening records, clinical risk matrix, IDRC referral tracking, and teleconsultation scheduling.
              </p>
            </div>

            <div className="relative z-10 space-y-3 my-6">
              <div className="flex items-center gap-2 text-xs text-slate-200 bg-white/10 backdrop-blur-md p-2.5 rounded-xl border border-white/10">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Offline-first IndexedDB persistence</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-200 bg-white/10 backdrop-blur-md p-2.5 rounded-xl border border-white/10">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Role-Based Access for frontline workers</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-200 bg-white/10 backdrop-blur-md p-2.5 rounded-xl border border-white/10">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Local Gemma AI health assistance</span>
              </div>
            </div>

            <div className="relative z-10 pt-4 border-t border-white/15 text-[11px] text-slate-300">
              Healthy Villages • Stronger Communities
            </div>
          </div>

          {/* Right Form Panel */}
          <div className="md:col-span-7 p-6 sm:p-8 flex flex-col justify-between">
            <div>
              <div className="mb-6">
                <h1 className="text-2xl font-black text-[#102A56] tracking-tight">
                  {lang === 'hi' ? 'RuralHealth AI में साइन इन करें' : lang === 'bn' ? 'RuralHealth AI-এ সাইন ইন করুন' : 'Sign In to RuralHealth AI'}
                </h1>
                <p className="text-xs text-slate-500 mt-1">
                  {lang === 'hi'
                    ? 'अपनी साख दर्ज करें या त्वरित पहुंच के लिए एक फ्रंटलाइन भूमिका चुनें।'
                    : lang === 'bn'
                    ? 'আপনার প্রমাণপত্র লিখুন বা দ্রুত অ্যাক্সেসের জন্য একটি ফ্রন্টলাইন ভূমিকা চয়ন করুন।'
                    : 'Enter your credentials or choose a quick-access frontline role.'}
                </p>
              </div>

              {/* Error Message */}
              {errorMsg && (
                <div className="mb-5 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Standard Login Form */}
              <form onSubmit={handleFormSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    {lang === 'hi' ? 'उपयोगकर्ता नाम / स्वास्थ्य आईडी' : lang === 'bn' ? 'ব্যবহারকারীর নাম / স্বাস্থ্য আইডি' : 'Username / Health ID'}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <User className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g. dr.sharma or asha.anita"
                      className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 hover:bg-white focus:bg-white text-sm text-[#102A56] rounded-xl border border-slate-200 focus:border-[#059669] focus:ring-2 focus:ring-[#059669]/20 outline-none transition-all"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-700">
                      {lang === 'hi' ? 'पासवर्ड' : lang === 'bn' ? 'পাসওয়ার্ড' : 'Password'}
                    </label>
                    <span className="text-[11px] text-[#2563EB] hover:underline cursor-pointer">
                      {lang === 'hi' ? 'पासवर्ड भूल गए?' : lang === 'bn' ? 'পাসওয়ার্ড ভুলে গেছেন?' : 'Forgot Password?'}
                    </span>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 hover:bg-white focus:bg-white text-sm text-[#102A56] rounded-xl border border-slate-200 focus:border-[#059669] focus:ring-2 focus:ring-[#059669]/20 outline-none transition-all"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 rounded-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 mt-2"
                >
                  {isLoading ? (
                    <span>
                      {lang === 'hi' ? 'प्रमाणीकरण हो रहा है...' : lang === 'bn' ? 'যাচাই করা হচ্ছে...' : 'Authenticating...'}
                    </span>
                  ) : (
                    <>
                      <span>
                        {lang === 'hi' ? 'साइन इन करें और डैशबोर्ड खोलें' : lang === 'bn' ? 'সাইন ইন করুন ও ড্যাশবোর্ড খুলুন' : 'Sign In & Open Dashboard'}
                      </span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Fast 1-Click Role Switcher */}
              <div className="mt-6 pt-5 border-t border-slate-100">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">
                  {lang === 'hi' ? 'त्वरित डेमो भूमिकाएँ' : lang === 'bn' ? 'দ্রুত ডেমো ভূমিকা' : 'Quick Access Demo Roles'}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleQuickLogin('dr.sharma', 'doctor123')}
                    className="p-2.5 rounded-xl border border-slate-200 hover:border-[#2563EB] hover:bg-blue-50/50 text-left transition-all group"
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#102A56] group-hover:text-[#2563EB]">
                      <Stethoscope className="w-3.5 h-3.5 text-[#2563EB]" />
                      <span>Dr. Rajesh Sharma</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">PHC Medical Officer</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleQuickLogin('asha.anita', 'asha123')}
                    className="p-2.5 rounded-xl border border-slate-200 hover:border-[#059669] hover:bg-emerald-50/50 text-left transition-all group"
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#102A56] group-hover:text-[#059669]">
                      <Users className="w-3.5 h-3.5 text-[#059669]" />
                      <span>Anita Roy (ASHA)</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Frontline Health Worker</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleQuickLogin('officer.patel', 'officer123')}
                    className="p-2.5 rounded-xl border border-slate-200 hover:border-amber-500 hover:bg-amber-50/50 text-left transition-all group"
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#102A56] group-hover:text-amber-600">
                      <Building2 className="w-3.5 h-3.5 text-amber-500" />
                      <span>Dr. V. K. Patel</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">District CMO</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleQuickLogin('admin', 'admin123')}
                    className="p-2.5 rounded-xl border border-slate-200 hover:border-purple-500 hover:bg-purple-50/50 text-left transition-all group"
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#102A56] group-hover:text-purple-600">
                      <ShieldCheck className="w-3.5 h-3.5 text-purple-500" />
                      <span>Administrator</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">System Admin</div>
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-4 text-center">
              <span className="text-xs text-slate-400">
                {lang === 'hi'
                  ? 'ऑफ़लाइन मोड समर्थित • स्थानीय SQLite / IndexedDB सिंक'
                  : lang === 'bn'
                  ? 'অফলাইন মোড সমর্থিত • স্থানীয় SQLite / IndexedDB সিঙ্ক'
                  : 'Offline Mode Supported • Local SQLite / IndexedDB Sync'}
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* Simple Footer */}
      <footer className="py-3 text-center text-xs text-slate-400 border-t border-slate-200 bg-white">
        © 2026 RuralHealth AI. Healthy Villages • Stronger Communities.
      </footer>
    </div>
  );
};
