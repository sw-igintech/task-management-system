import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, isAfter, isBefore, startOfDay, endOfDay, addDays, parseISO, differenceInCalendarDays } from 'date-fns';
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

// Whole calendar days a task is overdue relative to TODAY (local time, date-only — so a
// YYYY-MM-DD due date never shifts by timezone). Returns 0 (not overdue) when:
//   * due_date is missing, today, or in the future;
//   * the task is done; or
//   * the task has a closed_date (already closed).
// Display-only; mutates nothing. Accepts a partial so the edit form can pass live values.
export function overdueDays(input: {
  due_date?: string | null;
  status?: TaskStatus | string | null;
  closed_date?: string | null;
}): number {
  const { due_date, status, closed_date } = input;
  if (!due_date) return 0;
  if (status === 'done') return 0;
  if (closed_date) return 0;
  const due = startOfDay(parseISO(due_date));
  if (Number.isNaN(due.getTime())) return 0;
  const diff = differenceInCalendarDays(startOfDay(new Date()), due);
  return diff > 0 ? diff : 0;
}

// Human label for an overdue task, e.g. "Overdue by 1 day" / "Overdue by 3 days".
// Returns null when the task is not overdue (so callers render nothing).
export function formatOverdue(input: {
  due_date?: string | null;
  status?: TaskStatus | string | null;
  closed_date?: string | null;
}): string | null {
  const d = overdueDays(input);
  if (d <= 0) return null;
  return `Overdue by ${d} ${d === 1 ? 'day' : 'days'}`;
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
