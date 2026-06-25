import { useCallback, useEffect, useState } from 'react';
import type { MentionNotification } from '../types';
import { USE_WORKER_API, taskApi } from '../lib/taskApi';

// "My Mentions" inbox state for the selected Current user.
//
// Identity is the lightweight Current-user selector (NOT authentication). The list holds
// the UNREAD mentions (opened_at IS NULL) for that person, fetched from the Worker API and
// refetched whenever the Current user changes. Opening a mention marks it read globally (in
// D1), so it disappears for that person in every browser — read state is not browser-local.
//
// Only the Worker backend persists mentions; in mock/Supabase mode there is no inbox, so the
// list stays empty and no badge is shown. Loads fail GRACEFULLY (e.g. before the
// mention_notifications migration is applied) — the list is emptied and nothing crashes.
export interface UseMentions {
  mentions: MentionNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  // Marks one mention opened/read. Optimistically removes it from the list, then PATCHes the
  // Worker; on failure it refetches to restore the true state.
  markOpened: (id: number) => Promise<void>;
}

export function useMentions(currentUserId: string | null): UseMentions {
  const [mentions, setMentions] = useState<MentionNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    // No Worker backend, or no Current user → nothing to show (no other person's data).
    if (!USE_WORKER_API || !currentUserId) {
      setMentions([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await taskApi.getMentions(currentUserId);
      setMentions(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Non-fatal: a failure here must never break the app or show a stale badge.
      console.warn('[mentions] load failed:', msg);
      setMentions([]);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  // Fetch on mount and whenever the Current user changes. Deferred to a timer so the state
  // updates run outside the synchronous effect body (matches the useCurrentUser pattern —
  // avoids a synchronous setState-in-effect).
  useEffect(() => {
    const t = window.setTimeout(() => void refetch(), 0);
    return () => window.clearTimeout(t);
  }, [refetch]);

  const markOpened = useCallback(async (id: number) => {
    if (!USE_WORKER_API || !currentUserId) return;
    // Optimistic: drop it from the unread list immediately (updates the badge too).
    setMentions(prev => prev.filter(m => m.id !== id));
    try {
      await taskApi.markMentionOpened(id, currentUserId);
    } catch (err) {
      console.warn('[mentions] mark-opened failed:', err instanceof Error ? err.message : String(err));
      void refetch(); // restore true state on failure
    }
  }, [currentUserId, refetch]);

  return { mentions, unreadCount: mentions.length, loading, error, refetch, markOpened };
}
