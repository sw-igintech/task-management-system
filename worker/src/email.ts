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

// Env fields this module reads. Worker's Env interface extends this. All optional:
// when email is disabled the Worker deploys and runs without any of them set.
export interface EmailEnv {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  EMAIL_ENABLED?: string;
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
  responsible_person_id?: string | null;
}

type RecipientKind = 'assignment' | 'mention';
interface Recipient {
  personId: string;
  name: string;
  email: string;
  kind: RecipientKind;
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

// Recipients for an updated task:
//  * the NEW responsible person, only if responsible_person_id actually changed;
//  * people mentioned now but NOT before the update (newly mentioned only).
// De-duplicated with assignment precedence.
export function computeUpdateRecipients(
  oldTask: TaskRow,
  newTask: TaskRow,
  peopleById: Map<string, PersonRow>,
): Recipient[] {
  const map = new Map<string, Recipient>();
  if (newTask.responsible_person_id && newTask.responsible_person_id !== oldTask.responsible_person_id) {
    addRecipient(map, peopleById, newTask.responsible_person_id, 'assignment');
  }
  const before = new Set(taskMentionIds(oldTask));
  for (const id of taskMentionIds(newTask)) {
    if (!before.has(id)) addRecipient(map, peopleById, id, 'mention');
  }
  return [...map.values()];
}

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

function buildEmail(recipient: Recipient, task: TaskRow): { subject: string; text: string } {
  const key = taskKey(task);
  const title = task.title ?? '(untitled)';
  if (recipient.kind === 'assignment') {
    const status = task.status ? (STATUS_LABELS[task.status] ?? task.status) : 'Not Started';
    const due = task.due_date ? task.due_date : 'No due date';
    return {
      subject: `New task assigned: ${key} — ${title}`,
      text:
        `Hello ${recipient.name},\n\n` +
        `A new task was assigned to you.\n\n` +
        `Task: ${key} — ${title}\n` +
        `Status: ${status}\n` +
        `Priority: ${task.priority ?? '—'}\n` +
        `Due date: ${due}\n\n` +
        `Open task:\n${APP_URL}\n`,
    };
  }
  return {
    subject: `You were mentioned in ${key} — ${title}`,
    text:
      `Hello ${recipient.name},\n\n` +
      `You were mentioned in a task.\n\n` +
      `Task: ${key} — ${title}\n\n` +
      `Open task:\n${APP_URL}\n`,
  };
}

// Sends one email via Resend. Returns true on success. Never throws and never logs the
// API key. Caller guarantees env.RESEND_API_KEY / env.EMAIL_FROM are present.
async function sendViaResend(env: EmailEnv, recipient: Recipient, task: TaskRow): Promise<boolean> {
  const { subject, text } = buildEmail(recipient, task);
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [recipient.email], subject, text }),
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
export async function dispatchEmails(env: EmailEnv, recipients: Recipient[], task: TaskRow): Promise<void> {
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
    await sendViaResend(env, recipient, task);
  }
}
