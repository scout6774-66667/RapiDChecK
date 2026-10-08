import React, { useState, useEffect } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import type { TaskItem } from './types';

interface TodayTasksCardProps {
  tasks: TaskItem[];
  onViewAll?: () => void;
  onToggleTask?: (taskId: string) => void;
}

export const TodayTasksCard: React.FC<TodayTasksCardProps> = ({
  tasks: initialTasks,
  onViewAll,
  onToggleTask,
}) => {
  const [tasks, setTasks] = useState(initialTasks);

  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  const handleToggle = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
    onToggleTask?.(id);
  };

  const getStatusBadge = (status: TaskItem['status']) => {
    switch (status) {
      case 'In Progress':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#FFFBEB] text-[#F59E0B] border border-amber-200">
            ● In Progress
          </span>
        );
      case 'High Priority':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#FEF2F2] text-[#EF4444] border border-red-200">
            ● High Priority
          </span>
        );
      case 'Pending':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#EFF6FF] text-[#3B82F6] border border-blue-200">
            Pending
          </span>
        );
      case 'Reminder':
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#EFF6FF] text-[#3B82F6] border border-blue-200">
            Reminder
          </span>
        );
    }
  };

  return (
    <div className="health-card p-4 sm:p-5 flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-[#102A56]">Today's Tasks</h3>
        <button
          onClick={onViewAll}
          className="text-xs font-bold text-[#0A9F68] hover:text-[#088758] flex items-center gap-1 transition-all"
        >
          <span>View All</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Task List or Empty State */}
      {tasks.length === 0 ? (
        <div className="py-7 flex flex-col items-center justify-center text-center">
          <p className="text-xs font-bold text-[#102A56]">No tasks for today.</p>
          <p className="text-[11px] text-slate-500 mt-1 max-w-xs">
            Offline sync reminders, high-risk follow-ups, and scheduled teleconsultations will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {tasks.map((task) => (
            <div
              key={task.id}
              onClick={() => handleToggle(task.id)}
              className={`p-2.5 rounded-xl border transition-all flex items-center justify-between gap-3 cursor-pointer ${
                task.completed
                  ? 'bg-slate-50/50 border-slate-100 opacity-60'
                  : 'bg-white border-slate-100 hover:border-[#0A9F68]/30 hover:bg-slate-50/40'
              }`}
            >
              <div className="flex items-center gap-3">
                {/* Rounded Checkbox */}
                <div
                  className={`w-4.5 h-4.5 rounded-md border flex items-center justify-center transition-all ${
                    task.completed
                      ? 'bg-[#0A9F68] border-[#0A9F68] text-white'
                      : 'border-slate-300 hover:border-[#0A9F68]'
                  }`}
                >
                  {task.completed && <Check className="w-3 h-3 stroke-[3]" />}
                </div>

                <div>
                  <p
                    className={`text-xs font-bold text-[#102A56] leading-tight ${
                      task.completed ? 'line-through text-slate-400' : ''
                    }`}
                  >
                    {task.title}
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                    {task.timeOrSubtext}
                  </p>
                </div>
              </div>

              <div>{getStatusBadge(task.status)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
