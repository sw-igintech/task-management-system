# Git Workflow

> The branching model and review rules for this repository, adopted ahead of the
> Cloudflare migration (see `docs/cloudflare-migration-plan.md`).

## Branch model

| Branch | Purpose |
|---|---|
| `main` | **Production stable.** Pushes auto-deploy to **Cloudflare** (see below). PR-preferred. |
| `develop` | Integration branch — features/migration work land here first. |
| `migration/*` · `cloudflare/full-migration` | Migration work / staging deploys. |
| `feature/*` | Normal feature branches. |

**Tags** mark stable releases: `v0.1.0-supabase-vercel-stable` (initial baseline) and
`v0.1.0-vercel-supabase-before-cloudflare-cutover` (pre-cutover rollback point).

## Continuous deploy (post-cutover)

Pushing to **`main`** automatically deploys the official **Cloudflare** production:

- **Deploy Cloudflare Pages Production** — runs on every push to `main` (build gate; failed
  build blocks deploy) → `https://task-management-system-3nm.pages.dev`.
- **Deploy Cloudflare Worker Production** — runs on push to `main` when `worker/**` changes →
  Worker `task-management-api-production` (D1 production).
- **D1 Production Import is manual (`workflow_dispatch`) only** — a code push must never
  overwrite D1 production data.
- Runtime task/person edits go **Browser → Worker → D1 production** (not via git).
- Vercel + Supabase remain live as **rollback** (≥ 1–2 weeks); do not delete yet.

## Rules

- `main` = production stable; **no direct pushes** once branch protection is enabled.
- A **pull request is required before merging to `main`**.
- **GitHub Actions CI must pass** before a PR can merge.
- Cut work from `develop` (or directly as `migration/*` / `feature/*`), open a PR, merge
  after review + green CI.
- Tag stable points on `main` with annotated tags.

## Typical flow

```bash
git checkout develop && git pull origin develop
git checkout -b feature/my-change       # or migration/NN-...
# ... work ...
git push -u origin feature/my-change
# open a PR (target develop, or main for releases); wait for green CI; merge
```

## Branch protection — manual setup (GitHub UI)

Branch protection is **not** configured automatically. Set it up in
**GitHub → Settings → Branches → Branch protection rules**.

### `main` (strict)

- ✅ Require a pull request before merging.
- ✅ Require status checks to pass before merging.
  - Required check: **CI** (the `Build & checks` job from `.github/workflows/ci.yml`).
- ✅ Require branches to be up to date before merging (if available).
- ✅ Do not allow force pushes.
- ✅ Do not allow deletions.
- ◻️ Optional: require linear history.

### `develop` (lighter)

- ✅ Require status checks to pass — **CI**.
- ✅ Do not allow force pushes.
- (PR review optional.)

> Note: the `Lint` step in CI is currently **non-blocking** (`continue-on-error`) because
> there are pre-existing eslint issues unrelated to CI setup. Once those are resolved,
> remove `continue-on-error` from the lint step so it becomes a hard gate.
