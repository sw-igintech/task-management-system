# Production Cutover Checklist

> The Cloudflare production stack is **prepared as a candidate** but **not** cut over.
> Vercel + Supabase remain the live production and the rollback. No DNS/custom-domain change.

## 1. Old production (still live)

- Frontend: **Vercel** (`https://task-management-system-gray-beta.vercel.app`)
- Database/API: **Supabase** (source of truth + rollback)

## 2. New candidate (Cloudflare, not cut over)

- Frontend: **Cloudflare Pages production-preview** — `production-candidate` branch deployment
  of the `task-management-system` Pages project
  (`https://production-candidate.task-management-system-3nm.pages.dev`)
- API: **Worker `task-management-api-production`** (separate from staging `task-management-api`)
- Database: **Cloudflare D1 `task-management-production`** (clean copy from Supabase; archived
  smoke-test tasks excluded)

```
Cloudflare Pages (production-candidate) → Worker (task-management-api-production) → D1 (task-management-production)
```

## 3. Final manual validation (do before any cutover)

On the production-candidate URL, confirm:

- [ ] Tasks load (≈140 active) — header badge "Backend: Worker API", no Mock Mode
- [ ] People load (5)
- [ ] Add task → gets next `TASK-<n>`
- [ ] Edit task (title/status/priority/notes)
- [ ] Archive + restore
- [ ] Filters (status / priority / person multi-select + chips)
- [ ] Smart Views (incl. By Person merge behavior)
- [ ] `@TASK` autocomplete in Notes/Description
- [ ] `@TASK` link click jumps to & opens the referenced task
- [ ] Description/Notes bullet behavior (`• (DD.MM.YY) `, Enter vs Shift+Enter)
- [ ] Closed Date field
- [ ] Opened by field
- [ ] DevTools Network shows calls to `task-management-api-production.*.workers.dev`

## 4. Cutover steps (LATER — not in this prompt)

1. Decide the final domain (keep `.pages.dev`, or attach a custom domain).
2. Merge `cloudflare/full-migration` → `main` (or tag a release) once validated.
3. Deploy the Cloudflare production stack as the official production.
4. Optionally update DNS / custom domain to the Cloudflare Pages production deployment.
5. Add **auth/access control** before broad exposure (currently none — see risk note below).
6. Keep Vercel + Supabase running in parallel as rollback for **at least 1–2 weeks**.

## 5. Rollback

Vercel + Supabase are **untouched** and remain authoritative until cutover is verified.
Rollback = point users back at the Vercel URL / keep DNS unchanged. D1/Worker production are
additive and disposable until cutover.

## 6. ⚠️ Risk note (accepted)

There is **no app-level authentication** on the Worker API (staging or production candidate).
The user has accepted this risk for now; it must be addressed (auth/access control) before
broad production exposure. Documented, not blocking the candidate build.
