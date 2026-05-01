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

```bash
# Preview parsed task data (generates scripts/parsed_tasks.json)
npx tsx scripts/import_pdf_tasks.ts --dry-run

# Import tasks to Supabase (requires env vars configured)
npx tsx scripts/import_pdf_tasks.ts --import
```

## Tech Stack

- Vite + React 19 + TypeScript
- Tailwind CSS v4
- TanStack Table v8
- TanStack Query v5
- React Hook Form + Zod
- Lucide React icons
- date-fns
- Supabase JS client (optional)
