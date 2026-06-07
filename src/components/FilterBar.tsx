import { Search, X } from 'lucide-react';
import type { TaskFilters, Person, TaskStatus, PriorityLevel } from '../types';
import { STATUS_LABELS, PRIORITY_LABELS } from '../lib/utils';
import { Button } from './ui/Button';
import { ActiveFilterChips } from './ActiveFilterChips';
import { MultiSelectDropdown } from './MultiSelectDropdown';

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
    filters.statuses.length > 0 ||
    filters.priorities.length > 0 ||
    filters.personIds.length > 0 ||
    filters.overdue_only ||
    filters.due_this_week;

  const clearFilters = () => onChange({
    search: '',
    statuses: [],
    priorities: [],
    personIds: [],
    show_archived: filters.show_archived,
    overdue_only: false,
    due_this_week: false,
  });

  const statusOptions = (Object.entries(STATUS_LABELS) as [TaskStatus, string][]).map(
    ([value, label]) => ({ value, label }),
  );
  const priorityOptions = (Object.entries(PRIORITY_LABELS) as [string, string][]).map(
    ([value, label]) => ({ value, label }),
  );
  const personOptions = people.map(p => ({ value: p.id, label: p.name }));

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
        <MultiSelectDropdown
          allLabel="All Statuses"
          singular="Status"
          plural="Statuses"
          options={statusOptions}
          selectedValues={filters.statuses}
          onChange={vals => update({ statuses: vals as TaskStatus[] })}
        />

        <MultiSelectDropdown
          allLabel="All Priorities"
          singular="Priority"
          plural="Priorities"
          options={priorityOptions}
          selectedValues={filters.priorities.map(String)}
          onChange={vals => update({ priorities: vals.map(Number) as PriorityLevel[] })}
        />

        <MultiSelectDropdown
          allLabel="All People"
          singular="Person"
          plural="People"
          options={personOptions}
          selectedValues={filters.personIds}
          onChange={vals => update({ personIds: vals })}
        />

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
