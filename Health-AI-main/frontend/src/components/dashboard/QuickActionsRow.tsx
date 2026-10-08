import React from 'react';
import { Plus, Stethoscope, Share2, Calendar, MessageSquare } from 'lucide-react';

interface QuickActionsRowProps {
  onActionClick: (action: 'add_patient' | 'screen' | 'refer' | 'appointment' | 'chat') => void;
}

export const QuickActionsRow: React.FC<QuickActionsRowProps> = ({ onActionClick }) => {
  const actions = [
    {
      id: 'add_patient' as const,
      title: 'Add New Patient',
      desc: 'Register and start screening',
      icon: Plus,
      bg: 'bg-[#E7F7F0]/70 hover:bg-[#E7F7F0]',
      border: 'border-[#C7EBDD]',
      iconBg: 'bg-[#0A9F68]',
      iconColor: 'text-white',
    },
    {
      id: 'screen' as const,
      title: 'Screen Patient',
      desc: 'Begin health assessment',
      icon: Stethoscope,
      bg: 'bg-[#EFF6FF]/70 hover:bg-[#EFF6FF]',
      border: 'border-[#BFDBFE]',
      iconBg: 'bg-[#3B82F6]',
      iconColor: 'text-white',
    },
    {
      id: 'refer' as const,
      title: 'Refer to PHC',
      desc: 'Create referral record',
      icon: Share2,
      bg: 'bg-[#FFFBEB]/70 hover:bg-[#FFFBEB]',
      border: 'border-[#FDE68A]',
      iconBg: 'bg-[#F59E0B]',
      iconColor: 'text-white',
    },
    {
      id: 'appointment' as const,
      title: 'Book Appointment',
      desc: 'Schedule follow-up',
      icon: Calendar,
      bg: 'bg-[#F5F3FF]/70 hover:bg-[#F5F3FF]',
      border: 'border-[#DDD6FE]',
      iconBg: 'bg-[#8B5CF6]',
      iconColor: 'text-white',
    },
    {
      id: 'chat' as const,
      title: 'Open AI Assistant',
      desc: 'Health guidance & support',
      icon: MessageSquare,
      bg: 'bg-[#ECFDF5]/70 hover:bg-[#ECFDF5]',
      border: 'border-[#A7F3D0]',
      iconBg: 'bg-[#10B981]',
      iconColor: 'text-white',
    },
  ];

  return (
    <div className="health-card p-4 sm:p-5 mt-5">
      <h3 className="text-sm font-bold text-[#102A56] mb-3">Quick Actions</h3>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {actions.map((act) => {
          const Icon = act.icon;
          return (
            <button
              key={act.id}
              onClick={() => onActionClick(act.id)}
              className={`p-3 rounded-2xl border ${act.border} ${act.bg} text-left transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center gap-3 group`}
            >
              <div
                className={`w-9 h-9 rounded-full ${act.iconBg} ${act.iconColor} flex items-center justify-center shrink-0 shadow-xs`}
              >
                <Icon className="w-4.5 h-4.5" />
              </div>
              <div>
                <p className="text-xs font-bold text-[#102A56] leading-tight group-hover:text-[#0A9F68] transition-colors">
                  {act.title}
                </p>
                <p className="text-[10px] text-slate-500 font-medium mt-0.5 leading-snug">
                  {act.desc}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
