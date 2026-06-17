# Cloudflare Migration Plan

> Living plan for moving the Engineering Task Manager from GitHub + Vercel + Supabase
> to a Cloudflare-centric stack. **Nothing in this document has been executed beyond the
> baseline/CI groundwork (Phase 0–2).** Vercel + Supabase remain the live production stack.

## 1. Current architecture (live today)

| Concern | Provider |
|---|---|
| Source code, branches, PRs, tags | GitHub (`sw-igintech/task-management-system`) |
| CI | GitHub Actions (`.github/workflows/ci.yml`) — checks only, no deploy |
| Frontend hosting / deploy | **Vercel** (auto-deploys from `main`) |
| Database + API | **Supabase** (PostgreSQL + PostgREST, RLS permissive) |
| Email | none yet |

Production URL: https://task-management-system-gray-beta.vercel.app

## 2. Target architecture

| Concern | Provider |
|---|---|
| Source code | GitHub Repository |
| CI/CD | GitHub Actions |
| Frontend hosting | Cloudflare Pages |
| Backend / API | Cloudflare Workers |
| Database | Cloudflare D1 |
| Transactional email | Resend or SendGrid |

## 3. Responsibility split (target)

- **GitHub repo** — owns code, branches, PRs, tags, releases.
- **GitHub Actions** — owns CI/CD (build, checks, and later, deploys to Cloudflare).
- **Cloudflare Pages** — hosts the built frontend (static Vite output).
- **Cloudflare Workers** — hosts the backend/API that the frontend talks to.
- **Cloudflare D1** — the SQL database behind the Workers API.
- **Resend / SendGrid** — sends transactional email (notifications) from the Worker.

## Migration branch (updated)

The migration uses **one long-running branch: `cloudflare/full-migration`** (not a branch
per step). Work accumulates there and is deployed to Cloudflare **staging** via GitHub
Actions. `main` stays on the Vercel + Supabase production path until a verified cutover.

## 4. Safe migration phases

Each phase is committed to `cloudflare/full-migration`. Do not combine DB and hosting moves.

0. **Baseline / tag / backup** — capture a known-good state. Annotated tag
   `v0.1.0-supabase-vercel-stable` marks the last Vercel+Supabase commit. Back up the
   Supabase data (export) before any DB work. ✅ *done in this phase.*
1. **Branches & protection** — `main` (production), `develop` (integration), `migration/*`
   and `feature/*` working branches. Enable branch protection (see `docs/git-workflow.md`).
   ✅ *branches created; protection is a manual GitHub step.*
2. **CI only** — GitHub Actions builds + checks every PR. No deploy, no secrets.
   ✅ *done in this phase (`.github/workflows/ci.yml`).*
3. **Cloudflare staging deploy** — add a Cloudflare Pages project that builds the SAME
   frontend to a **staging** URL. Production stays on Vercel. Compare behavior.
   ✅ *done: `.github/workflows/deploy-cloudflare-pages.yml` deploys `dist/` to the Cloudflare
   Pages project `task-management-system` (preview/staging) on push to
   `cloudflare/full-migration`. Staging URL `https://staging.task-management-system-3nm.pages.dev`
   verified live and connected to Supabase. GitHub Actions owns the deploy. See
   `docs/cloudflare-setup.md`.*
4. **Worker API abstraction** — introduce a Cloudflare Worker that exposes the API the
   frontend needs. Frontend talks to an abstraction layer so the backend can be swapped.
   Worker initially proxies / mirrors Supabase. No data move yet.
   🔄 *in progress: read-only Worker `task-management-api` (`worker/`, deployed via
   `.github/workflows/deploy-cloudflare-worker.yml`) with `/health`, `/api/people`,
   `/api/tasks` reading Supabase via the server-side service-role key. The frontend is NOT
   switched to it yet; D1 remains future. See `docs/cloudflare-worker-api.md`.*
5. **D1 staging migration** — create the D1 schema, migrate a COPY of the data into D1,
   point the Worker at D1 **in staging only**. Verify parity against Supabase.
6. **Email notifications** — wire Resend/SendGrid into the Worker for transactional email.
   Keys live in Cloudflare/GitHub secrets, never in code.
7. **Production cutover** — switch the production domain to Cloudflare Pages + Workers + D1
   only after staging is fully verified. Keep Vercel + Supabase running in parallel.
8. **Rollback ready** — if anything regresses, repoint DNS/config back to Vercel + Supabase.
   Decommission the old stack only after a stable bake-in period.

## 5. Rollback principle

**Vercel + Supabase remain active and authoritative until Cloudflare production is fully
verified.** Cutover is a DNS/config switch, not a deletion. The baseline tag
`v0.1.0-supabase-vercel-stable` is the guaranteed return point for code.

## 6. Hard rules

- ⚠️ **Do not migrate database and hosting in the same PR.** Hosting (Pages/Workers) and
  data (D1) move in separate, independently reversible steps.
- ⚠️ **Do not put secrets in code.** API keys, tokens, and connection strings live in
  GitHub Actions secrets / Cloudflare environment variables — never committed.
- Keep each phase reversible and independently verifiable in staging first.

## 7. Baseline reference

- Stable baseline tag: **`v0.1.0-supabase-vercel-stable`** (commit `156342d`).
- This is the last known-good Vercel + Supabase production state before migration work.
