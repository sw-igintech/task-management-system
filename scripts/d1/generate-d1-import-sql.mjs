// Generate a STAGING-ONLY replacement import for D1 from the exported JSON.
// Reads exports/d1/people.json + exports/d1/tasks.json and writes
// exports/d1/import-staging.sql.
//
// ⚠️ The generated SQL is DESTRUCTIVE to the D1 staging copy ONLY (it DELETEs from
// tasks/people first, then re-inserts). It NEVER touches Supabase.
//
// Usage: node scripts/d1/generate-d1-import-sql.mjs

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIR = join('exports', 'd1');

// SQL string literal: null/undefined/'' → NULL; else single-quote-escaped.
function txt(v) {
  if (v === null || v === undefined || v === '') return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}
// SQL integer: null/undefined/'' → NULL; else integer literal.
function int(v) {
  if (v === null || v === undefined || v === '') return 'NULL';
  const n = Number(v);
  if (!Number.isFinite(n)) return 'NULL';
  return String(Math.trunc(n));
}
// archived is NOT NULL 0/1.
function bool01(v) {
  return v === true || v === 1 || v === '1' || v === 'true' ? '1' : '0';
}

const PEOPLE_COLS = ['id', 'name', 'email', 'created_at'];
const TASK_COLS = [
  'id', 'task_number', 'title', 'description', 'notes', 'status', 'priority',
  'responsible_person_id', 'opened_by_person_id', 'due_date', 'closed_date',
  'type', 'source_file', 'source_page', 'source_raw_text', 'import_hash',
  'archived', 'created_at', 'updated_at',
];

function personValues(p) {
  return `(${txt(p.id)}, ${txt(p.name)}, ${txt(p.email)}, ${txt(p.created_at)})`;
}
function taskValues(t) {
  return `(${txt(t.id)}, ${int(t.task_number)}, ${txt(t.title)}, ${txt(t.description)}, ${txt(t.notes)}, ` +
    `${txt(t.status)}, ${int(t.priority)}, ${txt(t.responsible_person_id)}, ${txt(t.opened_by_person_id)}, ` +
    `${txt(t.due_date)}, ${txt(t.closed_date)}, ${txt(t.type)}, ${txt(t.source_file)}, ${int(t.source_page)}, ` +
    `${txt(t.source_raw_text)}, ${txt(t.import_hash)}, ${bool01(t.archived)}, ${txt(t.created_at)}, ${txt(t.updated_at)})`;
}

async function main() {
  const people = JSON.parse(await readFile(join(DIR, 'people.json'), 'utf8'));
  const tasks = JSON.parse(await readFile(join(DIR, 'tasks.json'), 'utf8'));

  const lines = [];
  lines.push('-- D1 STAGING import (generated). Destructive to the D1 copy ONLY; never Supabase.');
  lines.push('PRAGMA foreign_keys = OFF;');
  lines.push('BEGIN TRANSACTION;');
  lines.push('DELETE FROM tasks;');
  lines.push('DELETE FROM people;');
  for (const p of people) {
    lines.push(`INSERT INTO people (${PEOPLE_COLS.join(', ')}) VALUES ${personValues(p)};`);
  }
  for (const t of tasks) {
    lines.push(`INSERT INTO tasks (${TASK_COLS.join(', ')}) VALUES ${taskValues(t)};`);
  }
  lines.push('COMMIT;');
  lines.push('PRAGMA foreign_keys = ON;');
  lines.push('');

  const out = join(DIR, 'import-staging.sql');
  await writeFile(out, lines.join('\n'));
  console.log(`[generate] wrote ${out} (${people.length} people, ${tasks.length} tasks)`);
}

main().catch((err) => {
  console.error('[generate] FAILED:', err.message);
  process.exit(1);
});
