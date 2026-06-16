import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, isAfter, isBefore, startOfDay, endOfDay, addDays, parseISO } from 'date-fns';
import type { Task, TaskStatus, PriorityLevel } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return format(parseISO(dateStr), 'MMM d, yyyy');
  } catch {
    return dateStr;
  }
}

// Human-readable task key, e.g. 123 -> "TASK-123". Falls back to "—" when a task
// has no number yet (e.g. before the DB migration runs).
export function formatTaskKey(taskNumber: number | null | undefined): string {
  return taskNumber == null ? '—' : `TASK-${taskNumber}`;
}

// Returns true when a search query refers to this task's number. Accepts
// "123", "TASK-123", "task-123" and "#123" (exact number match).
export function matchesTaskNumber(taskNumber: number | null | undefined, query: string): boolean {
  if (taskNumber == null) return false;
  const m = query.trim().match(/^#?(?:task-)?(\d+)$/i);
  return m != null && Number(m[1]) === taskNumber;
}

export function isOverdue(task: Task): boolean {
  if (!task.due_date) return false;
  if (task.status === 'done') return false;
  const today = startOfDay(new Date());
  const dueDate = startOfDay(parseISO(task.due_date));
  return isBefore(dueDate, today);
}

export function isDueThisWeek(task: Task): boolean {
  if (!task.due_date) return false;
  if (task.status === 'done') return false;
  const today = startOfDay(new Date());
  const weekEnd = endOfDay(addDays(today, 7));
  const dueDate = parseISO(task.due_date);
  return !isBefore(dueDate, today) && !isAfter(dueDate, weekEnd);
}

export const STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  on_hold: 'On Hold',
  need_to_review: 'Need to Review',
  done: 'Done',
};

export const STATUS_BADGE_CLASS: Record<TaskStatus, string> = {
  not_started: 'badge-not-started',
  in_progress: 'badge-in-progress',
  on_hold: 'badge-on-hold',
  need_to_review: 'badge-need-to-review',
  done: 'badge-done',
};

export const PRIORITY_LABELS: Record<PriorityLevel, string> = {
  1: '1 - High',
  2: '2 - Med-High',
  3: '3 - Medium',
  4: '4 - Low-Med',
  5: '5 - Low',
};

export const PRIORITY_BADGE_CLASS: Record<PriorityLevel, string> = {
  1: 'badge-priority-1',
  2: 'badge-priority-2',
  3: 'badge-priority-3',
  4: 'badge-priority-4',
  5: 'badge-priority-5',
};

export function statusFromRaw(raw: string): TaskStatus {
  const map: Record<string, TaskStatus> = {
    'In progress': 'in_progress',
    'Not started': 'not_started',
    'On hold': 'on_hold',
    'Need to review': 'need_to_review',
    'Done': 'done',
  };
  return map[raw] ?? 'not_started';
}
