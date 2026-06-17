# Cloudflare Setup (Staging)

> How the Cloudflare Pages **staging** deployment works. This is a parallel deploy of the
> existing Vite frontend. **Production is still Vercel + Supabase** — nothing here changes
> production. See `docs/cloudflare-migration-plan.md` for the full plan.

## 1. Required GitHub Secrets

Already configured (used by the deploy workflow; never printed or committed):

- `CLOUDFLARE_API_TOKEN` — token with Cloudflare Pages edit permission.
- `CLOUDFLARE_ACCOUNT_ID` — the Cloudflare account ID.

### Needed for the staging site to connect to Supabase

Vite inlines `VITE_*` at **build time**, so these must exist as GitHub Secrets for the
staging build to talk to the same Supabase as production. **If they are missing, the build
still succeeds and the site still loads, but in localStorage "mock mode" (not connected to
Supabase).** The Supabase anon key is a public client key by design — but still store it as a
secret/variable, never hardcode it.

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Add them in **GitHub → Settings → Secrets and variables → Actions → New repository secret**
(Secrets or Variables both work; the workflow reads them via `secrets.*`).

> **Note:** Supabase Vite secrets are required for staging builds: `VITE_SUPABASE_URL` and
> `VITE_SUPABASE_ANON_KEY`. Once set, re-run the deploy workflow so the staging build picks
> them up and connects to Supabase (instead of falling back to localStorage mock mode).

## 2. Cloudflare Pages project

- **Project name:** `task-management-system`
- **Production branch (project setting):** `main`
- Staging deploys use `--branch staging` → a **preview** deployment, so they never overwrite
  a production deployment.

## 3. Workflow

- **Path:** `.github/workflows/deploy-cloudflare-pages.yml`
- **Name:** `Deploy Cloudflare Pages`
- **Triggers:** push to **`cloudflare/full-migration`**, and manual `workflow_dispatch`.
  (It intentionally does **not** trigger on `main`.)
- **Steps:** checkout → Node 20 (npm cache) → `npm ci` → `npm run build` (with the `VITE_*`
  build env) → ensure Pages project exists → `wrangler pages deploy dist`.
- **GitHub Actions is the deploy owner.** Do **not** enable Cloudflare's Git integration —
  that would create a second, conflicting deploy pipeline.

## 3b. Cloudflare Worker API (staging skeleton)

A separate read-only Worker now sits in front of Supabase (frontend not switched yet).

- **Worker name:** `task-management-api` (project in `worker/`)
- **Workflow:** `.github/workflows/deploy-cloudflare-worker.yml` (triggers on
  `cloudflare/full-migration` when `worker/**` changes, + `workflow_dispatch`)
- **Required Worker secrets** (server-side; set via the workflow's `wrangler secret put`
  from GitHub Secrets, or manually in the Cloudflare dashboard):
  - `SUPABASE_URL` — same value as `VITE_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY` — Supabase **service role** key (⚠️ never expose to the
    frontend / never commit). **Add this GitHub secret** — it is not present yet.
- **Endpoints:** read (`/health`, `/api/people`, `/api/tasks`) **and** write
  (POST `/api/people`, POST `/api/tasks`, PATCH `/api/tasks/:id`,
  POST `/api/tasks/:id/archive`, POST `/api/tasks/:id/restore`). No `DELETE` (soft archive only).
- **How the deploy binds secrets:** the workflow runs `wrangler deploy`, then pipes each
  GitHub secret to `wrangler secret put` over stdin (`SUPABASE_URL` from `VITE_SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY` from the same-named secret) — values are masked and never echoed.
- **Verify after deploy:**
  ```bash
  B=https://task-management-api.sw-590.workers.dev
  curl -i $B/health        # 200
  curl -i $B/api/tasks     # 200, ~140 tasks
  curl -i $B/api/people    # 200, 5 people
  ```
  CRUD smoke test (creates one clearly-labelled temp task, leaves it archived): see
  `docs/cloudflare-worker-api.md`.
- ⚠️ **No app auth yet + service-role key → staging/internal only.** Do not expose write
  endpoints to production before adding access control.
- Full details: `docs/cloudflare-worker-api.md`.

## 3c. Frontend Worker-API mode (feature flag)

The frontend can optionally read/write through the Worker API instead of Supabase directly,
controlled by two **GitHub Variables** (non-secret; passed into the Pages build):

| Variable | Staging value | Meaning |
|---|---|---|
| `VITE_USE_WORKER_API` | `true` | Enable Worker mode (must be exactly `"true"`) |
| `VITE_WORKER_API_URL` | `https://task-management-api.sw-590.workers.dev` | Worker base URL |

- **Worker mode is active only when `VITE_USE_WORKER_API=true` AND `VITE_WORKER_API_URL` is set.**
- **Direct Supabase remains the default/fallback** when the flag is absent/false (and mock
  mode when Supabase env is also absent). The Supabase client code is unchanged and retained.
- These flags are read at **build time** (Vite inlines `VITE_*`). The Pages workflow passes
  them via `${{ vars.* }}`; set/change them in repo **Settings → Secrets and variables →
  Actions → Variables**. (Locally: put them in `.env`.)
- The header shows a **"Backend: Worker API"** badge in Worker mode (distinct from the amber
  "Mock Mode" badge). No service key is ever in the frontend.

## 3d. Cloudflare D1 (staging copy)

A D1 staging database holds a **copy** of the data for the next migration phase. Supabase
remains the source of truth; nothing reads/writes D1 at runtime yet.

- **D1 staging DB:** `task-management-staging`
- **D1 production DB (planned name only — do NOT create yet):** `task-management-production`
- **Schema:** `d1/schema.sql` (SQLite mirror of the Supabase tables)
- **Scripts:** `scripts/d1/export-worker-data.mjs` (export via Worker API),
  `scripts/d1/generate-d1-import-sql.mjs` (build the staging import SQL)
- **Workflow:** `.github/workflows/d1-staging-import.yml` (create/reuse DB → apply schema →
  export → generate → import → verify). Trigger: `workflow_dispatch` or push touching
  `d1/**` / `scripts/d1/**`. Secrets used: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
  (no Supabase secrets — export goes through the Worker API).
- **Generated data path (gitignored, never committed):** `exports/d1/`
- **Worker is now bound to D1** (`worker/wrangler.toml`):
  ```toml
  [[d1_databases]]
  binding = "DB"
  database_name = "task-management-staging"
  database_id = "e262c9ce-8d5f-46d0-86c7-24030b9e760d"
  ```
  The Worker reads/writes D1 directly (no `DATA_BACKEND` flag). It **no longer needs**
  `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` at runtime — those GitHub secrets still exist
  but are unused by the Worker, and the deploy workflow no longer uploads Worker secrets.
  Deploy still uses only `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`.
- Full details + verification SQL: `docs/d1-migration.md`.

## 3e. Cloudflare PRODUCTION candidate (prepared, not cut over)

A full parallel production stack exists as a **candidate** — Vercel + Supabase remain live;
no DNS/custom-domain change; no merge to main.

- **D1 production DB:** `task-management-production` (clean copy exported from Supabase via
  `scripts/d1/export-supabase-data.mjs`, archived smoke-test tasks excluded; imported by
  `.github/workflows/d1-production-import.yml`). Its `database_id` is set in
  `worker/wrangler.toml [[env.production.d1_databases]]`.
- **Production Worker:** `task-management-api-production` (`wrangler.toml [env.production]`,
  bound to D1 production; same D1-only code, no Supabase at runtime). Deployed by
  `.github/workflows/deploy-cloudflare-worker-production.yml` (`workflow_dispatch` only).
  URL: `https://task-management-api-production.<account-subdomain>.workers.dev`.
- **Production-preview frontend:** `.github/workflows/deploy-cloudflare-pages-production-preview.yml`
  (`workflow_dispatch` only) builds with `VITE_USE_WORKER_API=true` +
  `VITE_WORKER_API_URL=<production Worker URL>` and deploys to the existing Pages project under
  the **`production-candidate`** branch → `https://production-candidate.task-management-system-3nm.pages.dev`.
- **Secrets/variables used:** Cloudflare deploys use `CLOUDFLARE_API_TOKEN` +
  `CLOUDFLARE_ACCOUNT_ID`. The D1 production **import** uses `VITE_SUPABASE_URL` +
  `SUPABASE_SERVICE_ROLE_KEY` (read-only export from Supabase). The production Worker/Pages
  runtime path needs **no Supabase secrets** — those GitHub secrets still exist but are not
  used by the Worker/D1 path.
- All three are **manual (`workflow_dispatch`) only** — they never run on push or on main.
- **CORS:** the Worker allow-list (`worker/src/index.ts`) includes
  `https://staging.task-management-system-3nm.pages.dev`,
  `https://production-candidate.task-management-system-3nm.pages.dev`, and
  `http://localhost:5173`. A new production origin/custom domain must be **added to this
  allow-list** at cutover, or the browser will block API responses (empty UI).
- **The `production-candidate.*.pages.dev` URL is temporary** (validation only) — the final
  public URL / custom domain is selected at cutover; not configured here.
- See `docs/production-cutover-checklist.md`.

## 4. Intentionally NOT included yet

- Cloudflare **Workers** API
- Cloudflare **D1** database
- **Email** (Resend/SendGrid)
- **DNS** / custom domain / production cutover
- Any replacement or shutdown of Vercel or Supabase

## 5. Troubleshooting

- **"Project not found"** on deploy: the `Ensure Pages project exists` step creates it on
  first run. If it fails (e.g. token scope), create the project manually in the Cloudflare
  dashboard — **Workers & Pages → Create → Pages → Direct Upload** — named
  `task-management-system`, then re-run the workflow. Do **not** connect it to Git in
  Cloudflare (GitHub Actions owns CI/CD).
- **Site loads but shows no Supabase data / "mock mode" badge:** the `VITE_SUPABASE_URL` /
  `VITE_SUPABASE_ANON_KEY` secrets are missing — add them (section 1) and re-run. Never put
  these values in source.
- **Deploy URL:** after a successful run the workflow logs print the deployment URL
  (`https://<hash>.task-management-system.pages.dev` and the `staging` alias
  `https://staging.task-management-system.pages.dev`).
