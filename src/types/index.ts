export type TaskStatus = 'not_started' | 'in_progress' | 'on_hold' | 'need_to_review' | 'done';
export type PriorityLevel = 1 | 2 | 3 | 4 | 5;

export interface Person {
  id: string;
  name: string;
  email?: string;
  created_at: string;
}

export interface Task {
  id: string;
  // Human-readable, stable task number shown as "TASK-<n>". DB-assigned (sequence
  // default); optional in TS so the app degrades gracefully before the migration runs.
  task_number?: number | null;
  title: string;
  description?: string;
  notes?: string;
  status: TaskStatus;
  priority: PriorityLevel;
  responsible_person_id?: string;
  responsible_person?: Person;
  // "Opened by" = who opened/requested the task (distinct from the responsible
  // person above). FK to people; computed `opened_by_person` is a client-side join.
  opened_by_person_id?: string | null;
  opened_by_person?: Person | null;
  due_date?: string | null;
  // Actual closure date (distinct from due_date, the planned target). Optional.
  closed_date?: string | null;
  type?: string;
  source_file?: string;
  source_page?: number;
  source_raw_text?: string;
  import_hash?: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface TaskFilters {
  search: string;
  // Multi-select filters. Empty array = no filter / all values (OR within a
  // category, AND across categories).
  statuses: TaskStatus[];
  priorities: PriorityLevel[];
  personIds: string[];
  show_archived: boolean;
  overdue_only: boolean;
  due_this_week: boolean;
}

export type SortField = 'task_number' | 'due_date' | 'closed_date' | 'priority' | 'responsible_person' | 'status' | 'updated_at' | 'title';
export type SortDirection = 'asc' | 'desc';

// A persisted "My Mentions" notification row (one per NEW person mention introduced by a
// task create/update). Identity is the lightweight "Current user" selector — NOT auth.
// Shape mirrors the Worker's GET /api/mentions response (joined task title + actor name).
export interface MentionNotification {
  id: number;
  task_id: string;
  task_number: number;
  mentioned_person_id: string;
  actor_person_id: string | null;
  // Resolved name of who performed the mention (null when unresolved → "Someone").
  actor_name: string | null;
  // Joined task title / archived state (task may have been archived since the mention).
  task_title: string | null;
  task_archived: boolean;
  snippet: string | null;
  source: string;
  created_at: string;
  opened_at: string | null;
}
