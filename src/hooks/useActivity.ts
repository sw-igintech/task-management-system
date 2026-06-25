import { useCallback, useEffect, useState } from 'react';
import type { ActivityEvent, ActivityFilters } from '../types';
import { USE_WORKER_API, taskApi } from '../lib/taskApi';

// General Activity feed state for the selected Current user.
//
// Activity is a read-only chronological HISTORY (no unread/read state) — distinct from the
// My Mentions unread inbox. Identity is the lightweight Current-user selector (NOT auth).
// Refetches whenever the Current user or any filter changes (debounced so typing in the text
// search doesn't fire a request per keystroke). Loads fail GRACEFULLY (e.g. before the
// activity_events migration is applied) — the list empties and nothing crashes.
export interface UseActivity {
  events: ActivityEvent[];
  loading: boolean;
  error: string | null;
  filters: ActivityFilters;
  setFilters: (next: ActivityFilters) => void;
  refetch: () => Promise<void>;
}

export function useActivity(currentUserId: string | null): UseActivity {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ActivityFilters>({});

  const fetchWith = useCallback(async (f: ActivityFilters) => {
    if (!USE_WORKER_API || !currentUserId) {
      setEvents([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setEvents(await taskApi.getActivity(currentUserId, f));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[activity] load failed:', msg);
      setEvents([]);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  const refetch = useCallback(() => fetchWith(filters), [fetchWith, filters]);

  // Fetch on mount and whenever the Current user or filters change. Deferred via a timer so
  // the state updates run outside the synchronous effect body (matches useMentions/
  // useCurrentUser) and so text-search typing is debounced into a single request.
  useEffect(() => {
    const t = window.setTimeout(() => void fetchWith(filters), 300);
    return () => window.clearTimeout(t);
  }, [fetchWith, filters]);

  return { events, loading, error, filters, setFilters, refetch };
}
