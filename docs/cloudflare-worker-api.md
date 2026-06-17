# Cloudflare Worker API (`task-management-api`)

> Read-only Worker API that sits in front of Supabase. **Migration skeleton only.**
> The frontend still uses Supabase directly and has **not** been switched to this API.
> Production (Vercel + Supabase) is untouched. No D1, no email, no writes yet.

## Purpose

A server-side API boundary so the data layer can later be swapped (Supabase → D1)
without changing the frontend's call sites. This step only stands up the Worker and
verifies it can read from Supabase in staging.

## Current intermediate architecture

```
Browser ──▶ Cloudflare Pages (frontend)  ──▶ Supabase   (current data path, unchanged)
                                          ┌▶ Supabase   (NEW, parallel, staging tests only)
Cloudflare Worker  ───────────────────────┘
  task-management-api
```

The frontend does **not** call the Worker yet. Future API base URL (once switched):
`https://task-management-api.<account-subdomain>.workers.dev`.

## Project layout

- `worker/src/index.ts` — Worker entry (fetch handler + CORS + Supabase REST reads)
- `worker/wrangler.toml` — `name = "task-management-api"`, `main = "src/index.ts"`, current `compatibility_date`; no D1, no routes
- `worker/package.json`, `worker/tsconfig.json` — Worker-only toolchain (wrangler, typescript, workers-types)

## Endpoints (read-only)

| Method | Path | Returns |
|---|---|---|
| GET | `/health` | `{ ok, service: "task-management-api", db: "supabase", timestamp }` |
| GET | `/api/people` | JSON array of people from Supabase (`select=*&order=name.asc`) |
| GET | `/api/tasks` | JSON array of tasks from Supabase (`select=*&order=priority.asc`) |

Response shapes are the raw Supabase (PostgREST) rows — same snake_case columns the
frontend already uses (`task_number`, `opened_by_person_id`, `closed_date`, etc.). The
client-side person joins (`responsible_person`, `opened_by_person`) are not added here yet.

Create/update/delete/archive are intentionally **not** implemented in this step.

## CORS

Explicit allow-list (no wildcard, no credentials):

- `https://staging.task-management-system-3nm.pages.dev`
- `http://localhost:5173`

Methods: `GET, OPTIONS`. Preflight `OPTIONS` returns `204` with the CORS headers.

## Required secrets (server-side only)

Set as **Worker secrets** (the deploy workflow sets them from GitHub Secrets via
`wrangler secret put` over stdin — never committed, never echoed):

| Worker secret | Source |
|---|---|
| `SUPABASE_URL` | same value as `VITE_SUPABASE_URL` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase **service role** key |

⚠️ **Security:** `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS and is **server-side only**.
It must never appear in frontend code, build output, logs, docs, or any client response.
The Worker never returns it; it is used only in upstream request headers.

> **Redeploy note:** `SUPABASE_SERVICE_ROLE_KEY` is required as a GitHub Actions secret so
> the Worker can read Supabase data. After adding it, re-run the deploy workflow (via
> `workflow_dispatch`, or a push touching `worker/**`) so the deploy step binds it as a
> Worker secret; until then `/api/people` and `/api/tasks` return `503`.

## Deployment

- Workflow: `.github/workflows/deploy-cloudflare-worker.yml` (name **Deploy Cloudflare Worker**)
- Triggers: push to `cloudflare/full-migration` touching `worker/**` (or the workflow), and
  manual `workflow_dispatch`. Never triggers on `main`.
- Steps: checkout → Node 20 → `npm ci` (in `worker/`) → `npm run typecheck` →
  `wrangler deploy` → set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` Worker secrets.
- If `SUPABASE_SERVICE_ROLE_KEY` (GitHub secret) is absent, that step is **skipped** (not
  failed); `/health` works but `/api/*` returns `503` until the secret is added.

### Manual alternative (Cloudflare dashboard)

If you prefer not to store the key in GitHub: deploy the Worker, then in the Cloudflare
dashboard → Workers & Pages → `task-management-api` → Settings → Variables and Secrets,
add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as **encrypted secrets**.

## How to test

```bash
# health (no DB needed)
curl https://task-management-api.<account-subdomain>.workers.dev/health

# data (needs the two Worker secrets set)
curl https://task-management-api.<account-subdomain>.workers.dev/api/tasks
curl https://task-management-api.<account-subdomain>.workers.dev/api/people
```

## Future steps (not in this prompt)

1. Switch the frontend data layer to call this Worker API instead of Supabase directly.
2. Add write endpoints (create/update/archive) with auth.
3. Replace Supabase with Cloudflare D1 behind the same Worker API.
4. Email notifications (Resend/SendGrid) from the Worker.
