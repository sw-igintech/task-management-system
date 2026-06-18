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
} from './email';

export interface Env extends EmailEnv {
  DB: D1Database;
}

// ── Constants (mirror the frontend's allowed values) ────────────────────────
const VALID_STATUSES = ['not_started', 'in_progress', 'on_hold', 'need_to_review', 'done'];
const TASK_FIELDS = [
  'title', 'description', 'notes', 'status', 'priority',
  'responsible_person_id', 'opened_by_person_id', 'due_date', 'closed_date', 'archived',
] as const;
const PERSON_FIELDS = ['name', 'email'] as const;

const ALLOWED_ORIGINS = new Set<string>([
  'https://task-management-system-3nm.pages.dev', // official Cloudflare production
  'https://production-candidate.task-management-system-3nm.pages.dev',
  'https://staging.task-management-system-3nm.pages.dev',
  'http://localhost:5173',
]);

// ── HTTP helpers ────────────────────────────────────────────────────────────
function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function jsonResponse(data: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(origin) },
  });
}

function errorResponse(message: string, status: number, origin: string | null): Response {
  return jsonResponse({ error: message }, status, origin);
}

function handleCors(origin: string | null): Response {
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

async function parseJsonBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (!text.trim()) return {};
  const parsed = JSON.parse(text); // throws on invalid JSON → caught by caller
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Body must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

// D1 stores `archived` as INTEGER 0/1; the API exposes it as a boolean.
function mapTaskRow(row: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!row) return row;
  return { ...row, archived: row.archived === 1 || row.archived === true };
}

// ── Email notifications (best-effort, default-disabled) ──────────────────────
// These helpers NEVER throw — they are run via ctx.waitUntil and must not affect the
// task mutation's success. When EMAIL_ENABLED !== "true" they short-circuit (and skip
// the people lookup) after logging a safe skip message.
async function loadPeopleById(env: Env): Promise<Map<string, PersonRow>> {
  const { results } = await env.DB.prepare('SELECT id, name, email FROM people').all<PersonRow>();
  return new Map(results.map(p => [p.id, p]));
}

async function scheduleCreateNotifications(env: Env, task: TaskRow): Promise<void> {
  try {
    if (env.EMAIL_ENABLED !== 'true') {
      console.log('[email] skipped (EMAIL_ENABLED is not "true"): task created');
      return;
    }
    const peopleById = await loadPeopleById(env);
    await dispatchEmails(env, computeCreateRecipients(task, peopleById), task);
  } catch (err) {
    console.warn('[email] create-notification error:', err instanceof Error ? err.message : String(err));
  }
}

async function scheduleUpdateNotifications(env: Env, oldTask: TaskRow, newTask: TaskRow): Promise<void> {
  try {
    if (env.EMAIL_ENABLED !== 'true') {
      console.log('[email] skipped (EMAIL_ENABLED is not "true"): task updated');
      return;
    }
    const peopleById = await loadPeopleById(env);
    await dispatchEmails(env, computeUpdateRecipients(oldTask, newTask, peopleById), newTask);
  } catch (err) {
    console.warn('[email] update-notification error:', err instanceof Error ? err.message : String(err));
  }
}

// ── Validation (unchanged contract) ─────────────────────────────────────────
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function normDate(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string' && ISO_DATE.test(value)) return value;
  throw new Error(`${field} must be null or an ISO date (YYYY-MM-DD)`);
}

function normPersonId(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') return value;
  throw new Error(`${field} must be a string id or null`);
}

function rejectUnknownFields(body: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) {
      // Catches id, task_number, created_at, updated_at and any typo.
      throw new Error(`Unknown or disallowed field: ${key}`);
    }
  }
}

function validateStatus(value: unknown): string {
  if (typeof value !== 'string' || !VALID_STATUSES.includes(value)) {
    throw new Error(`status must be one of: ${VALID_STATUSES.join(', ')}`);
  }
  return value;
}

function validatePriority(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 5) {
    throw new Error('priority must be an integer between 1 and 5');
  }
  return n;
}

// Builds a validated payload for create (requireTitle) or patch. `archived` stays boolean
// here; it is converted to 0/1 at the SQL layer.
function buildTaskPayload(body: Record<string, unknown>, requireTitle: boolean): Record<string, unknown> {
  rejectUnknownFields(body, TASK_FIELDS);
  const out: Record<string, unknown> = {};

  if (requireTitle || 'title' in body) {
    const title = body.title;
    if (typeof title !== 'string' || title.trim() === '') {
      throw new Error('title is required and must be a non-empty string');
    }
    out.title = title.trim();
  }
  if ('description' in body) out.description = body.description ?? null;
  if ('notes' in body) out.notes = body.notes ?? null;
  if ('status' in body) out.status = validateStatus(body.status);
  if ('priority' in body) out.priority = validatePriority(body.priority);
  if ('responsible_person_id' in body) out.responsible_person_id = normPersonId(body.responsible_person_id, 'responsible_person_id');
  if ('opened_by_person_id' in body) out.opened_by_person_id = normPersonId(body.opened_by_person_id, 'opened_by_person_id');
  if ('due_date' in body) out.due_date = normDate(body.due_date, 'due_date');
  if ('closed_date' in body) out.closed_date = normDate(body.closed_date, 'closed_date');
  if ('archived' in body) {
    if (typeof body.archived !== 'boolean') throw new Error('archived must be a boolean');
    out.archived = body.archived;
  }
  return out;
}

// ── D1 route handlers ────────────────────────────────────────────────────────
async function listPeople(env: Env, origin: string | null): Promise<Response> {
  const { results } = await env.DB.prepare('SELECT * FROM people ORDER BY name ASC').all();
  return jsonResponse(results, 200, origin);
}

async function listTasks(env: Env, activeOnly: boolean, origin: string | null): Promise<Response> {
  const sql = `SELECT * FROM tasks${activeOnly ? ' WHERE archived = 0' : ''} ORDER BY priority ASC`;
  const { results } = await env.DB.prepare(sql).all<Record<string, unknown>>();
  return jsonResponse(results.map(mapTaskRow), 200, origin);
}

async function createPerson(env: Env, body: Record<string, unknown>, origin: string | null): Promise<Response> {
  rejectUnknownFields(body, PERSON_FIELDS);
  const name = body.name;
  if (typeof name !== 'string' || name.trim() === '') {
    return errorResponse('name is required and must be a non-empty string', 400, origin);
  }
  const email = 'email' in body ? (body.email ?? null) : null;
  const row = await env.DB
    .prepare('INSERT INTO people (id, name, email, created_at) VALUES (?, ?, ?, ?) RETURNING *')
    .bind(crypto.randomUUID(), name.trim(), email, new Date().toISOString())
    .first<Record<string, unknown>>();
  return jsonResponse(row, 201, origin);
}

async function createTask(env: Env, body: Record<string, unknown>, origin: string | null, ctx: ExecutionContext): Promise<Response> {
  const p = buildTaskPayload(body, true);
  // Next task_number = max + 1. Racy under concurrency — fine for staging/internal use;
  // production would need a sequence/atomic counter.
  const maxRow = await env.DB.prepare('SELECT MAX(task_number) AS m FROM tasks').first<{ m: number | null }>();
  const nextNumber = (maxRow?.m ?? 0) + 1;
  const now = new Date().toISOString();
  const archived = p.archived === true ? 1 : 0;

  const row = await env.DB
    .prepare(
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
      (p.status as string | undefined) ?? 'not_started',
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
  if (row) ctx.waitUntil(scheduleCreateNotifications(env, row as TaskRow));

  return jsonResponse(mapTaskRow(row), 201, origin);
}

async function patchTask(env: Env, id: string, payload: Record<string, unknown>, origin: string | null, ctx: ExecutionContext): Promise<Response> {
  if (Object.keys(payload).length === 0) {
    return errorResponse('No editable fields supplied', 400, origin);
  }
  // Snapshot the pre-update row ONLY when email is on, so we can diff responsible/mentions.
  // When email is disabled (the default) this read is skipped entirely.
  const emailEnabled = env.EMAIL_ENABLED === 'true';
  const oldRow = emailEnabled
    ? await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first<Record<string, unknown>>()
    : null;
  // Column names come only from the validated TASK_FIELDS whitelist → safe to interpolate.
  const sets: string[] = [];
  const binds: unknown[] = [];
  for (const [key, value] of Object.entries(payload)) {
    if (key === 'archived') {
      sets.push('archived = ?');
      binds.push(value === true ? 1 : 0);
    } else {
      sets.push(`${key} = ?`);
      binds.push(value ?? null);
    }
  }
  sets.push('updated_at = ?');
  binds.push(new Date().toISOString());
  binds.push(id);

  const row = await env.DB
    .prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ? RETURNING *`)
    .bind(...binds)
    .first<Record<string, unknown>>();
  if (!row) return errorResponse('Task not found', 404, origin);

  // Notify only the NEW responsible person (if changed) and NEWLY mentioned people.
  // Detached; safe no-op when email is disabled.
  if (oldRow) {
    ctx.waitUntil(scheduleUpdateNotifications(env, oldRow as TaskRow, row as TaskRow));
  }

  return jsonResponse(mapTaskRow(row), 200, origin);
}

// ── Router ──────────────────────────────────────────────────────────────────
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const origin = request.headers.get('Origin');
    const { pathname, searchParams } = new URL(request.url);
    const method = request.method;

    if (method === 'OPTIONS') return handleCors(origin);

    if (pathname === '/health' && method === 'GET') {
      return jsonResponse(
        { ok: true, service: 'task-management-api', db: 'd1', timestamp: new Date().toISOString() },
        200,
        origin,
      );
    }

    const parts = pathname.split('/').filter(Boolean); // e.g. ['api','tasks','<id>','archive']
    if (parts[0] !== 'api') return errorResponse('Not Found', 404, origin);

    if (!env.DB) {
      return errorResponse('Server not configured: D1 binding "DB" missing', 503, origin);
    }

    try {
      // /api/people
      if (parts[1] === 'people' && parts.length === 2) {
        if (method === 'GET') return await listPeople(env, origin);
        if (method === 'POST') return await createPerson(env, await parseJsonBody(request), origin);
        return errorResponse('Method Not Allowed', 405, origin);
      }

      // /api/tasks
      if (parts[1] === 'tasks') {
        if (parts.length === 2) {
          if (method === 'GET') {
            // Default (and ?include_archived=true|1) returns ALL tasks (the frontend filters
            // client-side). ?include_archived=false|0 narrows to active tasks only.
            const ia = searchParams.get('include_archived');
            const activeOnly = ia === 'false' || ia === '0';
            return await listTasks(env, activeOnly, origin);
          }
          if (method === 'POST') return await createTask(env, await parseJsonBody(request), origin, ctx);
          return errorResponse('Method Not Allowed', 405, origin);
        }
        const id = parts[2];
        // /api/tasks/:id
        if (parts.length === 3) {
          if (method === 'PATCH') {
            const payload = buildTaskPayload(await parseJsonBody(request), false);
            return await patchTask(env, id, payload, origin, ctx);
          }
          return errorResponse('Method Not Allowed', 405, origin);
        }
        // /api/tasks/:id/archive | /api/tasks/:id/restore
        if (parts.length === 4 && method === 'POST') {
          if (parts[3] === 'archive') return await patchTask(env, id, { archived: true }, origin, ctx);
          if (parts[3] === 'restore') return await patchTask(env, id, { archived: false }, origin, ctx);
        }
        return errorResponse('Not Found', 404, origin);
      }

      return errorResponse('Not Found', 404, origin);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isClientError =
        message.startsWith('Unknown or disallowed field') ||
        message.includes('must be') ||
        message.includes('is required') ||
        message.includes('JSON');
      if (isClientError) return errorResponse(message, 400, origin);
      console.error('[worker] unexpected error:', message);
      return errorResponse('Internal Server Error', 500, origin);
    }
  },
};
