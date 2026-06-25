import { Bell, Archive, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { ActivityEvent, ActivityFilters, Person } from '../types';
import { formatTaskKey } from '../lib/utils';

interface ActivityPageProps {
  events: ActivityEvent[];
  loading: boolean;
  // Selected Current user id (lightweight identity, not auth). null → empty state.
  currentUserId: string | null;
  people: Person[];
  filters: ActivityFilters;
  setFilters: (next: ActivityFilters) => void;
  // Opens the referenced task via the existing ?task= deep-link mechanism.
  onOpenTask: (taskNumber: number) => void;
}

// Event-type options for the filter dropdown (value '' = all). Labels are English.
const EVENT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All event types' },
  { value: 'task_created', label: 'Created' },
  { value: 'task_assigned', label: 'Assigned' },
  { value: 'person_mentioned', label: 'Mentioned' },
  { value: 'task_updated', label: 'Description/Notes updated' },
  { value: 'status_changed', label: 'Status changed' },
  { value: 'priority_changed', label: 'Priority changed' },
  { value: 'due_date_changed', label: 'Due date changed' },
  { value: 'closed_date_changed', label: 'Closed date changed' },
  { value: 'task_archived', label: 'Archived' },
  { value: 'task_restored', label: 'Restored' },
];

const EVENT_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  EVENT_TYPE_OPTIONS.filter(o => o.value).map(o => [o.value, o.label]),
);

function formatTime(iso: string): string {
  try {
    return format(parseISO(iso), "MMM d, yyyy '•' h:mm a");
  } catch {
    return iso;
  }
}

// Secondary detail line (snippet / added text) when the structured details carry one.
function detailLine(ev: ActivityEvent): string | null {
  const d = ev.details as Record<string, unknown> | null;
  if (!d) return null;
  if (typeof d.snippet === 'string' && d.snippet) return d.snippet;
  const changes = d.changes as Array<{ added?: string | null; field?: string }> | undefined;
  if (Array.isArray(changes)) {
    const withAdded = changes.find(c => c.added);
    if (withAdded?.added) return withAdded.added;
  }
  return null;
}

// "Activity" feed view. Icon-only bell entry lives in the header (App.tsx); this is the
// content panel — a read-only history for the Current user, newest first, with compact
// filters. Clicking an item opens the task. No modal/popup is used. Clicking a general
// Activity item NEVER marks a My Mentions item read (that read behaviour lives only in
// My Mentions).
export function ActivityPage({ events, loading, currentUserId, people, filters, setFilters, onOpenTask }: ActivityPageProps) {
  const update = (patch: Partial<ActivityFilters>) => setFilters({ ...filters, ...patch });
  const hasActiveFilters = Boolean(filters.event_type || filters.actor_person_id || filters.from || filters.to || (filters.q && filters.q.trim()));

  return (
    <div className="p-3 md:p-4 max-w-3xl mx-auto w-full">
      <div className="flex items-center gap-2 mb-4">
        <div className="bg-blue-600 text-white p-1.5 rounded-lg">
          <Bell size={18} />
        </div>
        <h1 className="text-xl font-bold text-gray-900">Activity</h1>
      </div>

      {/* No Current user → never show another person's data. Inline empty state (no popup). */}
      {!currentUserId ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          Select Current user to view your activity.
        </div>
      ) : (
        <>
          {/* Compact filters: text search, person (actor), event type, date range. */}
          <div className="flex flex-wrap items-end gap-2 mb-3 bg-white border border-gray-200 rounded-lg p-2.5">
            <label className="flex flex-col gap-0.5 text-[11px] text-gray-500 flex-1 min-w-[140px]">
              Search
              <input
                type="text"
                value={filters.q ?? ''}
                onChange={e => update({ q: e.target.value })}
                placeholder="Task, summary, text…"
                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] text-gray-500">
              Actor
              <select
                value={filters.actor_person_id ?? ''}
                onChange={e => update({ actor_person_id: e.target.value || undefined })}
                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Anyone</option>
                {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] text-gray-500">
              Type
              <select
                value={filters.event_type ?? ''}
                onChange={e => update({ event_type: e.target.value || undefined })}
                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {EVENT_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] text-gray-500">
              From
              <input
                type="date"
                value={filters.from ?? ''}
                onChange={e => update({ from: e.target.value || undefined })}
                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] text-gray-500">
              To
              <input
                type="date"
                value={filters.to ?? ''}
                onChange={e => update({ to: e.target.value || undefined })}
                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </label>
            {hasActiveFilters && (
              <button
                onClick={() => setFilters({})}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 px-2 py-1.5"
                title="Clear filters"
              >
                <X size={13} /> Clear
              </button>
            )}
          </div>

          {loading ? (
            <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
              Loading your activity…
            </div>
          ) : events.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
              {hasActiveFilters ? 'No activity matches these filters.' : 'No activity yet.'}
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {events.map(ev => {
                const detail = detailLine(ev);
                return (
                  <li key={ev.id}>
                    <button
                      onClick={() => onOpenTask(ev.task_number)}
                      className="w-full text-left rounded-lg border border-gray-200 bg-white p-3 hover:border-blue-400 hover:bg-blue-50/40 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] uppercase tracking-wide font-semibold text-blue-700 bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5">
                          {EVENT_TYPE_LABELS[ev.event_type] ?? ev.event_type}
                        </span>
                        <span className="font-semibold text-blue-700 text-sm">{formatTaskKey(ev.task_number)}</span>
                        <span className="text-sm font-medium text-gray-900 truncate">{ev.task_title ?? '(untitled)'}</span>
                        {ev.task_archived && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                            <Archive size={11} /> Archived
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-sm text-gray-700">{ev.summary}</div>
                      {detail && (
                        <div className="mt-1 text-xs text-gray-500 line-clamp-2 whitespace-pre-wrap break-words">{detail}</div>
                      )}
                      <div className="mt-1 text-[11px] text-gray-400">{formatTime(ev.created_at)}</div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
