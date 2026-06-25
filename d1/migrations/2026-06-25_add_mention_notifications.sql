-- Migration: add the mention_notifications table backing the "My Mentions" inbox.
-- Date: 2026-06-25
--
-- Purpose: persist a row each time a task create/update introduces a NEW person mention,
-- so a person (identified by the lightweight "Current user" selector — NOT auth) can later
-- see who mentioned them and open the task. Unread = opened_at IS NULL. Marking a mention
-- opened sets opened_at. See docs/email-notifications.md (My Mentions) and
-- docs/cloudflare-worker-api.md (/api/mentions endpoints).
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
--        --file=d1/migrations/2026-06-25_add_mention_notifications.sql
--    (use task-management-staging for staging)

CREATE TABLE IF NOT EXISTS mention_notifications (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id              TEXT NOT NULL,
  task_number          INTEGER NOT NULL,
  mentioned_person_id  TEXT NOT NULL,
  actor_person_id      TEXT,
  created_at           TEXT NOT NULL,
  opened_at            TEXT,
  source               TEXT NOT NULL DEFAULT 'mention',
  snippet              TEXT
);

-- Primary access path: unread mentions for a person, newest first
-- (WHERE mentioned_person_id = ? AND opened_at IS NULL ORDER BY created_at DESC).
CREATE INDEX IF NOT EXISTS idx_mention_notifications_person_unread
  ON mention_notifications(mentioned_person_id, opened_at, created_at);
CREATE INDEX IF NOT EXISTS idx_mention_notifications_task
  ON mention_notifications(task_id);
CREATE INDEX IF NOT EXISTS idx_mention_notifications_actor
  ON mention_notifications(actor_person_id);
