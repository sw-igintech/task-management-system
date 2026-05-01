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
  title: string;
  description?: string;
  notes?: string;
  status: TaskStatus;
  priority: PriorityLevel;
  responsible_person_id?: string;
  responsible_person?: Person;
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
  status: TaskStatus | 'all';
  priority: PriorityLevel | 'all';
  responsible_person_id: string | 'all';
  show_archived: boolean;
  overdue_only: boolean;
  due_this_week: boolean;
}

export type SortField = 'due_date' | 'priority' | 'responsible_person' | 'status' | 'updated_at' | 'title';
export type SortDirection = 'asc' | 'desc';
