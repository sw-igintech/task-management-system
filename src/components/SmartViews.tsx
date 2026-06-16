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
  hint?: string;
}

const BASE_SMART_VIEWS: SmartView[] = [
  {
    id: 'all-active',
    label: 'All Active',
    icon: <List size={14} />,
    hint: 'Active tasks — excludes Done and archived. The total task count is shown in the filter bar.',
    filters: {
      statuses: [],
      priorities: [],
      personIds: [],
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
    filters: { priorities: [1], show_archived: false },
  },
  {
    id: 'need-review',
    label: 'Need Review',
    icon: <Eye size={14} className="text-orange-500" />,
    filters: { statuses: ['need_to_review'], show_archived: false },
  },
  {
    id: 'in-progress',
    label: 'In Progress',
    icon: <BarChart2 size={14} className="text-yellow-500" />,
    filters: { statuses: ['in_progress'], show_archived: false },
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
    statuses: [],
    priorities: [],
    personIds: [],
    show_archived: false,
    overdue_only: false,
    due_this_week: false,
  };

  const applyView = (view: SmartView) => {
    onChange({ ...DEFAULT_FILTERS, ...view.filters });
    onClose?.();
  };

  // Compare filter values, treating arrays as unordered sets.
  const valuesEqual = (a: unknown, b: unknown): boolean => {
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      const setB = new Set(b);
      return a.every(x => setB.has(x));
    }
    return a === b;
  };

  const isActiveView = (view: SmartView): boolean =>
    Object.entries(view.filters).every(([k, v]) => valuesEqual(filters[k as keyof TaskFilters], v));

  // Toggle a person in the multi-select person filter WITHOUT touching any other
  // active filter (statuses/priorities/search/overdue/due-this-week/show_archived).
  // Add the person if not selected, remove if already selected.
  const applyPersonFilter = (personId: string) => {
    onChange({
      ...filters,
      personIds: filters.personIds.includes(personId)
        ? filters.personIds.filter(id => id !== personId)
        : [...filters.personIds, personId],
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
          title={view.hint}
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
            // Highlight every selected person (multi-select), regardless of other
            // active filters — consistent with the toggle/merge behavior above.
            const isActive = filters.personIds.includes(person.id);
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
