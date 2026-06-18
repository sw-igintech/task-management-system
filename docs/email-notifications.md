# Person mentions & email notifications

This document covers two related features:

1. **Person mentions** in task Description and Notes (live now).
2. **Email notifications** (Resend) for new assignments and mentions — **scaffolded but
   DISABLED by default**. No real email is ever sent until you configure Resend and set
   `EMAIL_ENABLED=true`.

---

## 1. Person mentions

You can `@`-mention a person inside Description and Notes, the same way you reference
tasks. Typing `@` opens a combined dropdown with two sections:

- **Tasks** — `@123`, `@TASK-123`, `@task-123` (numeric). Unchanged behaviour.
- **People** — `@Mat` suggests *Matan*, etc. (matches anywhere in the name).

Arrow keys / Enter / Tab select; Escape closes. Selecting a person inserts a mention.

### Syntax & storage

| Where | Representation |
|-------|----------------|
| Stored in DB (`description` / `notes` text) | `@person:<person_id>` |
| Read-only display (expanded task view) | `@Name` (highlighted) |

**Why store the id, not the name?** The id is stable: renaming a person never breaks an
existing mention, and duplicate names are never ambiguous. The read-only renderer resolves
the id back to the *current* name at display time. If the id no longer matches a person
(e.g. the person was removed), it renders a muted `@unknown` instead of crashing.

### Edit-mode limitation (documented)

The Description/Notes editors are plain `<textarea>`s. In **edit mode** a person mention is
shown as its raw stored token `@person:<id>`, not as `@Name`. This is intentional — a
live token→name conversion layer inside the textarea would risk interfering with the
existing dated-bullet logic (`• (DD.MM.YY)`, Enter/Shift+Enter). Read-only views always
show the friendly `@Name`. (If a richer inline editor is added later, this can be revisited.)

### What is preserved

`@TASK` references are completely unchanged — same numeric syntax, same clickable links
that jump to the task, same unresolved-reference styling. Person mentions and task
references never collide: person tokens always carry the `person:` prefix, and the task
regex only matches digits. Dated-bullet behaviour in Description/Notes is unchanged.

### Helpers

- Frontend: `src/lib/mentions.ts` — `extractPersonMentionIds`, `extractTaskPersonMentionIds`,
  `getMentionItems`, `buildPersonMention`.
- Worker: `worker/src/email.ts` mirrors the extraction (separate package/build).

---

## 2. Email notifications (Resend)

### Events

| Event | Recipient | Email |
|-------|-----------|-------|
| Task created with a responsible person | that person (if they have an email) | "New task assigned…" |
| Task created mentioning people | each mentioned person (if they have an email) | "You were mentioned…" |
| Task updated, responsible person **changed** | the **new** responsible person | "New task assigned…" |
| Task updated with **new** mentions | only the **newly** mentioned people | "You were mentioned…" |

### De-duplication

A person is emailed **at most once per action**. If someone is both the responsible
person and mentioned in the same task, they get a single **assignment** email (assignment
takes precedence over mention). On update, people already mentioned *before* the edit are
**not** re-notified — only newly added mentions are.

### Provider: Resend (only)

Resend was chosen because it is simple to call from a Cloudflare Worker via `fetch`
(transactional HTTP API) and has a useful free tier for a small internal tool. SendGrid,
Brevo, and raw SMTP are intentionally **not** implemented.

**Resend free-tier limits (document & monitor):**

- **100 emails/day**
- **3,000 emails/month**
- **Each recipient counts separately** (a task mentioning 3 people = 3 emails).
- If usage grows beyond this, review a paid Resend plan or another provider later.

### Configuration (Worker env)

| Variable | Type | Default | Purpose |
|----------|------|---------|---------|
| `EMAIL_ENABLED` | var | `"false"` | Must be exactly `"true"` to send. Anything else = disabled. |
| `EMAIL_FROM` | var | `""` | Verified Resend sender address (e.g. `tasks@yourdomain.com`). |
| `RESEND_API_KEY` | **secret** | _(unset)_ | Resend API key. Set via `wrangler secret put` — **never** committed. |

`EMAIL_ENABLED` and `EMAIL_FROM` live in `worker/wrangler.toml` (`[vars]` and
`[env.production.vars]`) as safe non-secret defaults. `RESEND_API_KEY` is a secret and is
**not** stored in the repo.

### Default behaviour: DISABLED

Out of the box `EMAIL_ENABLED="false"`, so:

- Person mentions still work.
- The Worker email code exists and the notification logic is ready.
- **No Resend call is ever attempted.** The Worker logs a safe skip line:
  `[email] skipped (EMAIL_ENABLED is not "true"): task created`.

### Failure behaviour (task ops always succeed)

Email is best-effort and runs **detached** via `ctx.waitUntil(...)`, so the HTTP response
never waits on it. **A task create/update always succeeds**, regardless of email state:

- `EMAIL_ENABLED` not `"true"` → no send; safe skip log.
- `EMAIL_ENABLED="true"` but `RESEND_API_KEY`/`EMAIL_FROM` missing → no send; safe warning
  log; **no secrets printed**; task op still succeeds.
- Resend API errors → the task mutation is **not** rolled back; a safe failure is logged
  (HTTP status + short excerpt, never the API key); task op still succeeds.

### Email content

Plain text, concise (no full description/notes). `<number>` = task number, etc.

**New assignment**
```
Subject: New task assigned: TASK-<number> — <title>

Hello <person name>,

A new task was assigned to you.

Task: TASK-<number> — <title>
Status: <status>
Priority: <priority>
Due date: <due_date or "No due date">

Open task:
https://task-management-system-3nm.pages.dev
```

**Mention**
```
Subject: You were mentioned in TASK-<number> — <title>

Hello <person name>,

You were mentioned in a task.

Task: TASK-<number> — <title>

Open task:
https://task-management-system-3nm.pages.dev
```

---

## 3. People email addresses (`people.email`)

`people.email` is an **optional** `TEXT` column. The app works correctly when it is `NULL`
(that person simply receives no email). People with no email are skipped silently.

### Adding email addresses

There is no dedicated People-admin email UI in this step. Set emails directly in D1:

```bash
# Production (read first to find the id)
npx wrangler d1 execute task-management-production --remote \
  --command "SELECT id, name, email FROM people ORDER BY name;"

npx wrangler d1 execute task-management-production --remote \
  --command "UPDATE people SET email = 'matan@example.com' WHERE id = '<person-id>';"
```

(Use `task-management-staging` for staging.) New people created via `POST /api/people`
may include an optional `email` field. Do **not** commit real private email addresses to
the repo.

### Migration

`d1/schema.sql` already declares `people.email`, and `d1/migrations/2026-06-18_add_people_email.sql`
adds it to any older DB. SQLite `ADD COLUMN` has no `IF NOT EXISTS`, so re-running it when
the column already exists fails with *"duplicate column name: email"* — a **safe** no-op.
Apply via the **D1 Apply Migrations** workflow (`workflow_dispatch`, choose `staging` or
`production`), which tolerates that specific error, or manually:

```bash
npx wrangler d1 execute task-management-production --remote \
  --file=d1/migrations/2026-06-18_add_people_email.sql
```

---

## 4. Enabling real email later (user setup checklist)

Real email sending is **off** until **all** of these are done:

1. Create a [Resend](https://resend.com) account.
2. Verify a sender/domain in Resend.
3. Store the key as a Worker secret:
   ```bash
   cd worker
   npx wrangler secret put RESEND_API_KEY --env production
   ```
4. Set `EMAIL_FROM` to the verified sender (edit `[env.production.vars]` in
   `worker/wrangler.toml`, or set it as a secret/var).
5. Set `EMAIL_ENABLED="true"` (same place) and redeploy the production Worker.
6. Add email addresses to the relevant people (section 3).

### Testing safely

- **Disabled (default):** create/update tasks and confirm the Worker logs
  `[email] skipped (...)` and **no Resend request** is made (`wrangler tail`).
- **Enabled, staging first:** enable on the staging Worker with a verified sender and a
  test recipient before touching production. Watch `wrangler tail` for
  `[email] sent assignment notification …`.

---

## 5. Security & future hardening

There is **no authentication / access control** on the Worker write endpoints yet; this
is an accepted risk for a small internal tool (see `docs/cloudflare-worker-api.md`).
Future hardening to consider before broader exposure:

- Auth / access control on the API.
- Rate limiting (also protects the Resend quota).
- Audit logging of notifications sent.
- Email open/click handling and richer (HTML) templates if needed.
