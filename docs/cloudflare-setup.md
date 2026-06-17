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
