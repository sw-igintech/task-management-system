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

Response shapes are the raw Supabase (PostgREST) rows — same snake_case columns the frontend
already reads (`id`, `task_number`, `title`, `description`, `notes`, `status`, `priority`,
`responsible_person_id`, `opened_by_person_id`, `due_date`, `closed_date`, `archived`,
`created_at`, `updated_at`, `source_raw_text`, `import_hash`, …). The client-side person joins
(`responsible_person`, `opened_by_person`) are computed in the frontend and are **not** added
by the Worker (it mirrors the frontend's `select('*')` query exactly).

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

There is **no app-level authentication yet**, and the Worker uses the Supabase **service
role** key (bypasses RLS). Therefore this Worker is a **staging / internal migration API
only** — it must **not** be treated as a public production API. Before any production cutover
that exposes the write endpoints broadly, auth/permissions (or another access control) must be
added. Until then it is reachable only as a parallel staging surface; the frontend is not
switched to it.

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

## Future steps (not in this prompt)

1. Switch the frontend data layer to call this Worker API behind an env flag (Supabase direct
   stays the default fallback).
2. Add auth/permissions before exposing write endpoints to production.
3. Replace Supabase with Cloudflare D1 behind the same Worker API.
4. Email notifications (Resend/SendGrid) from the Worker.
