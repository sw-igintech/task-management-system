import { Search, X } from 'lucide-react';
import type { TaskFilters, Person } from '../types';
import { STATUS_LABELS, PRIORITY_LABELS } from '../lib/utils';
import { Button } from './ui/Button';
import { ActiveFilterChips } from './ActiveFilterChips';

interface FilterBarProps {
  filters: TaskFilters;
  people: Person[];
  onChange: (filters: TaskFilters) => void;
  totalCount: number;
  filteredCount: number;
}

export function FilterBar({ filters, people, onChange, totalCount, filteredCount }: FilterBarProps) {
  const update = (patch: Partial<TaskFilters>) => onChange({ ...filters, ...patch });

  const hasActiveFilters =
    filters.search !== '' ||
    filters.status !== 'all' ||
    filters.priority !== 'all' ||
    filters.responsible_person_id !== 'all' ||
    filters.overdue_only ||
    filters.due_this_week;

  const clearFilters = () => onChange({
    search: '',
    status: 'all',
    priority: 'all',
    responsible_person_id: 'all',
    show_archived: filters.show_archived,
    overdue_only: false,
    due_this_week: false,
  });

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 flex flex-col gap-3">
      {/* Search row */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search tasks, notes, people..."
            value={filters.search}
            onChange={e => update({ search: e.target.value })}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {filters.search && (
            <button
              onClick={() => update({ search: '' })}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="whitespace-nowrap text-red-600 hover:text-red-700 hover:bg-red-50">
            <X size={13} />
            Clear filters
          </Button>
        )}
      </div>

      {/* Filter dropdowns */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filters.status}
          onChange={e => update({ status: e.target.value as TaskFilters['status'] })}
          className="text-xs border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="all">All Statuses</option>
          {Object.entries(STATUS_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>

        <select
          value={filters.priority}
          onChange={e => update({ priority: e.target.value === 'all' ? 'all' : Number(e.target.value) as TaskFilters['priority'] })}
          className="text-xs border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="all">All Priorities</option>
          {Object.entries(PRIORITY_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>

        <select
          value={filters.responsible_person_id}
          onChange={e => update({ responsible_person_id: e.target.value })}
          className="text-xs border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="all">All People</option>
          {people.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={filters.overdue_only}
            onChange={e => update({ overdue_only: e.target.checked })}
            className="rounded"
          />
          Overdue only
        </label>

        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={filters.due_this_week}
            onChange={e => update({ due_this_week: e.target.checked })}
            className="rounded"
          />
          Due this week
        </label>

        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none ml-auto">
          <input
            type="checkbox"
            checked={filters.show_archived}
            onChange={e => update({ show_archived: e.target.checked })}
            className="rounded"
          />
          Show archived
        </label>

        <span className="text-xs text-gray-400 ml-2">
          {filteredCount === totalCount
            ? `${totalCount} tasks`
            : `${filteredCount} of ${totalCount} tasks`}
        </span>
      </div>

      {/* Active filter chips (renders nothing when no filter is active) */}
      <ActiveFilterChips filters={filters} people={people} onChange={onChange} />
    </div>
  );
}
