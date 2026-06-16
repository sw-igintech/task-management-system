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

export type SortField = 'task_number' | 'due_date' | 'priority' | 'responsible_person' | 'status' | 'updated_at' | 'title';
export type SortDirection = 'asc' | 'desc';
