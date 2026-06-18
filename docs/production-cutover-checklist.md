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

> ⚠️ **The `production-candidate.*.pages.dev` URL is temporary** — a validation surface, **not**
> the final public URL. The final URL / custom domain is chosen during the final cutover
> (step 4); no custom domain is configured yet. The production Worker's CORS allow-list
> currently includes this candidate origin (alongside staging + localhost); the final
> production origin/domain must be added to the allow-list at cutover.

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
- [ ] `@`-mention autocomplete also suggests **people** (`@Mat` → Matan); selecting inserts a
      mention that renders as `@Name` in the expanded (read-only) task view
- [ ] Description/Notes bullet behavior (`• (DD.MM.YY) `, Enter vs Shift+Enter)
- [ ] Closed Date field
- [ ] Opened by field
- [ ] DevTools Network shows calls to `task-management-api-production.*.workers.dev`

## 4. Cutover steps — performed

1. ✅ Final D1 production refresh from Supabase (read-only export, smoke tests excluded).
2. ✅ Production Worker CORS includes the official prod origin
   `https://task-management-system-3nm.pages.dev`; production Worker redeployed.
3. ✅ Backup tag `v0.1.0-vercel-supabase-before-cloudflare-cutover` on the pre-cutover `main`.
4. ✅ Merge `cloudflare/full-migration` → `main` (PR, normal merge).
5. ✅ Official Cloudflare production frontend deployed via **Deploy Cloudflare Pages
   Production** → `https://task-management-system-3nm.pages.dev`.
6. ✅ **Continuous deploy enabled:** pushes to `main` now auto-deploy the production frontend
   (always) and the production Worker (when `worker/**` changes). **D1 Production Import stays
   manual (`workflow_dispatch`) only** — code pushes never touch D1 data.
7. ◻️ **Kept as rollback:** Vercel + Supabase remain live and untouched (run in parallel
   ≥ 1–2 weeks). No DNS/custom domain changed. No auth added (accepted risk).
8. ◻️ Later: optional custom domain; add auth/access control before broad exposure; then
   plan removal of the old Vercel/Supabase paths.

## 5. Rollback

Vercel + Supabase are **untouched** and fully usable. If a Cloudflare issue occurs:

- Send users to the **Vercel** URL (`https://task-management-system-gray-beta.vercel.app`) —
  it still serves the app against **Supabase** (the source of truth that was exported).
- No DNS change was made, so nothing needs reverting at the DNS layer.
- The Cloudflare stack (Pages/Worker/D1) is additive and can be left or rolled back
  independently; the pre-cutover `main` is tagged
  `v0.1.0-vercel-supabase-before-cloudflare-cutover`.

**Observation period:** keep Vercel + Supabase alive for **at least 1–2 weeks** before any
cleanup of the old paths.

## 6. ⚠️ Risk note (accepted)

There is **no app-level authentication** on the Worker API (staging or production candidate).
The user has accepted this risk for now; it must be addressed (auth/access control) before
broad production exposure. Documented, not blocking the candidate build.

## 7. Person mentions & email notifications

The person-mention feature is live (shown/edited as friendly `@Name`; stored as
`@person:<id>`). Email notifications (Resend) are **ENABLED in production** (2026-06-18):
`EMAIL_ENABLED="true"`, sender `Task Manager <notifications@task-notification.xyz>`,
Reply-To `sw@igintech.com`, domain `task-notification.xyz` Verified, `RESEND_API_KEY` stored
as a Worker secret, and all five people have igintech.com emails in D1. Task create/update
always succeeds regardless of email state (best-effort, detached send).

- D1 production has the `people.email` column and populated addresses.
- Staging Worker stays `EMAIL_ENABLED="false"` (no real sends from staging).
- An "Overdue by X days" indicator shows under Due Date on expanded/edited tasks.
- Full details: [`email-notifications.md`](email-notifications.md).
