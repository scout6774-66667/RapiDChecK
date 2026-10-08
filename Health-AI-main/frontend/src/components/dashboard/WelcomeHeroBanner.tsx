import React from 'react';
import { Calendar, Sun } from 'lucide-react';
import heroBannerBg from '../../assets/hero_banner.jpg';

interface WelcomeHeroBannerProps {
  userName?: string;
  facilityName?: string;
  blockName?: string;
}

export const WelcomeHeroBanner: React.FC<WelcomeHeroBannerProps> = ({
  userName = 'Sunita Devi',
  facilityName = 'Sundarpur PHC',
  blockName = 'Block A',
}) => {
  // Format current or fallback date
  const todayDateStr = 'Thursday, 14 Nov 2024';

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
            <span>Good Morning, {userName}!</span>
            <span className="inline-block animate-wave origin-[70%_70%]">👋</span>
          </h2>
          <p className="text-xs sm:text-sm font-medium text-slate-600 mt-1">
            Together for healthier villages and stronger communities.
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
              {blockName} • {facilityName}
            </div>
          </div>
          <div className="text-amber-500 pl-1">
            <Sun className="w-4.5 h-4.5" />
          </div>
        </div>
      </div>
    </div>
  );
};
