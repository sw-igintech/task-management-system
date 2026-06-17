// Cloudflare Worker API (CRUD) in front of Supabase.
//
// Migration step: this Worker mirrors the task/person operations the frontend uses,
// so the frontend can later be switched to it safely. The frontend is NOT switched
// yet — it still talks to Supabase directly. No D1, no email.
//
// SECURITY: uses the Supabase SERVICE ROLE key (server-side secret, bypasses RLS).
// It is read from a Worker secret binding — never committed, logged, or returned to
// clients. There is NO app-level auth yet, so this is a STAGING/INTERNAL migration API
// only; write endpoints must be protected before any public/production exposure.

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

// ── Constants (mirror the frontend's allowed values) ────────────────────────
const VALID_STATUSES = ['not_started', 'in_progress', 'on_hold', 'need_to_review', 'done'];
const TASK_FIELDS = [
  'title', 'description', 'notes', 'status', 'priority',
  'responsible_person_id', 'opened_by_person_id', 'due_date', 'closed_date', 'archived',
] as const;
const PERSON_FIELDS = ['name', 'email'] as const;

const ALLOWED_ORIGINS = new Set<string>([
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

// ── Supabase REST (PostgREST) wrapper ───────────────────────────────────────
async function sb(
  env: Env,
  method: string,
  pathAndQuery: string,
  body?: unknown,
  prefer?: string,
): Promise<Response> {
  const headers: Record<string, string> = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    Accept: 'application/json',
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers['Prefer'] = prefer;
  return fetch(`${env.SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// Reads the upstream body and returns a safe error response. PostgREST messages
// don't contain secrets; we truncate and also log server-side for debugging.
async function upstreamError(res: Response, origin: string | null): Promise<Response> {
  const detail = (await res.text()).slice(0, 300);
  console.error(`[supabase] ${res.status}: ${detail}`);
  return jsonResponse({ error: 'Database request failed', status: res.status, detail }, 502, origin);
}

// ── Validation ──────────────────────────────────────────────────────────────
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Normalizes/validates a date field: '' → null; null → null; 'YYYY-MM-DD' ok.
function normDate(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string' && ISO_DATE.test(value)) return value;
  throw new Error(`${field} must be null or an ISO date (YYYY-MM-DD)`);
}

// Optional person id: '' → null; null → null; non-empty string ok.
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

// Builds a validated DB payload for create (requireTitle) or patch.
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

// ── Route handlers ──────────────────────────────────────────────────────────
async function listTable(env: Env, table: string, order: string, origin: string | null): Promise<Response> {
  const res = await sb(env, 'GET', `${table}?select=*&order=${order}`);
  if (!res.ok) return upstreamError(res, origin);
  return jsonResponse(await res.json(), 200, origin);
}

async function createPerson(env: Env, body: Record<string, unknown>, origin: string | null): Promise<Response> {
  rejectUnknownFields(body, PERSON_FIELDS);
  const name = body.name;
  if (typeof name !== 'string' || name.trim() === '') {
    return errorResponse('name is required and must be a non-empty string', 400, origin);
  }
  const payload: Record<string, unknown> = { name: name.trim() };
  if ('email' in body) payload.email = body.email ?? null;

  const res = await sb(env, 'POST', 'people', [payload], 'return=representation');
  if (!res.ok) return upstreamError(res, origin);
  const rows = (await res.json()) as unknown[];
  return jsonResponse(rows[0] ?? null, 201, origin);
}

async function createTask(env: Env, body: Record<string, unknown>, origin: string | null): Promise<Response> {
  const payload = buildTaskPayload(body, true);
  if (!('archived' in payload)) payload.archived = false; // default; id/task_number/timestamps are DB-managed
  const res = await sb(env, 'POST', 'tasks', [payload], 'return=representation');
  if (!res.ok) return upstreamError(res, origin);
  const rows = (await res.json()) as unknown[];
  return jsonResponse(rows[0] ?? null, 201, origin);
}

async function patchTask(env: Env, id: string, payload: Record<string, unknown>, origin: string | null): Promise<Response> {
  if (Object.keys(payload).length === 0) {
    return errorResponse('No editable fields supplied', 400, origin);
  }
  const res = await sb(env, 'PATCH', `tasks?id=eq.${encodeURIComponent(id)}`, payload, 'return=representation');
  if (!res.ok) return upstreamError(res, origin);
  const rows = (await res.json()) as unknown[];
  if (rows.length === 0) return errorResponse('Task not found', 404, origin);
  return jsonResponse(rows[0], 200, origin);
}

// ── Router ──────────────────────────────────────────────────────────────────
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    const { pathname } = new URL(request.url);
    const method = request.method;

    if (method === 'OPTIONS') return handleCors(origin);

    // Health needs no DB config.
    if (pathname === '/health' && method === 'GET') {
      return jsonResponse(
        { ok: true, service: 'task-management-api', db: 'supabase', timestamp: new Date().toISOString() },
        200,
        origin,
      );
    }

    const parts = pathname.split('/').filter(Boolean); // e.g. ['api','tasks','<id>','archive']
    if (parts[0] !== 'api') return errorResponse('Not Found', 404, origin);

    // All /api/* endpoints need server config.
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      return errorResponse('Server not configured: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing', 503, origin);
    }

    try {
      // /api/people
      if (parts[1] === 'people' && parts.length === 2) {
        if (method === 'GET') return await listTable(env, 'people', 'name.asc', origin);
        if (method === 'POST') return await createPerson(env, await parseJsonBody(request), origin);
        return errorResponse('Method Not Allowed', 405, origin);
      }

      // /api/tasks
      if (parts[1] === 'tasks') {
        if (parts.length === 2) {
          if (method === 'GET') return await listTable(env, 'tasks', 'priority.asc', origin);
          if (method === 'POST') return await createTask(env, await parseJsonBody(request), origin);
          return errorResponse('Method Not Allowed', 405, origin);
        }
        const id = parts[2];
        // /api/tasks/:id
        if (parts.length === 3) {
          if (method === 'PATCH') {
            const payload = buildTaskPayload(await parseJsonBody(request), false);
            return await patchTask(env, id, payload, origin);
          }
          return errorResponse('Method Not Allowed', 405, origin);
        }
        // /api/tasks/:id/archive | /api/tasks/:id/restore
        if (parts.length === 4 && method === 'POST') {
          if (parts[3] === 'archive') return await patchTask(env, id, { archived: true }, origin);
          if (parts[3] === 'restore') return await patchTask(env, id, { archived: false }, origin);
        }
        return errorResponse('Not Found', 404, origin);
      }

      return errorResponse('Not Found', 404, origin);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Validation/JSON-parse errors are client errors (400); anything else is 500.
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
