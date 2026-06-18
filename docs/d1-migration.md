# Cloudflare D1 Migration (Staging Copy)

> Stands up a Cloudflare **D1 staging** database and loads a **copy** of the current data
> into it. This is preparation only — **Supabase remains the source of truth**, and neither
> the Worker nor the frontend talks to D1 yet.

## 1. Purpose

Create and populate `task-management-staging` (D1/SQLite) so the next phase — a Worker D1
backend adapter — can be developed and verified against real-shaped data without risk.

## 2. Source of truth

**Supabase remains the source/rollback reference, unchanged.** D1 staging was seeded with a
copy of the data exported from the (then Supabase-backed) Worker API.

**Update (Worker now uses D1):** on `cloudflare/full-migration` the deployed Worker reads/writes
**D1 staging directly** (binding `DB` → `task-management-staging`). There is no `DATA_BACKEND`
flag and no Supabase at runtime. So the staging path is now:
`Cloudflare Pages → Worker → D1 staging`. Writes via the Worker affect **D1 only**, never
Supabase. `task-management-production` is still **not** created. Next: full browser-level
validation, then auth/access-control decisions before any production cutover.

## 3. Databases

| Name | Status |
|---|---|
| `task-management-staging` | live staging copy; Worker `task-management-api` is bound to it |
| `task-management-production` | **created** as a production candidate (not cut over); Worker `task-management-api-production` is bound to it |

### Production import (clean source)

- **Source:** **Supabase** (the original source of truth, untouched) — chosen because staging
  D1 contains smoke-test tasks (TASK-141/142/143) that must not pollute production.
- **Script:** `scripts/d1/export-supabase-data.mjs` (read-only). **Smoke-test exclusion**:
  drop tasks where `archived` AND title contains `DELETE ME` AND one of
  `Worker CRUD smoke test` / `Worker frontend smoke test` / `D1 Worker smoke test`. These are
  **not** deleted from Supabase — only excluded from the production copy. (Supabase contains
  TASK-141 & TASK-142; TASK-143 was D1-staging-only and is not in Supabase at all.)
- **Generate + import:** `node scripts/d1/generate-d1-import-sql.mjs production` →
  `exports/d1-production/import-production.sql`; applied by
  `.github/workflows/d1-production-import.yml` (`workflow_dispatch`).
- **Verification SQL:** same as staging (people / total / active / archived / null / dup
  task_number) plus `SELECT COUNT(*) FROM tasks WHERE title LIKE '%DELETE ME%'` (expect 0).
- **Rollback:** D1 production is disposable and additive; Supabase + Vercel remain the live
  production and rollback. No DNS/custom-domain change; no cutover.

## 4. Schema

- File: **`d1/schema.sql`** (SQLite). Mirrors the Supabase `people` and `tasks` columns,
  with `CHECK` constraints (status enum, priority 1–5, `archived IN (0,1)`), `task_number`
  unique, FK references people(id), and indexes. Idempotent (`CREATE TABLE IF NOT EXISTS`).
- Note: D1 does not enforce foreign keys by default; the FK clauses are declarative. The
  import disables enforcement during load regardless.

### Schema migrations (additive, non-destructive)

Incremental schema changes live in **`d1/migrations/*.sql`** and are applied **separately
from data import** by `.github/workflows/d1-apply-migrations.yml` (**`workflow_dispatch`
only**, input `environment: staging | production`). This workflow **never imports or
deletes data** — it only applies additive DDL.

- `2026-06-18_add_people_email.sql` — adds the optional `people.email` column backing the
  (default-disabled) email-notification feature. `people.email` is also already declared in
  `d1/schema.sql`, so any DB created from the current schema already has it.
- SQLite `ALTER TABLE ... ADD COLUMN` has **no `IF NOT EXISTS`**, so re-applying an
  already-present column fails with *"duplicate column name"*. The workflow treats that
  exact error as a **safe no-op** (and fails on any other error), then verifies via
  `PRAGMA table_info(people)`.
- Manual equivalent:
  ```bash
  npx wrangler d1 execute task-management-production --remote \
    --file=d1/migrations/2026-06-18_add_people_email.sql   # 'duplicate column name' = already applied, safe
  ```
- **Apply the `people.email` migration to production (and staging if maintained) before
  deploying/merging code that uses it.** The app degrades gracefully when `people.email` is
  `NULL` (that person just receives no email). See
  [`email-notifications.md`](email-notifications.md).

## 5. Export / import flow

1. **Export** — `node scripts/d1/export-worker-data.mjs`
   (`WORKER_API_URL` default = `https://task-management-api.sw-590.workers.dev`). Calls
   `GET /api/people` and `GET /api/tasks?include_archived=true` and writes
   `exports/d1/{people,tasks,export-summary}.json`. No secrets required.
2. **Generate** — `node scripts/d1/generate-d1-import-sql.mjs` reads the JSON and writes
   `exports/d1/import-staging.sql`: `DELETE FROM tasks; DELETE FROM people; INSERT … ;`.
   Strings escaped, `archived` → `0/1`, empty/missing → `NULL`,
   `task_number`/ids/timestamps preserved. **No explicit `BEGIN`/`COMMIT`/`PRAGMA`** —
   Cloudflare D1 rejects SQL transaction statements, and `wrangler d1 execute --file` runs
   the whole file atomically as one batch (so the DELETE-then-INSERT replace stays
   all-or-nothing). D1 also does not enforce foreign keys.
3. **Import** — `wrangler d1 execute task-management-staging --remote --file=…` applies the
   schema then the import SQL. Orchestrated by `.github/workflows/d1-staging-import.yml`
   (trigger: `workflow_dispatch`, or push touching `d1/**` / `scripts/d1/**`). Requires only
   `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` (no Supabase secrets).

`exports/` is **gitignored** — generated data is never committed.

## 6. Verification SQL

```sql
SELECT COUNT(*) FROM people;                                   -- expect 5
SELECT COUNT(*) FROM tasks;                                    -- expect ~142
SELECT COUNT(*) FROM tasks WHERE archived = 0;                 -- expect ~140
SELECT COUNT(*) FROM tasks WHERE archived = 1;                 -- expect ~2
SELECT COUNT(*) FROM tasks WHERE task_number IS NULL;          -- expect 0
SELECT COUNT(*) FROM (
  SELECT task_number FROM tasks WHERE task_number IS NOT NULL
  GROUP BY task_number HAVING COUNT(*) > 1
);                                                             -- expect 0 (no dup task_number)
```

## 7. Rollback

D1 staging is disposable. To redo: re-run the workflow (the import is a full staging-only
replace), or `wrangler d1 execute task-management-staging --remote --command="DELETE FROM
tasks; DELETE FROM people;"` and re-import. Supabase is never affected, so there is nothing
to roll back on the source side.

## 8. ⚠️ Do not use D1 production yet

`task-management-production` is a **future name only**. Do not create or point anything at it
in this phase.

## 9. ⚠️ Do not cut over the Worker to D1 yet

The Worker still uses Supabase. Do not switch its backend to D1 until a D1 adapter is
implemented behind a Worker-side flag/binding and verified against this staging copy.

## 10. Data notes

- **Description and Notes are separate columns** and are preserved separately.
- **Archived tasks are included** in the copy (the export uses `include_archived=true`;
  TASK-141 / TASK-142 are archived smoke-test tasks).
- **`closed_date` is included** (distinct from `due_date`).
- **`opened_by_person_id` and `responsible_person_id` are preserved.**
- **`task_number` uniqueness is verified** (no duplicates, no nulls).
