import {
  List,
  AlertCircle,
  Calendar,
  Flame,
  Eye,
  Users,
  BarChart2,
} from 'lucide-react';
import type { TaskFilters, Person } from '../types';
import { cn } from '../lib/utils';

interface SmartView {
  id: string;
  label: string;
  icon: React.ReactNode;
  filters: Partial<TaskFilters>;
}

const BASE_SMART_VIEWS: SmartView[] = [
  {
    id: 'all-active',
    label: 'All Active',
    icon: <List size={14} />,
    filters: {
      status: 'all',
      priority: 'all',
      responsible_person_id: 'all',
      overdue_only: false,
      due_this_week: false,
      show_archived: false,
    },
  },
  {
    id: 'overdue',
    label: 'Overdue',
    icon: <AlertCircle size={14} className="text-red-500" />,
    filters: { overdue_only: true, show_archived: false },
  },
  {
    id: 'due-this-week',
    label: 'Due This Week',
    icon: <Calendar size={14} className="text-orange-500" />,
    filters: { due_this_week: true, show_archived: false },
  },
  {
    id: 'high-priority',
    label: 'High Priority',
    icon: <Flame size={14} className="text-red-600" />,
    filters: { priority: 1, show_archived: false },
  },
  {
    id: 'need-review',
    label: 'Need Review',
    icon: <Eye size={14} className="text-orange-500" />,
    filters: { status: 'need_to_review', show_archived: false },
  },
  {
    id: 'in-progress',
    label: 'In Progress',
    icon: <BarChart2 size={14} className="text-yellow-500" />,
    filters: { status: 'in_progress', show_archived: false },
  },
];

interface SmartViewsProps {
  filters: TaskFilters;
  people: Person[];
  onChange: (filters: TaskFilters) => void;
  taskCounts: Record<string, number>;
  onClose?: () => void;
}

export function SmartViews({ filters, people, onChange, taskCounts, onClose }: SmartViewsProps) {
  const DEFAULT_FILTERS: TaskFilters = {
    search: '',
    status: 'all',
    priority: 'all',
    responsible_person_id: 'all',
    show_archived: false,
    overdue_only: false,
    due_this_week: false,
  };

  const applyView = (view: SmartView) => {
    onChange({ ...DEFAULT_FILTERS, ...view.filters });
    onClose?.();
  };

  const isActiveView = (view: SmartView): boolean => {
    for (const [k, v] of Object.entries(view.filters)) {
      if (filters[k as keyof TaskFilters] !== v) return false;
    }
    return true;
  };

  const applyPersonFilter = (personId: string) => {
    onChange({
      ...DEFAULT_FILTERS,
      responsible_person_id: personId,
    });
    onClose?.();
  };

  return (
    <div className="w-48 shrink-0 flex flex-col gap-1">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-2 mb-1">
        Smart Views
      </p>

      {BASE_SMART_VIEWS.map(view => (
        <button
          key={view.id}
          onClick={() => applyView(view)}
          className={cn(
            'flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left w-full transition-colors',
            isActiveView(view)
              ? 'bg-blue-600 text-white font-medium'
              : 'text-gray-700 hover:bg-gray-100',
          )}
        >
          {view.icon}
          <span className="flex-1 truncate">{view.label}</span>
          {taskCounts[view.id] !== undefined && (
            <span className={cn(
              'text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center',
              isActiveView(view) ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600',
            )}>
              {taskCounts[view.id]}
            </span>
          )}
        </button>
      ))}

      {people.length > 0 && (
        <>
          <div className="mt-3 mb-1 flex items-center gap-1.5 px-2">
            <Users size={12} className="text-gray-400" />
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              By Person
            </p>
          </div>
          {people.map(person => {
            const isActive = filters.responsible_person_id === person.id &&
              filters.status === 'all' &&
              filters.priority === 'all' &&
              !filters.overdue_only &&
              !filters.due_this_week;
            return (
              <button
                key={person.id}
                onClick={() => applyPersonFilter(person.id)}
                className={cn(
                  'flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left w-full transition-colors',
                  isActive
                    ? 'bg-blue-600 text-white font-medium'
                    : 'text-gray-700 hover:bg-gray-100',
                )}
              >
                <span className={cn(
                  'w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                  isActive ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-700',
                )}>
                  {person.name.charAt(0)}
                </span>
                <span className="flex-1 truncate">{person.name}</span>
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}
