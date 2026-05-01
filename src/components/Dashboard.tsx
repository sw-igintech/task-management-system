import { AlertCircle, Calendar, Flame, CheckCircle2, Clock, Users } from 'lucide-react';
import type { TaskFilters } from '../types';
import { STATUS_LABELS } from '../lib/utils';

interface DashboardStats {
  totalActive: number;
  overdue: number;
  dueThisWeek: number;
  highPriority: number;
  byStatus: Record<string, number>;
  byPerson: Array<{ name: string; total: number; overdue: number }>;
}

interface DashboardProps {
  stats: DashboardStats;
  onFilterChange?: (filters: Partial<TaskFilters>) => void;
}

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  onClick?: () => void;
}

function StatCard({ label, value, icon, color, bgColor, onClick }: StatCardProps) {
  return (
    <button
      onClick={onClick}
      className={`${bgColor} rounded-xl p-5 flex items-start gap-4 text-left transition-transform hover:scale-[1.02] hover:shadow-md w-full border border-transparent hover:border-gray-200`}
    >
      <div className={`${color} p-2.5 rounded-lg bg-white/60`}>
        {icon}
      </div>
      <div>
        <p className="text-3xl font-bold text-gray-900">{value}</p>
        <p className={`text-sm font-medium mt-0.5 ${color}`}>{label}</p>
      </div>
    </button>
  );
}

const statusBarColor: Record<string, string> = {
  not_started: 'bg-sky-400',
  in_progress: 'bg-yellow-400',
  on_hold: 'bg-red-400',
  need_to_review: 'bg-orange-400',
  done: 'bg-green-400',
};

export function Dashboard({ stats, onFilterChange }: DashboardProps) {
  const totalByStatus = Object.values(stats.byStatus).reduce((a, b) => a + b, 0) || 1;
  const maxPersonCount = Math.max(...stats.byPerson.map(p => p.total), 1);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Summary cards */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Overview</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Active Tasks"
            value={stats.totalActive}
            icon={<Clock size={22} className="text-blue-600" />}
            color="text-blue-600"
            bgColor="bg-blue-50"
            onClick={() => onFilterChange?.({ status: 'all', show_archived: false, overdue_only: false, due_this_week: false })}
          />
          <StatCard
            label="Overdue"
            value={stats.overdue}
            icon={<AlertCircle size={22} className="text-red-600" />}
            color="text-red-600"
            bgColor="bg-red-50"
            onClick={() => onFilterChange?.({ overdue_only: true, show_archived: false })}
          />
          <StatCard
            label="Due This Week"
            value={stats.dueThisWeek}
            icon={<Calendar size={22} className="text-orange-600" />}
            color="text-orange-600"
            bgColor="bg-orange-50"
            onClick={() => onFilterChange?.({ due_this_week: true, show_archived: false })}
          />
          <StatCard
            label="High Priority"
            value={stats.highPriority}
            icon={<Flame size={22} className="text-rose-600" />}
            color="text-rose-600"
            bgColor="bg-rose-50"
            onClick={() => onFilterChange?.({ priority: 1, show_archived: false })}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status breakdown */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 size={16} className="text-gray-400" />
            <h3 className="font-semibold text-gray-700">Status Breakdown</h3>
          </div>
          <div className="flex flex-col gap-3">
            {Object.entries(stats.byStatus).map(([status, count]) => {
              const pct = Math.round((count / totalByStatus) * 100);
              return (
                <div key={status}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm text-gray-600">{STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status}</span>
                    <span className="text-sm font-semibold text-gray-800">{count}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${statusBarColor[status] ?? 'bg-gray-400'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* By person */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users size={16} className="text-gray-400" />
            <h3 className="font-semibold text-gray-700">Tasks by Person</h3>
          </div>
          <div className="flex flex-col gap-3">
            {stats.byPerson
              .sort((a, b) => b.total - a.total)
              .map(({ name, total, overdue }) => (
                <div key={name}>
                  <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                        {name.charAt(0)}
                      </span>
                      <span className="text-sm text-gray-700">{name}</span>
                      {overdue > 0 && (
                        <span className="text-xs bg-red-100 text-red-600 rounded px-1.5 py-0.5">
                          {overdue} overdue
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-gray-800">{total}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-400 rounded-full transition-all"
                      style={{ width: `${Math.round((total / maxPersonCount) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
