import { X } from 'lucide-react';
import type { TaskFilters, Person, TaskStatus, PriorityLevel } from '../types';
import { STATUS_LABELS, PRIORITY_LABELS } from '../lib/utils';

interface ActiveFilterChipsProps {
  filters: TaskFilters;
  people: Person[];
  onChange: (filters: TaskFilters) => void;
}

interface Chip {
  key: string;
  label: string;
  patch: Partial<TaskFilters>;
}

/**
 * Row of removable chips showing which filters are currently active.
 * One chip per selected value, so a single value can be removed directly.
 * Renders nothing (and takes no space) when no filter is active.
 */
export function ActiveFilterChips({ filters, people, onChange }: ActiveFilterChipsProps) {
  const update = (patch: Partial<TaskFilters>) => onChange({ ...filters, ...patch });

  const chips: Chip[] = [];

  if (filters.search.trim() !== '') {
    chips.push({ key: 'search', label: `Search: "${filters.search}"`, patch: { search: '' } });
  }

  // One chip per selected status — removing it drops just that value.
  filters.statuses.forEach((status: TaskStatus) => {
    chips.push({
      key: `status:${status}`,
      label: `Status: ${STATUS_LABELS[status]}`,
      patch: { statuses: filters.statuses.filter(s => s !== status) },
    });
  });

  filters.priorities.forEach((priority: PriorityLevel) => {
    chips.push({
      key: `priority:${priority}`,
      label: `Priority: ${PRIORITY_LABELS[priority]}`,
      patch: { priorities: filters.priorities.filter(p => p !== priority) },
    });
  });

  filters.personIds.forEach(personId => {
    const name = people.find(p => p.id === personId)?.name ?? 'Unknown';
    chips.push({
      key: `person:${personId}`,
      label: `Person: ${name}`,
      patch: { personIds: filters.personIds.filter(id => id !== personId) },
    });
  });

  if (filters.overdue_only) {
    chips.push({ key: 'overdue', label: 'Overdue only', patch: { overdue_only: false } });
  }
  if (filters.due_this_week) {
    chips.push({ key: 'due_this_week', label: 'Due this week', patch: { due_this_week: false } });
  }
  if (filters.show_archived) {
    chips.push({ key: 'show_archived', label: 'Show archived', patch: { show_archived: false } });
  }

  if (chips.length === 0) return null;

  const clearAll = () =>
    onChange({
      search: '',
      statuses: [],
      priorities: [],
      personIds: [],
      show_archived: false,
      overdue_only: false,
      due_this_week: false,
    });

  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-3 border-t border-gray-100">
      <span className="text-xs font-medium text-gray-400 mr-0.5">Active filters:</span>
      {chips.map(chip => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full pl-2.5 pr-1 py-0.5 text-xs"
        >
          <span className="whitespace-nowrap">{chip.label}</span>
          <button
            type="button"
            onClick={() => update(chip.patch)}
            className="rounded-full p-0.5 hover:bg-blue-100 text-blue-500 hover:text-blue-700 transition-colors"
            aria-label={`Remove filter: ${chip.label}`}
          >
            <X size={11} />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={clearAll}
        className="ml-1 text-xs font-medium text-red-600 hover:text-red-700 hover:underline"
      >
        Clear all
      </button>
    </div>
  );
}
