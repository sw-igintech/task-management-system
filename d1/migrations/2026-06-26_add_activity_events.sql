-- Migration: add the activity_events table backing the general Activity / Notifications feed.
-- Date: 2026-06-26
--
-- Purpose: persist a chronological history of task events relevant to a person (the
-- lightweight "Current user" — NOT authentication). This is DISTINCT from the My Mentions
-- inbox (mention_notifications): My Mentions = actionable UNREAD mentions; Activity = a
-- read-only event history (no unread/read state). One row PER target person, so the feed is
-- trivially queryable by target_person_id. See docs/cloudflare-worker-api.md (/api/activity)
-- and docs/d1-migration.md.
--
-- Id conventions match the existing schema: people.id and tasks.id are TEXT (UUIDs), so the
-- person/task id columns here are TEXT. task_number is INTEGER (mirrors tasks.task_number).
--
-- IMPORTANT NOTES
--  * This migration is ADDITIVE and NON-DESTRUCTIVE — it only creates a new table + indexes.
--    It never drops, imports, or modifies existing data.
--  * CREATE TABLE / CREATE INDEX use IF NOT EXISTS, so re-applying it is a safe no-op.
--  * Apply via the "D1 Apply Migrations" workflow (workflow_dispatch → staging|production)
--    or manually (see docs/d1-migration.md):
--      npx wrangler d1 execute task-management-production --remote \
--        --file=d1/migrations/2026-06-26_add_activity_events.sql
--    (use task-management-staging for staging)

CREATE TABLE IF NOT EXISTS activity_events (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id           TEXT NOT NULL,
  task_number       INTEGER NOT NULL,
  actor_person_id   TEXT,
  target_person_id  TEXT,
  event_type        TEXT NOT NULL,
  summary           TEXT NOT NULL,
  details_json      TEXT,
  created_at        TEXT NOT NULL
);

-- Primary access path: a person's activity, newest first
-- (WHERE target_person_id = ? ORDER BY created_at DESC).
CREATE INDEX IF NOT EXISTS idx_activity_events_target
  ON activity_events(target_person_id, created_at);
CREATE INDEX IF NOT EXISTS idx_activity_events_actor
  ON activity_events(actor_person_id, created_at);
CREATE INDEX IF NOT EXISTS idx_activity_events_type
  ON activity_events(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_activity_events_task
  ON activity_events(task_id, created_at);
