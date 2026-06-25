import { AtSign, Archive } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { MentionNotification } from '../types';
import { formatTaskKey } from '../lib/utils';

interface MentionsPageProps {
  mentions: MentionNotification[];
  loading: boolean;
  // Selected Current user id (lightweight identity, not auth). null → empty state.
  currentUserId: string | null;
  // Marks a mention opened/read (D1-persisted, global for the Current user).
  onMarkOpened: (id: number) => Promise<void>;
  // Opens the referenced task via the existing ?task= deep-link mechanism.
  onOpenTask: (taskNumber: number) => void;
}

// Human date+time for a mention, e.g. "Jun 25, 2026 • 2:14 PM". Falls back to the raw
// string if it can't be parsed.
function formatMentionTime(iso: string): string {
  try {
    return format(parseISO(iso), "MMM d, yyyy '•' h:mm a");
  } catch {
    return iso;
  }
}

// "My Mentions" inbox view. Icon-only @ entry lives in the header (App.tsx); this is the
// content panel. Unread mentions for the Current user, newest first. Clicking an item marks
// it read and opens the task. No modal/popup is used anywhere here.
export function MentionsPage({ mentions, loading, currentUserId, onMarkOpened, onOpenTask }: MentionsPageProps) {
  const handleOpen = async (m: MentionNotification) => {
    // Mark read first (optimistic removal happens in the hook), then navigate to the task.
    await onMarkOpened(m.id);
    onOpenTask(m.task_number);
  };

  return (
    <div className="p-3 md:p-4 max-w-3xl mx-auto w-full">
      <div className="flex items-center gap-2 mb-4">
        <div className="bg-blue-600 text-white p-1.5 rounded-lg">
          <AtSign size={18} />
        </div>
        <h1 className="text-xl font-bold text-gray-900">My Mentions</h1>
      </div>

      {/* No Current user → never show another person's data. Inline empty state (no popup). */}
      {!currentUserId ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          Select Current user to view your mentions.
        </div>
      ) : loading ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
          Loading your mentions…
        </div>
      ) : mentions.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          No unread mentions. You're all caught up.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {mentions.map(m => (
            <li key={m.id}>
              <button
                onClick={() => void handleOpen(m)}
                className="w-full text-left rounded-lg border border-gray-200 bg-white p-3 hover:border-blue-400 hover:bg-blue-50/40 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-blue-700 text-sm">
                    {formatTaskKey(m.task_number)}
                  </span>
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {m.task_title ?? '(untitled)'}
                  </span>
                  {m.task_archived && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                      <Archive size={11} /> Archived
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs text-gray-600">
                  <span className="font-medium text-gray-700">{m.actor_name ?? 'Someone'}</span> mentioned you
                  <span className="text-gray-400"> · {formatMentionTime(m.created_at)}</span>
                </div>
                {m.snippet && (
                  <div className="mt-1.5 text-sm text-gray-700 line-clamp-2 whitespace-pre-wrap break-words">
                    {m.snippet}
                  </div>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
