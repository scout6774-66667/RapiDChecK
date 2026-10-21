import React from 'react';
import {
  LayoutDashboard,
  ClipboardCheck,
  Users,
  Share2,
  Calendar,
  BarChart3,
  MessageCircle,
  BookOpen,
  CheckCircle2,
  Heart,
  UserCheck,
  X
} from 'lucide-react';
import ashaIllustration from '../../assets/asha_sidebar.jpg';

import { RuralHealthLogo } from '../brand/RuralHealthLogo';
import { useLanguage } from '../../i18n';
import { useAuth } from '../../auth/AuthContext';

export type DashboardNavTab =
  | 'dashboard'
  | 'screen'
  | 'patients'
  | 'referrals'
  | 'appointments'
  | 'staff'
  | 'analytics'
  | 'population_health'
  | 'chat'
  | 'resources';

interface DashboardSidebarProps {
  currentTab: DashboardNavTab;
  onSelectTab: (tab: DashboardNavTab) => void;
  isOnline: boolean;
  appointmentCount?: number;
  onCloseMobileMenu?: () => void;
}

export const DashboardSidebar: React.FC<DashboardSidebarProps> = ({
  currentTab,
  onSelectTab,
  isOnline,
  appointmentCount = 0,
  onCloseMobileMenu,
}) => {
  const { strings } = useLanguage();
  const { user } = useAuth();
  const isOwnerOrDoctor =
    !user ||
    user.role === 'CLINIC_OWNER' ||
    user.role === 'SYSTEM_ADMIN' ||
    user.role === 'PHC_DOCTOR' ||
    user.role === 'DOCTOR';

  const navItems: { id: DashboardNavTab; label: string; icon: React.ElementType; badge?: number | string }[] = [
    { id: 'dashboard', label: strings?.sidebar?.dashboard || 'Dashboard', icon: LayoutDashboard },
    { id: 'screen', label: strings?.sidebar?.screenPatients || 'Screen Patients', icon: ClipboardCheck },
    { id: 'patients', label: strings?.sidebar?.patientDirectory || 'Patient Directory', icon: Users },
    { id: 'referrals', label: strings?.sidebar?.idrcReferrals || 'IDRC Referrals', icon: Share2 },
    { id: 'appointments', label: strings?.sidebar?.appointments || 'Appointments', icon: Calendar, badge: appointmentCount },
    ...(isOwnerOrDoctor
      ? [{ id: 'staff' as DashboardNavTab, label: strings?.sidebar?.staffManagement || 'Staff Management', icon: UserCheck }]
      : []),
    { id: 'population_health', label: strings?.sidebar?.populationHealth || 'Population Health', icon: Heart, badge: 'HMIS' },
    { id: 'analytics', label: strings?.sidebar?.analytics || 'Analysis', icon: BarChart3 },
    { id: 'chat', label: strings?.sidebar?.chatAssistant || 'Chat Assistant', icon: MessageCircle },
    { id: 'resources', label: strings?.sidebar?.healthResources || 'Health Resources', icon: BookOpen },
  ];

  return (
    <aside className="w-[245px] bg-white border-r border-[#E5EEF1] flex flex-col justify-between h-screen sticky top-0 shrink-0 z-40 overflow-y-auto select-none">
      {/* Top Branding */}
      <div>
        <div className="p-4 sm:p-5 flex items-center justify-between border-b border-slate-100">
          <div
            className="cursor-pointer"
            onClick={() => onSelectTab('dashboard')}
            title="RuralHealth AI Dashboard"
          >
            <RuralHealthLogo size="sm" showTagline={true} />
          </div>

          {/* Close button on mobile */}
          {onCloseMobileMenu && (
            <button
              onClick={onCloseMobileMenu}
              className="lg:hidden p-1 text-slate-400 hover:text-slate-700"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Navigation Items */}
        <nav className="px-3 py-3.5 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelectTab(item.id);
                  if (onCloseMobileMenu) onCloseMobileMenu();
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all group ${
                  isActive
                    ? 'bg-[#0A9F68] text-white shadow-md shadow-[#0A9F68]/25 font-bold'
                    : 'text-[#102A56] hover:bg-[#F4F9FA] hover:text-[#0A9F68]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4.5 h-4.5 transition-colors ${
                      isActive ? 'text-white' : 'text-slate-500 group-hover:text-[#0A9F68]'
                    }`}
                  />
                  <span>{item.label}</span>
                </div>

                {item.badge !== undefined && (typeof item.badge === 'string' || item.badge > 0) && (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      isActive
                        ? 'bg-white text-[#0A9F68]'
                        : 'bg-[#E7F7F0] text-[#0A9F68] border border-[#0A9F68]/30'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Middle & Bottom Sections: Offline Card + ASHA Illustration */}
      <div className="px-3 pb-3 space-y-3">
        {/* Offline / Online Status Card */}
        <div className="bg-[#EAF7F1]/80 border border-[#BDE7D3] rounded-2xl p-3 text-left">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-extrabold tracking-wider text-[#0A9F68] uppercase bg-white/80 px-2 py-0.5 rounded-md border border-[#0A9F68]/20">
              {isOnline ? strings?.sidebar?.onlineBadge || 'ONLINE' : strings?.sidebar?.offlineBadge || 'OFFLINE MODE'}
            </span>
            <CheckCircle2 className="w-3.5 h-3.5 text-[#0A9F68]" />
          </div>
          <p className="text-xs font-bold text-[#102A56] leading-tight">
            {isOnline
              ? strings?.sidebar?.systemSynchronized || 'System Synchronized'
              : strings?.sidebar?.youAreOffline || 'You are offline'}
          </p>
          <p className="text-[10px] text-slate-600 mt-0.5 leading-snug">
            {isOnline
              ? strings?.sidebar?.recordsUpToDate || 'All health records up-to-date.'
              : strings?.sidebar?.dataWillSync || 'Data will sync automatically'}
          </p>
        </div>

        {/* Rural Village & ASHA Worker Graphic Card */}
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-b from-[#F0FDF4] to-[#DCFCE7] border border-[#BDE7D3] p-2 text-center group shadow-2xs">
          <div className="relative h-28 w-full rounded-xl overflow-hidden mb-2">
            <img
              src={ashaIllustration}
              alt="ASHA Worker in Village"
              className="w-full h-full object-cover object-top filter contrast-[1.05]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-white/70 via-transparent to-transparent"></div>
          </div>

          <p className="text-[12px] font-handwriting text-[#102A56] font-bold leading-tight px-1 flex items-center justify-center flex-wrap gap-1">
            <span>{strings?.sidebar?.missionStatement || 'Technology in the hands of Health Workers for a Healthier Tomorrow'}</span>
            <Heart className="w-3.5 h-3.5 fill-red-500 text-red-500 inline-block" />
          </p>
        </div>
      </div>
    </aside>
  );
};
