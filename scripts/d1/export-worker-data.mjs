// Export all people and ALL tasks (including archived) from the current Worker API
// (which currently reads Supabase). Output is a local data copy for the D1 staging
// import. No secrets required — this only calls the public Worker endpoints.
//
// Usage:
//   WORKER_API_URL=https://task-management-api.sw-590.workers.dev node scripts/d1/export-worker-data.mjs
//
// Outputs (gitignored):
//   exports/d1/people.json
//   exports/d1/tasks.json
//   exports/d1/export-summary.json

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const WORKER_API_URL = (process.env.WORKER_API_URL || 'https://task-management-api.sw-590.workers.dev').replace(/\/+$/, '');
const OUT_DIR = join('exports', 'd1');

async function getJson(path) {
  const res = await fetch(`${WORKER_API_URL}${path}`);
  if (!res.ok) {
    throw new Error(`GET ${path} failed (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error(`GET ${path} did not return an array`);
  return data;
}

async function main() {
  console.log(`[export] Worker API: ${WORKER_API_URL}`);
  const [people, tasks] = await Promise.all([
    getJson('/api/people'),
    getJson('/api/tasks?include_archived=true'), // ALL tasks, archived included
  ]);

  const archived = tasks.filter((t) => t.archived === true || t.archived === 1).length;
  const summary = {
    worker_api_url: WORKER_API_URL,
    people_count: people.length,
    tasks_total: tasks.length,
    tasks_active: tasks.length - archived,
    tasks_archived: archived,
    null_task_number: tasks.filter((t) => t.task_number == null).length,
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(join(OUT_DIR, 'people.json'), JSON.stringify(people, null, 2));
  await writeFile(join(OUT_DIR, 'tasks.json'), JSON.stringify(tasks, null, 2));
  await writeFile(join(OUT_DIR, 'export-summary.json'), JSON.stringify(summary, null, 2));

  console.log('[export] wrote exports/d1/{people,tasks,export-summary}.json');
  console.log('[export] summary:', JSON.stringify(summary));
}

main().catch((err) => {
  console.error('[export] FAILED:', err.message);
  process.exit(1);
});
