// Cloudflare Worker API (CRUD) backed directly by Cloudflare D1 (staging).
//
// On the cloudflare/full-migration branch this Worker reads/writes the D1 database
// `task-management-staging` (binding `DB`). There is NO DATA_BACKEND flag and NO Supabase
// at runtime — Supabase remains only as the source/rollback reference. Staging only.
//
// SECURITY: write endpoints have NO app-level auth yet. This is acceptable for
// staging/internal migration testing ONLY. Before any production exposure, auth/access
// control must be added (or an explicit risk decision documented).
//
// EMAIL: task create/update can trigger Resend notifications, but only when
// EMAIL_ENABLED === "true" AND Resend is configured. Default is DISABLED — see
// email.ts / docs/email-notifications.md. Email sending NEVER affects whether a task
// mutation succeeds (it runs detached via ctx.waitUntil and swallows its own errors).

import {
  type EmailEnv,
  type PersonRow,
  type TaskRow,
  computeCreateRecipients,
  computeUpdateRecipients,
  dispatchEmails,
  mentionSnippet,
  newlyMentionedOnCreate,
  newlyMentionedOnUpdate,
} from "./email";
import {
  type ActivityTaskRow,
  type PendingActivity,
  buildCreateActivity,
  buildUpdateActivity,
} from "./activity";

export interface Env extends EmailEnv {
  DB: D1Database;
}

// ── Constants (mirror the frontend's allowed values) ────────────────────────
const VALID_STATUSES = [
  "not_started",
  "in_progress",
  "on_hold",
  "need_to_review",
  "done",
];
const TASK_FIELDS = [
  "title",
  "description",
  "notes",
  "status",
  "priority",
  "responsible_person_id",
  "opened_by_person_id",
  "due_date",
  "closed_date",
  "archived",
] as const;
const PERSON_FIELDS = ["name", "email"] as const;

const ALLOWED_ORIGINS = new Set<string>([
  "https://task-management-system-3nm.pages.dev", // official Cloudflare production
  "https://production-candidate.task-management-system-3nm.pages.dev",
  "https://staging.task-management-system-3nm.pages.dev",
  "http://localhost:5173",
]);

// ── HTTP helpers ────────────────────────────────────────────────────────────
function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function jsonResponse(
  data: unknown,
  status: number,
  origin: string | null,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(origin),
    },
  });
}

function errorResponse(
  message: string,
  status: number,
  origin: string | null,
): Response {
  return jsonResponse({ error: message }, status, origin);
}

function handleCors(origin: string | null): Response {
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

async function parseJsonBody(
  request: Request,
): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (!text.trim()) return {};
  const parsed = JSON.parse(text); // throws on invalid JSON → caught by caller
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Body must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

// D1 stores `archived` as INTEGER 0/1; the API exposes it as a boolean.
function mapTaskRow(
  row: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!row) return row;
  return { ...row, archived: row.archived === 1 || row.archived === true };
}

// ── Email notifications (best-effort, default-disabled) ──────────────────────
// These helpers NEVER throw — they are run via ctx.waitUntil and must not affect the
// task mutation's success. When EMAIL_ENABLED !== "true" they short-circuit (and skip
// the people lookup) after logging a safe skip message.
async function loadPeopleById(env: Env): Promise<Map<string, PersonRow>> {
  const { results } = await env.DB.prepare(
    "SELECT id, name, email FROM people",
  ).all<PersonRow>();
  return new Map(results.map((p) => [p.id, p]));
}

// Resolves a person id to a name, or null when missing/unresolved.
function nameOf(
  personId: string | null | undefined,
  peopleById: Map<string, PersonRow>,
): string | null {
  return personId ? (peopleById.get(personId)?.name ?? null) : null;
}

// Actor for THIS action ("<actor> mentioned you in a task."). Prefers the request-supplied
// actor_person_id (the Current user) when it resolves to a known person; otherwise falls
// back to the opener (opened_by_person_id). An unresolved/invalid actor id is handled
// safely by this fallback — the request is never rejected for it. Returns null when nothing
// resolves → the mention email reads "Someone mentioned you in a task."
function actorNameFor(
  actorPersonId: string | null | undefined,
  task: TaskRow,
  peopleById: Map<string, PersonRow>,
): string | null {
  return (
    nameOf(actorPersonId, peopleById) ??
    nameOf(task.opened_by_person_id, peopleById)
  );
}

// "Opened by:" line — always the opener (opened_by_person_id), independent of the actor.
function openedByNameFor(
  task: TaskRow,
  peopleById: Map<string, PersonRow>,
): string | null {
  return nameOf(task.opened_by_person_id, peopleById);
}

async function scheduleCreateNotifications(
  env: Env,
  task: TaskRow,
  actorPersonId: string | null,
): Promise<void> {
  try {
    if (env.EMAIL_ENABLED !== "true") {
      console.log(
        '[email] skipped (EMAIL_ENABLED is not "true"): task created',
      );
      return;
    }
    const peopleById = await loadPeopleById(env);
    await dispatchEmails(
      env,
      computeCreateRecipients(task, peopleById),
      task,
      actorNameFor(actorPersonId, task, peopleById),
      openedByNameFor(task, peopleById),
    );
  } catch (err) {
    console.warn(
      "[email] create-notification error:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function scheduleUpdateNotifications(
  env: Env,
  oldTask: TaskRow,
  newTask: TaskRow,
  actorPersonId: string | null,
): Promise<void> {
  try {
    if (env.EMAIL_ENABLED !== "true") {
      console.log(
        '[email] skipped (EMAIL_ENABLED is not "true"): task updated',
      );
      return;
    }
    const peopleById = await loadPeopleById(env);
    await dispatchEmails(
      env,
      computeUpdateRecipients(oldTask, newTask, peopleById, actorPersonId),
      newTask,
      actorNameFor(actorPersonId, newTask, peopleById),
      openedByNameFor(newTask, peopleById),
    );
  } catch (err) {
    console.warn(
      "[email] update-notification error:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

// ── My Mentions notifications (best-effort, INDEPENDENT of email config) ─────
// Persists one mention_notifications row per NEWLY mentioned person on create/update so the
// "My Mentions" inbox can surface unread mentions. Unlike email, this runs regardless of
// EMAIL_ENABLED and regardless of whether the mentioned person has an email address — it is
// an in-app workflow feature. It NEVER throws (run via ctx.waitUntil) and must not affect the
// task mutation's success. If the table doesn't exist yet (migration not applied), each
// insert fails and is logged, but the task op already succeeded.
async function scheduleMentionNotifications(
  env: Env,
  taskId: string,
  task: TaskRow,
  mentionedIds: string[],
  actorPersonId: string | null,
): Promise<void> {
  try {
    if (mentionedIds.length === 0) return;
    if (task.task_number == null) return; // task_number is required by the table; tasks always have one
    const peopleById = await loadPeopleById(env);
    const now = new Date().toISOString();
    for (const personId of mentionedIds) {
      const snippet = mentionSnippet(task, personId, peopleById);
      try {
        await env.DB.prepare(
          `INSERT INTO mention_notifications
               (task_id, task_number, mentioned_person_id, actor_person_id, created_at, opened_at, source, snippet)
             VALUES (?, ?, ?, ?, ?, NULL, 'mention', ?)`,
        )
          .bind(taskId, task.task_number, personId, actorPersonId, now, snippet)
          .run();
      } catch (err) {
        console.warn(
          `[mentions] failed to insert notification (task ${task.task_number}, person ${personId}):`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  } catch (err) {
    console.warn(
      "[mentions] notification scheduling error:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

// ── Activity feed (best-effort, INDEPENDENT of email config) ─────────────────
// Persists chronological activity_events rows (one per target person) for the general
// Activity feed. Like My Mentions, this runs regardless of EMAIL_ENABLED, NEVER throws (run
// via ctx.waitUntil), and must not affect the task mutation's success. If the table doesn't
// exist yet (migration not applied), each insert fails and is logged, but the task op already
// succeeded.
// Per-user retention: keep only the newest N activity_events rows per target person.
const ACTIVITY_RETENTION_PER_TARGET = 50;

// Deletes all but the newest ACTIVITY_RETENTION_PER_TARGET rows for ONE target person
// (newest by created_at DESC, id DESC tie-breaker). Best-effort: logs and swallows errors so
// it never breaks a task mutation. Retention is keyed on target_person_id (the person the
// feed is FOR) — NOT actor_person_id. A null/empty target is skipped (never pruned), and it
// touches ONLY activity_events for THIS target — never other users, mention_notifications,
// tasks, or email data.
async function pruneActivityEventsForTarget(
  env: Env,
  targetPersonId: string | null | undefined,
): Promise<void> {
  if (!targetPersonId) return;
  try {
    await env.DB.prepare(
      `DELETE FROM activity_events
          WHERE target_person_id = ?
            AND id NOT IN (
              SELECT id FROM activity_events
               WHERE target_person_id = ?
               ORDER BY created_at DESC, id DESC
               LIMIT ${ACTIVITY_RETENTION_PER_TARGET}
            )`,
    )
      .bind(targetPersonId, targetPersonId)
      .run();
  } catch (err) {
    console.warn(
      `[activity] prune failed for target ${targetPersonId}:`,
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function insertActivityEvents(
  env: Env,
  events: PendingActivity[],
): Promise<void> {
  if (events.length === 0) return;
  const now = new Date().toISOString();
  for (const ev of events) {
    try {
      await env.DB.prepare(
        `INSERT INTO activity_events
             (task_id, task_number, actor_person_id, target_person_id, event_type, summary, details_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          ev.task_id,
          ev.task_number,
          ev.actor_person_id,
          ev.target_person_id,
          ev.event_type,
          ev.summary,
          ev.details ? JSON.stringify(ev.details) : null,
          now,
        )
        .run();
    } catch (err) {
      console.warn(
        `[activity] insert failed (task ${ev.task_number}, ${ev.event_type} → ${ev.target_person_id}):`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // After inserting, prune each AFFECTED target person ONCE so only the newest 50 remain.
  const targets = new Set<string>();
  for (const ev of events) {
    if (ev.target_person_id) targets.add(ev.target_person_id);
  }
  for (const targetPersonId of targets) {
    await pruneActivityEventsForTarget(env, targetPersonId);
  }
}

async function scheduleCreateActivity(
  env: Env,
  task: ActivityTaskRow,
  actorPersonId: string | null,
): Promise<void> {
  try {
    const peopleById = await loadPeopleById(env);
    await insertActivityEvents(
      env,
      buildCreateActivity(task, actorPersonId, peopleById),
    );
  } catch (err) {
    console.warn(
      "[activity] create scheduling error:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function scheduleUpdateActivity(
  env: Env,
  oldTask: ActivityTaskRow,
  newTask: ActivityTaskRow,
  actorPersonId: string | null,
): Promise<void> {
  try {
    const peopleById = await loadPeopleById(env);
    await insertActivityEvents(
      env,
      buildUpdateActivity(oldTask, newTask, actorPersonId, peopleById),
    );
  } catch (err) {
    console.warn(
      "[activity] update scheduling error:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

// ── Validation (unchanged contract) ─────────────────────────────────────────
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function normDate(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && ISO_DATE.test(value)) return value;
  throw new Error(`${field} must be null or an ISO date (YYYY-MM-DD)`);
}

function normPersonId(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") return value;
  throw new Error(`${field} must be a string id or null`);
}

// Pulls the optional `actor_person_id` out of a request body and REMOVES it, so the task
// field whitelist never sees it (it is the actor of this action, not a task column — it is
// never stored). Returns the id string, or null when absent/empty. A non-string value is a
// client error (400). An id that doesn't match a real person is NOT rejected here — it is
// resolved safely at email time (falls back to the opener).
function extractActorPersonId(body: Record<string, unknown>): string | null {
  if (!("actor_person_id" in body)) return null;
  const value = body.actor_person_id;
  delete body.actor_person_id;
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string")
    throw new Error("actor_person_id must be a string id or null");
  return value;
}

function rejectUnknownFields(
  body: Record<string, unknown>,
  allowed: readonly string[],
): void {
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) {
      // Catches id, task_number, created_at, updated_at and any typo.
      throw new Error(`Unknown or disallowed field: ${key}`);
    }
  }
}

function validateStatus(value: unknown): string {
  if (typeof value !== "string" || !VALID_STATUSES.includes(value)) {
    throw new Error(`status must be one of: ${VALID_STATUSES.join(", ")}`);
  }
  return value;
}

function validatePriority(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 5) {
    throw new Error("priority must be an integer between 1 and 5");
  }
  return n;
}

// Builds a validated payload for create (requireTitle) or patch. `archived` stays boolean
// here; it is converted to 0/1 at the SQL layer.
function buildTaskPayload(
  body: Record<string, unknown>,
  requireTitle: boolean,
): Record<string, unknown> {
  rejectUnknownFields(body, TASK_FIELDS);
  const out: Record<string, unknown> = {};

  if (requireTitle || "title" in body) {
    const title = body.title;
    if (typeof title !== "string" || title.trim() === "") {
      throw new Error("title is required and must be a non-empty string");
    }
    out.title = title.trim();
  }
  if ("description" in body) out.description = body.description ?? null;
  if ("notes" in body) out.notes = body.notes ?? null;
  if ("status" in body) out.status = validateStatus(body.status);
  if ("priority" in body) out.priority = validatePriority(body.priority);
  if ("responsible_person_id" in body)
    out.responsible_person_id = normPersonId(
      body.responsible_person_id,
      "responsible_person_id",
    );
  if ("opened_by_person_id" in body)
    out.opened_by_person_id = normPersonId(
      body.opened_by_person_id,
      "opened_by_person_id",
    );
  if ("due_date" in body) out.due_date = normDate(body.due_date, "due_date");
  if ("closed_date" in body)
    out.closed_date = normDate(body.closed_date, "closed_date");
  if ("archived" in body) {
    if (typeof body.archived !== "boolean")
      throw new Error("archived must be a boolean");
    out.archived = body.archived;
  }
  return out;
}

// ── D1 route handlers ────────────────────────────────────────────────────────
async function listPeople(env: Env, origin: string | null): Promise<Response> {
  const { results } = await env.DB.prepare(
    "SELECT * FROM people ORDER BY name ASC",
  ).all();
  return jsonResponse(results, 200, origin);
}

async function listTasks(
  env: Env,
  activeOnly: boolean,
  origin: string | null,
): Promise<Response> {
  const sql = `SELECT * FROM tasks${activeOnly ? " WHERE archived = 0" : ""} ORDER BY priority ASC`;
  const { results } = await env.DB.prepare(sql).all<Record<string, unknown>>();
  return jsonResponse(results.map(mapTaskRow), 200, origin);
}

async function createPerson(
  env: Env,
  body: Record<string, unknown>,
  origin: string | null,
): Promise<Response> {
  rejectUnknownFields(body, PERSON_FIELDS);
  const name = body.name;
  if (typeof name !== "string" || name.trim() === "") {
    return errorResponse(
      "name is required and must be a non-empty string",
      400,
      origin,
    );
  }
  const email = "email" in body ? (body.email ?? null) : null;
  const row = await env.DB.prepare(
    "INSERT INTO people (id, name, email, created_at) VALUES (?, ?, ?, ?) RETURNING *",
  )
    .bind(crypto.randomUUID(), name.trim(), email, new Date().toISOString())
    .first<Record<string, unknown>>();
  return jsonResponse(row, 201, origin);
}

async function createTask(
  env: Env,
  body: Record<string, unknown>,
  actorPersonId: string | null,
  origin: string | null,
  ctx: ExecutionContext,
): Promise<Response> {
  const p = buildTaskPayload(body, true);
  // Next task_number = max + 1. Racy under concurrency — fine for staging/internal use;
  // production would need a sequence/atomic counter.
  const maxRow = await env.DB.prepare(
    "SELECT MAX(task_number) AS m FROM tasks",
  ).first<{ m: number | null }>();
  const nextNumber = (maxRow?.m ?? 0) + 1;
  const now = new Date().toISOString();
  const archived = p.archived === true ? 1 : 0;

  const row = await env.DB.prepare(
    `INSERT INTO tasks
        (id, task_number, title, description, notes, status, priority,
         responsible_person_id, opened_by_person_id, due_date, closed_date,
         archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(
      crypto.randomUUID(),
      nextNumber,
      p.title,
      p.description ?? null,
      p.notes ?? null,
      (p.status as string | undefined) ?? "not_started",
      (p.priority as number | undefined) ?? 3,
      p.responsible_person_id ?? null,
      p.opened_by_person_id ?? null,
      p.due_date ?? null,
      p.closed_date ?? null,
      archived,
      now,
      now,
    )
    .first<Record<string, unknown>>();

  // Notify (responsible assignment + mentions) detached from the response. Safe no-op
  // when email is disabled; never affects the 201 just produced.
  if (row) {
    ctx.waitUntil(
      scheduleCreateNotifications(env, row as TaskRow, actorPersonId),
    );
    // Persist My-Mentions rows for everyone mentioned in the new task (runs regardless of
    // email config). Detached; never affects the response.
    ctx.waitUntil(
      scheduleMentionNotifications(
        env,
        row.id as string,
        row as TaskRow,
        newlyMentionedOnCreate(row as TaskRow),
        actorPersonId,
      ),
    );
    // Persist Activity feed events (assignment / mention / created). Independent of email
    // config; detached; never affects the response.
    ctx.waitUntil(
      scheduleCreateActivity(env, row as ActivityTaskRow, actorPersonId),
    );
  }

  return jsonResponse(mapTaskRow(row), 201, origin);
}

async function patchTask(
  env: Env,
  id: string,
  payload: Record<string, unknown>,
  actorPersonId: string | null,
  origin: string | null,
  ctx: ExecutionContext,
): Promise<Response> {
  if (Object.keys(payload).length === 0) {
    return errorResponse("No editable fields supplied", 400, origin);
  }
  // Snapshot the pre-update row. Always needed now: the Activity feed diffs ANY field
  // (status/priority/dates/archived/desc/notes/responsible), and it is also reused for the
  // email recipients and the My-Mentions newly-mentioned detection. One indexed PK lookup.
  const emailEnabled = env.EMAIL_ENABLED === "true";
  const tracksMentions = "description" in payload || "notes" in payload;
  const oldRow = await env.DB.prepare("SELECT * FROM tasks WHERE id = ?")
    .bind(id)
    .first<Record<string, unknown>>();
  // Column names come only from the validated TASK_FIELDS whitelist → safe to interpolate.
  const sets: string[] = [];
  const binds: unknown[] = [];
  for (const [key, value] of Object.entries(payload)) {
    if (key === "archived") {
      sets.push("archived = ?");
      binds.push(value === true ? 1 : 0);
    } else {
      sets.push(`${key} = ?`);
      binds.push(value ?? null);
    }
  }
  sets.push("updated_at = ?");
  binds.push(new Date().toISOString());
  binds.push(id);

  const row = await env.DB.prepare(
    `UPDATE tasks SET ${sets.join(", ")} WHERE id = ? RETURNING *`,
  )
    .bind(...binds)
    .first<Record<string, unknown>>();
  if (!row) return errorResponse("Task not found", 404, origin);

  // Notify only the NEW responsible person (if changed) and NEWLY mentioned people.
  // Detached; safe no-op when email is disabled.
  if (oldRow) {
    if (emailEnabled) {
      ctx.waitUntil(
        scheduleUpdateNotifications(
          env,
          oldRow as TaskRow,
          row as TaskRow,
          actorPersonId,
        ),
      );
    }
    // Persist My-Mentions rows for people mentioned by THIS edit but not before it. Runs
    // regardless of email config; archive/restore never reach here (no Description/Notes).
    if (tracksMentions) {
      const newIds = newlyMentionedOnUpdate(oldRow as TaskRow, row as TaskRow);
      ctx.waitUntil(
        scheduleMentionNotifications(
          env,
          row.id as string,
          row as TaskRow,
          newIds,
          actorPersonId,
        ),
      );
    }
    // Persist Activity feed events (mention / assignment / field changes / archive-restore).
    // Independent of email config; detached; never affects the response.
    ctx.waitUntil(
      scheduleUpdateActivity(
        env,
        oldRow as ActivityTaskRow,
        row as ActivityTaskRow,
        actorPersonId,
      ),
    );
  }

  return jsonResponse(mapTaskRow(row), 200, origin);
}

// ── My Mentions endpoints ────────────────────────────────────────────────────
// Identity is the `person_id` query/body param sourced from the app's "Current user"
// selector. This is a lightweight workflow identity, NOT authentication — anyone can pass
// any person_id. Accepted as the current (no-auth) design; documented in the docs.

// GET /api/mentions?person_id=<id>&status=unread|all  (default unread, newest first).
async function listMentions(
  env: Env,
  personId: string | null,
  status: string | null,
  origin: string | null,
): Promise<Response> {
  if (!personId) return errorResponse("person_id is required", 400, origin);
  const unreadOnly = status !== "all"; // default (and any value other than "all") → unread only
  const sql = `SELECT n.id, n.task_id, n.task_number, n.mentioned_person_id, n.actor_person_id,
            n.created_at, n.opened_at, n.snippet, n.source,
            t.title AS task_title, t.archived AS task_archived,
            ap.name AS actor_name
       FROM mention_notifications n
       LEFT JOIN tasks  t  ON t.id  = n.task_id
       LEFT JOIN people ap ON ap.id = n.actor_person_id
      WHERE n.mentioned_person_id = ?${unreadOnly ? " AND n.opened_at IS NULL" : ""}
      ORDER BY n.created_at DESC, n.id DESC`;
  const { results } = await env.DB.prepare(sql)
    .bind(personId)
    .all<Record<string, unknown>>();
  // Expose archived as a boolean (D1 stores 0/1), mirroring mapTaskRow.
  const mapped = results.map((r) => ({
    ...r,
    task_archived: r.task_archived === 1 || r.task_archived === true,
  }));
  return jsonResponse(mapped, 200, origin);
}

// GET /api/mentions/count?person_id=<id> → { count } of unread mentions.
async function countMentions(
  env: Env,
  personId: string | null,
  origin: string | null,
): Promise<Response> {
  if (!personId) return errorResponse("person_id is required", 400, origin);
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM mention_notifications WHERE mentioned_person_id = ? AND opened_at IS NULL",
  )
    .bind(personId)
    .first<{ c: number }>();
  return jsonResponse({ count: row?.c ?? 0 }, 200, origin);
}

// POST/PATCH /api/mentions/:id/open  body { person_id } → marks opened_at (idempotent).
// Since there is no auth, person_id is validated to equal the row's mentioned_person_id;
// a mismatch is rejected (403) so one person cannot mark another's mention opened.
async function openMention(
  env: Env,
  id: string,
  body: Record<string, unknown>,
  origin: string | null,
): Promise<Response> {
  const personId = typeof body.person_id === "string" ? body.person_id : "";
  if (!personId) return errorResponse("person_id is required", 400, origin);
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0)
    return errorResponse("Invalid mention id", 400, origin);

  const row = await env.DB.prepare(
    "SELECT id, mentioned_person_id, opened_at FROM mention_notifications WHERE id = ?",
  )
    .bind(numId)
    .first<{
      id: number;
      mentioned_person_id: string;
      opened_at: string | null;
    }>();
  if (!row) return errorResponse("Mention not found", 404, origin);
  if (row.mentioned_person_id !== personId) {
    return errorResponse(
      "person_id does not match the mentioned person",
      403,
      origin,
    );
  }
  if (row.opened_at)
    return jsonResponse({ ok: true, alreadyOpened: true }, 200, origin); // idempotent

  await env.DB.prepare(
    "UPDATE mention_notifications SET opened_at = ? WHERE id = ?",
  )
    .bind(new Date().toISOString(), numId)
    .run();
  return jsonResponse({ ok: true }, 200, origin);
}

// ── Activity feed endpoints ──────────────────────────────────────────────────
// Identity is the `person_id` query param sourced from the app's "Current user" selector — a
// lightweight workflow identity, NOT authentication (any person_id is accepted). Activity is
// a read-only history list (no unread/read state); My Mentions remains the unread inbox.

// GET /api/activity?person_id=&limit=&event_type=&actor_person_id=&from=&to=&q=
async function listActivity(
  env: Env,
  params: URLSearchParams,
  origin: string | null,
): Promise<Response> {
  const personId = params.get("person_id");
  if (!personId) return errorResponse("person_id is required", 400, origin);

  // limit: default 50, clamped to 1..200.
  const rawLimit = Number(params.get("limit"));
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), 200)
      : 50;

  const where: string[] = ["a.target_person_id = ?"];
  const binds: unknown[] = [personId];

  const eventType = params.get("event_type");
  if (eventType) {
    where.push("a.event_type = ?");
    binds.push(eventType);
  }

  const actor = params.get("actor_person_id");
  if (actor) {
    where.push("a.actor_person_id = ?");
    binds.push(actor);
  }

  // Date range over created_at (ISO strings compare lexicographically). A date-only `to` is
  // extended to the end of that day so the whole day is included.
  const from = params.get("from");
  if (from) {
    where.push("a.created_at >= ?");
    binds.push(from);
  }
  const to = params.get("to");
  if (to) {
    where.push("a.created_at <= ?");
    binds.push(to.length === 10 ? `${to}T23:59:59.999Z` : to);
  }

  // Free-text search over task title, summary, details, and the task number/key.
  const q = params.get("q");
  if (q && q.trim() !== "") {
    const like = `%${q.trim()}%`;
    where.push(
      "(t.title LIKE ? OR a.summary LIKE ? OR a.details_json LIKE ? OR CAST(a.task_number AS TEXT) LIKE ?)",
    );
    binds.push(like, like, like, like);
  }

  const sql = `SELECT a.id, a.task_id, a.task_number, a.actor_person_id, a.target_person_id,
            a.event_type, a.summary, a.details_json, a.created_at,
            t.title AS task_title, t.archived AS task_archived,
            ap.name AS actor_name, tp.name AS target_name
       FROM activity_events a
       LEFT JOIN tasks  t  ON t.id  = a.task_id
       LEFT JOIN people ap ON ap.id = a.actor_person_id
       LEFT JOIN people tp ON tp.id = a.target_person_id
      WHERE ${where.join(" AND ")}
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT ?`;
  binds.push(limit);

  const { results } = await env.DB.prepare(sql)
    .bind(...binds)
    .all<Record<string, unknown>>();
  const mapped = results.map((r) => {
    let details: unknown = null;
    if (typeof r.details_json === "string" && r.details_json) {
      try {
        details = JSON.parse(r.details_json);
      } catch {
        details = null;
      }
    }
    return {
      ...r,
      task_archived: r.task_archived === 1 || r.task_archived === true,
      details,
    };
  });
  return jsonResponse(mapped, 200, origin);
}

// GET /api/activity/count?person_id=<id> → { count } total activity events for that person.
// Activity has NO unread/read concept; this is a plain total (the UI does not show an
// always-on bell badge). Provided for completeness.
async function countActivity(
  env: Env,
  personId: string | null,
  origin: string | null,
): Promise<Response> {
  if (!personId) return errorResponse("person_id is required", 400, origin);
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM activity_events WHERE target_person_id = ?",
  )
    .bind(personId)
    .first<{ c: number }>();
  return jsonResponse({ count: row?.c ?? 0 }, 200, origin);
}

// ── Router ──────────────────────────────────────────────────────────────────
export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const origin = request.headers.get("Origin");
    const { pathname, searchParams } = new URL(request.url);
    const method = request.method;

    if (method === "OPTIONS") return handleCors(origin);

    if (pathname === "/health" && method === "GET") {
      return jsonResponse(
        {
          ok: true,
          service: "task-management-api",
          db: "d1",
          timestamp: new Date().toISOString(),
        },
        200,
        origin,
      );
    }

    const parts = pathname.split("/").filter(Boolean); // e.g. ['api','tasks','<id>','archive']
    if (parts[0] !== "api") return errorResponse("Not Found", 404, origin);

    if (!env.DB) {
      return errorResponse(
        'Server not configured: D1 binding "DB" missing',
        503,
        origin,
      );
    }

    try {
      // /api/people
      if (parts[1] === "people" && parts.length === 2) {
        if (method === "GET") return await listPeople(env, origin);
        if (method === "POST")
          return await createPerson(env, await parseJsonBody(request), origin);
        return errorResponse("Method Not Allowed", 405, origin);
      }

      // /api/tasks
      if (parts[1] === "tasks") {
        if (parts.length === 2) {
          if (method === "GET") {
            // Default (and ?include_archived=true|1) returns ALL tasks (the frontend filters
            // client-side). ?include_archived=false|0 narrows to active tasks only.
            const ia = searchParams.get("include_archived");
            const activeOnly = ia === "false" || ia === "0";
            return await listTasks(env, activeOnly, origin);
          }
          if (method === "POST") {
            const body = await parseJsonBody(request);
            const actorPersonId = extractActorPersonId(body);
            return await createTask(env, body, actorPersonId, origin, ctx);
          }
          return errorResponse("Method Not Allowed", 405, origin);
        }
        const id = parts[2];
        // /api/tasks/:id
        if (parts.length === 3) {
          if (method === "PATCH") {
            const body = await parseJsonBody(request);
            const actorPersonId = extractActorPersonId(body);
            const payload = buildTaskPayload(body, false);
            return await patchTask(
              env,
              id,
              payload,
              actorPersonId,
              origin,
              ctx,
            );
          }
          return errorResponse("Method Not Allowed", 405, origin);
        }
        // /api/tasks/:id/archive | /api/tasks/:id/restore — no actor (no mention change).
        if (parts.length === 4 && method === "POST") {
          if (parts[3] === "archive")
            return await patchTask(
              env,
              id,
              { archived: true },
              null,
              origin,
              ctx,
            );
          if (parts[3] === "restore")
            return await patchTask(
              env,
              id,
              { archived: false },
              null,
              origin,
              ctx,
            );
        }
        return errorResponse("Not Found", 404, origin);
      }

      // /api/mentions — My Mentions inbox (lightweight Current-user identity, not auth).
      if (parts[1] === "mentions") {
        // /api/mentions?person_id=&status=
        if (parts.length === 2 && method === "GET") {
          return await listMentions(
            env,
            searchParams.get("person_id"),
            searchParams.get("status"),
            origin,
          );
        }
        // /api/mentions/count?person_id=
        if (parts.length === 3 && parts[2] === "count" && method === "GET") {
          return await countMentions(
            env,
            searchParams.get("person_id"),
            origin,
          );
        }
        // /api/mentions/:id/open
        if (
          parts.length === 4 &&
          parts[3] === "open" &&
          (method === "POST" || method === "PATCH")
        ) {
          return await openMention(
            env,
            parts[2],
            await parseJsonBody(request),
            origin,
          );
        }
        return errorResponse("Not Found", 404, origin);
      }

      // /api/activity — general Activity feed (read-only history; Current-user identity, not auth).
      if (parts[1] === "activity") {
        if (parts.length === 2 && method === "GET") {
          return await listActivity(env, searchParams, origin);
        }
        if (parts.length === 3 && parts[2] === "count" && method === "GET") {
          return await countActivity(
            env,
            searchParams.get("person_id"),
            origin,
          );
        }
        return errorResponse("Not Found", 404, origin);
      }

      return errorResponse("Not Found", 404, origin);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isClientError =
        message.startsWith("Unknown or disallowed field") ||
        message.includes("must be") ||
        message.includes("is required") ||
        message.includes("JSON");
      if (isClientError) return errorResponse(message, 400, origin);
      console.error("[worker] unexpected error:", message);
      return errorResponse("Internal Server Error", 500, origin);
    }
  },
};
