import React, { useState } from 'react';
import { Search, Globe, Bell, ChevronDown, Wifi, WifiOff, RefreshCw, Menu } from 'lucide-react';
import type { Language } from '../../i18n/translations';
import sunitaAvatar from '../../assets/sunita_avatar.jpg';

interface DashboardHeaderProps {
  lang: Language;
  onLangChange: (lang: Language) => void;
  isOnline: boolean;
  pendingSyncCount: number;
  onSyncTrigger: () => void;
  isSyncing: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onToggleMobileMenu?: () => void;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  lang,
  onLangChange,
  isOnline,
  pendingSyncCount,
  onSyncTrigger,
  isSyncing,
  searchQuery,
  onSearchChange,
  onToggleMobileMenu,
}) => {
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  return (
    <header className="h-[74px] bg-white border-b border-[#E5EEF1] px-4 sm:px-6 lg:px-8 flex items-center justify-between sticky top-0 z-30 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
      {/* Left side: Mobile menu toggle + Search bar */}
      <div className="flex items-center gap-3 sm:gap-4 flex-1 max-w-2xl">
        <button
          onClick={onToggleMobileMenu}
          className="lg:hidden p-2 text-[#102A56] hover:bg-slate-100 rounded-lg"
          aria-label="Open sidebar menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Global Patient Search Box */}
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search patients by name, ID, or phone number..."
            className="w-full pl-10 pr-20 py-2.5 bg-[#F8FAFC] hover:bg-white focus:bg-white text-sm text-[#102A56] placeholder-slate-400 rounded-xl border border-[#E2E8F0] focus:border-[#0A9F68] focus:ring-2 focus:ring-[#0A9F68]/15 outline-none transition-all"
          />
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            <span className="text-[11px] font-medium text-slate-400 bg-white px-1.5 py-0.5 rounded border border-slate-200 shadow-2xs">
              Ctrl + K
            </span>
          </div>
        </div>
      </div>

      {/* Right side: Language, Network, Notifications, Profile */}
      <div className="flex items-center gap-2 sm:gap-4 ml-3">
        {/* Language Selector */}
        <div className="relative">
          <button
            onClick={() => setShowLangMenu(!showLangMenu)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-[#E2E8F0] hover:border-slate-300 bg-white text-xs font-semibold text-[#102A56] hover:bg-slate-50 transition-all"
          >
            <Globe className="w-4 h-4 text-slate-500" />
            <span className="hidden sm:inline">
              {lang === 'en' ? 'English' : lang === 'hi' ? 'हिन्दी' : 'বাংলা'}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {showLangMenu && (
            <div className="absolute right-0 mt-1.5 w-36 bg-white rounded-xl shadow-lg border border-slate-100 py-1 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
              <button
                onClick={() => {
                  onLangChange('en');
                  setShowLangMenu(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs font-medium hover:bg-slate-50 ${
                  lang === 'en' ? 'text-[#0A9F68] font-bold bg-[#E7F7F0]/40' : 'text-[#102A56]'
                }`}
              >
                English
              </button>
              <button
                onClick={() => {
                  onLangChange('hi');
                  setShowLangMenu(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs font-medium hover:bg-slate-50 ${
                  lang === 'hi' ? 'text-[#0A9F68] font-bold bg-[#E7F7F0]/40' : 'text-[#102A56]'
                }`}
              >
                हिन्दी (Hindi)
              </button>
              <button
                onClick={() => {
                  onLangChange('bn');
                  setShowLangMenu(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs font-medium hover:bg-slate-50 ${
                  lang === 'bn' ? 'text-[#0A9F68] font-bold bg-[#E7F7F0]/40' : 'text-[#102A56]'
                }`}
              >
                বাংলা (Bengali)
              </button>
            </div>
          )}
        </div>

        {/* Sync / Network status indicator */}
        <div className="flex items-center">
          {pendingSyncCount > 0 ? (
            <button
              onClick={onSyncTrigger}
              disabled={isSyncing || !isOnline}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold hover:bg-amber-100 transition-all"
              title="Sync pending records"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-amber-600' : ''}`} />
              <span className="hidden md:inline">{pendingSyncCount} pending</span>
            </button>
          ) : (
            <div
              className={`p-1.5 rounded-full ${
                isOnline ? 'text-[#0A9F68] hover:bg-[#E7F7F0]' : 'text-rose-500 hover:bg-rose-50'
              } transition-colors`}
              title={isOnline ? 'Online (Connected to PHC Hub)' : 'Offline Mode (Local Storage)'}
            >
              {isOnline ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            </div>
          )}
        </div>

        {/* Notifications Bell */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 text-slate-500 hover:text-[#102A56] hover:bg-slate-100 rounded-xl transition-all"
            aria-label="View notifications"
          >
            <Bell className="w-4.5 h-4.5" />
            <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-[#EF4444] text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">
              3
            </span>
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-1.5 w-72 bg-white rounded-2xl shadow-xl border border-slate-100 p-3 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
                <span className="text-xs font-bold text-[#102A56]">Notifications</span>
                <span className="text-[10px] text-[#0A9F68] font-semibold bg-[#E7F7F0] px-1.5 py-0.5 rounded">3 New</span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="p-2 bg-red-50/60 rounded-xl border border-red-100 text-slate-700">
                  <p className="font-semibold text-red-700">High Risk Patient Alert</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Ramesh Kumar requires PHC referral follow-up.</p>
                </div>
                <div className="p-2 bg-purple-50/60 rounded-xl border border-purple-100 text-slate-700">
                  <p className="font-semibold text-purple-700">Teleconsultation Scheduled</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Sita Devi at 10:00 AM with Dr. Verma.</p>
                </div>
                <div className="p-2 bg-blue-50/60 rounded-xl border border-blue-100 text-slate-700">
                  <p className="font-semibold text-blue-700">Offline Sync Ready</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">All local screening records are backed up.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* User Profile Card */}
        <div className="relative pl-1 sm:pl-2 border-l border-slate-200">
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-2.5 py-1 px-1.5 rounded-xl hover:bg-slate-50 transition-all text-left"
          >
            <img
              src={sunitaAvatar}
              alt="Sunita Devi"
              className="w-9 h-9 rounded-full object-cover border-2 border-[#0A9F68]/20 shadow-2xs"
            />
            <div className="hidden md:block">
              <div className="text-xs font-bold text-[#102A56] leading-tight">Sunita Devi</div>
              <div className="text-[11px] text-slate-400 font-medium">ASHA Worker</div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 mt-1.5 w-48 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-50 text-xs">
              <div className="px-3 py-1.5 border-b border-slate-100">
                <p className="font-bold text-[#102A56]">Sunita Devi</p>
                <p className="text-[11px] text-slate-400">Sundarpur PHC Block A</p>
              </div>
              <button
                onClick={() => setShowProfileMenu(false)}
                className="w-full text-left px-3 py-2 text-slate-700 hover:bg-slate-50 hover:text-[#0A9F68] font-medium"
              >
                Profile & ID Card
              </button>
              <button
                onClick={() => setShowProfileMenu(false)}
                className="w-full text-left px-3 py-2 text-slate-700 hover:bg-slate-50 hover:text-[#0A9F68] font-medium"
              >
                Field Work Summary
              </button>
              <button
                onClick={() => setShowProfileMenu(false)}
                className="w-full text-left px-3 py-2 text-slate-700 hover:bg-slate-50 hover:text-[#0A9F68] font-medium"
              >
                Settings & Language
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
