// Activity / Notifications feed — pure event builders for the Worker.
//
// The Activity feed is a CHRONOLOGICAL HISTORY of task events relevant to a person (the
// "Current user" — a lightweight workflow identity, NOT authentication). It is DISTINCT from
// the My Mentions inbox: My Mentions = actionable UNREAD mentions only; Activity = a read-only
// history list (no unread/read state).
//
// These functions are PURE — they compute the rows to insert; the Worker (index.ts) performs
// the best-effort INSERTs (detached via ctx.waitUntil, never blocking a task mutation).
//
// Targeting: one row PER target person (the person an event is most relevant to), so the feed
// is trivially queryable by target_person_id. Self-noise is suppressed to mirror the existing
// email self-suppression rules (see notes on each builder).

import {
  type PersonRow,
  type TaskRow,
  type FieldChange,
  computeFieldChange,
  mentionSnippet,
  newlyMentionedOnCreate,
  newlyMentionedOnUpdate,
} from './email';

// A task row as read from D1 (RETURNING * / SELECT *) — superset of email's TaskRow with the
// fields Activity diffs. `archived` is stored as INTEGER 0/1.
export interface ActivityTaskRow extends TaskRow {
  id?: string;
  archived?: number | boolean;
}

// One activity row to insert. `details` is serialised to details_json by the caller.
export interface PendingActivity {
  task_id: string;
  task_number: number;
  actor_person_id: string | null;
  target_person_id: string;
  event_type: string;
  summary: string;
  details: Record<string, unknown> | null;
}

const STATUS_LABELS: Record<string, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  on_hold: 'On Hold',
  need_to_review: 'Need to Review',
  done: 'Done',
};
function statusLabel(s: string | null | undefined): string {
  if (!s) return '—';
  return STATUS_LABELS[s] ?? s;
}

function nameOf(personId: string | null | undefined, peopleById: Map<string, PersonRow>): string | null {
  return personId ? (peopleById.get(personId)?.name ?? null) : null;
}

// Actor display name for summaries: the actor (Current user) → falls back to the opener →
// "Someone" (mirrors the email actorNameFor resolution).
function actorDisplayName(
  actorPersonId: string | null | undefined,
  task: ActivityTaskRow,
  peopleById: Map<string, PersonRow>,
): string {
  return nameOf(actorPersonId, peopleById) ?? nameOf(task.opened_by_person_id, peopleById) ?? 'Someone';
}

function taskKey(task: ActivityTaskRow): string {
  return task.task_number == null ? 'TASK' : `TASK-${task.task_number}`;
}
function taskLabel(task: ActivityTaskRow): string {
  return `${taskKey(task)} - ${task.title ?? '(untitled)'}`;
}
function toBool(v: number | boolean | null | undefined): boolean {
  return v === 1 || v === true;
}

// Common details fields attached to every event (handy for the frontend even though the API
// also joins the live task title).
function baseDetails(task: ActivityTaskRow, actorName: string): Record<string, unknown> {
  return { actor_name: actorName, task_key: taskKey(task), task_title: task.title ?? null };
}

// ── CREATE ────────────────────────────────────────────────────────────────────
// Per target person, the single most relevant event (precedence assigned > mentioned >
// created), mirroring email precedence. No self-suppression for assignment/mention (matches
// the assignment/mention emails, which are sent even to oneself). task_created is suppressed
// when the opener IS the actor (the common self-create case → pure self-noise).
export function buildCreateActivity(
  task: ActivityTaskRow,
  actorPersonId: string | null,
  peopleById: Map<string, PersonRow>,
): PendingActivity[] {
  if (!task.id || task.task_number == null) return [];
  const actorName = actorDisplayName(actorPersonId, task, peopleById);
  const base = { task_id: task.id, task_number: task.task_number, actor_person_id: actorPersonId };

  // target → { prio, event }. Lower prio number wins.
  const primary = new Map<string, { prio: number; ev: PendingActivity }>();
  const consider = (pid: string | null | undefined, prio: number, ev: PendingActivity) => {
    if (!pid) return;
    const existing = primary.get(pid);
    if (!existing || prio < existing.prio) primary.set(pid, { prio, ev });
  };

  // 1. Assignment → responsible person.
  if (task.responsible_person_id) {
    consider(task.responsible_person_id, 1, {
      ...base,
      target_person_id: task.responsible_person_id,
      event_type: 'task_assigned',
      summary: `${actorName} assigned ${taskLabel(task)} to you`,
      details: { ...baseDetails(task, actorName), status: task.status ?? null, priority: task.priority ?? null, due_date: task.due_date ?? null },
    });
  }
  // 2. Mentions → each mentioned person.
  for (const pid of newlyMentionedOnCreate(task)) {
    consider(pid, 2, {
      ...base,
      target_person_id: pid,
      event_type: 'person_mentioned',
      summary: `${actorName} mentioned you in ${taskLabel(task)}`,
      details: { ...baseDetails(task, actorName), snippet: mentionSnippet(task, pid, peopleById) },
    });
  }
  // 3. Created → opener, only when the opener is NOT the actor (avoid self-noise).
  if (task.opened_by_person_id && task.opened_by_person_id !== actorPersonId) {
    consider(task.opened_by_person_id, 3, {
      ...base,
      target_person_id: task.opened_by_person_id,
      event_type: 'task_created',
      summary: `${actorName} created ${taskLabel(task)}`,
      details: baseDetails(task, actorName),
    });
  }

  return [...primary.values()].map(x => x.ev);
}

// ── UPDATE (includes archive/restore, detected via the archived flag) ───────────
// Mirrors email self-suppression: field-change events go to the EXISTING responsible person
// only when the actor is NOT that person. Newly-mentioned/newly-assigned events are not
// self-suppressed (matches the mention/assignment emails).
export function buildUpdateActivity(
  oldTask: ActivityTaskRow,
  newTask: ActivityTaskRow,
  actorPersonId: string | null,
  peopleById: Map<string, PersonRow>,
): PendingActivity[] {
  if (!newTask.id || newTask.task_number == null) return [];
  const actorName = actorDisplayName(actorPersonId, newTask, peopleById);
  const base = { task_id: newTask.id, task_number: newTask.task_number, actor_person_id: actorPersonId };
  const events: PendingActivity[] = [];

  // Archive / restore dominates: when the archived flag flips, emit a single archive/restore
  // event to the responsible person (or opener) and nothing else.
  if (toBool(oldTask.archived) !== toBool(newTask.archived)) {
    const target = newTask.responsible_person_id ?? newTask.opened_by_person_id;
    if (target) {
      const archived = toBool(newTask.archived);
      events.push({
        ...base,
        target_person_id: target,
        event_type: archived ? 'task_archived' : 'task_restored',
        summary: `${taskLabel(newTask)} was ${archived ? 'archived' : 'restored'}`,
        details: baseDetails(newTask, actorName),
      });
    }
    return events;
  }

  const respNew = newTask.responsible_person_id;
  const respOld = oldTask.responsible_person_id;
  const newlyAssigned = respNew && respNew !== respOld ? respNew : null;

  // 1. Newly mentioned → person_mentioned (skip a person who is also newly assigned → they get
  //    the assignment event instead, mirroring assignment > mention precedence).
  for (const pid of newlyMentionedOnUpdate(oldTask, newTask)) {
    if (pid === newlyAssigned) continue;
    events.push({
      ...base,
      target_person_id: pid,
      event_type: 'person_mentioned',
      summary: `${actorName} mentioned you in ${taskLabel(newTask)}`,
      details: { ...baseDetails(newTask, actorName), snippet: mentionSnippet(newTask, pid, peopleById) },
    });
  }

  // 2. Responsible person changed → task_assigned to the new responsible person.
  if (newlyAssigned) {
    events.push({
      ...base,
      target_person_id: newlyAssigned,
      event_type: 'task_assigned',
      summary: `${actorName} assigned ${taskLabel(newTask)} to you`,
      details: { ...baseDetails(newTask, actorName), status: newTask.status ?? null, priority: newTask.priority ?? null, due_date: newTask.due_date ?? null },
    });
  }

  // 3. Field changes → the EXISTING responsible person (unchanged), self-suppressed when the
  //    actor IS that person (mirrors the update email's self-suppression).
  if (respNew && respNew === respOld && respNew !== actorPersonId) {
    const target = respNew;

    if ((oldTask.status ?? null) !== (newTask.status ?? null)) {
      events.push({
        ...base, target_person_id: target, event_type: 'status_changed',
        summary: `${actorName} changed status in ${taskLabel(newTask)} from ${statusLabel(oldTask.status)} to ${statusLabel(newTask.status)}`,
        details: { ...baseDetails(newTask, actorName), old: statusLabel(oldTask.status), new: statusLabel(newTask.status), old_raw: oldTask.status ?? null, new_raw: newTask.status ?? null },
      });
    }
    if (Number(oldTask.priority ?? NaN) !== Number(newTask.priority ?? NaN)) {
      events.push({
        ...base, target_person_id: target, event_type: 'priority_changed',
        summary: `${actorName} changed priority in ${taskLabel(newTask)} from ${oldTask.priority ?? '—'} to ${newTask.priority ?? '—'}`,
        details: { ...baseDetails(newTask, actorName), old: oldTask.priority ?? null, new: newTask.priority ?? null },
      });
    }
    if ((oldTask.due_date ?? '') !== (newTask.due_date ?? '')) {
      events.push({
        ...base, target_person_id: target, event_type: 'due_date_changed',
        summary: `${actorName} changed due date in ${taskLabel(newTask)} from ${oldTask.due_date ?? 'none'} to ${newTask.due_date ?? 'none'}`,
        details: { ...baseDetails(newTask, actorName), old: oldTask.due_date ?? null, new: newTask.due_date ?? null },
      });
    }
    if ((oldTask.closed_date ?? '') !== (newTask.closed_date ?? '')) {
      events.push({
        ...base, target_person_id: target, event_type: 'closed_date_changed',
        summary: `${actorName} changed closed date in ${taskLabel(newTask)} from ${oldTask.closed_date ?? 'none'} to ${newTask.closed_date ?? 'none'}`,
        details: { ...baseDetails(newTask, actorName), old: oldTask.closed_date ?? null, new: newTask.closed_date ?? null },
      });
    }

    // Description / Notes → one task_updated event listing the changed text fields, with the
    // added-text excerpt (reusing the email diff logic).
    const changes: FieldChange[] = [];
    if ((oldTask.description ?? '') !== (newTask.description ?? '')) {
      changes.push(computeFieldChange('Description', oldTask.description, newTask.description, peopleById));
    }
    if ((oldTask.notes ?? '') !== (newTask.notes ?? '')) {
      changes.push(computeFieldChange('Notes', oldTask.notes, newTask.notes, peopleById));
    }
    if (changes.length > 0) {
      const fieldNames = changes.map(c => c.field);
      events.push({
        ...base, target_person_id: target, event_type: 'task_updated',
        summary: `${actorName} updated ${fieldNames.join(' & ')} in ${taskLabel(newTask)}`,
        details: { ...baseDetails(newTask, actorName), changed_fields: fieldNames, changes },
      });
    }
  }

  return events;
}
