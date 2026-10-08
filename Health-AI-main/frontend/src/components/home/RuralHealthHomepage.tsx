import React, { useState } from 'react';
import { RuralHealthLogo } from '../brand/RuralHealthLogo';
import { VideoModal } from './VideoModal';
import { useLanguage, type Language } from '../../i18n';
import cinematicHeroBg from '../../assets/cinematic_rural_health_bg.jpg';
import ruralFooterPanorama from '../../assets/rural_footer_panorama.jpg';
import {
  Globe,
  ChevronDown,
  Play,
  Wifi,
  Users,
  ShieldCheck,
  Stethoscope,
  FileSearch,
  Share2,
  Calendar,
  MessageSquare,
  MapPin,
  Languages,
  BookOpen,
  BarChart3,
  Menu,
  X,
  CheckCircle2,
} from 'lucide-react';

interface RuralHealthHomepageProps {
  onSignIn: () => void;
  onGetStarted: () => void;
  lang?: Language;
  onLangChange?: (lang: Language) => void;
  isAuthenticated?: boolean;
}

export const RuralHealthHomepage: React.FC<RuralHealthHomepageProps> = ({
  onSignIn,
  onGetStarted,
  lang: propLang,
  onLangChange: propOnLangChange,
  isAuthenticated = false,
}) => {
  const { language: contextLang, setLanguage: setContextLang, strings } = useLanguage();
  const lang = propLang || contextLang;

  const [showLangMenu, setShowLangMenu] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [videoModalOpen, setVideoModalOpen] = useState(false);

  const handleLanguageSelect = (newLang: Language) => {
    setContextLang(newLang);
    if (propOnLangChange) {
      propOnLangChange(newLang);
    }
    setShowLangMenu(false);
  };

  const scrollToSection = (sectionId: string) => {
    setMobileMenuOpen(false);
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

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

  return (
    <div className="min-h-screen bg-[#F4FBF8] text-[#12345B] font-sans selection:bg-[#12B981] selection:text-white flex flex-col">
      {/* 1. FLOATING LIGHT GLASS NAVIGATION CONTAINER */}
      <div className="fixed top-0 inset-x-0 z-50 px-3 sm:px-6 lg:px-10 pt-3 sm:pt-5 pointer-events-none">
        <header className="max-w-[1720px] mx-auto h-20 sm:h-[84px] bg-white/88 backdrop-blur-2xl border border-[#12345B]/10 shadow-[0_8px_30px_rgba(30,80,70,0.08)] rounded-[28px] sm:rounded-[34px] px-4 sm:px-7 lg:px-8 flex items-center justify-between pointer-events-auto transition-all duration-300">
          {/* Left: Brand Logo & Tagline */}
          <div
            className="cursor-pointer select-none"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <RuralHealthLogo size="md" theme="light" />
          </div>

          {/* Center: Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-7 lg:gap-9 text-sm font-semibold text-[#304A67]">
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="relative py-2 text-[#126B55] font-bold transition-colors cursor-pointer group"
            >
              <span>{strings.nav.home}</span>
              <span className="absolute -bottom-1 left-0 right-0 h-0.5 bg-[#12B981] rounded-full"></span>
            </button>
            <button
              onClick={() => scrollToSection('how-it-works')}
              className="py-2 text-[#304A67] hover:text-[#0FA36B] transition-colors cursor-pointer"
            >
              {strings.nav.howItWorks}
            </button>
            <button
              onClick={() => scrollToSection('features')}
              className="py-2 text-[#304A67] hover:text-[#0FA36B] transition-colors cursor-pointer"
            >
              {strings.nav.features}
            </button>
            <button
              onClick={() => scrollToSection('impact')}
              className="py-2 text-[#304A67] hover:text-[#0FA36B] transition-colors cursor-pointer"
            >
              {strings.nav.impact}
            </button>
            <button
              onClick={() => scrollToSection('about')}
              className="py-2 text-[#304A67] hover:text-[#0FA36B] transition-colors cursor-pointer"
            >
              {strings.nav.about}
            </button>
          </nav>

          {/* Right: Language Selector + Sign In + Get Started */}
          <div className="hidden lg:flex items-center gap-3">
            {/* Language Selector Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowLangMenu(!showLangMenu)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-[#D7E7E1] hover:border-[#AFCFC3] text-xs font-semibold text-[#27435F] bg-[#F8FCFA] hover:bg-white transition-all cursor-pointer shadow-2xs focus:outline-none focus:ring-2 focus:ring-[#0FA36B]"
                aria-label={strings.nav.selectLanguage}
                aria-haspopup="listbox"
                aria-expanded={showLangMenu}
              >
                <Globe className="w-3.5 h-3.5 text-[#0FA36B]" />
                <span>{getLanguageLabel(lang)}</span>
                <ChevronDown className="w-3 h-3 text-[#52677F]" />
              </button>

              {showLangMenu && (
                <div
                  className="absolute right-0 mt-2 w-44 bg-white rounded-2xl shadow-xl border border-[#DCEBE5] py-2 z-50 animate-in fade-in zoom-in-95 duration-150"
                  role="listbox"
                >
                  <button
                    type="button"
                    onClick={() => handleLanguageSelect('en')}
                    className={`w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-[#F0F8F5] transition-colors flex items-center justify-between ${
                      lang === 'en' ? 'text-[#0FA36B] font-bold bg-[#E8F8F2]' : 'text-[#27435F]'
                    }`}
                  >
                    <span>English</span>
                    {lang === 'en' && <CheckCircle2 className="w-3.5 h-3.5 text-[#0FA36B]" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLanguageSelect('hi')}
                    className={`w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-[#F0F8F5] transition-colors flex items-center justify-between ${
                      lang === 'hi' ? 'text-[#0FA36B] font-bold bg-[#E8F8F2]' : 'text-[#27435F]'
                    }`}
                  >
                    <span>हिन्दी (Hindi)</span>
                    {lang === 'hi' && <CheckCircle2 className="w-3.5 h-3.5 text-[#0FA36B]" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLanguageSelect('bn')}
                    className={`w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-[#F0F8F5] transition-colors flex items-center justify-between ${
                      lang === 'bn' ? 'text-[#0FA36B] font-bold bg-[#E8F8F2]' : 'text-[#27435F]'
                    }`}
                  >
                    <span>বাংলা (Bengali)</span>
                    {lang === 'bn' && <CheckCircle2 className="w-3.5 h-3.5 text-[#0FA36B]" />}
                  </button>
                </div>
              )}
            </div>

            {/* Sign In CTA */}
            <button
              onClick={onSignIn}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-[#BFD5CD] hover:border-[#0FA36B] text-[#183D5A] hover:bg-[#F0F8F5] text-xs sm:text-sm font-semibold transition-all cursor-pointer bg-white/80"
            >
              <span>{strings.nav.signIn}</span>
            </button>

            {/* Get Started CTA */}
            <button
              onClick={onGetStarted}
              className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-full bg-[#12B981] hover:bg-[#0FA36B] text-white text-xs sm:text-sm font-bold shadow-[0_4px_16px_rgba(18,185,129,0.25)] hover:shadow-[0_6px_22px_rgba(18,185,129,0.35)] hover:-translate-y-0.5 transition-all cursor-pointer"
            >
              <span>
                {isAuthenticated
                  ? lang === 'hi'
                    ? 'डैशबोर्ड खोलें'
                    : lang === 'bn'
                    ? 'ড্যাশবোর্ড খুলুন'
                    : 'Open Dashboard'
                  : strings.nav.getStarted}
              </span>
              <span className="text-base leading-none">→</span>
            </button>
          </div>

          {/* Mobile menu toggle */}
          <div className="flex items-center gap-2 lg:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2.5 text-[#12345B] hover:bg-[#E8F8F2] rounded-2xl transition-colors"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </header>

        {/* Mobile Dropdown Light Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden mt-2 bg-white/95 backdrop-blur-2xl border border-[#DCEBE5] rounded-3xl p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200 pointer-events-auto">
            <div className="flex flex-col space-y-2 text-sm font-semibold text-[#12345B]">
              <button
                onClick={() => {
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                  setMobileMenuOpen(false);
                }}
                className="text-left px-3.5 py-2.5 rounded-xl bg-[#E8F8F2] text-[#0FA36B] font-bold"
              >
                {strings.nav.home}
              </button>
              <button
                onClick={() => scrollToSection('how-it-works')}
                className="text-left px-3.5 py-2.5 rounded-xl hover:bg-slate-50"
              >
                {strings.nav.howItWorks}
              </button>
              <button
                onClick={() => scrollToSection('features')}
                className="text-left px-3.5 py-2.5 rounded-xl hover:bg-slate-50"
              >
                {strings.nav.features}
              </button>
              <button
                onClick={() => scrollToSection('impact')}
                className="text-left px-3.5 py-2.5 rounded-xl hover:bg-slate-50"
              >
                {strings.nav.impact}
              </button>
              <button
                onClick={() => scrollToSection('about')}
                className="text-left px-3.5 py-2.5 rounded-xl hover:bg-slate-50"
              >
                {strings.nav.about}
              </button>
            </div>

            <div className="pt-3 border-t border-[#DCEBE5] flex flex-col gap-3">
              <div className="flex items-center justify-between px-2">
                <span className="text-xs font-semibold text-[#52677F]">{strings.nav.selectLanguage}:</span>
                <div className="flex gap-2 text-xs">
                  <button
                    onClick={() => handleLanguageSelect('en')}
                    className={`px-3 py-1 rounded-full transition-colors ${
                      lang === 'en' ? 'bg-[#12B981] text-white font-bold' : 'bg-[#E8F8F2] text-[#12345B]'
                    }`}
                  >
                    EN
                  </button>
                  <button
                    onClick={() => handleLanguageSelect('hi')}
                    className={`px-3 py-1 rounded-full transition-colors ${
                      lang === 'hi' ? 'bg-[#12B981] text-white font-bold' : 'bg-[#E8F8F2] text-[#12345B]'
                    }`}
                  >
                    हिन्दी
                  </button>
                  <button
                    onClick={() => handleLanguageSelect('bn')}
                    className={`px-3 py-1 rounded-full transition-colors ${
                      lang === 'bn' ? 'bg-[#12B981] text-white font-bold' : 'bg-[#E8F8F2] text-[#12345B]'
                    }`}
                  >
                    বাংলা
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-2">
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onSignIn();
                  }}
                  className="w-full py-3 rounded-full border border-[#BFD5CD] hover:border-[#0FA36B] text-[#183D5A] text-xs font-bold text-center bg-white"
                >
                  {strings.nav.signIn}
                </button>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onGetStarted();
                  }}
                  className="w-full py-3 rounded-full bg-[#12B981] hover:bg-[#0FA36B] text-white text-xs font-bold text-center shadow-md shadow-emerald-500/20"
                >
                  {strings.nav.getStarted} →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. LIGHT, CINEMATIC & WARM HERO SECTION */}
      <section className="relative min-h-[92vh] sm:min-h-screen flex flex-col justify-between overflow-hidden bg-gradient-to-br from-white via-[#F4FBF8] to-[#EDF9F5] pt-28 sm:pt-36 pb-8 border-b border-[#DCEBE5]">
        {/* Full-bleed Natural Cinematic Background Image with Light Readability Gradient */}
        <div className="absolute inset-0 z-0">
          <img
            src={cinematicHeroBg}
            alt="Rural Health Worker with Patient"
            className="w-full h-full object-cover object-[center_right] sm:object-[78%_center] opacity-95 transition-transform duration-1000 ease-out"
          />

          {/* Layer 1: Left-to-Right Soft White/Mint Gradient for crystal-clear navy text contrast */}
          <div className="absolute inset-0 bg-gradient-to-r from-white/98 via-white/92 via-35% sm:via-white/82 md:via-55% to-white/10 to-85%"></div>

          {/* Layer 2: Subtle Bottom Transition */}
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#F4FBF8] via-[#F4FBF8]/70 to-transparent"></div>

          {/* Layer 3: Subtle Top Soft Vignette */}
          <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-white/80 to-transparent pointer-events-none"></div>
        </div>

        {/* Hero Main Content Container */}
        <div className="relative z-10 max-w-[1720px] mx-auto w-full px-5 sm:px-8 lg:px-12 xl:px-16 my-auto pt-6 pb-8">
          <div className="max-w-[760px] space-y-6 sm:space-y-7">
            {/* Top Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#E8F8F2] border border-[#A8E6CE] text-[#087454] text-[11px] sm:text-xs font-bold uppercase tracking-[1.5px] shadow-2xs backdrop-blur-md animate-in fade-in slide-in-from-top-3 duration-500">
              <span className="w-2 h-2 rounded-full bg-[#12B981] animate-pulse"></span>
              <span>{strings.hero.badge}</span>
            </div>

            {/* Oversized High-Contrast Navy & Green Headline */}
            <h1 className="text-[44px] sm:text-[58px] md:text-[68px] lg:text-[76px] xl:text-[86px] font-black tracking-[-0.035em] text-[#12345B] leading-[1.04]">
              {strings.hero.titleLine1}
              <br />
              {strings.hero.titleLine2}
              <br />
              <span className="text-[#0FA36B]">{strings.hero.titleHighlight}</span>
            </h1>

            {/* Supporting Paragraph */}
            <p className="text-[#506780] text-base sm:text-lg lg:text-xl font-normal leading-relaxed max-w-[700px]">
              {strings.hero.description}
            </p>

            {/* Primary & Secondary CTA Buttons */}
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button
                onClick={onGetStarted}
                className="h-14 sm:h-16 px-8 sm:px-9 rounded-full bg-[#12B981] hover:bg-[#0FA36B] text-white font-bold text-base sm:text-lg shadow-[0_10px_25px_rgba(18,185,129,0.22)] hover:shadow-[0_14px_30px_rgba(18,185,129,0.32)] hover:-translate-y-0.5 transition-all flex items-center gap-2.5 cursor-pointer group"
              >
                <span>
                  {isAuthenticated
                    ? lang === 'hi'
                      ? 'डैशबोर्ड खोलें'
                      : lang === 'bn'
                      ? 'ড্যাশবোর্ড খুলুন'
                      : 'Open Dashboard'
                    : strings.hero.getStarted}
                </span>
                <span className="text-xl leading-none transition-transform group-hover:translate-x-1">→</span>
              </button>

              <button
                onClick={() => setVideoModalOpen(true)}
                className="h-14 sm:h-16 px-7 sm:px-8 rounded-full bg-white/90 hover:bg-white border border-[#AFCFC3] text-[#214763] font-bold text-base sm:text-lg backdrop-blur-md transition-all flex items-center gap-3 cursor-pointer shadow-sm hover:border-[#0FA36B]"
              >
                <div className="w-7 h-7 rounded-full bg-[#E8F8F2] text-[#12B981] flex items-center justify-center">
                  <Play className="w-3.5 h-3.5 fill-current translate-x-0.5" />
                </div>
                <span>{strings.hero.watchVideo}</span>
              </button>
            </div>
          </div>
        </div>

        {/* 3. LIGHT BOTTOM CAPABILITY / TRUST STRIP */}
        <div className="relative z-10 max-w-[1720px] mx-auto w-full px-5 sm:px-8 lg:px-12 xl:px-16 pt-6 border-t border-[#DCEBE5]/80">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            {/* 3 Light Capability Blocks */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-8 lg:gap-12 flex-1">
              {/* Feature 1 */}
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-[#E8F8F2] text-[#0FA36B] flex items-center justify-center shrink-0 mt-0.5">
                  <Wifi className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-[#183B5A] text-sm sm:text-base leading-snug">
                    {strings.capabilities.feat1Title}
                  </div>
                  <div className="text-xs sm:text-[13px] text-[#52677F] font-normal">
                    {strings.capabilities.feat1Desc}
                  </div>
                </div>
              </div>

              {/* Feature 2 */}
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-[#EAF4FF] text-[#2563EB] flex items-center justify-center shrink-0 mt-0.5">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-[#183B5A] text-sm sm:text-base leading-snug">
                    {strings.capabilities.feat2Title}
                  </div>
                  <div className="text-xs sm:text-[13px] text-[#52677F] font-normal">
                    {strings.capabilities.feat2Desc}
                  </div>
                </div>
              </div>

              {/* Feature 3 */}
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-[#EDF9F4] text-[#0FA36B] flex items-center justify-center shrink-0 mt-0.5">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-[#183B5A] text-sm sm:text-base leading-snug">
                    {strings.capabilities.feat3Title}
                  </div>
                  <div className="text-xs sm:text-[13px] text-[#52677F] font-normal">
                    {strings.capabilities.feat3Desc}
                  </div>
                </div>
              </div>
            </div>

            {/* Floating Light Glass Health Message Card */}
            <div className="hidden xl:flex items-center gap-3 bg-white/95 backdrop-blur-xl px-5 py-3 rounded-2xl border border-[#12345B]/8 shadow-[0_12px_30px_rgba(20,70,60,0.10)] shrink-0">
              <span className="text-rose-500">❤️</span>
              <div className="text-xs font-bold text-[#12345B] tracking-tight">
                {strings.capabilities.healthMessage}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. HOW IT WORKS SECTION */}
      <section id="how-it-works" className="py-20 lg:py-24 bg-white text-[#12345B] border-b border-[#DCEBE5]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-12 gap-8 items-start mb-12">
            {/* Section Header */}
            <div className="lg:col-span-4 space-y-2">
              <span className="text-xs font-black uppercase tracking-wider text-[#0FA36B]">
                {strings.howItWorks.eyebrow}
              </span>
              <h2 className="text-3xl sm:text-4xl font-black text-[#12345B] tracking-tight leading-tight">
                {strings.howItWorks.title}
              </h2>
              <p className="text-xs sm:text-sm text-[#52677F] max-w-sm pt-1">
                {strings.howItWorks.desc}
              </p>
            </div>

            {/* 5-Step Horizontal Workflow */}
            <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 relative">
              {/* Step 01 */}
              <div className="p-4 rounded-2xl bg-[#F8FCFA] border border-[#DCEBE5] hover:border-[#12B981] shadow-2xs hover:shadow-md transition-all flex flex-col justify-between relative group">
                <div>
                  <div className="w-10 h-10 rounded-full bg-[#EAF4FF] text-[#2563EB] flex items-center justify-center mb-3">
                    <Users className="w-5 h-5" />
                  </div>
                  <div className="text-[11px] font-bold text-[#52677F]">{strings.howItWorks.step1Num}</div>
                  <h3 className="text-sm font-bold text-[#12345B] mt-0.5">{strings.howItWorks.step1Title}</h3>
                  <p className="text-xs text-[#52677F] mt-1 leading-snug">
                    {strings.howItWorks.step1Desc}
                  </p>
                </div>
                <div className="hidden lg:block absolute -right-3 top-1/2 -translate-y-1/2 text-slate-300 font-bold z-10">
                  →
                </div>
              </div>

              {/* Step 02 */}
              <div className="p-4 rounded-2xl bg-[#F8FCFA] border border-[#DCEBE5] hover:border-[#12B981] shadow-2xs hover:shadow-md transition-all flex flex-col justify-between relative group">
                <div>
                  <div className="w-10 h-10 rounded-full bg-[#E8F8F2] text-[#0FA36B] flex items-center justify-center mb-3">
                    <Stethoscope className="w-5 h-5" />
                  </div>
                  <div className="text-[11px] font-bold text-[#52677F]">{strings.howItWorks.step2Num}</div>
                  <h3 className="text-sm font-bold text-[#12345B] mt-0.5">{strings.howItWorks.step2Title}</h3>
                  <p className="text-xs text-[#52677F] mt-1 leading-snug">
                    {strings.howItWorks.step2Desc}
                  </p>
                </div>
                <div className="hidden lg:block absolute -right-3 top-1/2 -translate-y-1/2 text-slate-300 font-bold z-10">
                  →
                </div>
              </div>

              {/* Step 03 */}
              <div className="p-4 rounded-2xl bg-[#F8FCFA] border border-[#DCEBE5] hover:border-[#12B981] shadow-2xs hover:shadow-md transition-all flex flex-col justify-between relative group">
                <div>
                  <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mb-3">
                    <FileSearch className="w-5 h-5" />
                  </div>
                  <div className="text-[11px] font-bold text-[#52677F]">{strings.howItWorks.step3Num}</div>
                  <h3 className="text-sm font-bold text-[#12345B] mt-0.5">{strings.howItWorks.step3Title}</h3>
                  <p className="text-xs text-[#52677F] mt-1 leading-snug">
                    {strings.howItWorks.step3Desc}
                  </p>
                </div>
                <div className="hidden lg:block absolute -right-3 top-1/2 -translate-y-1/2 text-slate-300 font-bold z-10">
                  →
                </div>
              </div>

              {/* Step 04 */}
              <div className="p-4 rounded-2xl bg-[#F8FCFA] border border-[#DCEBE5] hover:border-[#12B981] shadow-2xs hover:shadow-md transition-all flex flex-col justify-between relative group">
                <div>
                  <div className="w-10 h-10 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center mb-3">
                    <Share2 className="w-5 h-5" />
                  </div>
                  <div className="text-[11px] font-bold text-[#52677F]">{strings.howItWorks.step4Num}</div>
                  <h3 className="text-sm font-bold text-[#12345B] mt-0.5">{strings.howItWorks.step4Title}</h3>
                  <p className="text-xs text-[#52677F] mt-1 leading-snug">
                    {strings.howItWorks.step4Desc}
                  </p>
                </div>
                <div className="hidden lg:block absolute -right-3 top-1/2 -translate-y-1/2 text-slate-300 font-bold z-10">
                  →
                </div>
              </div>

              {/* Step 05 */}
              <div className="p-4 rounded-2xl bg-[#F8FCFA] border border-[#DCEBE5] hover:border-[#12B981] shadow-2xs hover:shadow-md transition-all flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 rounded-full bg-pink-50 text-pink-600 flex items-center justify-center mb-3">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div className="text-[11px] font-bold text-[#52677F]">{strings.howItWorks.step5Num}</div>
                  <h3 className="text-sm font-bold text-[#12345B] mt-0.5">{strings.howItWorks.step5Title}</h3>
                  <p className="text-xs text-[#52677F] mt-1 leading-snug">
                    {strings.howItWorks.step5Desc}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. KEY FEATURES SECTION */}
      <section id="features" className="py-20 lg:py-24 bg-[#F4FBF8] text-[#12345B] border-b border-[#DCEBE5]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-12 gap-8 items-start mb-10">
            {/* Header Column */}
            <div className="lg:col-span-4 space-y-2">
              <span className="text-xs font-black uppercase tracking-wider text-[#0FA36B]">
                {strings.features.eyebrow}
              </span>
              <h2 className="text-3xl sm:text-4xl font-black text-[#12345B] tracking-tight leading-tight">
                {strings.features.title}
              </h2>
              <p className="text-xs sm:text-sm text-[#52677F] max-w-sm pt-1">
                {strings.features.desc}
              </p>
            </div>

            {/* 8 Feature Cards Grid */}
            <div className="lg:col-span-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Feature 01 */}
              <div className="p-4 rounded-2xl bg-white border border-[#DCEBE5] hover:border-[#12B981] shadow-2xs hover:shadow-md transition-all">
                <div className="w-9 h-9 rounded-xl bg-[#E8F8F2] text-[#0FA36B] flex items-center justify-center mb-3">
                  <Wifi className="w-4.5 h-4.5" />
                </div>
                <h3 className="text-sm font-bold text-[#12345B]">{strings.features.feat1Title}</h3>
                <p className="text-xs text-[#52677F] mt-1 leading-relaxed">
                  {strings.features.feat1Desc}
                </p>
              </div>

              {/* Feature 02 */}
              <div className="p-4 rounded-2xl bg-white border border-[#DCEBE5] hover:border-[#12B981] shadow-2xs hover:shadow-md transition-all">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-3">
                  <MessageSquare className="w-4.5 h-4.5" />
                </div>
                <h3 className="text-sm font-bold text-[#12345B]">{strings.features.feat2Title}</h3>
                <p className="text-xs text-[#52677F] mt-1 leading-relaxed">
                  {strings.features.feat2Desc}
                </p>
              </div>

              {/* Feature 03 */}
              <div className="p-4 rounded-2xl bg-white border border-[#DCEBE5] hover:border-[#12B981] shadow-2xs hover:shadow-md transition-all">
                <div className="w-9 h-9 rounded-xl bg-[#E8F8F2] text-[#0FA36B] flex items-center justify-center mb-3">
                  <MapPin className="w-4.5 h-4.5" />
                </div>
                <h3 className="text-sm font-bold text-[#12345B]">{strings.features.feat3Title}</h3>
                <p className="text-xs text-[#52677F] mt-1 leading-relaxed">
                  {strings.features.feat3Desc}
                </p>
              </div>

              {/* Feature 04 */}
              <div className="p-4 rounded-2xl bg-white border border-[#DCEBE5] hover:border-[#12B981] shadow-2xs hover:shadow-md transition-all">
                <div className="w-9 h-9 rounded-xl bg-[#EAF4FF] text-[#2563EB] flex items-center justify-center mb-3">
                  <Users className="w-4.5 h-4.5" />
                </div>
                <h3 className="text-sm font-bold text-[#12345B]">{strings.features.feat4Title}</h3>
                <p className="text-xs text-[#52677F] mt-1 leading-relaxed">
                  {strings.features.feat4Desc}
                </p>
              </div>

              {/* Feature 05 */}
              <div className="p-4 rounded-2xl bg-white border border-[#DCEBE5] hover:border-[#12B981] shadow-2xs hover:shadow-md transition-all">
                <div className="w-9 h-9 rounded-xl bg-[#EAF4FF] text-[#2563EB] flex items-center justify-center mb-3">
                  <Languages className="w-4.5 h-4.5" />
                </div>
                <h3 className="text-sm font-bold text-[#12345B]">{strings.features.feat5Title}</h3>
                <p className="text-xs text-[#52677F] mt-1 leading-relaxed">
                  {strings.features.feat5Desc}
                </p>
              </div>

              {/* Feature 06 */}
              <div className="p-4 rounded-2xl bg-white border border-[#DCEBE5] hover:border-[#12B981] shadow-2xs hover:shadow-md transition-all">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mb-3">
                  <BookOpen className="w-4.5 h-4.5" />
                </div>
                <h3 className="text-sm font-bold text-[#12345B]">{strings.features.feat6Title}</h3>
                <p className="text-xs text-[#52677F] mt-1 leading-relaxed">
                  {strings.features.feat6Desc}
                </p>
              </div>

              {/* Feature 07 */}
              <div className="p-4 rounded-2xl bg-white border border-[#DCEBE5] hover:border-[#12B981] shadow-2xs hover:shadow-md transition-all">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-3">
                  <BarChart3 className="w-4.5 h-4.5" />
                </div>
                <h3 className="text-sm font-bold text-[#12345B]">{strings.features.feat7Title}</h3>
                <p className="text-xs text-[#52677F] mt-1 leading-relaxed">
                  {strings.features.feat7Desc}
                </p>
              </div>

              {/* Feature 08 */}
              <div className="p-4 rounded-2xl bg-white border border-[#DCEBE5] hover:border-[#12B981] shadow-2xs hover:shadow-md transition-all">
                <div className="w-9 h-9 rounded-xl bg-[#EAF4FF] text-[#2563EB] flex items-center justify-center mb-3">
                  <Calendar className="w-4.5 h-4.5" />
                </div>
                <h3 className="text-sm font-bold text-[#12345B]">{strings.features.feat8Title}</h3>
                <p className="text-xs text-[#52677F] mt-1 leading-relaxed">
                  {strings.features.feat8Desc}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. KEY IMPACT SECTION */}
      <section id="impact" className="py-20 lg:py-24 bg-white text-[#12345B] border-b border-[#DCEBE5]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-4 space-y-2">
              <span className="text-xs font-black uppercase tracking-wider text-[#0FA36B]">
                {strings.impact.eyebrow}
              </span>
              <h2 className="text-3xl sm:text-4xl font-black text-[#12345B] tracking-tight leading-tight">
                {strings.impact.title}
              </h2>
            </div>

            {/* 4 Impact Cards */}
            <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-3.5">
              {/* Card 1 */}
              <div className="p-4 rounded-2xl bg-[#F8FCFA] border border-[#DCEBE5] shadow-2xs hover:shadow-md transition-all flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#E8F8F2] text-[#0FA36B] flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-lg sm:text-xl font-black text-[#12345B] leading-tight">
                    {strings.impact.stat1Value}
                  </div>
                  <div className="text-[11px] font-medium text-[#52677F]">
                    {strings.impact.stat1Label}
                  </div>
                </div>
              </div>

              {/* Card 2 */}
              <div className="p-4 rounded-2xl bg-[#F8FCFA] border border-[#DCEBE5] shadow-2xs hover:shadow-md transition-all flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#EAF4FF] text-[#2563EB] flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-lg sm:text-xl font-black text-[#12345B] leading-tight">
                    {strings.impact.stat2Value}
                  </div>
                  <div className="text-[11px] font-medium text-[#52677F]">
                    {strings.impact.stat2Label}
                  </div>
                </div>
              </div>

              {/* Card 3 */}
              <div className="p-4 rounded-2xl bg-[#F8FCFA] border border-[#DCEBE5] shadow-2xs hover:shadow-md transition-all flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-lg sm:text-xl font-black text-[#12345B] leading-tight">
                    {strings.impact.stat3Value}
                  </div>
                  <div className="text-[11px] font-medium text-[#52677F]">
                    {strings.impact.stat3Label}
                  </div>
                </div>
              </div>

              {/* Card 4 */}
              <div className="p-4 rounded-2xl bg-[#F8FCFA] border border-[#DCEBE5] shadow-2xs hover:shadow-md transition-all flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-lg sm:text-xl font-black text-[#12345B] leading-tight">
                    {strings.impact.stat4Value}
                  </div>
                  <div className="text-[11px] font-medium text-[#52677F]">
                    {strings.impact.stat4Label}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. FOOTER */}
      <footer id="about" className="bg-white text-[#12345B] border-t border-[#DCEBE5] pt-16 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-6 lg:grid-cols-12 gap-8 pb-12">
            {/* Left Brand Column */}
            <div className="col-span-2 md:col-span-6 lg:col-span-4 space-y-3">
              <RuralHealthLogo size="md" theme="light" />
              <p className="text-xs text-[#52677F] max-w-xs pt-1 leading-relaxed">
                {strings.footer.brandDesc}
              </p>
              <div className="text-xs text-slate-400 pt-2">
                {strings.footer.rights}
              </div>
            </div>

            {/* Column 1: Product */}
            <div className="col-span-1 lg:col-span-2 space-y-2.5">
              <div className="text-xs font-extrabold uppercase tracking-wider text-[#12345B]">
                {strings.footer.product}
              </div>
              <ul className="space-y-2 text-xs text-[#52677F]">
                <li>
                  <button onClick={() => scrollToSection('features')} className="hover:text-[#0FA36B] transition-colors">
                    {strings.footer.features}
                  </button>
                </li>
                <li>
                  <button onClick={() => scrollToSection('how-it-works')} className="hover:text-[#0FA36B] transition-colors">
                    {strings.footer.howItWorks}
                  </button>
                </li>
                <li>
                  <span className="hover:text-[#0FA36B] cursor-pointer">{strings.footer.pricing}</span>
                </li>
              </ul>
            </div>

            {/* Column 2: Resources */}
            <div className="col-span-1 lg:col-span-2 space-y-2.5">
              <div className="text-xs font-extrabold uppercase tracking-wider text-[#12345B]">
                {strings.footer.resources}
              </div>
              <ul className="space-y-2 text-xs text-[#52677F]">
                <li>
                  <span className="hover:text-[#0FA36B] cursor-pointer">{strings.footer.healthResources}</span>
                </li>
                <li>
                  <span className="hover:text-[#0FA36B] cursor-pointer">{strings.footer.documentation}</span>
                </li>
                <li>
                  <span className="hover:text-[#0FA36B] cursor-pointer">{strings.footer.faq}</span>
                </li>
              </ul>
            </div>

            {/* Column 3: Company */}
            <div className="col-span-1 lg:col-span-2 space-y-2.5">
              <div className="text-xs font-extrabold uppercase tracking-wider text-[#12345B]">
                {strings.footer.company}
              </div>
              <ul className="space-y-2 text-xs text-[#52677F]">
                <li>
                  <span className="hover:text-[#0FA36B] cursor-pointer">{strings.footer.about}</span>
                </li>
                <li>
                  <span className="hover:text-[#0FA36B] cursor-pointer">{strings.footer.contact}</span>
                </li>
                <li>
                  <span className="hover:text-[#0FA36B] cursor-pointer">{strings.footer.privacyPolicy}</span>
                </li>
              </ul>
            </div>

            {/* Column 4: For Organizations */}
            <div className="col-span-1 lg:col-span-2 space-y-2.5">
              <div className="text-xs font-extrabold uppercase tracking-wider text-[#12345B]">
                {strings.footer.forOrganizations}
              </div>
              <ul className="space-y-2 text-xs text-[#52677F]">
                <li>
                  <span className="hover:text-[#0FA36B] cursor-pointer">{strings.footer.phcs}</span>
                </li>
                <li>
                  <span className="hover:text-[#0FA36B] cursor-pointer">{strings.footer.ngos}</span>
                </li>
                <li>
                  <span className="hover:text-[#0FA36B] cursor-pointer">{strings.footer.communityTeams}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* FULL-WIDTH PANORAMIC RURAL LANDSCAPE FOOTER BACKGROUND */}
        <div className="relative w-full h-[300px] sm:h-[340px] lg:h-[380px] overflow-hidden rounded-t-[36px] sm:rounded-t-[48px] border-t border-[#12345B]/8 mt-2">
          {/* Continuous Panoramic Background Image */}
          <div
            className="absolute inset-0 w-full h-full bg-cover bg-center"
            style={{
              backgroundImage: `url(${ruralFooterPanorama})`,
              backgroundPosition: 'center 45%',
            }}
          />

          {/* Very subtle top gradient wash for soft transition and pristine text contrast */}
          <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-white/70 via-white/15 to-transparent pointer-events-none" />

          {/* Overlaid Footer Content */}
          <div className="relative z-10 w-full h-full max-w-[1720px] mx-auto px-6 sm:px-12 lg:px-16 pt-8 sm:pt-12 lg:pt-14 flex flex-col sm:flex-row items-start justify-between gap-6">
            {/* Left: Connect With Us & Translucent Glass Buttons */}
            <div className="space-y-3 sm:space-y-3.5">
              <h3 className="text-lg sm:text-[19px] font-bold text-[#12345B] tracking-tight drop-shadow-2xs">
                {strings.footer.connectWithUs}
              </h3>
              <div className="flex items-center gap-2.5 sm:gap-3">
                <a
                  href="https://linkedin.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-12 h-12 sm:w-13 sm:h-13 rounded-2xl bg-white/75 hover:bg-white/95 backdrop-blur-md border border-white/85 text-[#12345B] hover:text-[#0077b5] flex items-center justify-center transition-all duration-200 shadow-[0_4px_16px_rgba(20,60,50,0.06)] hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#0FA36B]"
                  aria-label="LinkedIn"
                >
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                  </svg>
                </a>
                <a
                  href="https://twitter.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-12 h-12 sm:w-13 sm:h-13 rounded-2xl bg-white/75 hover:bg-white/95 backdrop-blur-md border border-white/85 text-[#12345B] hover:text-[#1da1f2] flex items-center justify-center transition-all duration-200 shadow-[0_4px_16px_rgba(20,60,50,0.06)] hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#0FA36B]"
                  aria-label="X (Twitter)"
                >
                  <svg className="w-4.5 h-4.5 fill-current" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </a>
                <a
                  href="https://youtube.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-12 h-12 sm:w-13 sm:h-13 rounded-2xl bg-white/75 hover:bg-white/95 backdrop-blur-md border border-white/85 text-[#12345B] hover:text-[#ff0000] flex items-center justify-center transition-all duration-200 shadow-[0_4px_16px_rgba(20,60,50,0.06)] hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#0FA36B]"
                  aria-label="YouTube"
                >
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                  </svg>
                </a>
                <a
                  href="https://github.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-12 h-12 sm:w-13 sm:h-13 rounded-2xl bg-white/75 hover:bg-white/95 backdrop-blur-md border border-white/85 text-[#12345B] hover:text-[#0FA36B] flex items-center justify-center transition-all duration-200 shadow-[0_4px_16px_rgba(20,60,50,0.06)] hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#0FA36B]"
                  aria-label="GitHub"
                >
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                  </svg>
                </a>
              </div>
            </div>

            {/* Right: Message over Sky / Sunrise Area */}
            <div className="text-left sm:text-right">
              <p className="text-lg sm:text-[19px] lg:text-[20px] font-bold text-[#12345B] tracking-tight drop-shadow-2xs">
                {strings.footer.tagline}
              </p>
            </div>
          </div>
        </div>
      </footer>

      {/* Video Modal */}
      <VideoModal
        isOpen={videoModalOpen}
        onClose={() => setVideoModalOpen(false)}
        onGetStarted={onGetStarted}
      />
    </div>
  );
};
