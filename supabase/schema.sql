-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- People table
CREATE TABLE IF NOT EXISTS people (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tasks table
-- Human-readable task numbers (TASK-<n> in the UI). Auto-assigned by a sequence
-- default; backfilled for pre-existing rows. See supabase/add_task_number_to_tasks.sql.
CREATE SEQUENCE IF NOT EXISTS tasks_task_number_seq;

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_number INTEGER UNIQUE NOT NULL DEFAULT nextval('tasks_task_number_seq'),
  title TEXT NOT NULL,
  description TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started','in_progress','on_hold','need_to_review','done')),
  priority INTEGER NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  responsible_person_id UUID REFERENCES people(id) ON DELETE SET NULL,
  -- "Opened by" = who opened/requested the task (distinct from responsible_person_id).
  -- Nullable so legacy/imported tasks without this value remain valid; the app
  -- enforces it as required for newly created and edited tasks.
  opened_by_person_id UUID REFERENCES people(id) ON DELETE SET NULL,
  due_date DATE,
  type TEXT,
  source_file TEXT,
  source_page INTEGER,
  source_raw_text TEXT,
  import_hash TEXT UNIQUE,
  archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_task_number ON tasks(task_number);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_responsible ON tasks(responsible_person_id);
CREATE INDEX IF NOT EXISTS idx_tasks_opened_by_person_id ON tasks(opened_by_person_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_archived ON tasks(archived);
CREATE INDEX IF NOT EXISTS idx_tasks_import_hash ON tasks(import_hash);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ language 'plpgsql';

CREATE OR REPLACE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS (disabled for MVP, enable for production)
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE people ENABLE ROW LEVEL SECURITY;

-- Permissive policies for MVP (open access)
CREATE POLICY "allow_all_tasks" ON tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_people" ON people FOR ALL USING (true) WITH CHECK (true);
