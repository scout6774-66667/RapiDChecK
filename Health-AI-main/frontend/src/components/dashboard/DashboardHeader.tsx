import React, { useState } from 'react';
import { Search, Globe, Bell, ChevronDown, Wifi, WifiOff, RefreshCw, Menu, LogOut, Building2, Check } from 'lucide-react';
import type { Language } from '../../i18n/translations';
import sunitaAvatar from '../../assets/sunita_avatar.jpg';
import { useAuth } from '../../auth/AuthContext';
import { useLanguage } from '../../i18n';

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
  onLogout?: () => void;
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
  onLogout,
}) => {
  const { user, activeClinic, userClinics, switchClinic, logout } = useAuth();
  const { strings, language, setLanguage } = useLanguage();
  const activeLang = lang || language || 'en';

  const [showLangMenu, setShowLangMenu] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showClinicMenu, setShowClinicMenu] = useState(false);

  const handleLangChangeInternal = (newLang: Language) => {
    setLanguage(newLang);
    onLangChange(newLang);
    setShowLangMenu(false);
  };

  const handleSignOut = async () => {
    setShowProfileMenu(false);
    await logout();
    if (onLogout) {
      onLogout();
    }
  };

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
            placeholder={strings?.dashboard?.searchPlaceholder || 'Search patients by name, ID, or phone number...'}
            className="w-full pl-10 pr-20 py-2.5 bg-[#F8FAFC] hover:bg-white focus:bg-white text-sm text-[#102A56] placeholder-slate-400 rounded-xl border border-[#E2E8F0] focus:border-[#0A9F68] focus:ring-2 focus:ring-[#0A9F68]/15 outline-none transition-all"
          />
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            <span className="text-[11px] font-medium text-slate-400 bg-white px-1.5 py-0.5 rounded border border-slate-200 shadow-2xs">
              {strings?.dashboard?.searchShortcut || 'Ctrl + K'}
            </span>
          </div>
        </div>
      </div>

      {/* Right side: Clinic Workspace, Language, Network, Notifications, Profile */}
      <div className="flex items-center gap-2 sm:gap-3 ml-3">
        {/* Active Clinic Workspace Badge & Selector */}
        {activeClinic && (
          <div className="relative">
            <button
              onClick={() => userClinics.length > 1 && setShowClinicMenu(!showClinicMenu)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs transition-all ${
                userClinics.length > 1
                  ? 'bg-emerald-50/80 border-emerald-200 text-[#0A9F68] hover:bg-emerald-100/60 cursor-pointer shadow-2xs'
                  : 'bg-slate-50 border-slate-200 text-[#102A56] cursor-default'
              }`}
              title={userClinics.length > 1 ? 'Click to switch clinic workspace' : activeClinic.name}
            >
              <Building2 className="w-3.5 h-3.5 text-[#0A9F68] shrink-0" />
              <div className="flex flex-col text-left max-w-[130px] sm:max-w-[180px]">
                <span className="truncate leading-tight text-[11px] font-extrabold text-[#102A56]">{activeClinic.name}</span>
                <span className="text-[9px] text-[#0A9F68] font-bold uppercase tracking-wide">
                  {activeClinic.role === 'CLINIC_OWNER' ? 'Clinic Owner' : activeClinic.role}
                </span>
              </div>
              {userClinics.length > 1 && (
                <ChevronDown className="w-3 h-3 text-slate-400 shrink-0 ml-0.5" />
              )}
            </button>

            {showClinicMenu && userClinics.length > 1 && (
              <div className="absolute right-0 sm:left-0 mt-1.5 w-64 bg-white rounded-2xl shadow-xl border border-slate-100 py-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="px-3 py-1.5 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Authorized Workspaces
                </div>
                {userClinics.map((c) => (
                  <button
                    key={c.id}
                    onClick={async () => {
                      setShowClinicMenu(false);
                      if (c.id !== activeClinic.id) {
                        await switchClinic(c.id);
                        window.location.reload();
                      }
                    }}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-50 transition-colors ${
                      c.id === activeClinic.id ? 'bg-emerald-50/70 text-emerald-800 font-bold' : 'text-slate-700'
                    }`}
                  >
                    <div className="truncate mr-2">
                      <p className="truncate font-semibold">{c.name}</p>
                      <span className="text-[10px] text-slate-400">{c.role}</span>
                    </div>
                    {c.id === activeClinic.id && (
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Language Selector */}
        <div className="relative">
          <button
            onClick={() => setShowLangMenu(!showLangMenu)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-[#E2E8F0] hover:border-slate-300 bg-white text-xs font-semibold text-[#102A56] hover:bg-slate-50 transition-all cursor-pointer"
          >
            <Globe className="w-4 h-4 text-slate-500" />
            <span className="hidden sm:inline">
              {activeLang === 'en' ? 'English' : activeLang === 'hi' ? 'हिन्दी' : 'বাংলা'}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {showLangMenu && (
            <div className="absolute right-0 mt-1.5 w-36 bg-white rounded-xl shadow-lg border border-slate-100 py-1 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
              <button
                onClick={() => handleLangChangeInternal('en')}
                className={`w-full text-left px-3 py-2 text-xs font-medium hover:bg-slate-50 ${
                  activeLang === 'en' ? 'text-[#0A9F68] font-bold bg-[#E7F7F0]/40' : 'text-[#102A56]'
                }`}
              >
                English
              </button>
              <button
                onClick={() => handleLangChangeInternal('hi')}
                className={`w-full text-left px-3 py-2 text-xs font-medium hover:bg-slate-50 ${
                  activeLang === 'hi' ? 'text-[#0A9F68] font-bold bg-[#E7F7F0]/40' : 'text-[#102A56]'
                }`}
              >
                हिन्दी (Hindi)
              </button>
              <button
                onClick={() => handleLangChangeInternal('bn')}
                className={`w-full text-left px-3 py-2 text-xs font-medium hover:bg-slate-50 ${
                  activeLang === 'bn' ? 'text-[#0A9F68] font-bold bg-[#E7F7F0]/40' : 'text-[#102A56]'
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
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold hover:bg-amber-100 transition-all cursor-pointer"
              title={strings?.common?.syncNow || 'Sync pending records'}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-amber-600' : ''}`} />
              <span className="hidden md:inline">{pendingSyncCount} {strings?.common?.syncPending || 'pending'}</span>
            </button>
          ) : (
            <div
              className={`p-1.5 rounded-full ${
                isOnline ? 'text-[#0A9F68] hover:bg-[#E7F7F0]' : 'text-rose-500 hover:bg-rose-50'
              } transition-colors`}
              title={isOnline ? strings?.sidebar?.systemSynchronized || 'Online' : strings?.sidebar?.youAreOffline || 'Offline'}
            >
              {isOnline ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            </div>
          )}
        </div>

        {/* Notifications Bell */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 text-slate-500 hover:text-[#102A56] hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
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
                <span className="text-xs font-bold text-[#102A56]">{strings?.dashboard?.notifications || 'Notifications'}</span>
                <span className="text-[10px] text-[#0A9F68] font-semibold bg-[#E7F7F0] px-1.5 py-0.5 rounded">
                  3 {strings?.dashboard?.newNotifications || 'New'}
                </span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="p-2 bg-red-50/60 rounded-xl border border-red-100 text-slate-700">
                  <p className="font-semibold text-red-700">{strings?.dashboard?.highRiskAlert || 'High Risk Patient Alert'}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Ramesh Kumar {strings?.dashboard?.highRiskAlertDesc || 'requires PHC referral follow-up.'}</p>
                </div>
                <div className="p-2 bg-purple-50/60 rounded-xl border border-purple-100 text-slate-700">
                  <p className="font-semibold text-purple-700">{strings?.dashboard?.teleconsultScheduled || 'Teleconsultation Scheduled'}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Sita Devi {strings?.dashboard?.teleconsultScheduledDesc || 'at 10:00 AM with Dr. Verma.'}</p>
                </div>
                <div className="p-2 bg-blue-50/60 rounded-xl border border-blue-100 text-slate-700">
                  <p className="font-semibold text-blue-700">{strings?.dashboard?.offlineSyncReady || 'Offline Sync Ready'}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{strings?.dashboard?.offlineSyncReadyDesc || 'All local screening records are backed up.'}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* User Profile Card */}
        <div className="relative pl-1 sm:pl-2 border-l border-slate-200">
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-2.5 py-1 px-1.5 rounded-xl hover:bg-slate-50 transition-all text-left cursor-pointer"
          >
            <img
              src={sunitaAvatar}
              alt={user?.full_name || 'User Profile'}
              className="w-9 h-9 rounded-full object-cover border-2 border-[#0A9F68]/20 shadow-2xs"
            />
            <div className="hidden md:block">
              <div className="text-xs font-bold text-[#102A56] leading-tight">
                {user?.full_name || 'Dr. Rajesh Sharma'}
              </div>
              <div className="text-[11px] text-[#0A9F68] font-bold">
                {user?.role === 'CLINIC_OWNER'
                  ? 'Clinic Owner'
                  : user?.role === 'PHC_DOCTOR' || user?.role === 'DOCTOR'
                  ? strings?.dashboard?.rolePhcDoctor || 'Medical Officer'
                  : user?.role === 'DISTRICT_OFFICER'
                  ? strings?.dashboard?.roleDistrictOfficer || 'District CMO'
                  : user?.role === 'SYSTEM_ADMIN'
                  ? strings?.dashboard?.roleSystemAdmin || 'System Admin'
                  : user?.role === 'COUNSELOR'
                  ? 'Specialist / Counselor'
                  : strings?.dashboard?.roleAsha || 'Health Worker'}
              </div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 mt-1.5 w-52 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-50 text-xs">
              <div className="px-3 py-2 border-b border-slate-100">
                <p className="font-bold text-[#102A56]">{user?.full_name || 'Dr. Rajesh Sharma'}</p>
                <p className="text-[11px] text-[#0A9F68] font-bold">
                  {activeClinic?.name || user?.facility_id || 'Health Center'}
                </p>
                {user?.email && (
                  <p className="text-[10px] text-slate-400 truncate">{user.email}</p>
                )}
              </div>
              <button
                onClick={() => setShowProfileMenu(false)}
                className="w-full text-left px-3 py-2 text-slate-700 hover:bg-slate-50 hover:text-[#0A9F68] font-medium"
              >
                {strings?.dashboard?.profileAndId || 'Profile & ID Card'}
              </button>
              <button
                onClick={() => setShowProfileMenu(false)}
                className="w-full text-left px-3 py-2 text-slate-700 hover:bg-slate-50 hover:text-[#0A9F68] font-medium"
              >
                {strings?.dashboard?.fieldWorkSummary || 'Field Work Summary'}
              </button>
              <button
                onClick={() => setShowProfileMenu(false)}
                className="w-full text-left px-3 py-2 text-slate-700 hover:bg-slate-50 hover:text-[#0A9F68] font-medium"
              >
                {strings?.dashboard?.settingsLanguage || 'Settings & Language'}
              </button>
              <div className="border-t border-slate-100 mt-1 pt-1">
                <button
                  onClick={handleSignOut}
                  className="w-full text-left px-3 py-2 text-rose-600 hover:bg-rose-50 font-bold flex items-center gap-2 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>{strings?.dashboard?.signOut || 'Sign Out'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
