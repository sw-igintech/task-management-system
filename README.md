# Engineering Task Manager

A complete task management system for the engineering team, built with Vite + React + TypeScript + Tailwind CSS.

## Features

- 63 pre-loaded engineering tasks from the PDF "New Engineering Tasks - 4.26 - Google Sheets.pdf"
- Works completely offline using localStorage (Mock Mode) — no backend required
- Optional Supabase backend for team persistence
- Full CRUD: create, edit, archive, and restore tasks
- Rich filtering: search, status, priority, person, overdue, due this week
- Smart Views sidebar for quick navigation
- Dashboard with stats, status breakdown, and per-person task counts
- TanStack Table v8 with sortable columns and expandable rows
- React Hook Form + Zod validation
- `@`-mentions in Description/Notes for both tasks (`@TASK-123`) and people (`@Matan`) —
  shown and edited as friendly `@Name` (stored stably as `@person:<id>`), rendered **blue**
- "Overdue by X days" indicator under Due Date on expanded/edited tasks
- Email notifications (Resend, English) for assignments & mentions — **ENABLED in production**
  (`EMAIL_ENABLED=true`, sender domain `task-notification.xyz`); assignment emails name the
  opener, every email deep-links to the specific task (`?task=TASK-<n>`, opens it expanded);
  best-effort, never blocks a task save; see [`docs/email-notifications.md`](docs/email-notifications.md)
- **Current user** selector in the header (lightweight actor, **not** authentication) — stored
  in `localStorage`; sent as the optional `actor_person_id` so mention emails name who acted
  ("Matan mentioned you…"); saving newly added mentions requires it (inline prompt, no popup)
- **Update emails include the added text** — when Description/Notes change, the "task updated"
  email shows the actual added text (`Added to Notes: …`), with a Before/After fallback for
  mid-text edits; `@person:<id>` tokens render as `@Name` (see `docs/email-notifications.md`)
- **My Mentions inbox** — a compact icon-only `@` button in the header (with an unread badge)
  opens a list of unread mentions for the selected Current user; clicking one marks it read
  (persisted in D1) and opens the task. Identity is the Current user (lightweight, **not**
  auth). Requires the `mention_notifications` D1 migration (see `docs/d1-migration.md`)
- **Activity feed** — a compact icon-only **bell** button in the header (next to `@`) opens a
  chronological **Activity** history for the Current user: assignments, mentions, Description/
  Notes updates, status/priority/due/closed-date changes, archive/restore. Compact filters
  (person/actor, event type, date range, text search). Distinct from My Mentions — Activity is
  a read-only history (no unread/read state); My Mentions is the actionable unread inbox.
  Identity is the Current user (lightweight, **not** auth / not an audit-security log).
  Requires the `activity_events` D1 migration (see `docs/d1-migration.md`). Dates display as
  **dd/mm/yy · HH:mm** (24-hour). **Retention:** only the latest **50** events per person are
  kept (older rows are pruned automatically after each insert; per `target_person_id`, not
  global). See [`docs/session-handoff.md`](docs/session-handoff.md) for current state.
- **Header navigation** — clicking the **Engineering Task Manager** brand/logo returns to the
  Tasks page; the `@` (My Mentions) and bell (Activity) icons form a consistent header action group

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173 — the app runs immediately with all 63 tasks loaded from localStorage.

## Supabase Setup (Optional)

If you want data persisted in a shared database, see `SETUP_REQUIRED_FROM_USER.md`.

## Deployment / Production

**Official production stack (Cloudflare):**

```
https://task-management-system-3nm.pages.dev
  → Worker  https://task-management-api-production.sw-590.workers.dev   (task-management-api-production)
  → D1      task-management-production  (id a5f4558a-d8db-41ba-9d2a-a5cd9210eb16)
```

Staging stack (validation): `https://staging.task-management-system-3nm.pages.dev` → staging
Worker `task-management-api` → D1 `task-management-staging`.

### Operational quick guide

1. **Official site:** https://task-management-system-3nm.pages.dev
2. **Update code (auto-deploys to Cloudflare):**
   ```bash
   git checkout main && git pull origin main
   # ...make changes...
   npm run build           # verify locally
   git commit -am "..." && git push origin main
   ```
   Pushing to `main` runs GitHub Actions → **Deploy Cloudflare Pages Production** (always) and
   **Deploy Cloudflare Worker Production** (when `worker/**` changes) → the live site updates
   automatically. A failed build blocks the deploy.
3. **Update tasks/people (data):** just use the website — runtime changes go
   **Browser → Worker → D1 production** and are **not** pushed to GitHub. No deploy needed.
4. **Deploy monitoring:** GitHub → Actions → *Deploy Cloudflare Pages Production* /
   *Deploy Cloudflare Worker Production*.
5. **Rollback (kept live):** Vercel (`https://task-management-system-gray-beta.vercel.app`) +
   Supabase remain available — use them if a Cloudflare issue occurs. **Do not delete for
   ≥ 1–2 weeks.** No DNS change was made, so rollback = use the Vercel URL.
6. **Manual-only (never automatic):** **D1 Production Import**
   (`d1-production-import.yml`, `workflow_dispatch`) — it can overwrite D1 production data, so a
   normal code push must never run it. Same for staging imports.
7. **Future:** custom domain · auth/access control (none yet — accepted risk, see
   `docs/cloudflare-worker-api.md`) · cleanup of the old Vercel/Supabase stack (later).

Full details: `docs/cloudflare-setup.md`, `docs/production-cutover-checklist.md`,
`docs/cloudflare-worker-api.md`, `docs/d1-migration.md`.

## Scripts

### Import / replace tasks from a CSV (or Excel) file

The current source of truth is `New Engineering Tasks - 2026 - Engineering Tasks.csv`.
See `docs/import-tasks.md` for the full guide.

```bash
# Dry-run — never writes to Supabase; parses, validates, reports
npm run import:tasks -- --file "New Engineering Tasks - 2026 - Engineering Tasks.csv" --dry-run

# Apply — backs up, deletes ALL existing tasks, then inserts the CSV tasks
# (people are never deleted; missing people are created)
npm run import:tasks -- --file "New Engineering Tasks - 2026 - Engineering Tasks.csv" --apply
```

> ⚠️ `--apply` deletes all existing tasks before inserting. A timestamped backup
> of tasks + people is written to `backups/` (gitignored) first.

### Legacy PDF importer

```bash
# Original hardcoded-from-PDF importer (kept for reference)
npx tsx scripts/import_pdf_tasks.ts --dry-run
npx tsx scripts/import_pdf_tasks.ts --import
```

## Documentation

- [`docs/context.md`](docs/context.md) — full project context and history
- [`docs/git-workflow.md`](docs/git-workflow.md) — branch model, PR rules, branch protection
- [`docs/cloudflare-migration-plan.md`](docs/cloudflare-migration-plan.md) — planned migration to Cloudflare (in progress: Pages staging)
- [`docs/cloudflare-setup.md`](docs/cloudflare-setup.md) — Cloudflare Pages staging deploy: secrets, workflow, troubleshooting
- [`docs/cloudflare-worker-api.md`](docs/cloudflare-worker-api.md) — read-only Cloudflare Worker API (`task-management-api`) over Supabase
- [`docs/email-notifications.md`](docs/email-notifications.md) — person mentions + Resend email notifications (disabled by default)
- [`docs/import-tasks.md`](docs/import-tasks.md) · [`docs/sync-tasks.md`](docs/sync-tasks.md) · [`docs/filtering.md`](docs/filtering.md) · [`docs/task-references.md`](docs/task-references.md) · [`docs/task-text-traceability.md`](docs/task-text-traceability.md)

CI runs on every PR via [`.github/workflows/ci.yml`](.github/workflows/ci.yml) (build + checks; no deploy).

## Tech Stack

- Vite + React 19 + TypeScript
- Tailwind CSS v4
- TanStack Table v8
- TanStack Query v5
- React Hook Form + Zod
- Lucide React icons
- date-fns
- Supabase JS client (optional)
