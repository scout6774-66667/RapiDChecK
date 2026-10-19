import React from 'react';
import { Calendar, Sun, Moon } from 'lucide-react';
import heroBannerBg from '../../assets/hero_banner.jpg';
import type { Language } from '../../i18n/translations';
import { useLanguage } from '../../i18n';

interface WelcomeHeroBannerProps {
  userName?: string | null;
  facilityName?: string | null;
  blockName?: string | null;
  lang?: Language;
}

export const WelcomeHeroBanner: React.FC<WelcomeHeroBannerProps> = ({
  userName,
  facilityName,
  blockName,
  lang,
}) => {
  const { strings, language } = useLanguage();
  const currentLang = lang || language || 'en';

  // Locale-sensitive real-time date formatting from system clock (Requirement 2.9)
  const localeMap: Record<Language, string> = {
    en: 'en-US',
    hi: 'hi-IN',
    bn: 'bn-IN',
  };
  const locale = localeMap[currentLang] || 'en-US';
  const now = new Date();
  const todayDateStr = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(now);

  // Time-of-day greeting
  const currentHour = now.getHours();
  const greeting =
    currentHour < 12
      ? strings?.dashboard?.goodMorning || 'Good Morning'
      : currentHour < 17
      ? strings?.dashboard?.goodAfternoon || 'Good Afternoon'
      : strings?.dashboard?.goodEvening || 'Good Evening';

  // Explicit unavailable fallback states (Requirement 2.8)
  const displayUser = userName?.trim() ? userName : strings?.dashboard?.identityUnavailable || 'Healthcare Worker (Identity Unavailable)';
  const displayFacility = facilityName?.trim() ? facilityName : strings?.dashboard?.facilityUnassigned || 'Facility Unassigned';
  const displayBlock = blockName?.trim() ? blockName : strings?.dashboard?.jurisdictionUnspecified || 'Jurisdiction Unspecified';

  return (
    <div className="relative rounded-2xl overflow-hidden shadow-xs border border-[#E5EEF1] bg-[#EAF5F0] mb-5">
      {/* Background Graphic */}
      <div className="absolute inset-0 z-0">
        <img
          src={heroBannerBg}
          alt="Rural Landscape"
          className="w-full h-full object-cover object-center opacity-85"
        />
        {/* Soft gradient wash for pristine readability */}
        <div className="absolute inset-0 bg-gradient-to-r from-white/95 via-white/80 to-white/40"></div>
      </div>

      {/* Banner Content */}
      <div className="relative z-10 px-5 sm:px-7 py-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-[#102A56] tracking-tight flex items-center gap-2">
            <span>
              {greeting}, {displayUser}!
            </span>
            <span className="inline-block animate-wave origin-[70%_70%]">👋</span>
          </h2>
          <p className="text-xs sm:text-sm font-medium text-slate-600 mt-1">
            {strings?.dashboard?.heroSub || 'Together for healthier villages and stronger communities.'}
          </p>
        </div>

        {/* Date & Facility Pill Card */}
        <div className="bg-white/95 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/80 shadow-sm flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 rounded-xl bg-[#FFF7ED] text-[#EA580C] flex items-center justify-center shrink-0">
            <Calendar className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-[#102A56] leading-tight">{todayDateStr}</div>
            <div className="text-[11px] text-slate-500 font-medium">
              {displayBlock} • {displayFacility}
            </div>
          </div>
          <div className="text-amber-500 pl-1">
            {currentHour >= 6 && currentHour < 18 ? (
              <Sun className="w-4.5 h-4.5" />
            ) : (
              <Moon className="w-4.5 h-4.5 text-indigo-400" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
