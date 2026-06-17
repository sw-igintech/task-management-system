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

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173 — the app runs immediately with all 63 tasks loaded from localStorage.

## Supabase Setup (Optional)

If you want data persisted in a shared database, see `SETUP_REQUIRED_FROM_USER.md`.

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
