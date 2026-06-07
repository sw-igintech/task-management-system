# Engineering Task Manager — Project Context

> Project documentation and context for future development sessions.
> Read this before making changes to understand the full project history and state.
> (This file replaces the old `claude/context.md`. The `claude/` folder no longer exists.)

---

## 1. Project Overview

**What it is:** An internal web app for tracking engineering tasks across a small team.

**Why it exists:** The team managed tasks in a Google Sheet (originally exported to PDF, now exported to CSV). That export is the source of truth used to seed/replace the database. The app replaces ad-hoc spreadsheet management with a structured, filterable, searchable task management UI.

**Main features:**
- View all engineering tasks in a sortable, filterable table
- Expand any task row to see full notes, metadata, and source info
- Filter by status, priority, responsible person, overdue, due-this-week
- Smart Views sidebar: All Active, Overdue, Due This Week, High Priority, Need Review, In Progress, By Person
- Dashboard with summary stats (active, overdue, due-this-week, high-priority, by status, by person)
- Add / edit / archive tasks; add people
- Mock/localStorage mode when Supabase is not configured (fully functional for local dev)

**Tech stack:**
- Frontend: Vite 8 + React 19 + TypeScript
- Styling: Tailwind CSS v4
- Table: TanStack Table v8 · Data fetching: TanStack Query v5
- Forms: React Hook Form + Zod · Icons: Lucide React · Dates: date-fns
- State: local React state + custom `useTasks` hook
- Backend/DB: Supabase (PostgreSQL with RLS)
- Deployment: Vercel (frontend only, no server)

**Production URL:** https://task-management-system-gray-beta.vercel.app

**GitHub repo:** git@github.com:sw-igintech/task-management-system.git

---

## 2. Architecture

### Frontend (`src/`)
- `types/index.ts` — TypeScript types: `Task`, `Person`, `TaskFilters`, `SortField`, etc.
- `lib/supabase.ts` — Supabase client + `isMockMode` detection
- `lib/mockData.ts` — seed tasks + people for mock mode
- `lib/storage.ts` — localStorage CRUD + filtering/sorting/stats (mock mode)
- `lib/utils.ts` — `cn()`, `formatDate`, `isOverdue`, `isDueThisWeek`, badge maps
- `hooks/useTasks.ts` — master data hook: detects mock vs Supabase mode; exposes tasks, people, filters, CRUD
- `components/` — `ui/` primitives + `Dashboard`, `FilterBar`, `SmartViews`, `TaskExpandedView`, `TaskForm`, `TaskRow`, `TaskTable`
- `pages/` — `TasksPage.tsx` (main, incl. mobile sidebar drawer), `DashboardPage.tsx`
- `App.tsx`, `main.tsx`, `index.css`

### Backend — Supabase
- Hosted PostgreSQL + REST API + RLS
- Tables: `people`, `tasks`
- RLS enabled with **permissive "allow all"** policies for the MVP (no auth yet). This is why the anon key is sufficient for the import script's delete/insert.
- Schema: `supabase/schema.sql` · Original seed: `supabase/seed.sql`

### Mock / localStorage fallback
- Triggered when `VITE_SUPABASE_URL` is missing/placeholder
- `isMockMode` flag exported from `src/lib/supabase.ts`
- Data stored in localStorage keys `etm_tasks`, `etm_people`, initialized from `mockData.ts`
- An amber "Mock Mode (localStorage)" badge appears in the header
- All CRUD works in mock mode

### Environment variables
| Variable | Where used | Required for |
|---|---|---|
| `VITE_SUPABASE_URL` | `src/lib/supabase.ts` + import script | Supabase connection |
| `VITE_SUPABASE_ANON_KEY` | `src/lib/supabase.ts` + import script | Supabase auth |
| `SUPABASE_SERVICE_ROLE_KEY` | **import script only**, optional | Only if RLS is tightened. Never in frontend, never committed. |

Set in `.env` locally (gitignored). Set `VITE_*` vars in Vercel project settings for production. **Never print or commit key values.**

---

## 3. Data Model

### `people` table
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | `uuid_generate_v4()` |
| `name` | TEXT NOT NULL | |
| `email` | TEXT | optional |
| `created_at` | TIMESTAMPTZ | default now() |

### `tasks` table
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `title` | TEXT NOT NULL | |
| `description` | TEXT | nullable |
| `notes` | TEXT | nullable |
| `status` | TEXT | enum (CHECK): `not_started`, `in_progress`, `on_hold`, `need_to_review`, `done` |
| `priority` | INTEGER | 1 (High) – 5 (Low), CHECK BETWEEN 1 AND 5 |
| `responsible_person_id` | UUID FK → people.id | ON DELETE SET NULL, **nullable** |
| `due_date` | DATE | nullable |
| `type` | TEXT | optional |
| `source_file` | TEXT | origin filename |
| `source_page` | INTEGER | (legacy from PDF import) |
| `source_raw_text` | TEXT | original raw row text |
| `import_hash` | TEXT UNIQUE | dedup key |
| `archived` | BOOLEAN | default false |
| `created_at` / `updated_at` | TIMESTAMPTZ | `updated_at` auto-updated via trigger |

**Status values (schema-accurate):** `not_started`, `in_progress`, `on_hold`, `need_to_review`, `done`.
**Priority values:** integer 1–5 (1 = High, 5 = Low).

### DB ↔ Frontend mapping
- All columns are snake_case in DB **and** TypeScript types.
- `responsible_person` on the `Task` type is a **computed client-side join**, not a DB column.
- `useTasks.ts` fetches people + tasks in parallel and joins via `joinPerson()`; `toDbPayload()` strips `responsible_person`, `id`, `created_at`, `updated_at` before writes.

---

## 4. Project History

1. **PDF source** — "New Engineering Tasks - 4.26 - Google Sheets.pdf" contained 63 tasks across 5 people (Amit, Elad, Guy, Matan, Tamir). Initial tasks were imported from this PDF.
2. **Initial build** — Vite+React+TS app generated; tasks hardcoded in `mockData.ts`; localStorage mock mode fully functional.
3. **Supabase schema + seed** — `supabase/schema.sql` and `supabase/seed.sql` were executed; 5 people + 63 tasks verified.
4. **Supabase URL typo** — Initial Supabase URL had a typo causing `NXDOMAIN`; fixed by correcting the URL in `.env`.
5. **Frontend Supabase path fixed** — `useTasks.ts` originally had the Supabase branch unimplemented (app showed 0 tasks). It was rewritten to implement parallel fetch + client-side join + full CRUD.
6. **Vercel deployment** — Completed at the production URL above; auto-deploys from `main`.
7. **Mobile Smart Views drawer** — Collapsible Smart Views sidebar added for mobile; desktop layout unchanged.
8. **CSV task replacement (this task)** — Old task data replaced with `New Engineering Tasks - 2026 - Engineering Tasks.csv` via a new safe import workflow (`scripts/import_excel_tasks.ts`). The `claude/` context folder was renamed to `docs/`. See section 6.

---

## 5. User Preferences / Working Style

- **Precision over vagueness.** Exact instructions, not "you might need to...".
- **Step-by-step troubleshooting.** Numbered steps with exact commands when something breaks.
- **Minimal, safe changes.** Only touch files that need changing. No refactoring unrelated code.
- **Never break functionality.** Keep mock mode. Don't change Supabase logic unless fixing it. Don't touch the mobile drawer.
- **Verification after every change.** Run `npm run build` (and lint) and report the result.
- **Final report format.** End each task with: files changed/created, commands run, results, git commit, what remains.
- **Hebrew chat, English code/docs.** Explanations to the user in Hebrew; code and docs in English.
- **Self-sufficient.** Solve everything possible without asking; only ask when a value is truly missing.
- **No secrets printed.** Never log/print/expose Supabase keys. Service role key only in local scripts.

---

## 6. Import Workflow

**Source file (current source of truth):** `New Engineering Tasks - 2026 - Engineering Tasks.csv` (project root).

**Script:** `scripts/import_excel_tasks.ts` (supports CSV; supports XLSX/XLS if the optional `xlsx` package is installed).

**Commands:**
```bash
npm run import:tasks -- --file "New Engineering Tasks - 2026 - Engineering Tasks.csv" --dry-run
npm run import:tasks -- --file "New Engineering Tasks - 2026 - Engineering Tasks.csv" --apply
```

**Dry-run** never touches Supabase: parses, normalizes, validates, dedups, and prints a report (also written to `backups/dry-run-report-<ts>.json`).

**Apply** (destructive, in order):
1. Backup current `tasks` + `people` to `backups/` (timestamped JSON, host only — no secrets).
2. Create any missing people (matched by normalized name). **People are never deleted.**
3. Delete all existing `tasks`.
4. Insert the new tasks from the CSV (deduped by `import_hash`).
5. Verify final counts + sample rows.

**Backups** live in `backups/` (gitignored). If insert fails after delete, the script prints the backup path + restore instructions and exits non-zero.

**Restore note:** load `backups/tasks-backup-<ts>.json` and insert its `tasks` array back into the `tasks` table (via a script or the Supabase dashboard import).

See `docs/import-tasks.md` for the full operator guide.

---

## 7. Current Status

- **Build:** `npm run build` passes (0 TypeScript errors).
- **Lint:** `npm run lint` reports pre-existing `react-hooks` errors in `src/` (e.g. `useTasks.ts`, `TaskTable.tsx`) unrelated to the import work; the import script lints clean.
- **DB:** 128 tasks, 5 people after the CSV import.
- **Deployed:** Vercel auto-deploys from `main`.
- **Possible follow-ups:** add Supabase Auth (RLS currently permissive); 2 CSV rows have no responsible person (stored as unassigned); consider code-splitting the >500 kB bundle.
