# Session Handoff — Engineering Task Manager

> **Read this first.** Single-page snapshot so a fresh Claude/Codex session can continue
> without prior chat history. For deep project history see [`context.md`](context.md); for
> APIs see [`cloudflare-worker-api.md`](cloudflare-worker-api.md); for D1 ops see
> [`d1-migration.md`](d1-migration.md); for email/mentions see
> [`email-notifications.md`](email-notifications.md).
>
> **Last updated:** 2026-06-25 (PR #14 — Activity date format + retention).

---

## 1. Current production architecture

```
https://task-management-system-3nm.pages.dev          (Cloudflare Pages — official production frontend)
  → https://task-management-api-production.sw-590.workers.dev   (Cloudflare Worker — task-management-api-production)
  → Cloudflare D1  task-management-production  (id a5f4558a-d8db-41ba-9d2a-a5cd9210eb16)
```

- Staging stack (validation only): `https://staging.task-management-system-3nm.pages.dev` →
  Worker `task-management-api` → D1 `task-management-staging`.
- **Vercel + Supabase remain live as ROLLBACK** (Vercel URL + Supabase project). They are
  **not** in the production runtime path but **must NOT be deleted** unless the user explicitly
  asks. No DNS/custom-domain change has been made.
- Deploys are GitHub Actions on push to `main`: **Deploy Cloudflare Pages Production** (always)
  and **Deploy Cloudflare Worker Production** (when `worker/**` changes). D1 schema migrations
  are **manual** via the **D1 Apply Migrations** workflow (`workflow_dispatch`); **D1 import is
  manual-only and must never be run automatically**.

## 2. Current major features

- **Tasks** page (sortable/filterable table, expand rows, add/edit/archive/restore, Smart Views).
- **Dashboard** page (summary stats).
- **Current user selector** (header) — see §3.
- **My Mentions** (header `@` icon) — see §4.
- **Activity feed** (header bell icon) — see §5.
- **Emails (Resend, English, ENABLED in production):** assignment emails, mention emails, and
  Description/Notes **update** emails to the responsible person (the update email includes the
  actual added text, with a Before/After fallback). Best-effort, detached; never blocks a task
  mutation. `RESEND_API_KEY` is a Cloudflare Worker **secret** (never in the repo).
- **Activity retention rule:** keep only the latest **50** activity events per user (§6).

## 3. Current-user model (NOT authentication)

- There is **no login/auth**. The header **Current user** selector is a lightweight *actor*
  identity only.
- Stored in `localStorage` (`taskManager.currentUserId`); validated against the people list;
  stale ids cleared gracefully.
- Sent as the optional `actor_person_id` on task create/update (stripped before the task
  whitelist — never stored on the task).
- **Required** for: saving newly added person mentions, and saving Description/Notes changes on
  an assigned task (these would send actor-dependent emails). A blocked save lights the
  selector's attention cue. Ordinary/`@TASK`-only edits don't require it.

## 4. My Mentions behavior

- Opened by the header **`@`** icon (unread-count red badge).
- Backed by D1 table **`mention_notifications`**; unread = `opened_at IS NULL`.
- Worker inserts one row per **newly** mentioned person on create/update (independent of email).
- Opening a mention marks it **opened/read** (`POST /api/mentions/:id/open`, idempotent,
  `person_id` must equal the row's `mentioned_person_id`) → it leaves the unread list globally.
- **Distinct from Activity.** My Mentions retention is **unchanged** and **must not be touched**.

## 5. Activity behavior

- Opened by the header **bell** icon (icon-only; no always-on badge — Activity has no unread
  concept). `@` and bell share consistent header styling.
- Backed by D1 table **`activity_events`** — a **read-only chronological history** (no
  unread/read state). One row **per target person**.
- Event types: `task_created`, `task_assigned`, `person_mentioned`, `task_updated`,
  `status_changed`, `priority_changed`, `due_date_changed`, `closed_date_changed`,
  `task_archived`, `task_restored`.
- API: `GET /api/activity?person_id=&limit=&event_type=&actor_person_id=&from=&to=&q=`
  (newest first; default `limit=50`, max 200) and `GET /api/activity/count?person_id=`.
- Filters in the UI: person/actor, event type, date range (from/to), text search.
- Clicking an activity item opens the task via the existing `?task=TASK-<n>` deep link. Clicking
  an Activity item **never** marks a My Mentions item read.
- **Activity is NOT a full security/audit log.** It is a convenience feed keyed on the
  lightweight Current user.

## 6. Activity retention implementation (latest 50 per user)

- Enforced in **Worker code** (`worker/src/index.ts` → `pruneActivityEventsForTarget`), called
  by `insertActivityEvents` **after** inserting rows, once per affected `target_person_id`.
- SQL (D1/SQLite):
  ```sql
  DELETE FROM activity_events
   WHERE target_person_id = ?
     AND id NOT IN (
       SELECT id FROM activity_events
        WHERE target_person_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 50
     );
  ```
- **Per `target_person_id`** (the person the feed is FOR), **NOT `actor_person_id`**, **not
  global**. Newest 50 kept (`created_at DESC, id DESC`); older rows deleted.
- **Never** touches other users' rows, `mention_notifications`, tasks, or email data. `NULL`/
  empty target is **skipped** (never pruned). Best-effort (logged; never breaks a task mutation).
- **No migration / no D1 import.** Existing rows beyond 50/user are not bulk-deleted; each user
  converges to ≤50 as they accrue new activity.

## 7. Date formatting (Activity UI)

- Activity timestamps display as **`dd/mm/yy · HH:mm`** (24-hour), e.g. `25/06/26 · 17:53`
  (`formatTime` in `src/pages/ActivityPage.tsx`, date-fns token `"dd/MM/yy '·' HH:mm"`).
- **Stored D1 timestamps are unchanged** (ISO 8601) — presentation only.
- The From/To filter labels note `(dd/mm/yy)`. The native `<input type="date">` still renders
  its **browser-locale** value/placeholder, which the page cannot override (known limitation —
  not worth a custom date picker). My Mentions keeps its own format (unchanged, out of scope).

## 8. Known lint baseline (intentionally out of scope)

`npm run lint` reports **1 error + 2 warnings**, all **pre-existing** and unrelated to recent
work — do not treat as regressions:
- `src/hooks/useTasks.ts:113` — `react-hooks/set-state-in-effect` (error). Long-standing.
- `src/components/TaskForm.tsx`, `src/components/TaskTable.tsx` — "Compilation Skipped: Use of
  incompatible library" (warnings).
CI's lint step is non-blocking (`continue-on-error`); the `Build & checks` job is the gate.

## 9. Operational rules

- **Never print or commit `RESEND_API_KEY`** (Cloudflare Worker secret).
- **Never run D1 import** unless the user explicitly requests it; never make it automatic.
- D1 schema migrations are **additive / manual** via the **D1 Apply Migrations** workflow
  (`workflow_dispatch`), or `wrangler d1 execute --remote --file=…`. When dispatching the
  workflow for a not-yet-merged migration file, pass `--ref <feature-branch>` (the workflow
  defaults to the `main` ref).
- **No force-push, no force-merge.**
- **No unrelated UI** additions. **Do not reintroduce** the removed Description/Notes Preview UI.
- Do not change My Mentions / `mention_notifications` retention or behavior.

## 10. Latest production verification

- **Latest production-affecting change:** PR #14 (`feature/activity-date-format-and-retention`)
  — Activity dd/mm/yy date display + per-user retention (50). Worker + frontend only; **no D1
  migration**.
- Standing production facts (verified during this and prior sessions): production URL returns
  **HTTP 200**; Worker `/health` returns `{"db":"d1"}`; `/api/people`, `/api/tasks`,
  `/api/mentions`, `/api/activity` all return 200. The exact post-deploy verification for the
  latest change is recorded in that PR's session report (see the PR description / final report).
- D1 tables present in production: `people`, `tasks`, `mention_notifications`, `activity_events`
  (+ `people.email`). Migrations applied: `2026-06-18_add_people_email`,
  `2026-06-25_add_mention_notifications`, `2026-06-26_add_activity_events`.
- Any production smoke tasks are titled `… DELETE ME` and **archived** after the test; target
  **active `DELETE ME` count = 0**.

## 11. What a future session should check first

1. `git status` (expect clean) and `git branch --show-current` (expect `main`).
2. `git fetch origin` → `git checkout main` → `git pull origin main`. Stop if the tree is dirty.
3. Read this file, then [`context.md`](context.md), [`cloudflare-worker-api.md`](cloudflare-worker-api.md),
   [`d1-migration.md`](d1-migration.md), [`email-notifications.md`](email-notifications.md),
   [`production-cutover-checklist.md`](production-cutover-checklist.md),
   [`git-workflow.md`](git-workflow.md).
4. Inspect `.github/workflows/` (CI, Pages/Worker production deploys, D1 apply-migrations, D1
   imports) before any deploy/migration.
5. Confirm production URLs respond: Pages `200`, Worker `/health` `db:"d1"`, `/api/people`,
   `/api/tasks`, `/api/mentions`, `/api/activity`.
6. Confirm D1 migration state — the three migrations above should already be applied to
   `task-management-production`. New schema needs a new `d1/migrations/*.sql` + the manual
   workflow; **never** run a D1 import.
7. Key source: Worker `worker/src/index.ts` (routes, email/mention/activity scheduling +
   retention prune) and `worker/src/{email,activity}.ts`; frontend `src/App.tsx` (header/nav),
   `src/pages/{ActivityPage,MentionsPage,TasksPage}.tsx`, `src/hooks/{useActivity,useMentions,
   useCurrentUser,useTasks}.ts`, `src/lib/taskApi.ts`.
