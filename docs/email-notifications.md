# Person mentions & email notifications

This document covers two related features:

1. **Person mentions** in task Description and Notes (live now). Users see and edit
   friendly `@Name` mentions; the raw `@person:<id>` token is never shown.
2. **Email notifications** (Resend) for new assignments and mentions — **ENABLED in
   production** as of 2026-06-18 (`EMAIL_ENABLED=true`). Real emails are sent from the
   verified domain `task-notification.xyz`.

> **Status (production):** Email is **ON**. Resend domain `task-notification.xyz` is
> Verified; sender `Task Manager <notifications@task-notification.xyz>`, Reply-To
> `sw@igintech.com`; `RESEND_API_KEY` is stored as a Cloudflare Worker secret. Sending is
> best-effort — a missing key or Resend failure never breaks a task create/update.

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
| **Edit mode (textarea)** | `@Name` (friendly; converted on load/save) |

**Why store the id, not the name?** The id is stable: renaming a person never breaks an
existing mention, and duplicate names are never ambiguous. Resolution to the *current* name
happens at display/edit time. If the id no longer matches a person (e.g. the person was
removed), read-only renders a muted `@unknown` instead of crashing.

### Edit mode shows `@Name`, not the raw token

The Description/Notes editors are plain `<textarea>`s, but the raw `@person:<id>` token is
**never** shown to the user. Conversion happens at the field boundary:

- **On load (edit):** `prepareMentionsForEditing` rewrites stored `@person:<id>` → `@Name`
  before the textarea is populated.
- **On save:** `serializeMentionsForStorage` rewrites `@Name` → `@person:<id>` (matching
  known person names case-insensitively at a mention boundary, longest name first).
- This round-trips cleanly (store → edit → store is stable) and saving an unchanged task
  does not duplicate or corrupt mentions.

This boundary conversion does not touch the dated-bullet logic (`• (DD.MM.YY)`,
Enter/Shift+Enter), which operates on the live textarea text and is unchanged.

**Edge cases / determinism:** An id that no longer resolves is kept as the raw
`@person:<id>` token in edit mode (so the mention is preserved, not silently lost) rather
than shown as `@unknown`. If two people ever shared a name (none do today), `@Name`
serializes deterministically to the lowest person id. `@TASK-123` references are never
converted (person names are non-numeric).

### What is preserved

`@TASK` references are completely unchanged — same numeric syntax, same clickable links
that jump to the task, same unresolved-reference styling. Person mentions and task
references never collide: person tokens always carry the `person:` prefix, and the task
regex only matches digits. Dated-bullet behaviour in Description/Notes is unchanged.

### Helpers

- Frontend: `src/lib/mentions.ts` — `extractPersonMentionIds`, `extractTaskPersonMentionIds`,
  `getMentionItems`, the display⇄storage trio `renderStoredMentionsForDisplay`,
  `prepareMentionsForEditing`, `serializeMentionsForStorage`, and `tokenizeMentions`
  (segments for the blue edit-mode preview).
- Worker: `worker/src/email.ts` mirrors the extraction (separate package/build).

### Overdue indicator (related UI)

When a task is expanded or edited, an **"Overdue by X day(s)"** line appears under Due
Date (small red text). It uses local date-only comparison (`overdueDays`/`formatOverdue`
in `src/lib/utils.ts`) and is shown only when the due date is strictly before today; it is
hidden for today/future dates, missing dates, `done` tasks, and tasks with a `closed_date`.
Display-only — it mutates no data.

---

## 2. Email notifications (Resend)

### Events

| Event | Recipient | Email |
|-------|-----------|-------|
| Task created with a responsible person | that person (if they have an email) | assignment (incl. opener name) |
| Task created mentioning people | each mentioned person (if they have an email) | mention (incl. actor name) |
| Task updated, responsible person **changed** | the **new** responsible person | assignment |
| Task updated with **new** mentions | only the **newly** mentioned people | mention |

Archive/restore send **no** email (no responsible/mention change). Mention emails are
**live**: anyone mentioned in Description or Notes with an email on file is notified.

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

| Variable | Type | Production value | Purpose |
|----------|------|------------------|---------|
| `EMAIL_ENABLED` | var | `"true"` | Must be exactly `"true"` to send. Anything else = disabled. |
| `EMAIL_FROM` | var | `Task Manager <notifications@task-notification.xyz>` | Verified Resend sender. |
| `EMAIL_REPLY_TO` | var | `sw@igintech.com` | Optional Reply-To header (added to the Resend payload when set; sending works without it). |
| `RESEND_API_KEY` | **secret** | _(stored in Cloudflare)_ | Resend API key. Set via `wrangler secret put` — **never** committed. |

`EMAIL_ENABLED`, `EMAIL_FROM`, and `EMAIL_REPLY_TO` live in `worker/wrangler.toml`
(`[env.production.vars]`). `RESEND_API_KEY` is a secret and is **not** stored in the repo.
The **staging** Worker keeps `EMAIL_ENABLED="false"` (no real sends from staging).

### Behaviour when disabled

If `EMAIL_ENABLED` is anything other than `"true"` (e.g. staging):

- Person mentions still work.
- **No Resend call is attempted.** The Worker logs a safe skip line:
  `[email] skipped (EMAIL_ENABLED is not "true"): task created`.

### Failure behaviour (task ops always succeed)

Email is best-effort and runs **detached** via `ctx.waitUntil(...)`, so the HTTP response
never waits on it. **A task create/update always succeeds**, regardless of email state:

- `EMAIL_ENABLED` not `"true"` → no send; safe skip log.
- `EMAIL_ENABLED="true"` but `RESEND_API_KEY`/`EMAIL_FROM` missing → no send; safe warning
  log; **no secrets printed**; task op still succeeds.
- Resend API errors → the task mutation is **not** rolled back; a safe failure is logged
  (HTTP status + short excerpt, never the API key); task op still succeeds.

### Email content (English)

All notification emails are in **English** (plain text, concise — no full
description/notes). Each email includes an explicit **Opened by:** line and a **deep link**
that opens the specific task already expanded (see *Deep links* below). `<number>` = task
number; `<actor>`/opener = the `opened_by_person_id` name (best-available actor — there is
no current-user concept).

**New assignment** — includes who opened the task:
```
Subject: New task assigned: TASK-<number> - <title>

Hi <recipient name>,

A new task was assigned to you.

Task: TASK-<number> - <title>
Opened by: <opened_by name, or "Unknown">
Status: <status>
Priority: <priority>
Due date: <due_date, or "No due date">

Open task: https://task-management-system-3nm.pages.dev?task=TASK-<number>
```

**Mention**:
```
Subject: You were mentioned in TASK-<number> - <title>

Hi <recipient name>,

<actor name> mentioned you in a task.

Task: TASK-<number> - <title>
Opened by: <opened_by name, or "Unknown">

Open task: https://task-management-system-3nm.pages.dev?task=TASK-<number>
```

English status labels: Not Started / In Progress / On Hold / Need to Review / Done.

**Actor / opener source & limitation:** for both create and update, the actor and the
"Opened by" line are resolved from the task's `opened_by_person_id` (this API has no
authenticated current-user). So an update made by a different person still shows the
original opener as the actor. If the opener is missing/unresolved, the assignment email
shows `Opened by: Unknown` and the mention email falls back to
`Someone mentioned you in a task.` Documented, by design.

When `EMAIL_REPLY_TO` is set, a `reply_to` header (`sw@igintech.com`) is added so replies
route to the team inbox rather than the no-reply sender.

### Deep links (open a specific task)

Emails link to **`https://task-management-system-3nm.pages.dev?task=TASK-<number>`**. On
load the app reads `?task=`, finds the task by number, clears filters that would hide it
(matching its archived state), and expands + scrolls to it on the **Tasks** tab. Clicking a
`@TASK` reference inside the app also syncs the URL to the same `?task=` form (via
`history.replaceState`, no router). Helpers: `buildTaskUrl` / `buildTaskQuery` /
`parseTaskParam` in `src/lib/utils.ts`; the Worker email builder mirrors the exact scheme.
Limitation: deep links open on the Tasks tab; if the task number doesn't exist nothing
opens (logged to console).

### Blue highlighting of mentions & task references

- **Read-only (expanded task view):** person mentions `@Name` and task references
  `@TASK-135` render in blue (`TaskTextWithLinks`); task references stay clickable, person
  mentions are blue text (not clickable in this step).
- **Mention dropdown:** both task and person suggestions use blue labels.
- **Edit mode:** a native `<textarea>` cannot colour only part of its own text, so the raw
  textarea stays plain (preserving typing, bullets, Enter/Shift+Enter, autocomplete, and
  caret behaviour). A small read-only **Preview** is shown beneath Description/Notes that
  renders the same text with mentions/task refs in blue (`MentionPreview` +
  `tokenizeMentions`). This is the documented, low-risk alternative to a textarea overlay.

---

## 3. People email addresses (`people.email`)

`people.email` is an **optional** `TEXT` column. The app works correctly when it is `NULL`
(that person simply receives no email). People with no email are skipped silently.

**Configured in production (2026-06-18):** all five people (Amit, Elad, Tamir, Guy, Matan)
have igintech.com addresses set. These were applied with `UPDATE people SET email = … WHERE
name = …` (one row each, by name), **not** via data import. The literal addresses are kept
out of the repo (set directly in D1).

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

## 4. Production activation (DONE) & how it was set up

Email is **active in production**. The setup that was completed (2026-06-18):

1. Resend account created; domain **`task-notification.xyz`** added and **Verified**
   (DNS records in Spaceship).
2. `RESEND_API_KEY` stored as a Worker secret:
   ```bash
   cd worker
   npx wrangler secret put RESEND_API_KEY --env production   # value never printed/committed
   ```
3. `worker/wrangler.toml` `[env.production.vars]`:
   ```toml
   EMAIL_ENABLED  = "true"
   EMAIL_FROM     = "Task Manager <notifications@task-notification.xyz>"
   EMAIL_REPLY_TO = "sw@igintech.com"
   ```
4. People emails set in D1 production (section 3).
5. Production Worker redeployed (auto on merge to `main`, `worker/**` changed).

### Testing safely

- **Staging (disabled):** create/update tasks and confirm the Worker logs
  `[email] skipped (...)` and **no Resend request** is made (`wrangler tail`).
- **Production smoke test:** create one obvious task (e.g. *"Email notification smoke test
  - DELETE ME"*) assigned to a person with an email, watch `wrangler tail` for
  `[email] sent assignment notification …`, confirm in Resend → Logs, then **archive** the
  task. Send at most one test email; do not mention all people.

---

## 5. Security & future hardening

There is **no authentication / access control** on the Worker write endpoints yet; this
is an accepted risk for a small internal tool (see `docs/cloudflare-worker-api.md`).
Future hardening to consider before broader exposure:

- Auth / access control on the API.
- Rate limiting (also protects the Resend quota).
- Audit logging of notifications sent.
- Email open/click handling and richer (HTML) templates if needed.
