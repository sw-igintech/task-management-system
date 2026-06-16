-- Migration: add human-readable task_number to tasks
-- ---------------------------------------------------------------------------
-- Adds tasks.task_number (integer, unique) — a stable, human-friendly identifier
-- displayed in the UI as "TASK-<n>" (e.g. TASK-123). This replaces the raw
-- import_hash as the primary user-facing identifier; import_hash stays as a
-- technical/debug field only.
--
-- Strategy:
--   1. Add the column nullable (so existing rows stay valid).
--   2. Backfill existing NULL rows with stable, unique numbers ordered by
--      created_at ASC, title ASC, id ASC — continuing past any numbers that may
--      already exist (idempotent: only touches rows where task_number IS NULL).
--   3. Create a sequence and set it as the column DEFAULT so future INSERTs get a
--      number automatically (safe for concurrent inserts; the app never sends it).
--   4. Add a UNIQUE index.
--   5. Enforce NOT NULL (safe once every row is backfilled + default is set).
--
-- Idempotent + safe to run multiple times.
--
-- How to apply: paste this file into the Supabase SQL Editor and Run it.
-- DDL cannot be executed through the anon key / PostgREST from the app.
-- ---------------------------------------------------------------------------

-- 1. Add the column (nullable for now).
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_number integer;

-- 2. Backfill any rows that don't have a number yet, continuing above the current max.
WITH numbered AS (
  SELECT
    id,
    COALESCE((SELECT MAX(task_number) FROM tasks), 0)
      + ROW_NUMBER() OVER (ORDER BY created_at ASC, title ASC, id ASC) AS rn
  FROM tasks
  WHERE task_number IS NULL
)
UPDATE tasks t
SET task_number = numbered.rn
FROM numbered
WHERE t.id = numbered.id;

-- 3. Sequence + DEFAULT so future inserts auto-assign the next number.
CREATE SEQUENCE IF NOT EXISTS tasks_task_number_seq OWNED BY tasks.task_number;
-- Point the sequence just past the current max; with is_called = false the next
-- nextval() returns exactly (max + 1) (or 1 when the table is empty).
SELECT setval(
  'tasks_task_number_seq',
  COALESCE((SELECT MAX(task_number) FROM tasks), 0) + 1,
  false
);
ALTER TABLE tasks ALTER COLUMN task_number SET DEFAULT nextval('tasks_task_number_seq');

-- 4. Uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_task_number ON tasks(task_number);

-- 5. Now that every row has a value and new rows default automatically, require it.
ALTER TABLE tasks ALTER COLUMN task_number SET NOT NULL;
