// Export people + ALL tasks directly from the Supabase production source for the D1
// PRODUCTION import. Supabase is the original source of truth (untouched). This is a
// READ-ONLY export — it never writes to Supabase.
//
// Smoke-test exclusion (PRODUCTION import path only): tasks that are archived AND whose
// title contains "DELETE ME" AND one of the known smoke-test phrases are excluded from the
// production copy (they are NOT deleted from Supabase).
//
// Env (no secrets printed):
//   SUPABASE_URL or VITE_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY (preferred) or VITE_SUPABASE_ANON_KEY
//
// Outputs (gitignored):
//   exports/d1-production/people.json
//   exports/d1-production/tasks.json
//   exports/d1-production/export-summary.json

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const OUT_DIR = join('exports', 'd1-production');

const SMOKE_PHRASES = ['Worker CRUD smoke test', 'Worker frontend smoke test', 'D1 Worker smoke test'];

function isSmokeTestTask(t) {
  const archived = t.archived === true || t.archived === 1;
  const title = typeof t.title === 'string' ? t.title : '';
  return archived && title.includes('DELETE ME') && SMOKE_PHRASES.some((p) => title.includes(p));
}

async function getJson(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Supabase GET ${path} failed (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Missing Supabase config: set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_ANON_KEY).');
  }
  console.log(`[export-supabase] source: ${new URL(SUPABASE_URL).hostname}`);

  const [people, rawTasks] = await Promise.all([
    getJson('people?select=*&order=name.asc'),
    getJson('tasks?select=*&order=priority.asc'), // ALL tasks incl. archived
  ]);

  const excluded = rawTasks.filter(isSmokeTestTask);
  const tasks = rawTasks.filter((t) => !isSmokeTestTask(t));

  const summary = {
    source: 'supabase',
    supabase_host: new URL(SUPABASE_URL).hostname,
    raw_tasks: rawTasks.length,
    excluded_smoke_tests: excluded.length,
    excluded_task_numbers: excluded.map((t) => t.task_number).sort((a, b) => a - b),
    final_tasks_to_import: tasks.length,
    people_count: people.length,
    final_active: tasks.filter((t) => !(t.archived === true || t.archived === 1)).length,
    final_archived: tasks.filter((t) => t.archived === true || t.archived === 1).length,
    null_task_number: tasks.filter((t) => t.task_number == null).length,
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(join(OUT_DIR, 'people.json'), JSON.stringify(people, null, 2));
  await writeFile(join(OUT_DIR, 'tasks.json'), JSON.stringify(tasks, null, 2));
  await writeFile(join(OUT_DIR, 'export-summary.json'), JSON.stringify(summary, null, 2));

  console.log('[export-supabase] wrote exports/d1-production/{people,tasks,export-summary}.json');
  console.log('[export-supabase] summary:', JSON.stringify(summary));
}

main().catch((err) => {
  console.error('[export-supabase] FAILED:', err.message);
  process.exit(1);
});
