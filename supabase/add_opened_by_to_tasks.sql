-- Migration: add "opened_by" relationship to tasks
-- ---------------------------------------------------------------------------
-- Adds tasks.opened_by_person_id — who OPENED / requested the task.
-- This is DISTINCT from tasks.responsible_person_id (who owns/performs the task).
--
-- The column is intentionally NULLABLE: existing/imported tasks have no value
-- for it, so a NOT NULL constraint would break them. "Required" is enforced in
-- the application layer for newly created tasks and for edits of existing tasks
-- (see src/components/TaskForm.tsx). Legacy rows display "Opened by: —" until a
-- value is chosen on the next edit.
--
-- Safe to run multiple times (idempotent).
--
-- How to apply: paste this file into the Supabase SQL Editor and run it
-- (DDL cannot be executed through the anon key / PostgREST from the app).
-- ---------------------------------------------------------------------------

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS opened_by_person_id UUID REFERENCES people(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_opened_by_person_id ON tasks(opened_by_person_id);
