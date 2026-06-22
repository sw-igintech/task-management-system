import { useCallback, useEffect, useState } from 'react';
import type { Person } from '../types';

// Lightweight "current user" actor selector — NOT authentication.
//
// The app has no login/auth. This hook stores the id of the person the operator says
// they are, so task create/update can send an `actor_person_id` used purely to resolve
// the "<name> mentioned you in a task." actor in notification emails. It is persisted in
// the browser's localStorage and restored on the next visit; if the stored id no longer
// matches a known person (e.g. that person was removed) it is cleared gracefully.

export const CURRENT_USER_STORAGE_KEY = 'taskManager.currentUserId';

function readStored(): string | null {
  try {
    return window.localStorage.getItem(CURRENT_USER_STORAGE_KEY);
  } catch {
    // localStorage can throw (private mode / disabled). Treat as "no selection".
    return null;
  }
}

function writeStored(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(CURRENT_USER_STORAGE_KEY, id);
    else window.localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
  } catch {
    // Persistence is best-effort; never let a storage failure break the UI.
  }
}

export interface CurrentUser {
  // The selected person id, or null when nothing is selected (placeholder shown).
  currentUserId: string | null;
  setCurrentUserId: (id: string | null) => void;
}

// `people` is the loaded people list (from useTasks). Once it is available the stored id
// is validated against it; an unknown/stale id is cleared so the selector falls back to
// the placeholder rather than pointing at a non-existent person.
export function useCurrentUser(people: Person[]): CurrentUser {
  const [currentUserId, setCurrentUserIdState] = useState<string | null>(() => readStored());

  const setCurrentUserId = useCallback((id: string | null) => {
    const next = id && id !== '' ? id : null;
    setCurrentUserIdState(next);
    writeStored(next);
  }, []);

  // When people load (or change), drop a selection that no longer resolves. The state
  // clear is deferred to a timer so it runs outside the synchronous effect body (matching
  // the deep-link pattern in TasksPage — avoids a synchronous setState-in-effect).
  useEffect(() => {
    if (people.length === 0) return; // people not loaded yet — keep the stored id as-is
    if (currentUserId && !people.some(p => p.id === currentUserId)) {
      const t = window.setTimeout(() => {
        setCurrentUserIdState(null);
        writeStored(null);
      }, 0);
      return () => window.clearTimeout(t);
    }
  }, [people, currentUserId]);

  return { currentUserId, setCurrentUserId };
}
