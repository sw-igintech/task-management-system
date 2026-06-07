import { v4 as uuidv4 } from 'uuid';
import type { Task, Person, TaskFilters, SortField, SortDirection } from '../types';
import { MOCK_TASKS, MOCK_PEOPLE } from './mockData';
import { isOverdue, isDueThisWeek } from './utils';

const TASKS_KEY = 'etm_tasks';
const PEOPLE_KEY = 'etm_people';

function initStore() {
  if (!localStorage.getItem(TASKS_KEY)) {
    localStorage.setItem(TASKS_KEY, JSON.stringify(MOCK_TASKS));
  }
  if (!localStorage.getItem(PEOPLE_KEY)) {
    localStorage.setItem(PEOPLE_KEY, JSON.stringify(MOCK_PEOPLE));
  }
}

export function getTasks(): Task[] {
  initStore();
  const raw = localStorage.getItem(TASKS_KEY);
  return raw ? (JSON.parse(raw) as Task[]) : [];
}

export function getPeople(): Person[] {
  initStore();
  const raw = localStorage.getItem(PEOPLE_KEY);
  return raw ? (JSON.parse(raw) as Person[]) : [];
}

function saveTasks(tasks: Task[]) {
  localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
}

function savePeople(people: Person[]) {
  localStorage.setItem(PEOPLE_KEY, JSON.stringify(people));
}

export function addTask(task: Omit<Task, 'id' | 'created_at' | 'updated_at' | 'archived'>): Task {
  const tasks = getTasks();
  const people = getPeople();
  const now = new Date().toISOString();
  const person = task.responsible_person_id
    ? people.find(p => p.id === task.responsible_person_id)
    : undefined;
  const newTask: Task = {
    ...task,
    id: uuidv4(),
    archived: false,
    responsible_person: person,
    created_at: now,
    updated_at: now,
  };
  tasks.push(newTask);
  saveTasks(tasks);
  return newTask;
}

export function updateTask(id: string, updates: Partial<Task>): Task | null {
  const tasks = getTasks();
  const people = getPeople();
  const idx = tasks.findIndex(t => t.id === id);
  if (idx === -1) return null;
  const now = new Date().toISOString();
  const person = updates.responsible_person_id
    ? people.find(p => p.id === updates.responsible_person_id)
    : tasks[idx].responsible_person;
  const updated: Task = {
    ...tasks[idx],
    ...updates,
    responsible_person: person,
    updated_at: now,
  };
  tasks[idx] = updated;
  saveTasks(tasks);
  return updated;
}

export function archiveTask(id: string): void {
  updateTask(id, { archived: true });
}

export function restoreTask(id: string): void {
  updateTask(id, { archived: false });
}

export function deleteTask(id: string): void {
  const tasks = getTasks().filter(t => t.id !== id);
  saveTasks(tasks);
}

export function addPerson(name: string, email?: string): Person {
  const people = getPeople();
  const now = new Date().toISOString();
  const person: Person = {
    id: uuidv4(),
    name,
    email,
    created_at: now,
  };
  people.push(person);
  savePeople(people);
  return person;
}

export function getFilteredTasks(
  tasks: Task[],
  filters: TaskFilters,
  sortField: SortField,
  sortDirection: SortDirection,
): Task[] {
  let result = tasks.filter(task => {
    if (!filters.show_archived && task.archived) return false;
    if (filters.show_archived && !task.archived) return false;

    if (filters.search) {
      const q = filters.search.toLowerCase();
      const matchTitle = task.title.toLowerCase().includes(q);
      const matchNotes = task.notes?.toLowerCase().includes(q);
      const matchPerson = task.responsible_person?.name.toLowerCase().includes(q);
      if (!matchTitle && !matchNotes && !matchPerson) return false;
    }

    // Multi-select categories: empty array = no filter. OR within a category.
    if (filters.statuses.length > 0 && !filters.statuses.includes(task.status)) return false;
    if (filters.priorities.length > 0 && !filters.priorities.includes(task.priority)) return false;
    if (
      filters.personIds.length > 0 &&
      !(task.responsible_person_id && filters.personIds.includes(task.responsible_person_id))
    ) return false;
    if (filters.overdue_only && !isOverdue(task)) return false;
    if (filters.due_this_week && !isDueThisWeek(task)) return false;

    return true;
  });

  result = result.sort((a, b) => {
    let valA: string | number | undefined;
    let valB: string | number | undefined;

    switch (sortField) {
      case 'title':
        valA = a.title;
        valB = b.title;
        break;
      case 'status':
        valA = a.status;
        valB = b.status;
        break;
      case 'priority':
        valA = a.priority;
        valB = b.priority;
        break;
      case 'responsible_person':
        valA = a.responsible_person?.name ?? '';
        valB = b.responsible_person?.name ?? '';
        break;
      case 'due_date':
        valA = a.due_date ?? '9999-99-99';
        valB = b.due_date ?? '9999-99-99';
        break;
      case 'updated_at':
        valA = a.updated_at;
        valB = b.updated_at;
        break;
      default:
        valA = a.title;
        valB = b.title;
    }

    if (valA === undefined) valA = '';
    if (valB === undefined) valB = '';

    if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  return result;
}

export function getStats(tasks: Task[]) {
  const active = tasks.filter(t => !t.archived && t.status !== 'done');
  const overdue = active.filter(t => isOverdue(t));
  const dueThisWeek = active.filter(t => isDueThisWeek(t));
  const highPriority = active.filter(t => t.priority === 1);

  const byStatus = {
    not_started: tasks.filter(t => !t.archived && t.status === 'not_started').length,
    in_progress: tasks.filter(t => !t.archived && t.status === 'in_progress').length,
    on_hold: tasks.filter(t => !t.archived && t.status === 'on_hold').length,
    need_to_review: tasks.filter(t => !t.archived && t.status === 'need_to_review').length,
    done: tasks.filter(t => !t.archived && t.status === 'done').length,
  };

  const people = [...new Set(tasks.map(t => t.responsible_person?.name).filter(Boolean))];
  const byPerson = people.map(name => ({
    name: name!,
    total: tasks.filter(t => !t.archived && t.responsible_person?.name === name).length,
    overdue: tasks.filter(t => !t.archived && t.responsible_person?.name === name && isOverdue(t)).length,
  }));

  return {
    totalActive: active.length,
    overdue: overdue.length,
    dueThisWeek: dueThisWeek.length,
    highPriority: highPriority.length,
    byStatus,
    byPerson,
  };
}
