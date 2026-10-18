import React from 'react';
import logoImg from '../../assets/logo.png';

export interface RuralHealthLogoProps {
  className?: string;
  showTagline?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  theme?: 'light' | 'dark';
  variant?: 'mark' | 'full';
}

export const RuralHealthLogo: React.FC<RuralHealthLogoProps> = ({
  className = '',
  showTagline = true,
  size = 'md',
  theme = 'light',
  variant = 'mark',
}) => {
  const iconSizeClass =
    size === 'sm'
      ? 'w-8 h-8'
      : size === 'lg'
      ? 'w-14 h-14'
      : size === 'xl'
      ? 'w-20 h-20'
      : 'w-10 h-10';

  const fullHeightClass =
    size === 'sm'
      ? 'h-8'
      : size === 'lg'
      ? 'h-14'
      : size === 'xl'
      ? 'h-20'
      : 'h-11';

  const titleClass =
    size === 'sm'
      ? 'text-base font-black'
      : size === 'lg'
      ? 'text-2xl font-black'
      : size === 'xl'
      ? 'text-3xl font-black'
      : 'text-xl font-black';

  const taglineClass =
    size === 'sm'
      ? 'text-[9px]'
      : size === 'lg'
      ? 'text-xs'
      : size === 'xl'
      ? 'text-sm'
      : 'text-[11px]';

  const isDark = theme === 'dark';

  if (variant === 'full') {
    return (
      <div className={`inline-flex items-center ${className}`}>
        <img
          src={logoImg}
          alt="RuralHealth AI — Healthy Communities • Brighter Futures"
          className={`${fullHeightClass} w-auto object-contain select-none transition-transform duration-200 hover:scale-[1.02]`}
          loading="eager"
        />
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Official Project Emblem */}
      <div className={`${iconSizeClass} shrink-0 relative group`}>
        <img
          src={logoImg}
          alt="RuralHealth AI Emblem"
          className="w-full h-full object-contain select-none drop-shadow-sm transition-transform duration-200 group-hover:scale-105"
          loading="eager"
        />
      </div>

      <div className="flex flex-col leading-tight select-none">
        <div
          className={`${titleClass} tracking-tight ${
            isDark ? 'text-white' : 'text-[#102A56]'
          } flex items-center`}
        >
          RuralHealth
          <span className="text-[#0A9F68] ml-1">AI</span>
        </div>
        {showTagline && (
          <div
            className={`${taglineClass} ${
              isDark ? 'text-slate-300' : 'text-slate-500'
            } font-medium tracking-tight whitespace-nowrap`}
          >
            Healthy Communities • Brighter Futures
          </div>
        )}
      </div>
    </div>
  );
};

