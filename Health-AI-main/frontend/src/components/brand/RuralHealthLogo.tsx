import React from 'react';

interface RuralHealthLogoProps {
  className?: string;
  showTagline?: boolean;
  size?: 'sm' | 'md' | 'lg';
  theme?: 'light' | 'dark';
}

export const RuralHealthLogo: React.FC<RuralHealthLogoProps> = ({
  className = '',
  showTagline = true,
  size = 'md',
  theme = 'light',
}) => {
  const iconSizeClass =
    size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-12 h-12' : 'w-10 h-10';
  const titleClass =
    size === 'sm'
      ? 'text-base font-black'
      : size === 'lg'
      ? 'text-2xl font-black'
      : 'text-xl font-black';
  const taglineClass =
    size === 'sm'
      ? 'text-[9px]'
      : size === 'lg'
      ? 'text-xs'
      : 'text-[11px]';

  const isDark = theme === 'dark';

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* Brand Emblem: Leaf / Health Cross in vibrant green & healthcare blue */}
      <div
        className={`${iconSizeClass} rounded-2xl bg-gradient-to-tr from-[#059669] via-[#12B981] to-[#2563EB] p-[2px] shadow-sm flex items-center justify-center shrink-0`}
      >
        <div className="w-full h-full bg-white rounded-[14px] flex items-center justify-center relative overflow-hidden">
          {/* Subtle glow background */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#ECFDF5] to-[#EFF6FF] opacity-90"></div>

          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="w-5 h-5 relative z-10"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Top Leaf Accent (Green) */}
            <path
              d="M12 3C12 3 14 5.5 14 8C14 9.1 13.1 10 12 10C10.9 10 10 9.1 10 8C10 5.5 12 3 12 3Z"
              fill="#059669"
            />
            {/* Left Leaf (Blue) */}
            <path
              d="M4.5 12C4.5 12 7 10 9.5 10C10.6 10 11.5 10.9 11.5 12C11.5 13.1 10.6 14 9.5 14C7 14 4.5 12 4.5 12Z"
              fill="#2563EB"
            />
            {/* Right Leaf (Green) */}
            <path
              d="M19.5 12C19.5 12 17 10 14.5 10C13.4 10 12.5 10.9 12.5 12C12.5 13.1 13.4 14 14.5 14C17 14 19.5 12 19.5 12Z"
              fill="#12B981"
            />
            {/* Central Health / Community Stem (Teal/Navy) */}
            <path
              d="M12 10V20M8.5 16.5H15.5"
              stroke="#102A56"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>

      <div className="flex flex-col leading-tight">
        <div className={`${titleClass} tracking-tight ${isDark ? 'text-white' : 'text-[#102A56]'} flex items-center`}>
          RuralHealth
          <span className="text-[#12B981] ml-1">AI</span>
        </div>
        {showTagline && (
          <div className={`${taglineClass} ${isDark ? 'text-slate-300' : 'text-slate-500'} font-medium tracking-tight whitespace-nowrap`}>
            Healthy Villages • Stronger Communities
          </div>
        )}
      </div>
    </div>
  );
};
