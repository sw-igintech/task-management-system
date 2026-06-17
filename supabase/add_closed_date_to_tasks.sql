-- Migration: add closed_date to tasks
-- ---------------------------------------------------------------------------
-- Adds tasks.closed_date — the date the task was ACTUALLY closed/done.
-- This is distinct from due_date (the planned target date).
--
-- Nullable and optional: not every task has a closure date, and there is no
-- auto-fill when status becomes "done" (the field is set manually in the UI or
-- mapped from the CSV "close date" column by the import/sync scripts).
--
-- Idempotent — safe to run multiple times.
--
-- How to apply: paste this file into the Supabase SQL Editor and Run it.
-- DDL cannot be executed through the anon key / PostgREST from the app.
-- ---------------------------------------------------------------------------

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS closed_date date;
