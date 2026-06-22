import { useState, useEffect, useCallback } from 'react';
import type { Task, Person, TaskFilters, SortField, SortDirection } from '../types';
import { isMockMode, supabase } from '../lib/supabase';
import { USE_WORKER_API, taskApi } from '../lib/taskApi';
import * as storage from '../lib/storage';

// Backend the data layer is talking to (for the UI indicator).
export type Backend = 'worker' | 'mock' | 'supabase';
export const ACTIVE_BACKEND: Backend = USE_WORKER_API ? 'worker' : isMockMode ? 'mock' : 'supabase';

const DEFAULT_FILTERS: TaskFilters = {
  search: '',
  statuses: [],
  priorities: [],
  personIds: [],
  show_archived: false,
  overdue_only: false,
  due_this_week: false,
};

// Strip non-column fields before sending to Supabase
function toDbPayload(data: Partial<Task>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...data };
  delete result['responsible_person']; // computed join field, not a DB column
  delete result['opened_by_person']; // computed join field, not a DB column
  delete result['task_number']; // DB-assigned (sequence default); never written by the app
  delete result['id'];
  delete result['created_at'];
  delete result['updated_at'];
  return result;
}

// Attach both client-side person joins. Two separate FKs to people (responsible
// vs opened-by) are resolved here, not via an ambiguous Supabase embedded join.
function joinPerson(task: Task, peopleMap: Map<string, Person>): Task {
  return {
    ...task,
    responsible_person: task.responsible_person_id
      ? peopleMap.get(task.responsible_person_id)
      : undefined,
    opened_by_person: task.opened_by_person_id
      ? peopleMap.get(task.opened_by_person_id) ?? null
      : null,
  };
}

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [filters, setFilters] = useState<TaskFilters>(DEFAULT_FILTERS);
  const [sortField, setSortField] = useState<SortField>('priority');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Worker API mode (enabled by VITE_USE_WORKER_API=true). No silent Supabase
    // fallback — if the Worker fails we surface the error.
    if (USE_WORKER_API) {
      try {
        const [loadedPeople, rawTasks] = await Promise.all([taskApi.getPeople(), taskApi.getTasks()]);
        const peopleMap = new Map(loadedPeople.map(p => [p.id, p]));
        setPeople(loadedPeople);
        setTasks(rawTasks.map(t => joinPerson(t, peopleMap)));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[WorkerAPI] Load error:', msg);
        setError(msg);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (isMockMode) {
      setTasks(storage.getTasks());
      setPeople(storage.getPeople());
      setLoading(false);
      return;
    }

    // Supabase mode
    console.log('[Supabase] Fetching data from', new URL(import.meta.env.VITE_SUPABASE_URL).hostname);
    try {
      const [peopleRes, tasksRes] = await Promise.all([
        supabase!.from('people').select('*').order('name'),
        supabase!.from('tasks').select('*').order('priority', { ascending: true }),
      ]);

      if (peopleRes.error) throw new Error(`People fetch failed: ${peopleRes.error.message}`);
      if (tasksRes.error) throw new Error(`Tasks fetch failed: ${tasksRes.error.message}`);

      const loadedPeople = (peopleRes.data ?? []) as Person[];
      const peopleMap = new Map(loadedPeople.map(p => [p.id, p]));
      const loadedTasks = ((tasksRes.data ?? []) as Task[]).map(t => joinPerson(t, peopleMap));

      console.log(`[Supabase] Loaded ${loadedPeople.length} people, ${loadedTasks.length} tasks`);
      setPeople(loadedPeople);
      setTasks(loadedTasks);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Supabase] Load error:', msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const addTask = useCallback(async (
    taskData: Omit<Task, 'id' | 'created_at' | 'updated_at' | 'archived'>,
    // Optional actor (current user) — sent only to the Worker API and used purely to
    // resolve the mention-email actor. Never stored on the task. Not auth.
    actorPersonId?: string | null,
  ): Promise<Task | null> => {
    if (USE_WORKER_API) {
      try {
        const payload: Record<string, unknown> = { ...toDbPayload(taskData), archived: false };
        if (actorPersonId) payload.actor_person_id = actorPersonId;
        const created = await taskApi.createTask(payload);
        const newTask = joinPerson(created, new Map(people.map(p => [p.id, p])));
        setTasks(prev => [...prev, newTask]);
        return newTask;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[WorkerAPI] addTask error:', msg);
        setError(msg);
        return null;
      }
    }

    if (isMockMode) {
      const newTask = storage.addTask(taskData);
      setTasks(prev => [...prev, newTask]);
      return newTask;
    }

    const payload = { ...toDbPayload(taskData), archived: false };
    const { data, error: err } = await supabase!
      .from('tasks')
      .insert([payload])
      .select()
      .single();

    if (err) {
      console.error('[Supabase] addTask error:', err.message);
      setError(err.message);
      return null;
    }

    const newTask = joinPerson(data as Task, new Map(people.map(p => [p.id, p])));
    setTasks(prev => [...prev, newTask]);
    return newTask;
  }, [people]);

  const updateTask = useCallback(async (
    id: string,
    updates: Partial<Task>,
    // Optional actor (current user) — Worker-only, used for the mention-email actor.
    // Never stored on the task. Not auth.
    actorPersonId?: string | null,
  ): Promise<Task | null> => {
    if (USE_WORKER_API) {
      try {
        const patch: Record<string, unknown> = toDbPayload(updates);
        if (actorPersonId) patch.actor_person_id = actorPersonId;
        const updatedRow = await taskApi.updateTask(id, patch);
        const updatedTask = joinPerson(updatedRow, new Map(people.map(p => [p.id, p])));
        setTasks(prev => prev.map(t => (t.id === id ? updatedTask : t)));
        return updatedTask;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[WorkerAPI] updateTask error:', msg);
        setError(msg);
        return null;
      }
    }

    if (isMockMode) {
      const updated = storage.updateTask(id, updates);
      if (updated) setTasks(prev => prev.map(t => t.id === id ? updated : t));
      return updated;
    }

    const payload = toDbPayload(updates);
    const { data, error: err } = await supabase!
      .from('tasks')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (err) {
      console.error('[Supabase] updateTask error:', err.message);
      setError(err.message);
      return null;
    }

    const updatedTask = joinPerson(data as Task, new Map(people.map(p => [p.id, p])));
    setTasks(prev => prev.map(t => t.id === id ? updatedTask : t));
    return updatedTask;
  }, [people]);

  const archiveTask = useCallback((id: string) => {
    return updateTask(id, { archived: true });
  }, [updateTask]);

  const restoreTask = useCallback((id: string) => {
    return updateTask(id, { archived: false });
  }, [updateTask]);

  const addPerson = useCallback(async (
    name: string,
    email?: string,
  ): Promise<Person | null> => {
    if (USE_WORKER_API) {
      try {
        const person = await taskApi.createPerson(name, email);
        setPeople(prev => [...prev, person]);
        return person;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[WorkerAPI] addPerson error:', msg);
        setError(msg);
        return null;
      }
    }

    if (isMockMode) {
      const person = storage.addPerson(name, email);
      setPeople(prev => [...prev, person]);
      return person;
    }

    const { data, error: err } = await supabase!
      .from('people')
      .insert([{ name, email: email ?? null }])
      .select()
      .single();

    if (err) {
      console.error('[Supabase] addPerson error:', err.message);
      setError(err.message);
      return null;
    }

    const person = data as Person;
    setPeople(prev => [...prev, person]);
    return person;
  }, []);

  const handleSetSortField = useCallback((field: SortField) => {
    setSortField(prev => {
      if (prev === field) {
        setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
        return prev;
      }
      setSortDirection('asc');
      return field;
    });
  }, []);

  const filteredTasks = storage.getFilteredTasks(tasks, filters, sortField, sortDirection);
  const stats = storage.getStats(tasks);

  return {
    tasks,
    filteredTasks,
    people,
    filters,
    setFilters,
    sortField,
    sortDirection,
    setSortField: handleSetSortField,
    loading,
    error,
    isMockMode,
    backend: ACTIVE_BACKEND,
    addTask,
    updateTask,
    archiveTask,
    restoreTask,
    addPerson,
    stats,
    reload: loadData,
  };
}
