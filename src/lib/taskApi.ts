// Optional Worker API backend for the frontend data layer.
//
// Enabled ONLY when VITE_USE_WORKER_API === "true" AND VITE_WORKER_API_URL is set.
// When disabled, the app keeps its existing behavior (direct Supabase client, or
// localStorage mock mode). This client never sends or holds any secret — it talks to
// the public Worker endpoints over plain JSON. The service-role key lives only inside
// the Worker, never here.

import type { Task, Person, MentionNotification } from '../types';

// Trailing slashes stripped so `${base}/api/...` is always well-formed.
export const WORKER_API_URL = (import.meta.env.VITE_WORKER_API_URL || '').replace(/\/+$/, '');

// Exact "true" required (Vite env values are strings).
export const USE_WORKER_API =
  import.meta.env.VITE_USE_WORKER_API === 'true' && WORKER_API_URL !== '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${WORKER_API_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    const detail = body?.error ?? '';
    throw new Error(
      `Worker API ${init?.method ?? 'GET'} ${path} failed (HTTP ${res.status})${detail ? `: ${detail}` : ''}`,
    );
  }
  return (await res.json()) as T;
}

// Operations mirror what useTasks needs. Returns the SAME raw snake_case shapes as the
// Supabase path (the responsible/opened-by person joins are computed in useTasks).
export const taskApi = {
  getPeople: () => request<Person[]>('/api/people'),
  getTasks: () => request<Task[]>('/api/tasks'),
  createTask: (payload: Record<string, unknown>) =>
    request<Task>('/api/tasks', { method: 'POST', body: JSON.stringify(payload) }),
  updateTask: (id: string, patch: Record<string, unknown>) =>
    request<Task>(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  createPerson: (name: string, email?: string) =>
    request<Person>('/api/people', {
      method: 'POST',
      body: JSON.stringify(email !== undefined ? { name, email } : { name }),
    }),
  // My Mentions inbox. `personId` is the Current user (lightweight identity, not auth).
  getMentions: (personId: string) =>
    request<MentionNotification[]>(`/api/mentions?person_id=${encodeURIComponent(personId)}`),
  // Marks one mention opened/read; person_id must match the row's mentioned person.
  markMentionOpened: (id: number, personId: string) =>
    request<{ ok: boolean }>(`/api/mentions/${id}/open`, {
      method: 'POST',
      body: JSON.stringify({ person_id: personId }),
    }),
};
