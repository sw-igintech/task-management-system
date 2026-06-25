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

- Frontend: `src/lib/mentions.ts` — `extractPersonMentionIds`, `extractTaskPersonMentionIds`
  (the latter also powers TaskForm's new-mention save gate), `getMentionItems`, and the
  display⇄storage trio `renderStoredMentionsForDisplay`, `prepareMentionsForEditing`,
  `serializeMentionsForStorage`.
- Worker: `worker/src/email.ts` mirrors the extraction (separate package/build).

### Current user selector (lightweight actor — NOT authentication)

A compact **`Current user:`** dropdown sits in the app header (next to the Backend badge).
It is a lightweight way to say *who is acting* so mention emails name the right person.

- **It is not authentication / access control.** There is no login, no password, no
  permissions. It only labels the actor of an action. Anyone can change it freely.
- **Options** come from the existing people list (`/api/people`) — not hardcoded.
- **Persistence:** the selected person id is stored in `localStorage` under the key
  **`taskManager.currentUserId`** and restored on the next visit in the same browser. If the
  stored id no longer matches a known person (e.g. that person was removed) it is **cleared
  gracefully** and the selector falls back to its `Select user` placeholder.
- **You can type/select mentions without choosing a Current user.** Saving is blocked
  **only** when a save would send an **actor-dependent email** and no Current user is
  selected. Two triggers:
  1. the save adds *newly added* person mentions (inline message *"Please select Current
     user before saving mentions."*), or
  2. on an **edit**, the save changes **Description or Notes** on a task assigned to a
     responsible person who has an email — i.e. it would send the *task-updated*
     notification (inline message *"Please select Current user before saving changes."*).
  The message appears next to the Save/Update button (never a modal/popup). Ordinary edits,
  `@TASK`-only edits, unchanged mentions, unassigned tasks, and a responsible person with no
  email all save without a Current user.
- **Attention cue.** When such a save is blocked, the header **Current user** selector gets
  a pulsing red ring (`.current-user-attention` in `src/index.css`; honours
  `prefers-reduced-motion` with a static ring). The cue starts on the blocked save and stops
  as soon as a valid Current user is selected.
- **On the wire:** when a Current user is selected, create/update requests include the
  optional `actor_person_id` field (see `docs/cloudflare-worker-api.md`). It is the actor of
  *this request only* — it is **never stored** on the task. The Worker uses it to resolve the
  mention/update-email actor, falling back to the opener when absent/unresolved.

Implementation: `src/hooks/useCurrentUser.ts` (state + localStorage + `needsSelection` cue
flag — lazy localStorage initializer means the saved user is shown from first paint, no
hydration reset), the selector + cue in `src/App.tsx`, the save gate in
`src/components/TaskForm.tsx`, and the `actor_person_id` pass-through in
`src/hooks/useTasks.ts` → `src/lib/taskApi.ts`.

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
| Task updated, **Description or Notes changed** | the responsible person (if they have an email) | **update** (incl. actor name, changed fields, **and the added text** / Before-After fallback) |

Archive/restore send **no** email (no responsible/mention/Description/Notes change). Mention
emails are **live**: anyone mentioned in Description or Notes with an email on file is notified.

### De-duplication

A person is emailed **at most once per action**, with precedence **assignment > mention >
update**:

- If someone is both the responsible person and mentioned in the same task, they get a
  single **assignment** email (assignment beats mention).
- On update, people already mentioned *before* the edit are **not** re-notified — only newly
  added mentions are.
- The **update** notification (Description/Notes changed) goes to the responsible person
  **only** if they aren't already getting an assignment or mention email for the same save,
  **and** they are not the actor performing the edit (no self-notification). If both
  Description and Notes changed, it is still **one** email listing both fields.

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

**Update (Description/Notes changed)** — to the responsible person. The email now includes
**what was added/changed** (Jira-style), not just which field changed:
```
Subject: Task updated: TASK-<number> - <title>

Hi <recipient name>,

<actor name> updated a task assigned to you.

Task: TASK-<number> - <title>
Opened by: <opened_by name, or "Unknown">
Updated by: <actor name, or "Someone">
Changed fields: Notes            (comma-separated; only whichever actually changed)

Added to Notes:
<the added text>

Open task: https://task-management-system-3nm.pages.dev?task=TASK-<number>
```

When **both** Description and Notes changed it is still **one** email, with an `Added to
Description:` section followed by an `Added to Notes:` section (in that order).

**Added-text detection rules** (`computeFieldChange` in `worker/src/email.ts`):

- Old text **empty**, new has content → the whole new text is the added text.
- New text **starts with** the old text (the common append / dated-bullet case) → added text
  is `newText.slice(oldText.length).trim()`.
- Otherwise (a **middle edit or deletion**) → the added text can't be confidently isolated, so
  the email uses a concise **Before/After** fallback instead:
  ```
  Description changed.

  Before:
  <old description, trimmed>

  After:
  <new description, trimmed>
  ```
- Only CRLF↔LF is normalised (so a pure line-ending change isn't treated as content, and prefix
  detection is reliable). No update email is sent if Description/Notes did not actually change.

**Trimming / mention rendering in the added text:**

- Each field's added/Before/After text is capped at **2000 characters**; longer content is cut
  and marked with a trailing `... [trimmed]`. Line breaks within the kept portion are preserved.
- Stored `@person:<id>` tokens in the added text are rendered as friendly **`@Name`** (an
  unresolved id → `@unknown`). `@TASK-123` references are left untouched and stay readable.

English status labels: Not Started / In Progress / On Hold / Need to Review / Done.

**Actor vs. opener (Current user selector):** the **actor** ("`<actor>` mentioned you in a
task.") and the **"Opened by:"** line are now resolved separately:

- **Opened by** — always the task's `opened_by_person_id` (the opener/creator). Unresolved
  → `Opened by: Unknown`.
- **Actor** — the person who performed *this* action. Resolved from the optional
  `actor_person_id` request field (the **Current user** selected in the app header) when it
  resolves to a known person; otherwise it **falls back to the opener**
  (`opened_by_person_id`); if neither resolves, the mention email reads
  `Someone mentioned you in a task.`

So when Matan (Current user) edits a task opened by Amit and mentions Amit, Amit receives
*"Matan mentioned you in a task."* with *"Opened by: Amit"* — the actor and opener are
correctly distinct. The **Current user selector is not authentication** (see below); an
invalid/unknown `actor_person_id` is never rejected — it just falls back to the opener.

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
  caret behaviour). It shows friendly `@Name` mentions (never the raw `@person:<id>` token).
  The earlier read-only blue **Preview** block beneath Description/Notes was **removed**
  (it is intentionally not part of the editor); mentions render blue only in the read-only
  expanded view.

---

## 2a. My Mentions inbox (in-app, persisted)

The **My Mentions** inbox lets a person see who mentioned them and jump to the task — even if
they missed (or never get) the email. It is **separate from email** and works regardless of
`EMAIL_ENABLED` or whether the mentioned person has an email address.

> **My Mentions vs. Activity:** My Mentions (header `@` icon) is the **actionable unread inbox**
> — mentions only, with open/read state. The **Activity** feed (header **bell** icon) is a
> broader **read-only chronological history** (assignments, mentions, updates, status/priority/
> date changes, archive/restore) with **no** unread/read state. Both use the Current user as a
> lightweight identity (not auth). See `docs/cloudflare-worker-api.md` (Activity feed endpoints).

### Identity (lightweight, NOT auth)

My Mentions uses the existing **Current user** selector as the identity. **It is not
authentication** — there is no login and anyone can change the Current user. It is a
*lightweight workflow identity* only; the `/api/mentions` endpoints accept a `person_id` and
trust it. This is an accepted limitation of the no-auth design (see *Security* below).

### Data model — `mention_notifications`

Unread mentions are **not** computed from current task text; an event row is **persisted in
D1** at the moment a mention is introduced. Table (`d1/schema.sql` +
`d1/migrations/2026-06-25_add_mention_notifications.sql`):

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `task_id` | TEXT NOT NULL | tasks.id (UUID) |
| `task_number` | INTEGER NOT NULL | tasks.task_number (for the deep link / display) |
| `mentioned_person_id` | TEXT NOT NULL | who was mentioned (people.id) |
| `actor_person_id` | TEXT | who mentioned them (the Current user / actor; may be NULL) |
| `created_at` | TEXT NOT NULL | ISO timestamp |
| `opened_at` | TEXT | NULL = **unread**; set when opened/read |
| `source` | TEXT NOT NULL DEFAULT 'mention' | reserved for future sources |
| `snippet` | TEXT | the line/bullet where the person was mentioned, `@Name`-rendered, trimmed |

Indexed on `(mentioned_person_id, opened_at, created_at)`, `task_id`, and `actor_person_id`.

### When rows are created (Worker)

On `POST /api/tasks` and `PATCH /api/tasks/:id`, for each **newly** mentioned person the Worker
inserts one row (detached via `ctx.waitUntil`, never blocking the response):

- **Create** → every person mentioned in Description/Notes.
- **Update** → only people mentioned **now but not before** the edit (unchanged existing
  mentions create no row). A person mentioned in both Description and Notes in the same save
  gets **one** row. `@TASK` references never create rows. **Archive/restore create no rows**
  (they don't touch Description/Notes).
- Row creation is **independent of email**: it happens even when `EMAIL_ENABLED="false"` and
  even if the mentioned person has no email. If an email send fails, the row is still created.
  If a row insert fails (e.g. the migration isn't applied yet), it is logged and **the task
  create/update still succeeds** (non-blocking, fail-graceful).

### API (see `docs/cloudflare-worker-api.md` for full details)

- `GET /api/mentions?person_id=<id>&status=unread` — unread mentions for that person, newest
  first, with joined task title, archived flag, and actor name. (`status=all` returns read+unread.)
- `GET /api/mentions/count?person_id=<id>` — unread count.
- `POST /api/mentions/:id/open` body `{ "person_id": "<id>" }` — marks `opened_at` (idempotent).
  `person_id` must equal the row's `mentioned_person_id`, else **403** — one person can't mark
  another's mention read.

### Read semantics

Unread/read is stored in D1 via `opened_at`, **not** browser-local. Opening a mention in one
browser marks it read globally for that Current user. Opening a mention **navigates to the
task** using the same `?task=TASK-<n>` deep link as email links / `@TASK` references, then the
item disappears from the unread list.

### UI — icon-only `@` button

A **compact icon-only `@` button** sits in the app header (next to the Current user selector),
social-app style — tooltip/aria-label **"My Mentions"**, with a small unread-count **badge**
when count > 0. It is **not** a large text tab. Clicking opens the **My Mentions** view (a
panel inside the app, not a modal/popup). With **no Current user** selected, the view shows the
inline empty state *"Select Current user to view your mentions."* and the header Current-user
cue lights — it never shows another person's data.

> The future general **Activity/Notifications bell** is intentionally **not** implemented here
> — only the My Mentions `@` icon. No general Activity Log was added.

Implementation: `worker/src/index.ts` (`/api/mentions*` + row inserts),
`worker/src/email.ts` (`newlyMentionedOnUpdate`/`newlyMentionedOnCreate`/`mentionSnippet`),
`src/hooks/useMentions.ts`, `src/pages/MentionsPage.tsx`, the `@` button in `src/App.tsx`, and
`src/lib/taskApi.ts` (`getMentions`/`markMentionOpened`).

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
