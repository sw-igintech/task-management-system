import { X } from 'lucide-react';
import type { TaskFilters, Person } from '../types';
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
 * Renders nothing (and takes no space) when no filter is active.
 */
export function ActiveFilterChips({ filters, people, onChange }: ActiveFilterChipsProps) {
  const update = (patch: Partial<TaskFilters>) => onChange({ ...filters, ...patch });

  const chips: Chip[] = [];

  if (filters.search.trim() !== '') {
    chips.push({ key: 'search', label: `Search: "${filters.search}"`, patch: { search: '' } });
  }
  if (filters.status !== 'all') {
    chips.push({ key: 'status', label: `Status: ${STATUS_LABELS[filters.status]}`, patch: { status: 'all' } });
  }
  if (filters.priority !== 'all') {
    chips.push({ key: 'priority', label: `Priority: ${PRIORITY_LABELS[filters.priority]}`, patch: { priority: 'all' } });
  }
  if (filters.responsible_person_id !== 'all') {
    const name = people.find(p => p.id === filters.responsible_person_id)?.name ?? 'Unknown';
    chips.push({ key: 'person', label: `Person: ${name}`, patch: { responsible_person_id: 'all' } });
  }
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
      status: 'all',
      priority: 'all',
      responsible_person_id: 'all',
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
