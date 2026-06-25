// Email-notification scaffolding (Resend) for the Worker.
//
// DEFAULT BEHAVIOUR: DISABLED. Nothing here sends a real email unless EMAIL_ENABLED
// is exactly the string "true" AND both RESEND_API_KEY and EMAIL_FROM are configured.
// Every path here is best-effort and swallows its own errors — a task create/update
// must ALWAYS succeed regardless of email config or Resend availability. The caller
// runs dispatchEmails via ctx.waitUntil(...) so the HTTP response never waits on email.
//
// Provider: Resend only (simple transactional sending from a Cloudflare Worker via
// fetch; useful free tier — 100 emails/day, 3,000/month, each recipient counts
// separately). See docs/email-notifications.md.

// Public app URL used in every email body.
const APP_URL = 'https://task-management-system-3nm.pages.dev';
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

// Deep link that opens the app directly on a specific task (already expanded).
// Scheme: `${APP_URL}?task=TASK-<number>` — mirrors src/lib/utils.ts buildTaskUrl.
// Falls back to the bare app URL when the task has no number.
function buildTaskUrl(task: TaskRow): string {
  return task.task_number == null ? APP_URL : `${APP_URL}?task=TASK-${task.task_number}`;
}

// Env fields this module reads. Worker's Env interface extends this. All optional:
// when email is disabled the Worker deploys and runs without any of them set.
export interface EmailEnv {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  EMAIL_ENABLED?: string;
  // Optional Reply-To header. When set, added to the Resend payload; when absent the
  // email still sends without a reply-to. Never required.
  EMAIL_REPLY_TO?: string;
}

// Minimal shapes (rows come straight from D1 `RETURNING *` / SELECT).
export interface PersonRow {
  id: string;
  name: string;
  email?: string | null;
}
export interface TaskRow {
  task_number?: number | null;
  title?: string | null;
  description?: string | null;
  notes?: string | null;
  status?: string | null;
  priority?: number | null;
  due_date?: string | null;
  closed_date?: string | null;
  responsible_person_id?: string | null;
  // Who opened/created the task. Resolved to a name and shown as the actor/opener in
  // emails ("Opened by: <name>" and "<name> mentioned you in a task.").
  opened_by_person_id?: string | null;
}

type RecipientKind = 'assignment' | 'mention' | 'update';
// One detected change to a text field (Description or Notes) for the 'update' email.
//   * `added`  — the appended text (when it could be confidently detected: old text is a
//                prefix of new, or old was empty). Already rendered (@person:<id> → @Name)
//                and trimmed. null when no confident append → use the Before/After fallback.
//   * `before` / `after` — trimmed+rendered old/new text for the fallback block. Always set.
export interface FieldChange {
  field: string;
  added: string | null;
  before: string;
  after: string;
}
interface Recipient {
  personId: string;
  name: string;
  email: string;
  kind: RecipientKind;
  // For the 'update' kind only: which of Description/Notes actually changed, in order.
  changedFields?: string[];
  // For the 'update' kind only: the detected added-text / Before-After diff per changed field.
  changes?: FieldChange[];
}

// Mirror of src/lib/mentions.ts — kept duplicated because the Worker is a separate
// package/build. Matches the stable "@person:<id>" token; rejects a "@" glued to a
// word char so it never collides with "@TASK-123" task references or emails.
const PERSON_MENTION_SOURCE = '(?<![A-Za-z0-9_])@person:([A-Za-z0-9_-]+)';

export function extractPersonMentionIds(text: string | null | undefined): string[] {
  if (!text) return [];
  const re = new RegExp(PERSON_MENTION_SOURCE, 'g');
  const ids: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      ids.push(m[1]);
    }
  }
  return ids;
}

// Unique person ids mentioned across description AND notes.
function taskMentionIds(task: TaskRow): string[] {
  const all = [...extractPersonMentionIds(task.description), ...extractPersonMentionIds(task.notes)];
  return Array.from(new Set(all));
}

// Renders stored "@person:<id>" tokens as friendly "@Name" for email bodies (mirrors the
// frontend's renderStoredMentionsForDisplay). An id that no longer resolves → "@unknown".
// "@TASK-123" task references carry no "person:" prefix, so they are left untouched and
// stay readable as TASK references.
function renderMentionsForEmail(text: string, peopleById: Map<string, PersonRow>): string {
  return text.replace(new RegExp(PERSON_MENTION_SOURCE, 'g'), (_m, id: string) => {
    const name = peopleById.get(id)?.name;
    return name ? `@${name}` : '@unknown';
  });
}

// Per-field cap for added/before/after text in update emails. Keeps emails small; longer
// content is cut at the cap and marked with a trailing "... [trimmed]". Line breaks within
// the kept portion are preserved (readability).
const MAX_FIELD_CHARS = 2000;
function trimForEmail(text: string, max: number = MAX_FIELD_CHARS): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}\n... [trimmed]`;
}

// Normalises only CRLF→LF so a pure line-ending difference is not treated as a content
// change and prefix detection is reliable. No other normalisation (preserves the text).
function normalizeNewlines(text: string | null | undefined): string {
  return (text ?? '').replace(/\r\n/g, '\n');
}

// Computes the diff for one changed text field (Description or Notes).
//   * If old is empty and new has content → the whole new text is the added text.
//   * Else if new starts with old (append-style, the common dated-bullet case) → the added
//     text is newText.slice(oldText.length).trim().
//   * Otherwise (a middle edit or deletion) → added = null; the email uses Before/After.
// All emitted text has mentions rendered to @Name and is trimmed to MAX_FIELD_CHARS.
export function computeFieldChange(
  field: string,
  oldRaw: string | null | undefined,
  newRaw: string | null | undefined,
  peopleById: Map<string, PersonRow>,
): FieldChange {
  const oldText = normalizeNewlines(oldRaw);
  const newText = normalizeNewlines(newRaw);
  const render = (t: string) => trimForEmail(renderMentionsForEmail(t, peopleById));

  let added: string | null = null;
  if (oldText.trim() === '' && newText.trim() !== '') {
    added = newText.trim();
  } else if (newText.startsWith(oldText)) {
    const slice = newText.slice(oldText.length).trim();
    if (slice !== '') added = slice;
  }

  return {
    field,
    added: added != null ? render(added) : null,
    before: render(oldText.trim()),
    after: render(newText.trim()),
  };
}

// Builds the per-field change list (Description before Notes) for the fields that actually
// changed between old and new. Used by the 'update' email to show what was added.
function computeFieldChanges(
  oldTask: TaskRow,
  newTask: TaskRow,
  peopleById: Map<string, PersonRow>,
): FieldChange[] {
  const changes: FieldChange[] = [];
  if ((oldTask.description ?? '') !== (newTask.description ?? '')) {
    changes.push(computeFieldChange('Description', oldTask.description, newTask.description, peopleById));
  }
  if ((oldTask.notes ?? '') !== (newTask.notes ?? '')) {
    changes.push(computeFieldChange('Notes', oldTask.notes, newTask.notes, peopleById));
  }
  return changes;
}

// ── My Mentions: newly-mentioned detection + snippet (in-app inbox, NOT email) ───────
// These power the mention_notifications rows the Worker persists so a person can later see
// who mentioned them. They are independent of email config (the inbox works even when email
// is disabled) and of whether the mentioned person has an email address.

// All person ids mentioned in a freshly created task (every mention is "new").
export function newlyMentionedOnCreate(task: TaskRow): string[] {
  return taskMentionIds(task);
}

// Person ids mentioned in the updated task but NOT before it — i.e. mentions added by THIS
// edit. Unchanged existing mentions and @TASK references never appear here.
export function newlyMentionedOnUpdate(oldTask: TaskRow, newTask: TaskRow): string[] {
  const before = new Set(taskMentionIds(oldTask));
  return taskMentionIds(newTask).filter(id => !before.has(id));
}

// A short, human-readable snippet for where a person was mentioned: the first line/bullet
// in Description (then Notes) that contains the "@person:<id>" token, with mentions rendered
// to @Name and trimmed. Returns null when the token isn't found in either field.
const SNIPPET_MAX_CHARS = 200;
export function mentionSnippet(
  task: TaskRow,
  personId: string,
  peopleById: Map<string, PersonRow>,
): string | null {
  const token = `@person:${personId}`;
  for (const raw of [task.description, task.notes]) {
    const text = normalizeNewlines(raw);
    if (!text.includes(token)) continue;
    const line = text.split('\n').find(l => l.includes(token)) ?? text;
    const rendered = renderMentionsForEmail(line.trim(), peopleById);
    return rendered.length > SNIPPET_MAX_CHARS
      ? `${rendered.slice(0, SNIPPET_MAX_CHARS).trimEnd()}…`
      : rendered;
  }
  return null;
}

// Which of Description / Notes actually changed between the old and new task row. Compared
// as stored text (null treated as empty), so a PATCH that leaves a field untouched — or
// re-sends an identical value — counts as no change. Returns the human-readable labels in
// display order; empty array means neither changed.
function changedTextFields(oldTask: TaskRow, newTask: TaskRow): string[] {
  const fields: string[] = [];
  if ((oldTask.description ?? '') !== (newTask.description ?? '')) fields.push('Description');
  if ((oldTask.notes ?? '') !== (newTask.notes ?? '')) fields.push('Notes');
  return fields;
}

// Adds a recipient if the person exists, has a non-empty email, and is not already
// queued. Assignment is added before mentions, so a person who is BOTH the (new)
// responsible person and (newly) mentioned receives exactly ONE assignment email.
function addRecipient(
  map: Map<string, Recipient>,
  peopleById: Map<string, PersonRow>,
  personId: string | null | undefined,
  kind: RecipientKind,
): void {
  if (!personId || map.has(personId)) return;
  const person = peopleById.get(personId);
  const email = person?.email?.trim();
  if (!person || !email) return;
  map.set(personId, { personId, name: person.name, email, kind });
}

// Recipients for a newly created task: the responsible person (assignment) + everyone
// mentioned in description/notes (mention), de-duplicated with assignment precedence.
export function computeCreateRecipients(task: TaskRow, peopleById: Map<string, PersonRow>): Recipient[] {
  const map = new Map<string, Recipient>();
  addRecipient(map, peopleById, task.responsible_person_id, 'assignment');
  for (const id of taskMentionIds(task)) addRecipient(map, peopleById, id, 'mention');
  return [...map.values()];
}

// Recipients for an updated task, de-duplicated to AT MOST ONE email per person with
// precedence assignment > mention > update (the order they are added below):
//  * the NEW responsible person, only if responsible_person_id actually changed (assignment);
//  * people mentioned now but NOT before the update (mention, newly mentioned only);
//  * the responsible person when Description/Notes changed (update) — unless they were just
//    newly assigned or newly mentioned (already queued above), or they ARE the actor
//    (no self-notification). `actorPersonId` is the Current user who performed the edit.
export function computeUpdateRecipients(
  oldTask: TaskRow,
  newTask: TaskRow,
  peopleById: Map<string, PersonRow>,
  actorPersonId: string | null | undefined,
): Recipient[] {
  const map = new Map<string, Recipient>();
  if (newTask.responsible_person_id && newTask.responsible_person_id !== oldTask.responsible_person_id) {
    addRecipient(map, peopleById, newTask.responsible_person_id, 'assignment');
  }
  const before = new Set(taskMentionIds(oldTask));
  for (const id of taskMentionIds(newTask)) {
    if (!before.has(id)) addRecipient(map, peopleById, id, 'mention');
  }

  // Description/Notes update notification to the (unchanged-or-existing) responsible person.
  const changedFields = changedTextFields(oldTask, newTask);
  const respId = newTask.responsible_person_id;
  if (changedFields.length > 0 && respId && respId !== actorPersonId && !map.has(respId)) {
    const person = peopleById.get(respId);
    const email = person?.email?.trim();
    if (person && email) {
      const changes = computeFieldChanges(oldTask, newTask, peopleById);
      map.set(respId, { personId: respId, name: person.name, email, kind: 'update', changedFields, changes });
    }
  }

  return [...map.values()];
}

// English status labels for email bodies.
const STATUS_LABELS: Record<string, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  on_hold: 'On Hold',
  need_to_review: 'Need to Review',
  done: 'Done',
};

function taskKey(task: TaskRow): string {
  return task.task_number == null ? 'TASK' : `TASK-${task.task_number}`;
}

// Builds the (English) email for a recipient.
//   * `actorName`    — who performed THIS action (the Current user / actor_person_id when
//                      provided; falls back to the opener). Used for the mention line
//                      "<actor> mentioned you in a task." Unresolved → "Someone ...".
//   * `openedByName` — who opened/created the task (always from opened_by_person_id).
//                      Used for the "Opened by:" line. Unresolved → "Unknown".
// Keeping these separate lets "Matan mentioned you" appear above "Opened by: Amit".
// Both emails include a deep link that opens the specific task already expanded.
export function buildEmail(
  recipient: Recipient,
  task: TaskRow,
  actorName: string | null,
  openedByName: string | null,
): { subject: string; text: string } {
  const key = taskKey(task);
  const title = task.title ?? '(untitled)';
  const url = buildTaskUrl(task);
  const openedBy = openedByName && openedByName.trim() ? openedByName.trim() : 'Unknown';

  if (recipient.kind === 'assignment') {
    const status = task.status ? (STATUS_LABELS[task.status] ?? task.status) : STATUS_LABELS.not_started;
    const due = task.due_date ? task.due_date : 'No due date';
    return {
      subject: `New task assigned: ${key} - ${title}`,
      text:
        `Hi ${recipient.name},\n\n` +
        `A new task was assigned to you.\n\n` +
        `Task: ${key} - ${title}\n` +
        `Opened by: ${openedBy}\n` +
        `Status: ${status}\n` +
        `Priority: ${task.priority ?? '—'}\n` +
        `Due date: ${due}\n\n` +
        `Open task: ${url}\n`,
    };
  }

  if (recipient.kind === 'update') {
    // Who performed the update — the actor (Current user), falling back as elsewhere.
    const updatedBy = actorName && actorName.trim() ? actorName.trim() : 'Someone';
    const changed = recipient.changedFields && recipient.changedFields.length
      ? recipient.changedFields.join(', ')
      : 'Description / Notes';

    // What actually changed, per field: the appended text when it was confidently detected,
    // otherwise a concise Before/After block. Mentions are already rendered to @Name and the
    // text is trimmed (see computeFieldChange). Sections appear in Description-then-Notes order.
    let details = '';
    for (const c of recipient.changes ?? []) {
      if (c.added != null) {
        details += `\nAdded to ${c.field}:\n${c.added}\n`;
      } else {
        details += `\n${c.field} changed.\n\nBefore:\n${c.before || '(empty)'}\n\nAfter:\n${c.after || '(empty)'}\n`;
      }
    }

    return {
      subject: `Task updated: ${key} - ${title}`,
      text:
        `Hi ${recipient.name},\n\n` +
        `${updatedBy} updated a task assigned to you.\n\n` +
        `Task: ${key} - ${title}\n` +
        `Opened by: ${openedBy}\n` +
        `Updated by: ${updatedBy}\n` +
        `Changed fields: ${changed}\n` +
        details +
        `\nOpen task: ${url}\n`,
    };
  }

  const mentionedBy =
    actorName && actorName.trim()
      ? `${actorName.trim()} mentioned you in a task.`
      : 'Someone mentioned you in a task.';
  return {
    subject: `You were mentioned in ${key} - ${title}`,
    text:
      `Hi ${recipient.name},\n\n` +
      `${mentionedBy}\n\n` +
      `Task: ${key} - ${title}\n` +
      `Opened by: ${openedBy}\n\n` +
      `Open task: ${url}\n`,
  };
}

// Sends one email via Resend. Returns true on success. Never throws and never logs the
// API key. Caller guarantees env.RESEND_API_KEY / env.EMAIL_FROM are present.
async function sendViaResend(
  env: EmailEnv,
  recipient: Recipient,
  task: TaskRow,
  actorName: string | null,
  openedByName: string | null,
): Promise<boolean> {
  const { subject, text } = buildEmail(recipient, task, actorName, openedByName);
  const payload: Record<string, unknown> = { from: env.EMAIL_FROM, to: [recipient.email], subject, text };
  // Optional Reply-To: include only when configured; sending works fine without it.
  const replyTo = env.EMAIL_REPLY_TO?.trim();
  if (replyTo) payload.reply_to = replyTo;
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      // Log status + a short body excerpt; the request never contains the key in its body.
      const detail = await res.text().catch(() => '');
      console.warn(`[email] Resend send failed (HTTP ${res.status}) for ${recipient.kind}: ${detail.slice(0, 200)}`);
      return false;
    }
    console.log(`[email] sent ${recipient.kind} notification for ${taskKey(task)}`);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[email] Resend send error for ${recipient.kind}: ${message}`);
    return false;
  }
}

// Best-effort send of a batch of notifications. Honours EMAIL_ENABLED and config; on
// any disabled/misconfigured/failure path it logs a safe message and resolves without
// throwing. Intended to run inside ctx.waitUntil(...).
export async function dispatchEmails(
  env: EmailEnv,
  recipients: Recipient[],
  task: TaskRow,
  actorName: string | null,
  openedByName: string | null,
): Promise<void> {
  if (recipients.length === 0) return;

  if (env.EMAIL_ENABLED !== 'true') {
    console.log(`[email] skipped (EMAIL_ENABLED is not "true"): ${recipients.length} notification(s) not sent`);
    return;
  }
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    console.warn('[email] enabled but RESEND_API_KEY and/or EMAIL_FROM is missing — skipping send');
    return;
  }

  // Sequential is fine for the tiny recipient counts here; one failure never aborts others.
  for (const recipient of recipients) {
    await sendViaResend(env, recipient, task, actorName, openedByName);
  }
}
