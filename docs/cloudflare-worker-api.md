# Cloudflare Worker API (`task-management-api`)

> CRUD Worker API at `https://task-management-api.sw-590.workers.dev`. On the
> `cloudflare/full-migration` branch it is backed **directly by Cloudflare D1 staging**
> (`task-management-staging`) — **no Supabase at runtime, no `DATA_BACKEND` flag**. Staging
> only; Vercel + Supabase production are untouched (Supabase remains the source/rollback
> reference). No email. **Write endpoints have no auth yet (staging/internal only).**

## Purpose

A server-side API boundary between the frontend and the database. The frontend (staging)
calls this Worker; the Worker now reads/writes D1. Swapping Supabase → D1 happened here
without changing the frontend's call sites.

## Two Workers (staging + production candidate)

Both run the **same D1-only code** (`worker/src/index.ts`), selected by Wrangler environment
in `worker/wrangler.toml`. Neither uses Supabase at runtime.

| Worker | Wrangler env | D1 binding `DB` → | URL | Deploy workflow |
|---|---|---|---|---|
| `task-management-api` (staging) | default (`wrangler deploy`) | `task-management-staging` | `task-management-api.sw-590.workers.dev` | `deploy-cloudflare-worker.yml` (push + dispatch) |
| `task-management-api-production` (candidate) | `production` (`wrangler deploy --env production`) | `task-management-production` | `task-management-api-production.<subdomain>.workers.dev` | `deploy-cloudflare-worker-production.yml` (**dispatch only**) |

Deploying production does **not** touch staging. Auth limitation (no app auth yet) applies to
both — staging/internal & production-candidate only until access control is added.

## Architecture (this branch / staging)

```
Browser ──▶ Cloudflare Pages (staging) ──▶ Cloudflare Worker (task-management-api) ──▶ Cloudflare D1 (task-management-staging)
```

Supabase is no longer in the runtime path for this Worker. API base URL:
`https://task-management-api.sw-590.workers.dev`.

## Project layout

- `worker/src/index.ts` — Worker entry (fetch handler + CORS + **D1** queries)
- `worker/wrangler.toml` — `name`, `main`, `compatibility_date`, and the **D1 binding**
  `DB` → `task-management-staging` (`database_id e262c9ce-8d5f-46d0-86c7-24030b9e760d`). No
  production D1 binding, no routes, no custom domain.
- `worker/package.json`, `worker/tsconfig.json` — Worker-only toolchain (wrangler, typescript, workers-types)

## Endpoints

| Method | Path | Returns | Code |
|---|---|---|---|
| GET | `/health` | `{ ok, service, db, timestamp }` | 200 |
| GET | `/api/people` | people array (`select=*&order=name.asc`) | 200 |
| POST | `/api/people` | created person | 201 |
| GET | `/api/tasks` | tasks array (`select=*&order=priority.asc`) | 200 |
| POST | `/api/tasks` | created task | 201 |
| PATCH | `/api/tasks/:id` | updated task | 200 |
| POST | `/api/tasks/:id/archive` | updated task (`archived=true`) | 200 |
| POST | `/api/tasks/:id/restore` | updated task (`archived=false`) | 200 |

**No `DELETE`** — the app uses soft archive only; hard delete is intentionally not exposed.

Response shapes are the D1 rows — the same snake_case columns the frontend already reads
(`id`, `task_number`, `title`, `description`, `notes`, `status`, `priority`,
`responsible_person_id`, `opened_by_person_id`, `due_date`, `closed_date`, `archived`,
`created_at`, `updated_at`, `source_raw_text`, `import_hash`, …) — identical to the previous
Supabase responses. **`archived` is stored in D1 as INTEGER 0/1 but returned as a boolean.**
The client-side person joins (`responsible_person`, `opened_by_person`) are computed in the
frontend and are **not** added by the Worker.

### Request/response examples

```bash
# Create a task (201)
curl -X POST https://task-management-api.sw-590.workers.dev/api/tasks \
  -H 'Content-Type: application/json' \
  -d '{"title":"My task","status":"not_started","priority":5,
       "responsible_person_id":"<uuid>","opened_by_person_id":"<uuid>",
       "due_date":null,"closed_date":null}'
# → 201 { "id":"…","task_number":141,"title":"My task","status":"not_started", … }

# Update fields (200)
curl -X PATCH https://task-management-api.sw-590.workers.dev/api/tasks/<id> \
  -H 'Content-Type: application/json' -d '{"notes":"updated","status":"in_progress"}'

# Archive / restore (200)
curl -X POST https://task-management-api.sw-590.workers.dev/api/tasks/<id>/archive
curl -X POST https://task-management-api.sw-590.workers.dev/api/tasks/<id>/restore

# Create a person (201)
curl -X POST https://task-management-api.sw-590.workers.dev/api/people \
  -H 'Content-Type: application/json' -d '{"name":"New Person"}'
```

### Validation rules

- **Whitelist only.** Unknown/disallowed fields → `400` (this also blocks client-set `id`,
  `task_number`, `created_at`, `updated_at` — those are DB-managed).
- `title` — required on create; if present on PATCH must be a non-empty (trimmed) string.
- `status` — must be one of `not_started`, `in_progress`, `on_hold`, `need_to_review`, `done`.
- `priority` — integer `1`–`5`.
- `due_date` / `closed_date` — `null` or `YYYY-MM-DD` (empty string is coerced to `null`).
- `responsible_person_id` / `opened_by_person_id` — string id or `null` (empty → `null`).
- `archived` — boolean.
- `POST /api/people` — `name` required, trimmed, non-empty; `email` optional.
- PATCH with no editable fields → `400`; PATCH/archive/restore on a missing id → `404`.

### Error format & status codes

`{ "error": "message" }`. Codes: `200` ok · `201` created · `400` invalid input ·
`404` not found · `405` method not allowed · `500` unexpected · `502` upstream DB error ·
`503` missing server config. Upstream DB errors are truncated and logged server-side (no
secrets); the service-role key is never returned.

## CORS

Explicit allow-list (no wildcard, no credentials):

- `https://staging.task-management-system-3nm.pages.dev`
- `http://localhost:5173`

Methods: `GET, POST, PATCH, OPTIONS`. Headers: `Content-Type`. No credentials. Preflight
`OPTIONS` returns `204` with the CORS headers.

## Security limitation (important)

There is **no app-level authentication yet**. The Worker holds full read/write access to the
D1 staging database. Therefore this Worker is a **staging / internal migration API only** — it
must **not** be treated as a public production API. Before any production cutover that exposes
the write endpoints broadly, auth/permissions (or another access control) must be added, or an
explicit risk decision documented.

## Runtime config (no secrets)

The Worker talks to D1 via the **`DB` binding** in `worker/wrangler.toml` — there are **no
runtime secrets** (no `SUPABASE_URL`, no `SUPABASE_SERVICE_ROLE_KEY`). Deployment uses only
`CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` (GitHub Secrets).

> The `VITE_SUPABASE_*` and `SUPABASE_SERVICE_ROLE_KEY` GitHub secrets still exist but are
> **no longer used by this Worker**. Any Worker secrets set previously are ignored by the new
> D1 code. `/api/*` no longer returns `503` for missing Supabase config.

## Deployment

- Workflow: `.github/workflows/deploy-cloudflare-worker.yml` (name **Deploy Cloudflare Worker**)
- Triggers: push to `cloudflare/full-migration` touching `worker/**` (or the workflow), and
  manual `workflow_dispatch`. Never triggers on `main`.
- Steps: checkout → Node 20 → `npm ci` (in `worker/`) → `npm run typecheck` →
  `wrangler deploy`. No Supabase secret-upload steps (the D1 binding is declared in
  `wrangler.toml`).

## How to test

Base URL: `https://task-management-api.sw-590.workers.dev`

```bash
# reads
curl -i $BASE/health
curl -i $BASE/api/people
curl -i $BASE/api/tasks
```

### Write smoke test (non-destructive)

Use a clearly labelled temporary task and leave it **archived** at the end (never delete real
data, never modify existing tasks):

```bash
PID=$(curl -s $BASE/api/people | node -e 'const d=JSON.parse(require("fs").readFileSync(0));process.stdout.write((d.find(p=>p.name==="Matan")||d[0]).id)')
# create (201)
ID=$(curl -s -X POST $BASE/api/tasks -H 'Content-Type: application/json' \
  -d "{\"title\":\"Cloudflare Worker CRUD smoke test - DELETE ME\",\"description\":\"Temporary task created by Worker API smoke test.\",\"notes\":\"Temporary smoke test.\",\"status\":\"not_started\",\"priority\":5,\"responsible_person_id\":\"$PID\",\"opened_by_person_id\":\"$PID\",\"due_date\":null,\"closed_date\":null}" \
  | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0)).id)')
# patch (200), then archive (200) — leave archived so it stays out of the active list
curl -s -X PATCH $BASE/api/tasks/$ID -H 'Content-Type: application/json' -d '{"notes":"smoke test patched","status":"in_progress"}' >/dev/null
curl -s -X POST  $BASE/api/tasks/$ID/archive >/dev/null
```

## Frontend integration (behind a flag)

The frontend can now use this Worker API instead of direct Supabase, gated by env flags:

- `src/lib/taskApi.ts` — typed client (`getPeople`, `getTasks`, `createTask`, `updateTask`,
  `createPerson`); `USE_WORKER_API` = `VITE_USE_WORKER_API === 'true' && VITE_WORKER_API_URL set`.
- `src/hooks/useTasks.ts` — branches each op: **Worker mode** → `taskApi.*`; else **mock** →
  localStorage; else **Supabase** → direct client. Archive/restore go through `updateTask`
  (`{ archived }` → PATCH). Person joins (`responsible_person`/`opened_by_person`) are still
  computed client-side, so Worker responses match the existing `Task`/`Person` shapes.
- **No silent backend switching:** in Worker mode a Worker failure surfaces an error (it does
  not fall back to Supabase). Direct Supabase is the fallback only when the flag is off.
- Enable on Cloudflare Pages staging via GitHub Variables `VITE_USE_WORKER_API=true` and
  `VITE_WORKER_API_URL=https://task-management-api.sw-590.workers.dev` (see
  `docs/cloudflare-setup.md`). The header shows a "Backend: Worker API" badge when active.

## Future steps (not in this prompt)

1. Switch the frontend data layer to call this Worker API behind an env flag (Supabase direct
   stays the default fallback).
2. Add auth/permissions before exposing write endpoints to production.
3. Replace Supabase with Cloudflare D1 behind the same Worker API.
4. Email notifications (Resend/SendGrid) from the Worker.
