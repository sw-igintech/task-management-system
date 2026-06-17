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
| `task-management-staging` | created/used in this step (the copy target) |
| `task-management-production` | **planned name only — do NOT create or use yet** |

## 4. Schema

- File: **`d1/schema.sql`** (SQLite). Mirrors the Supabase `people` and `tasks` columns,
  with `CHECK` constraints (status enum, priority 1–5, `archived IN (0,1)`), `task_number`
  unique, FK references people(id), and indexes. Idempotent (`CREATE TABLE IF NOT EXISTS`).
- Note: D1 does not enforce foreign keys by default; the FK clauses are declarative. The
  import disables enforcement during load regardless.

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
