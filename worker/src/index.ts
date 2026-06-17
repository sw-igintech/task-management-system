// Cloudflare Worker API skeleton (read-only) in front of Supabase.
//
// Intermediate-architecture step of the Cloudflare migration: this Worker exists
// for staging tests only. The frontend still talks to Supabase directly and is
// NOT switched to this API yet. No D1, no email, no writes.
//
// Security: this uses the Supabase SERVICE ROLE key, which is a SERVER-SIDE secret.
// It is read from a Worker secret binding (never committed, never logged) and is
// never returned to clients. The browser must never receive it.

export interface Env {
  // Set as Worker secrets (wrangler secret put / Cloudflare dashboard):
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

// Explicit CORS allow-list (no wildcard). No credentials are used.
const ALLOWED_ORIGINS = new Set<string>([
  'https://staging.task-management-system-3nm.pages.dev',
  'http://localhost:5173',
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function json(data: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(origin) },
  });
}

// Read-only select against Supabase's REST (PostgREST) endpoint using the
// service-role key. Direct fetch keeps the Worker dependency-free and light.
async function supabaseSelect(env: Env, table: string, query: string): Promise<Response> {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: 'application/json',
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    const { pathname } = new URL(request.url);

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // Read-only API for now.
    if (request.method !== 'GET') {
      return json({ error: 'Method Not Allowed' }, 405, origin);
    }

    if (pathname === '/health') {
      return json(
        {
          ok: true,
          service: 'task-management-api',
          db: 'supabase',
          timestamp: new Date().toISOString(),
        },
        200,
        origin,
      );
    }

    if (pathname === '/api/people' || pathname === '/api/tasks') {
      if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
        return json(
          { error: 'Server not configured: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing' },
          503,
          origin,
        );
      }
      const isPeople = pathname === '/api/people';
      const table = isPeople ? 'people' : 'tasks';
      // Match the frontend's default ordering (people by name, tasks by priority asc).
      const query = isPeople ? 'select=*&order=name.asc' : 'select=*&order=priority.asc';
      try {
        const res = await supabaseSelect(env, table, query);
        if (!res.ok) {
          const detail = (await res.text()).slice(0, 200);
          return json({ error: `Supabase ${table} fetch failed`, status: res.status, detail }, 502, origin);
        }
        return json(await res.json(), 200, origin);
      } catch (err) {
        return json(
          { error: 'Upstream error', detail: err instanceof Error ? err.message : String(err) },
          502,
          origin,
        );
      }
    }

    return json({ error: 'Not Found' }, 404, origin);
  },
};
