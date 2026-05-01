import { useState, useEffect, useCallback } from 'react';
import type { Task, Person, TaskFilters, SortField, SortDirection } from '../types';
import { isMockMode, supabase } from '../lib/supabase';
import * as storage from '../lib/storage';

const DEFAULT_FILTERS: TaskFilters = {
  search: '',
  status: 'all',
  priority: 'all',
  responsible_person_id: 'all',
  show_archived: false,
  overdue_only: false,
  due_this_week: false,
};

// Strip non-column fields before sending to Supabase
function toDbPayload(data: Partial<Task>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...data };
  delete result['responsible_person']; // computed join field, not a DB column
  delete result['id'];
  delete result['created_at'];
  delete result['updated_at'];
  return result;
}

function joinPerson(task: Task, peopleMap: Map<string, Person>): Task {
  return {
    ...task,
    responsible_person: task.responsible_person_id
      ? peopleMap.get(task.responsible_person_id)
      : undefined,
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
  ): Promise<Task | null> => {
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
  ): Promise<Task | null> => {
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
    addTask,
    updateTask,
    archiveTask,
    restoreTask,
    addPerson,
    stats,
    reload: loadData,
  };
}
