# Engineering Task Manager — Project Context

> Project documentation and context for future development sessions.
> Read this before making changes to understand the full project history and state.
> (This file replaces the old `claude/context.md`. The `claude/` folder no longer exists.)
>
> **For a concise current-state snapshot (production architecture, features, Activity
> retention, date format, what to check first), read [`session-handoff.md`](session-handoff.md).**

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
| `id` | UUID PK | internal id |
| `task_number` | INTEGER UNIQUE NOT NULL | human-readable id shown as `TASK-<n>`; DB-assigned via `tasks_task_number_seq` default; backfilled for existing rows (see §10b) |
| `title` | TEXT NOT NULL | |
| `description` | TEXT | nullable |
| `notes` | TEXT | nullable |
| `status` | TEXT | enum (CHECK): `not_started`, `in_progress`, `on_hold`, `need_to_review`, `done` |
| `priority` | INTEGER | 1 (High) – 5 (Low), CHECK BETWEEN 1 AND 5 |
| `responsible_person_id` | UUID FK → people.id | ON DELETE SET NULL, **nullable** — who owns/performs the task (Assigned to) |
| `opened_by_person_id` | UUID FK → people.id | ON DELETE SET NULL, **nullable** — who opened/requested the task (Opened by). App-required for new/edited tasks; see §10 |
| `due_date` | DATE | nullable — planned target date |
| `closed_date` | DATE | nullable — **actual** closure date (distinct from due_date); set manually or mapped from CSV "close date". See §10c |
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
- `responsible_person` and `opened_by_person` on the `Task` type are **computed client-side joins**, not DB columns.
- `useTasks.ts` fetches people + tasks in parallel and joins via `joinPerson()` (which resolves **both** `responsible_person_id` → `responsible_person` **and** `opened_by_person_id` → `opened_by_person` from the same people map — two separate FKs to `people`, never an ambiguous embedded join); `toDbPayload()` strips `responsible_person`, `opened_by_person`, `id`, `created_at`, `updated_at` before writes.

---

## 4. Project History

1. **PDF source** — "New Engineering Tasks - 4.26 - Google Sheets.pdf" contained 63 tasks across 5 people (Amit, Elad, Guy, Matan, Tamir). Initial tasks were imported from this PDF.
2. **Initial build** — Vite+React+TS app generated; tasks hardcoded in `mockData.ts`; localStorage mock mode fully functional.
3. **Supabase schema + seed** — `supabase/schema.sql` and `supabase/seed.sql` were executed; 5 people + 63 tasks verified.
4. **Supabase URL typo** — Initial Supabase URL had a typo causing `NXDOMAIN`; fixed by correcting the URL in `.env`.
5. **Frontend Supabase path fixed** — `useTasks.ts` originally had the Supabase branch unimplemented (app showed 0 tasks). It was rewritten to implement parallel fetch + client-side join + full CRUD.
6. **Vercel deployment** — Completed at the production URL above; auto-deploys from `main`.
7. **Mobile Smart Views drawer** — Collapsible Smart Views sidebar added for mobile; desktop layout unchanged.
8. **CSV task replacement** — Old task data replaced with `New Engineering Tasks - 2026 - Engineering Tasks.csv` via a new safe import workflow (`scripts/import_excel_tasks.ts`). The `claude/` context folder was renamed to `docs/`. See section 6.
9. **Filters + inline editing** — Added an active-filter-chips row and moved task editing from a modal to inline expanded-row editing. Verified the post-import counts/statuses. See section 8.
10. **CSV verification / additive sync (this task)** — Added a non-destructive sync workflow (`scripts/sync_csv_tasks.ts`, `npm run sync:tasks`) that reconciles the CSV against Supabase: inserts missing tasks, updates deterministically-matched changed tasks, creates missing people, and **never deletes** (extras are reported only). See section 9 and `docs/sync-tasks.md`.

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

### CSV verification / additive sync (non-destructive)

**Script:** `scripts/sync_csv_tasks.ts` · **Commands:**

```bash
npm run sync:tasks -- --file "New Engineering Tasks - 2026 - Engineering Tasks.csv" --dry-run
npm run sync:tasks -- --file "New Engineering Tasks - 2026 - Engineering Tasks.csv" --apply
```

Unlike the import script (destructive delete + re-insert), **sync is additive**:

- **Inserts** tasks missing from the DB; **updates** existing tasks only on a
  deterministic match where a field differs; **creates** missing people (then assigns).
- **Never deletes.** DB tasks absent from the CSV are reported as `extra_in_db` only.
- **Matching strategy** (first hit wins): (1) `sync_id` stored in `source_raw_text`,
  (2) `import_hash` = `sha256(title|responsible|due|notes)` (same formula as the
  importer), (3) `title + responsible` only when unique on both sides; else
  `ambiguous_match` and left untouched.
- **Duplicates** are collapsed by `import_hash` (the DB's `UNIQUE` key); copies that
  differ only in status/priority are reported as conflicting duplicates (first wins).
- **`--dry-run`** never writes; **`--apply`** backs up to `backups/tasks-before-sync-*.json`
  and `backups/people-before-sync-*.json` first. Both modes write a timestamped JSON
  report to `reports/` (gitignored).

See `docs/sync-tasks.md` for the full operator guide, field mapping, and restore steps.

---

## 7. Current Status

- **Build:** `npm run build` passes (0 TypeScript errors). `npm run build` runs `tsc -b` so it doubles as the typecheck (no separate `typecheck` script).
- **Lint:** `npm run lint` reports **pre-existing** problems only (2 errors + 2 warnings), all in files unrelated to recent work: `useTasks.ts` (`react-hooks/set-state-in-effect`) and `TaskForm.tsx` (`no-explicit-any` on the zodResolver cast). `TaskTable.tsx` has a pre-existing TanStack `incompatible-library` **warning**. The import script and the new UI files lint clean.
- **DB:** 137 tasks, 5 people (after the 2026-06-15 CSV sync: inserted 9, updated 16, nothing deleted). `archived` = 0. Status counts: done=62, not_started=37, in_progress=22, on_hold=12, need_to_review=4. 2 tasks unassigned. (3 CSV rows are duplicates collapsed by `import_hash`, so 137 DB = 140 CSV rows − 3 dups; a re-run dry-run reports all 137 `already_correct`.)
- **Deployed:** Vercel auto-deploys from `main`.
- **Possible follow-ups:** add Supabase Auth (RLS currently permissive); 2 tasks have no responsible person (stored as unassigned); consider code-splitting the >500 kB bundle.

---

## 8. UI: Counts, Filters (multi-select), Active-Filter Chips, Inline Editing

### Task-count verification (canonical status: `need_to_review`)
- **`need_review` vs `need_to_review`:** the entire project — `types/index.ts`, `lib/utils.ts` (labels + badge map + `statusFromRaw`), `lib/storage.ts`, `SmartViews.tsx`, `TasksPage.tsx`, `TaskForm.tsx` zod enum, `supabase/schema.sql` CHECK, and the importer — uses **`need_to_review`**. The Supabase DB also contains only `need_to_review`. There is **no** `need_review` anywhere. Canonical value = **`need_to_review`**. No migration was needed.
- **Why the counts look the way they do:** top-right / FilterBar shows **128** = all non-archived tasks (the total). Smart View **"All Active" = 69** = non-archived **and** `status !== 'done'` (computed in `TasksPage.taskCounts['all-active']`, mirroring `storage.getStats`). 128 − 59 done = 69. Both are correct; nothing is hidden. (There is no place that computes 123 — that was a misread.) "Need Review" smart view counts tasks with `status === 'need_to_review'` (= 5).
- A clarifying tooltip was added to the **All Active** smart view explaining it excludes Done/archived.

### Active-filter chips — `src/components/ActiveFilterChips.tsx`
- Rendered inside `FilterBar` (bottom of the filter card). Returns `null` (no space) when no filter is active.
- **One chip per selected value** (since multi-select): every selected Status / Priority / Person gets its own removable chip, plus Search / Overdue only / Due this week / Show archived. Each chip's X removes just that value (removing the last value in a category returns it to "all"). **Clear all** resets everything. Wraps with `flex-wrap` for mobile.

### Multi-select filters — `TaskFilters` shape + `MultiSelectDropdown`
- **`TaskFilters` changed** (`src/types/index.ts`): the single-value fields `status: TaskStatus|'all'`, `priority: PriorityLevel|'all'`, `responsible_person_id: string|'all'` were replaced by arrays **`statuses: TaskStatus[]`, `priorities: PriorityLevel[]`, `personIds: string[]`**. `search`, `show_archived`, `overdue_only`, `due_this_week` are unchanged.
- **Semantics:** empty array = **no filter / all** (preserves old behavior). Non-empty = filter by those values. **OR within a category, AND across categories** — implemented in `storage.getFilteredTasks` (`statuses.includes(task.status)` etc.; a task with no `responsible_person_id` is excluded when `personIds` is non-empty).
- **`MultiSelectDropdown` (`src/components/MultiSelectDropdown.tsx`)** replaces the three native `<select>`s in `FilterBar`. Checkbox-style menu: each option shows a ✓ when selected; clicking toggles and keeps the menu open; closes on outside click or **Escape**. Button label summarizes selection: `All Statuses` / `1 Status` / `3 Statuses` (and the Priority/People equivalents).
- **"All" row** at the top of each menu: shows ✓ when every option is selected, a `–` (indeterminate) when some-but-not-all are selected, nothing when empty. Clicking it selects all values; clicking again when all are selected clears back to the neutral/all state. Flow for "everything except Done": open Status → click All → uncheck Done.
- **Consumers updated:** `useTasks` `DEFAULT_FILTERS`, `FilterBar` (dropdowns + `hasActiveFilters` + clear), `ActiveFilterChips`, `SmartViews` (view defs + array-aware `isActiveView` + By-Person active check), `Dashboard` stat-card click handlers (`{statuses:[]}`, `{priorities:[1]}`). `App.switchToTasksWithFilters` / `DashboardPage` are unchanged (they pass `Partial<TaskFilters>` through). See `docs/filtering.md`.

### Inline expanded-row editing (replaces the Edit modal)
- The **pencil** icon no longer opens a modal. It expands the row (if collapsed) and switches the expanded area into an inline `TaskForm` (reused as-is) with **Cancel** / **Update Task** buttons.
- Edit state lives in `TaskTable` (`editingId`); per-row saving/error state lives in `TaskRow`. Save goes through the existing `updateTask` (`TasksPage.handleUpdateTask` → `useTasks.updateTask`) — same path as before, returns `Task | null`.
- Success → exit edit mode, row stays expanded showing updated values. Failure → stays in edit mode, **keeps the user's input**, shows an inline error. Cancel → exits edit mode (RHF discards changes).
- Clicking the pencil while collapsed opens the row directly in edit mode. Clicking the row still toggles expand/collapse (collapsing also exits edit mode). **Add Task remains a modal** — only editing moved inline.
- Editable fields: title, description, notes, status, priority, responsible person, **opened by**, due date (same set as the old modal plus Opened by; `type` is not edited because the form never supported it).

---

## 9c. Automatic bullet-dated text traceability (Description & Notes)

When the user starts typing in the **Description** or **Notes** textarea, the app
auto-inserts a Word-style **bullet + date** prefix at the cursor, before the first typed
character. Lives in `src/components/TaskForm.tsx`, so it works identically in the Add Task
modal and the inline expanded-row editor. **Description and Notes are kept as two separate
fields/columns** (never merged); this applies to **both**.

- **Format:** `• (DD.MM.YY) ` — a real bullet `•`, space, date in parentheses (2-digit
  day.month.year), one trailing space (e.g. `2026-06-17` → `• (17.06.26) `). Built by
  `formatTracePrefix(new Date())`.
- **Enter vs Shift+Enter:** **Enter** starts a **new dated bullet line** (`\n• (DD.MM.YY) `,
  via `insertBulletLine`); **Shift+Enter** inserts a **plain newline** only (continue the same
  bullet). Plain Enter no longer just makes a newline — it makes a new bullet.
- **Plain editable text** — saved inline inside the existing `notes`/`description` text.
  **Not** a DB column, not a locked component, not stored separately. No schema change for
  traceability.
- **Not mandatory** — the user can delete/edit/ignore it; nothing validates it; not required
  for saving; **not re-inserted** if deleted within the same interaction.
- **Anti-repeat:** the first-char prefix is inserted once per focus interaction (per-field flag
  reset on `focus`); Enter adds a new bullet explicitly. Never `• (..) • (..)` from typing.
- **Trigger:** first single printable char (keydown, `e.key.length === 1`) + Enter + first
  paste. Ignored: Shift+Enter (plain newline), Backspace/Delete, arrows/Home/End/PageUp-Down,
  Tab/Esc, modifiers, Ctrl/Cmd/Alt shortcuts, and IME/composition (CJK / dead keys) so
  Hebrew/English direct typing works. The prefix sits on its own line unless at start of field
  or right after a newline. Selected text is replaced by `prefix + typed char`.
- Full details + edge-case table: see `docs/task-text-traceability.md`.

---

## 10b. Task numbers (TASK-123) & cross-task references (@123)

Human-readable task keys plus `@number` cross-task links. Full guide:
`docs/task-references.md`.

- **`task_number`** (`tasks.task_number INTEGER UNIQUE NOT NULL`) shown as **`TASK-<n>`** via
  `formatTaskKey()`. DB-assigned by sequence default `tasks_task_number_seq`; the app never
  sends it (stripped in `useTasks.toDbPayload`). UUID `id` is still the internal PK.
- **UI:** new sortable **Key** column in the table; expanded view shows `Task: TASK-<n>`
  prominently and demotes the raw `import_hash` to a tiny "hash (technical)" line. The
  `import_hash` is **no longer the primary UI identifier** — kept for debugging only.
- **Search** also matches the number: `123`, `TASK-123`, `task-123`, `#123` (exact match,
  via `matchesTaskNumber()`); title/notes/person search unchanged.
- **References:** typing `@123` / `@TASK-123` / `@task-123` in Notes/Description is stored as
  raw text and **linkified only at read-time** (`src/components/TaskTextWithLinks.tsx`, no
  `dangerouslySetInnerHTML`, line breaks preserved). Emails are not matched (the `@` must not
  follow a word char). Clicking a link resets hiding filters (matching the target's archived
  state), then expands + scrolls + briefly highlights the target row (`TaskTable.openTask`
  imperative handle; rows carry `data-task-id`/`data-task-number`). Unknown numbers render as
  subtle plain text and never crash.
- **Mention autocomplete (editing helper):** while editing Notes/Description, typing `@` opens
  a suggestion popup (`src/components/MentionSuggestions.tsx`, logic in `TaskForm`). Trigger:
  `@` at start or after a separator (space/newline/`([{:,`) — never mid-word, so emails don't
  trigger it. Typing digits filters task numbers by **prefix** (`@13` → TASK-13/130/131/139…);
  empty query shows the most-recent numbers (max 8); each row shows key + title + status; only
  tasks with a `task_number` appear. Keyboard: `↓`/`↑` highlight, `Enter`/`Tab` select, `Esc`
  close; mouse click selects, outside-click/blur closes. Selecting **inserts plain
  `@TASK-<number>` + trailing space** (replaces the typed token) via RHF `setValue` — **no DB
  column, no rich object/markdown/HTML**. The renderer accepts `@123`, `@TASK-123` and
  `@task-123` interchangeably, so older notes saved with the bare `@123` form still link. Works
  alongside the bullet-dated prefix (`@` as the first char → `• (DD.MM.YY) @`, then the popup
  filters as digits are typed). Suggestion source is the full loaded task list threaded
  `TasksPage → TaskTable → TaskRow → TaskForm` (and directly to the Add-Task modal) as
  `mentionTasks` — no per-keystroke Supabase query.
- **BY PERSON sidebar merges with current filters (2026-06-17):** clicking a person under
  Smart Views → BY PERSON now **toggles** that person in `personIds` while preserving every
  other active filter (statuses/priorities/search/overdue/due-this-week/show_archived) — it no
  longer resets to a clean view. The top Smart Views (All Active/Overdue/etc.) still replace the
  whole filter set by design. A person row is highlighted whenever it is in `personIds`. See
  `docs/filtering.md`.
- **Mock mode:** seed tasks get `TASK-1…TASK-63`; new mock tasks get `max + 1`. Search/links
  work in mock mode.
- **Import/sync scripts:** unchanged. They never send `task_number`; the DB default assigns it
  for inserted rows. (`select('*')` now also returns `task_number`, which is harmless.)

### Migration / apply instructions
- **File:** `supabase/add_task_number_to_tasks.sql` (idempotent): adds the column nullable,
  backfills existing rows by `created_at ASC, title ASC, id ASC`, creates + seeds the
  sequence, sets it as the column default, adds the unique index, then `SET NOT NULL`.
- **Apply status: NOT applied automatically** — DDL can't run through the anon key/PostgREST,
  and no `service_role` key is configured. **Run it manually** in the Supabase **SQL Editor**.
- **Until applied:** tasks have no `task_number` → keys show `—`, number search finds nothing,
  and `@n` references don't resolve. The app otherwise works (new inserts succeed; the column
  is just absent). Verify after running:
  - `SELECT COUNT(*) FROM tasks WHERE task_number IS NULL;` → expect `0`
  - `SELECT COUNT(*) total, COUNT(DISTINCT task_number) uniq FROM tasks;` → `total = uniq`

---

## 10c. Description/Notes field order + Closed Date (2026-06-17)

### Description & Notes stay separate; Description first
- Two distinct fields/columns, **never merged**: **Description** = what needs to be done /
  general context; **Notes** = updates / comments / ongoing log.
- **Order is Description then Notes** in the Add Task modal, the inline edit form, and the
  read-only expanded view.
- Both always render in the expanded view with placeholders when empty (`No description` /
  `No notes`), so a task with only one of them still shows correctly. No data was migrated or
  merged.
- TaskForm field order: Title → Status/Priority → Responsible/Due Date → Closed Date/Opened by
  → Description → Notes.

### Closed Date (`closed_date`)
- New nullable `tasks.closed_date DATE` — the **actual** closure date, distinct from `due_date`
  (planned target). `Task.closed_date?: string | null`.
- **UI:** date input in TaskForm **after Due Date** (paired with Opened by); new **Closed**
  column in the task table **after Due Date** (sortable); expanded metadata shows **Closed date**
  right after **Due date**. Empty → `—`.
- **No automation:** `closed_date` is **not** auto-set when status becomes Done; it is set
  manually (or mapped from CSV). Saving is not blocked when Done has no closed_date.
- **Flow:** loaded/inserted/updated as a normal column (`useTasks.toDbPayload` passes it
  through; `TasksPage` add/update handlers send `closed_date`); mock/localStorage stores it via
  the normal spread. `TasksPage` add/update map `data.closed_date || null`.
- **CSV import/sync:** a CSV `close date` / `closed date` column maps to `closed_date`
  (`columnMap.closed_date`, matched by `startsWith('close')`, parsed with the existing date
  normalizer; empty/invalid → `null`). Distinct from `due` (`startsWith('due')`). The sync
  script also diffs/updates `closed_date`. See `docs/import-tasks.md` / `docs/sync-tasks.md`.

### Migration / apply instructions
- **File:** `supabase/add_closed_date_to_tasks.sql` (idempotent):
  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS closed_date date;`
- **Apply status: NOT applied automatically** — DDL can't run through the anon key/PostgREST.
  **Run it manually** in the Supabase **SQL Editor**.
- **Until applied:** the column does not exist, so saving a task (insert/update) that includes
  `closed_date` **will fail** at Supabase. Run the SQL before using the app in production.
  Verify:
  - `SELECT column_name FROM information_schema.columns WHERE table_name='tasks' AND column_name='closed_date';` → `closed_date`
  - `SELECT COUNT(*) FROM tasks WHERE closed_date IS NOT NULL;`

---

## 9b. "Opened by" field (who opened/requested the task)

### What it is
A second person relationship on each task, **distinct from "Assigned to"**:
- **Assigned to** = `responsible_person_id` → who owns/performs the task.
- **Opened by** = `opened_by_person_id` → who opened/created/requested the task.

Values come **only** from the existing `people` table (a dropdown, no free text).

### DB column
- `tasks.opened_by_person_id UUID REFERENCES people(id) ON DELETE SET NULL` — **nullable**.
- Index: `idx_tasks_opened_by_person_id`.
- Name chosen to mirror the existing `responsible_person_id` (snake_case in both DB and TS).
- Defined in `supabase/schema.sql`; migration in `supabase/add_opened_by_to_tasks.sql`.

### Migration / apply instructions
The column is **nullable on purpose** — existing/imported tasks have no value and a
`NOT NULL` constraint would break them. "Required" is enforced in the **app layer**, not the DB.

**Apply status: NOT applied automatically.** DDL (`ALTER TABLE`) cannot run through the
Supabase anon key / PostgREST from the app, and no `service_role` key is configured. You
must run it manually:
1. Open the Supabase project → **SQL Editor**.
2. Paste the contents of `supabase/add_opened_by_to_tasks.sql` and **Run** (it is idempotent —
   `ADD COLUMN IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`).
3. After it runs, **Add Task** and inline edit will persist `opened_by_person_id`.

⚠️ **Until the migration is applied**, the app still loads tasks fine (the missing column
just reads as `null` → "Opened by: —"), but **creating or saving a task will fail** at
Supabase because the column does not exist yet. Apply the SQL first.

### UI behavior
- **Add Task** (modal) and **inline edit** (expanded row) both show an **Opened by** dropdown
  (label `Opened by *`, placeholder `Select opener`, options = current people).
- **Required** in both create and edit. Zod: `opened_by_person_id: z.string().min(1, 'Opened by is required')`.
  Submitting without a selection shows the inline error **"Opened by is required"** and blocks save.
- Editing an existing task that has no `opened_by_person_id` defaults the dropdown to empty,
  so the user **must pick** a value before the form will save.
- **Expanded details** show a new `Opened by` row (UserPlus icon) right under `Assigned to`.

### Existing tasks (no `opened_by` yet)
- Displayed as **`Opened by: —`** (same dash style as an unassigned responsible person).
- **Not** bulk-assigned to anyone — no silent default was applied. Each task gets a value
  the next time it is edited (the form requires one before saving).

### CSV import / sync
- The importer (`scripts/import_excel_tasks.ts`) and sync (`scripts/sync_csv_tasks.ts`) were
  **not changed**. The CSV has no "opened by" column, so imported/synced tasks get
  `opened_by_person_id = null` (column default) and display `Opened by: —`. `opened_by` is
  **not required** for CSV import. The scripts define their own row types and select explicit
  columns, so the new column does not affect them.

### Mock / localStorage mode
- `src/lib/storage.ts` `addTask`/`updateTask` attach the computed `opened_by_person` from the
  people list, mirroring `responsible_person`. Mock seed tasks (`mockData.ts`) intentionally
  have no `opened_by` (they demonstrate the legacy "—" + required-on-edit behavior).
