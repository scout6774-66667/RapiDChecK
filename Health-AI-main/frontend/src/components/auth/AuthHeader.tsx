import React, { useState } from 'react';
import { RuralHealthLogo } from '../brand/RuralHealthLogo';
import { useLanguage, type Language } from '../../i18n';
import { Globe, ChevronDown, CheckCircle2, ShieldCheck, ArrowRight, Menu, X } from 'lucide-react';

export interface AuthHeaderProps {
  currentScreen?: 'signin' | 'signup' | 'home';
  onNavigateSignIn?: () => void;
  onNavigateSignUp?: () => void;
  onNavigateHome?: () => void;
}

export const AuthHeader: React.FC<AuthHeaderProps> = ({
  currentScreen,
  onNavigateSignIn,
  onNavigateSignUp,
  onNavigateHome,
}) => {
  const { language, setLanguage, strings } = useLanguage();
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  const handleLogoClick = () => {
    if (onNavigateHome) {
      onNavigateHome();
    } else {
      window.location.href = '/';
    }
  };

  const handleSignInClick = () => {
    setMobileMenuOpen(false);
    if (onNavigateSignIn) {
      onNavigateSignIn();
    }
  };

  const handleSignUpClick = () => {
    setMobileMenuOpen(false);
    if (onNavigateSignUp) {
      onNavigateSignUp();
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full px-3 sm:px-6 lg:px-10 pt-3 sm:pt-4 pointer-events-none">
      <div className="max-w-[1720px] mx-auto h-20 sm:h-[84px] bg-white/92 backdrop-blur-2xl border border-[#12345B]/10 shadow-[0_8px_30px_rgba(30,80,70,0.06)] rounded-[26px] sm:rounded-[34px] px-4 sm:px-7 lg:px-8 flex items-center justify-between pointer-events-auto transition-all duration-300">
        {/* Left: Brand Logo & Tagline */}
        <div
          className="cursor-pointer select-none"
          onClick={handleLogoClick}
          role="button"
          tabIndex={0}
          aria-label="Return to RuralHealth AI home"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleLogoClick();
            }
          }}
        >
          <RuralHealthLogo size="md" theme="light" />
        </div>

        {/* Center: Subtle Clinical Gateway Security Badge (Desktop) */}
        <div className="hidden md:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#EBF7F2] border border-[#CDECE0] text-xs font-semibold text-[#0E7A53]">
          <ShieldCheck className="w-3.5 h-3.5 text-[#10B981]" />
          <span>Official RuralHealth AI Portal</span>
          <span className="text-slate-300">•</span>
          <span className="text-[#304A67] font-medium text-[11px]">Govt. & Frontline Health Network</span>
        </div>

        {/* Right: Language Selector + Sign In + Get Started CTA */}
        <div className="hidden sm:flex items-center gap-3">
          {/* Language Selector Dropdown */}
          <div className="relative">
            <button
              type="button"
              id="header-language-toggle"
              onClick={() => setShowLangMenu(!showLangMenu)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-[#D7E7E1] hover:border-[#AFCFC3] text-xs font-semibold text-[#27435F] bg-[#F8FCFA] hover:bg-white transition-all cursor-pointer shadow-2xs focus:outline-none focus:ring-2 focus:ring-[#12B981]"
              aria-label="Select language"
              aria-haspopup="listbox"
              aria-expanded={showLangMenu}
            >
              <Globe className="w-3.5 h-3.5 text-[#0FA36B]" />
              <span>{getLanguageLabel(language)}</span>
              <ChevronDown className="w-3 h-3 text-[#52677F]" />
            </button>

            {showLangMenu && (
              <div
                className="absolute right-0 mt-2 w-44 bg-white rounded-2xl shadow-xl border border-[#DCEBE5] py-2 z-50 animate-in fade-in zoom-in-95 duration-150"
                role="listbox"
              >
                <button
                  type="button"
                  onClick={() => {
                    setLanguage('en');
                    setShowLangMenu(false);
                  }}
                  className={`w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-[#F0F8F5] transition-colors flex items-center justify-between ${
                    language === 'en' ? 'text-[#0FA36B] font-bold bg-[#E8F8F2]' : 'text-[#27435F]'
                  }`}
                >
                  <span>English</span>
                  {language === 'en' && <CheckCircle2 className="w-3.5 h-3.5 text-[#0FA36B]" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLanguage('hi');
                    setShowLangMenu(false);
                  }}
                  className={`w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-[#F0F8F5] transition-colors flex items-center justify-between ${
                    language === 'hi' ? 'text-[#0FA36B] font-bold bg-[#E8F8F2]' : 'text-[#27435F]'
                  }`}
                >
                  <span>हिन्दी (Hindi)</span>
                  {language === 'hi' && <CheckCircle2 className="w-3.5 h-3.5 text-[#0FA36B]" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLanguage('bn');
                    setShowLangMenu(false);
                  }}
                  className={`w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-[#F0F8F5] transition-colors flex items-center justify-between ${
                    language === 'bn' ? 'text-[#0FA36B] font-bold bg-[#E8F8F2]' : 'text-[#27435F]'
                  }`}
                >
                  <span>বাংলা (Bengali)</span>
                  {language === 'bn' && <CheckCircle2 className="w-3.5 h-3.5 text-[#0FA36B]" />}
                </button>
              </div>
            )}
          </div>

          {/* Sign In button */}
          <button
            type="button"
            id="header-signin-button"
            onClick={handleSignInClick}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full border text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              currentScreen === 'signin'
                ? 'border-[#12B981] bg-[#E8F8F2] text-[#0A9F68] font-bold shadow-xs'
                : 'border-[#BFD5CD] hover:border-[#0FA36B] text-[#183D5A] hover:bg-[#F0F8F5] bg-white/80'
            }`}
          >
            <span>{strings?.nav?.signIn || 'Sign In'}</span>
          </button>

          {/* Get Started primary emerald CTA */}
          <button
            type="button"
            id="header-get-started-button"
            onClick={handleSignUpClick}
            className={`inline-flex items-center gap-1.5 px-6 py-2.5 rounded-full text-white text-xs sm:text-sm font-bold shadow-[0_4px_16px_rgba(18,185,129,0.25)] hover:shadow-[0_6px_22px_rgba(18,185,129,0.35)] hover:-translate-y-0.5 transition-all cursor-pointer ${
              currentScreen === 'signup'
                ? 'bg-[#0E9466] ring-2 ring-[#12B981]/50'
                : 'bg-[#12B981] hover:bg-[#0FA36B]'
            }`}
          >
            <span>{strings?.nav?.getStarted || 'Get Started'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Mobile menu trigger */}
        <div className="flex sm:hidden items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="sm:hidden mt-2 max-w-[1720px] mx-auto bg-white rounded-2xl border border-[#12345B]/10 shadow-xl p-4 space-y-3 pointer-events-auto animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <span className="text-xs font-semibold text-slate-500">Language</span>
            <div className="flex gap-1.5">
              {(['en', 'hi', 'bn'] as Language[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLanguage(l)}
                  className={`px-2.5 py-1 text-xs rounded-lg font-bold ${
                    language === l ? 'bg-[#12B981] text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {getLanguageLabel(l)}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={handleSignInClick}
            className={`w-full py-2.5 rounded-full text-center text-xs font-bold border ${
              currentScreen === 'signin'
                ? 'border-[#12B981] bg-[#E8F8F2] text-[#0A9F68]'
                : 'border-slate-300 text-slate-700'
            }`}
          >
            {strings?.nav?.signIn || 'Sign In'}
          </button>

          <button
            type="button"
            onClick={handleSignUpClick}
            className="w-full py-2.5 rounded-full text-center text-xs font-bold bg-[#12B981] text-white shadow-md flex items-center justify-center gap-1.5"
          >
            <span>{strings?.nav?.getStarted || 'Get Started'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </header>
  );
};
