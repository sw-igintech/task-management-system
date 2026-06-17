# Importing Tasks from CSV / Excel

The Engineering Task Manager keeps its tasks in the Supabase `tasks` table. This
guide explains how to **replace** all tasks with the contents of a CSV (or XLSX)
export using the safe import workflow.

Script: `scripts/import_excel_tasks.ts` · Command: `npm run import:tasks`

> ⚠️ **Apply is destructive for tasks.** It deletes **all existing tasks** and
> replaces them with the file's rows. **People are never deleted** — missing
> people are created and existing ones are reused.

---

## Prerequisites

`.env` in the project root must contain:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

The current Supabase RLS policies are permissive ("allow all"), so the **anon
key is enough** for delete/insert. If RLS is later tightened, set
`SUPABASE_SERVICE_ROLE_KEY` in `.env` (local only — never in the frontend, never
committed); the script will prefer it automatically. Key values are never
printed — only the Supabase host is shown.

---

## 1. Dry-run (safe — never writes to the DB)

```bash
npm run import:tasks -- --file "New Engineering Tasks - 2026 - Engineering Tasks.csv" --dry-run
```

Prints: the file used, detected headers, the column mapping, raw row count,
valid/invalid/duplicate counts, unique people found, the current DB task count,
how many tasks would be inserted, warnings by type, and a sample of parsed
tasks. A full report is also written to `backups/dry-run-report-<timestamp>.json`.

**Always run dry-run first** and confirm the numbers look right.

---

## 2. Apply (replaces all tasks)

```bash
npm run import:tasks -- --file "New Engineering Tasks - 2026 - Engineering Tasks.csv" --apply
```

Steps, in order:
1. **Backup** current `tasks` + `people` to `backups/` (timestamped JSON).
2. **Create missing people** (matched by normalized name). People are never deleted.
3. **Delete** all existing tasks.
4. **Insert** the new tasks (deduped by `import_hash`).
5. **Verify** — prints final task/people counts, count by status, count by
   responsible person, the people list, and 5 sample tasks.

The import refuses to apply if zero valid tasks were parsed.

---

## Field mapping & normalization

| DB column | CSV source (flexible match) |
|---|---|
| `title` | `Title` / `Task description` / `Task` |
| `description` | `Description` (only if distinct from the title column) |
| `notes` | `Notes` / `Comments` |
| `status` | `Status` |
| `priority` | `Priority` |
| `responsible_person_id` | `Responsibility` / `Responsible` / `Owner` / `Assignee` (→ matched/created in `people`) |
| `due_date` | `Due date` (header `startsWith('due')`) |
| `closed_date` | `Close date` / `Closed date` (header `startsWith('close')`; same date parsing; empty/invalid → `null`) — actual closure date, distinct from `due_date` |
| `type` | `Type` |
| `source_file` | the file name |
| `source_raw_text` | JSON of the original row values |
| `import_hash` | sha256 of `title|responsible|due_date|notes` (dedup key) |
| `archived` | always `false` |

- **Status** → `not_started`, `in_progress`, `on_hold`, `need_to_review`, `done`
  (`Completed`/`Complete` → `done`; `Need to review`/`Need review` → `need_to_review`).
  Empty status → `not_started` (counted as a warning).
- **Priority** numeric 1–5 (`1`, `1 - High`, `High`, `5- Low`, `Low`, …).
  Missing/invalid → `3` (warning).
- **Due date** accepts `dd/mm/yyyy`, `dd-mm-yyyy`, `yyyy-mm-dd`, etc.
  Empty / placeholder / invalid → `null` (no crash).
- **Responsible** missing → `responsible_person_id = null` (the column is nullable).
- **Duplicates** (same `import_hash`) are imported once; collapsed duplicates are reported.

---

## Backups & restore

- Backups are written to `backups/` (which is **gitignored** — never committed).
- Files: `tasks-backup-<timestamp>.json`, `people-backup-<timestamp>.json`.
  Each contains the timestamp, Supabase host (no secrets), row count, and all rows.

**If insert fails after delete:** the script prints the backup path and exits
non-zero. To restore, load `backups/tasks-backup-<timestamp>.json` and insert its
`tasks` array back into the `tasks` table — either via a small script using the
Supabase client, or by importing the JSON in the Supabase dashboard.

---

## Excel (XLSX/XLS)

The script also accepts `.xlsx`/`.xls` files **if** the optional `xlsx` package
is installed (`npm i -D xlsx`). Without it, export the sheet to CSV and pass the
`.csv` file instead.
