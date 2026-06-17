/**
 * Safe CSV / Excel task import workflow for the Engineering Task Manager.
 *
 * Replaces the `tasks` table in Supabase with the tasks from a CSV/XLSX file.
 * People are NEVER deleted — missing people are created and reused.
 *
 * Usage:
 *   npm run import:tasks -- --file "New Engineering Tasks - 2026 - Engineering Tasks.csv" --dry-run
 *   npm run import:tasks -- --file "New Engineering Tasks - 2026 - Engineering Tasks.csv" --apply
 *
 * Or directly:
 *   npx tsx scripts/import_excel_tasks.ts --file "<file>" --dry-run
 *   npx tsx scripts/import_excel_tasks.ts --file "<file>" --apply
 *
 * Safety:
 *   - --dry-run  : never touches Supabase. Parses, validates, reports.
 *   - --apply    : backs up tasks+people first, then deletes existing tasks
 *                  ONLY (people are kept), creates missing people, inserts new tasks,
 *                  and verifies the result.
 *   - If insertion fails after deletion, the script prints restore instructions
 *     and exits non-zero. Backups live in backups/ (gitignored).
 *
 * Secrets: reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (and optional
 * SUPABASE_SERVICE_ROLE_KEY) from .env. Never prints key values — only the host.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// Schema-accurate values (see supabase/schema.sql)
const VALID_STATUSES = ['not_started', 'in_progress', 'on_hold', 'need_to_review', 'done'] as const;
type TaskStatus = (typeof VALID_STATUSES)[number];
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

// ---------------------------------------------------------------------------
// .env loader (no dependency). Does not print values.
// ---------------------------------------------------------------------------
function loadEnv(): void {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

// ---------------------------------------------------------------------------
// RFC 4180 CSV parser (handles quoted fields, escaped quotes, embedded newlines)
// ---------------------------------------------------------------------------
function parseCsv(text: string): string[][] {
  // Strip a UTF-8 BOM if present
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += ch;
        i += 1;
      }
    } else if (ch === '"') {
      inQuotes = true;
      i += 1;
    } else if (ch === ',') {
      row.push(field);
      field = '';
      i += 1;
    } else if (ch === '\r') {
      // handle \r\n and lone \r
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      i += text[i + 1] === '\n' ? 2 : 1;
    } else if (ch === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      i += 1;
    } else {
      field += ch;
      i += 1;
    }
  }
  // flush last field/row
  row.push(field);
  rows.push(row);

  // Drop trailing fully-empty rows
  while (rows.length && rows[rows.length - 1].every(c => c.trim() === '')) {
    rows.pop();
  }
  return rows;
}

// ---------------------------------------------------------------------------
// XLSX parser (optional — only if the `xlsx` package is installed)
// ---------------------------------------------------------------------------
async function parseXlsx(filePath: string): Promise<string[][]> {
  let XLSX: typeof import('xlsx');
  try {
    XLSX = await import('xlsx');
  } catch {
    throw new Error(
      'XLSX support requires the "xlsx" package. Install it (npm i -D xlsx) ' +
        'or export the sheet to CSV and pass the .csv file instead.',
    );
  }
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: false,
    defval: '',
  });
  return rows.map(r => r.map(c => (c == null ? '' : String(c))));
}

// ---------------------------------------------------------------------------
// Header mapping
// ---------------------------------------------------------------------------
function normalizeHeader(h: string): string {
  return h
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

interface ColumnMap {
  title: number;
  description: number;
  status: number;
  priority: number;
  notes: number;
  responsible: number;
  due_date: number;
  closed_date: number;
  type: number;
}

function buildColumnMap(headers: string[]): ColumnMap {
  const norm = headers.map(normalizeHeader);
  const map: ColumnMap = {
    title: -1,
    description: -1,
    status: -1,
    priority: -1,
    notes: -1,
    responsible: -1,
    due_date: -1,
    closed_date: -1,
    type: -1,
  };

  // Title preference order: "title" > "task description" > "task"
  const titleCandidates: number[] = [];
  norm.forEach((h, idx) => {
    if (h === 'title') titleCandidates[0] = idx;
    else if (h === 'task description' || h.startsWith('task description')) {
      if (titleCandidates[1] === undefined) titleCandidates[1] = idx;
    } else if (h === 'task') {
      if (titleCandidates[2] === undefined) titleCandidates[2] = idx;
    }
  });
  map.title = titleCandidates.find(v => v !== undefined) ?? -1;

  norm.forEach((h, idx) => {
    if (map.status === -1 && h.startsWith('status')) map.status = idx;
    if (map.priority === -1 && h.startsWith('priority')) map.priority = idx;
    if (map.notes === -1 && (h.startsWith('note') || h === 'comments')) map.notes = idx;
    if (
      map.responsible === -1 &&
      (h.startsWith('responsib') || h === 'owner' || h.startsWith('assignee') || h.startsWith('assigned'))
    )
      map.responsible = idx;
    if (map.due_date === -1 && h.startsWith('due')) map.due_date = idx;
    // "close date" / "closed date" → closed_date (distinct from due date).
    if (map.closed_date === -1 && h.startsWith('close')) map.closed_date = idx;
    if (map.type === -1 && h === 'type') map.type = idx;
    // description only if it's NOT the title column and not "task description"
    if (
      map.description === -1 &&
      h === 'description' &&
      idx !== map.title
    )
      map.description = idx;
  });

  return map;
}

// ---------------------------------------------------------------------------
// Field normalization
// ---------------------------------------------------------------------------
function normStatus(raw: string): { value: TaskStatus; warned: boolean } {
  const s = (raw || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!s) return { value: 'not_started', warned: true };
  const table: Record<string, TaskStatus> = {
    'not started': 'not_started',
    notstarted: 'not_started',
    'to do': 'not_started',
    todo: 'not_started',
    'in progress': 'in_progress',
    inprogress: 'in_progress',
    doing: 'in_progress',
    'on hold': 'on_hold',
    onhold: 'on_hold',
    blocked: 'on_hold',
    'need to review': 'need_to_review',
    'need review': 'need_to_review',
    'needs review': 'need_to_review',
    review: 'need_to_review',
    done: 'done',
    completed: 'done',
    complete: 'done',
    finished: 'done',
  };
  if (table[s]) return { value: table[s], warned: false };
  // Already a canonical value?
  if ((VALID_STATUSES as readonly string[]).includes(s)) return { value: s as TaskStatus, warned: false };
  return { value: 'not_started', warned: true };
}

function normPriority(raw: string): { value: number; warned: boolean } {
  const s = (raw || '').trim().toLowerCase();
  if (!s) return { value: 3, warned: true };
  // Leading number wins: "1", "1 - High", "5- Low"
  const m = s.match(/^(\d)/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 5) return { value: n, warned: false };
  }
  // Word forms
  if (s.includes('high') || s === 'urgent' || s === 'critical') return { value: 1, warned: false };
  if (s.includes('medium') || s.includes('normal')) return { value: 3, warned: false };
  if (s.includes('low')) return { value: 5, warned: false };
  return { value: 3, warned: true };
}

function normDueDate(raw: string): { value: string | null; warned: boolean } {
  const s = (raw || '').trim();
  if (!s) return { value: null, warned: false };
  // Literal placeholders
  if (/^[dmy]+[/\-.][dmy]+[/\-.][dmy]+$/i.test(s)) return { value: null, warned: false };

  // yyyy-mm-dd
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const iso = toIso(+m[1], +m[2], +m[3]);
    return iso ? { value: iso, warned: false } : { value: null, warned: true };
  }
  // dd/mm/yyyy or dd-mm-yyyy or dd.mm.yyyy
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    let year = +m[3];
    if (year < 100) year += 2000;
    const iso = toIso(year, +m[2], +m[1]);
    return iso ? { value: iso, warned: false } : { value: null, warned: true };
  }
  // Fallback: let Date try (Excel text dates etc.)
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const iso = toIso(d.getFullYear(), d.getMonth() + 1, d.getDate());
    if (iso) return { value: iso, warned: false };
  }
  return { value: null, warned: true };
}

function toIso(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  const mm = String(mo).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

function makeImportHash(
  title: string,
  responsible: string,
  due: string | null,
  notes: string,
): string {
  const raw = [
    title.replace(/\s+/g, ' ').trim().toLowerCase(),
    responsible.replace(/\s+/g, ' ').trim().toLowerCase(),
    due ?? 'null',
    notes.replace(/\s+/g, ' ').trim().toLowerCase(),
  ].join('|');
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------------------
// Parsed task shape
// ---------------------------------------------------------------------------
interface ParsedTask {
  rowNumber: number; // 1-based data row number (excludes header)
  title: string;
  description: string | null;
  notes: string;
  status: TaskStatus;
  priority: number;
  responsible: string | null;
  due_date: string | null;
  closed_date: string | null;
  type: string | null;
  source_file: string;
  source_raw_text: string;
  import_hash: string;
  archived: false;
}

interface ParseResult {
  headers: string[];
  columnMap: ColumnMap;
  rawRowCount: number;
  tasks: ParsedTask[]; // valid + deduped
  invalidRows: { rowNumber: number; reason: string }[];
  duplicateRows: { rowNumber: number; title: string }[];
  warnings: Record<string, number>;
  people: string[]; // unique responsible names found
}

function get(cells: string[], idx: number): string {
  if (idx < 0 || idx >= cells.length) return '';
  return (cells[idx] ?? '').trim();
}

function parseTasks(rows: string[][], sourceFile: string): ParseResult {
  const headers = rows[0] ?? [];
  const columnMap = buildColumnMap(headers);
  const dataRows = rows.slice(1);

  const warnings: Record<string, number> = {};
  const bump = (k: string) => { warnings[k] = (warnings[k] ?? 0) + 1; };

  const invalidRows: { rowNumber: number; reason: string }[] = [];
  const duplicateRows: { rowNumber: number; title: string }[] = [];
  const seen = new Set<string>();
  const tasks: ParsedTask[] = [];
  const peopleSet = new Map<string, string>(); // lowercased -> display name

  dataRows.forEach((cells, i) => {
    const rowNumber = i + 1;

    // Skip completely empty rows silently
    if (cells.every(c => (c ?? '').trim() === '')) return;

    const title = get(cells, columnMap.title);
    if (!title) {
      invalidRows.push({ rowNumber, reason: 'missing title (task description)' });
      bump('missing_title');
      return;
    }

    const statusRaw = get(cells, columnMap.status);
    const { value: status, warned: statusWarned } = normStatus(statusRaw);
    if (statusWarned) bump('status_defaulted');

    const priorityRaw = get(cells, columnMap.priority);
    const { value: priority, warned: prWarned } = normPriority(priorityRaw);
    if (prWarned) bump('priority_defaulted');

    const dueRaw = get(cells, columnMap.due_date);
    const { value: due_date, warned: dueWarned } = normDueDate(dueRaw);
    if (dueWarned) bump('due_date_invalid');

    const closedRaw = columnMap.closed_date >= 0 ? get(cells, columnMap.closed_date) : '';
    const { value: closed_date, warned: closedWarned } = normDueDate(closedRaw);
    if (closedRaw && closedWarned) bump('closed_date_invalid');

    const responsibleRaw = get(cells, columnMap.responsible);
    const responsible = responsibleRaw || null;
    if (!responsible) bump('responsible_missing');
    else peopleSet.set(responsible.toLowerCase(), responsible);

    const notes = get(cells, columnMap.notes);
    const description = columnMap.description >= 0 ? get(cells, columnMap.description) || null : null;
    const type = columnMap.type >= 0 ? get(cells, columnMap.type) || null : null;

    const import_hash = makeImportHash(title, responsible ?? '', due_date, notes);
    if (seen.has(import_hash)) {
      duplicateRows.push({ rowNumber, title });
      bump('duplicate_in_csv');
      return;
    }
    seen.add(import_hash);

    tasks.push({
      rowNumber,
      title,
      description,
      notes,
      status,
      priority,
      responsible,
      due_date,
      closed_date,
      type,
      source_file: sourceFile,
      source_raw_text: JSON.stringify({
        title,
        status: statusRaw,
        priority: priorityRaw,
        notes,
        responsible: responsibleRaw,
        due_date: dueRaw,
      }),
      import_hash,
      archived: false,
    });
  });

  return {
    headers,
    columnMap,
    rawRowCount: dataRows.filter(r => r.some(c => (c ?? '').trim() !== '')).length,
    tasks,
    invalidRows,
    duplicateRows,
    warnings,
    people: [...peopleSet.values()],
  };
}

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------
async function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
  // Prefer service role for destructive admin import if provided; else anon (RLS is permissive).
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    '';

  if (!url || url.includes('placeholder') || url === 'your-project-url-here') {
    throw new Error('Supabase URL not configured. Set VITE_SUPABASE_URL in .env.');
  }
  if (!key) {
    throw new Error('Supabase key not configured. Set VITE_SUPABASE_ANON_KEY in .env.');
  }

  let host = 'unknown';
  try {
    host = new URL(url).hostname;
  } catch {
    /* ignore */
  }
  const usingServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  console.log(`Supabase host: ${host}  (auth: ${usingServiceRole ? 'service_role' : 'anon'} key)`);

  const { createClient } = await import('@supabase/supabase-js');
  return { supabase: createClient(url, key), host };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------
function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}-${p(
    d.getMinutes(),
  )}-${p(d.getSeconds())}`;
}

function printParseReport(file: string, r: ParseResult, existingTaskCount: number | null) {
  console.log('\n========== PARSE / DRY-RUN REPORT ==========');
  console.log(`CSV file used            : ${file}`);
  console.log(`Detected headers         : ${r.headers.map(h => normalizeHeader(h)).filter(Boolean).join(' | ')}`);
  console.log('Column mapping           :');
  console.log(`   title       -> col ${r.columnMap.title}`);
  console.log(`   description -> col ${r.columnMap.description}`);
  console.log(`   status      -> col ${r.columnMap.status}`);
  console.log(`   priority    -> col ${r.columnMap.priority}`);
  console.log(`   notes       -> col ${r.columnMap.notes}`);
  console.log(`   responsible -> col ${r.columnMap.responsible}`);
  console.log(`   due_date    -> col ${r.columnMap.due_date}`);
  console.log(`   closed_date -> col ${r.columnMap.closed_date}`);
  console.log(`   type        -> col ${r.columnMap.type}`);
  console.log(`Raw non-empty data rows  : ${r.rawRowCount}`);
  console.log(`Valid tasks (deduped)    : ${r.tasks.length}`);
  console.log(`Invalid / skipped rows   : ${r.invalidRows.length}`);
  console.log(`Duplicate rows in CSV    : ${r.duplicateRows.length}`);
  console.log(`Unique people found      : ${r.people.length}  [${r.people.join(', ')}]`);
  console.log(
    `Existing tasks (DB)      : ${existingTaskCount === null ? '(not queried — dry-run offline)' : existingTaskCount}`,
  );
  console.log(`New tasks to insert      : ${r.tasks.length}`);

  console.log('\nWarnings by type:');
  if (Object.keys(r.warnings).length === 0) console.log('   (none)');
  else for (const [k, v] of Object.entries(r.warnings)) console.log(`   ${k}: ${v}`);

  if (r.invalidRows.length) {
    console.log('\nInvalid / skipped rows (data-row #, reason):');
    r.invalidRows.forEach(x => console.log(`   row ${x.rowNumber}: ${x.reason}`));
  }
  if (r.duplicateRows.length) {
    console.log('\nDuplicate rows collapsed (data-row #, title):');
    r.duplicateRows.forEach(x => console.log(`   row ${x.rowNumber}: ${x.title}`));
  }

  console.log('\nSample parsed tasks (first 8):');
  r.tasks.slice(0, 8).forEach((t, i) => {
    console.log(
      `   ${String(i + 1).padStart(2, '0')}. [${(t.responsible ?? '—').padEnd(7)}] P${t.priority} [${t.status.padEnd(
        14,
      )}] ${t.due_date ?? '----------'}  ${t.title.slice(0, 50)}`,
    );
  });
  console.log('============================================\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const apply = argv.includes('--apply');
  const fileArgIdx = argv.indexOf('--file');
  let file = fileArgIdx !== -1 ? argv[fileArgIdx + 1] : '';

  if (!file) {
    // Default to the known CSV if present
    const def = 'New Engineering Tasks - 2026 - Engineering Tasks.csv';
    if (fs.existsSync(path.join(ROOT, def))) file = def;
  }
  if (!file) {
    console.error('ERROR: no --file provided and default CSV not found.');
    process.exit(1);
  }

  const absFile = path.isAbsolute(file) ? file : path.join(ROOT, file);
  if (!fs.existsSync(absFile)) {
    console.error(`ERROR: file not found: ${absFile}`);
    process.exit(1);
  }
  if (!dryRun && !apply) {
    console.error('ERROR: specify either --dry-run or --apply.');
    console.error('  npm run import:tasks -- --file "<file>" --dry-run');
    console.error('  npm run import:tasks -- --file "<file>" --apply');
    process.exit(1);
  }

  loadEnv();

  const ext = path.extname(absFile).toLowerCase();
  let rows: string[][];
  if (ext === '.xlsx' || ext === '.xls') {
    rows = await parseXlsx(absFile);
  } else {
    rows = parseCsv(fs.readFileSync(absFile, 'utf8'));
  }

  const sourceFile = path.basename(absFile);
  const parsed = parseTasks(rows, sourceFile);

  // Write a dry-run report file (always useful)
  const reportDir = path.join(ROOT, 'backups');
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `dry-run-report-${timestamp()}.json`);
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        file: sourceFile,
        headers: parsed.headers,
        columnMap: parsed.columnMap,
        rawRowCount: parsed.rawRowCount,
        validTasks: parsed.tasks.length,
        invalidRows: parsed.invalidRows,
        duplicateRows: parsed.duplicateRows,
        warnings: parsed.warnings,
        people: parsed.people,
        tasks: parsed.tasks,
      },
      null,
      2,
    ),
  );

  // -------------------- DRY RUN --------------------
  if (dryRun) {
    let existingCount: number | null = null;
    try {
      const { supabase } = await getSupabase();
      const { count } = await supabase.from('tasks').select('*', { count: 'exact', head: true });
      existingCount = count ?? 0;
    } catch (e) {
      console.log(`(Dry-run could not query DB for existing count: ${(e as Error).message})`);
    }
    printParseReport(sourceFile, parsed, existingCount);
    console.log(`Dry-run report written to: ${path.relative(ROOT, reportPath)}`);
    console.log('DRY RUN complete — no data was written to Supabase.\n');
    return;
  }

  // -------------------- APPLY --------------------
  if (parsed.tasks.length === 0) {
    console.error('ERROR: no valid tasks parsed — refusing to apply (would wipe tasks for nothing).');
    process.exit(1);
  }

  const { supabase, host } = await getSupabase();

  // 1) Backup tasks + people FIRST
  console.log('\n[1/5] Backing up current Supabase data...');
  const { data: existingTasks, error: tErr } = await supabase.from('tasks').select('*');
  if (tErr) {
    console.error('Backup failed (tasks):', tErr.message);
    process.exit(1);
  }
  const { data: existingPeople, error: pErr } = await supabase.from('people').select('*');
  if (pErr) {
    console.error('Backup failed (people):', pErr.message);
    process.exit(1);
  }

  const ts = timestamp();
  const tasksBackupPath = path.join(reportDir, `tasks-backup-${ts}.json`);
  const peopleBackupPath = path.join(reportDir, `people-backup-${ts}.json`);
  fs.writeFileSync(
    tasksBackupPath,
    JSON.stringify(
      { timestamp: ts, supabase_host: host, row_count: existingTasks?.length ?? 0, tasks: existingTasks },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    peopleBackupPath,
    JSON.stringify(
      { timestamp: ts, supabase_host: host, row_count: existingPeople?.length ?? 0, people: existingPeople },
      null,
      2,
    ),
  );
  console.log(`   tasks backup : ${path.relative(ROOT, tasksBackupPath)} (${existingTasks?.length ?? 0} rows)`);
  console.log(`   people backup: ${path.relative(ROOT, peopleBackupPath)} (${existingPeople?.length ?? 0} rows)`);

  // 2) Ensure people exist (create missing — never delete)
  console.log('\n[2/5] Ensuring people exist (creating missing only)...');
  const peopleMap = new Map<string, string>(); // lowercased name -> id
  for (const p of existingPeople ?? []) peopleMap.set(String(p.name).trim().toLowerCase(), p.id);

  let peopleCreated = 0;
  for (const name of parsed.people) {
    const key = name.toLowerCase();
    if (peopleMap.has(key)) continue;
    const { data, error } = await supabase.from('people').insert([{ name }]).select().single();
    if (error) {
      console.error(`   ERROR creating person "${name}": ${error.message}`);
      console.error('   Aborting BEFORE deleting any tasks. No destructive change made.');
      process.exit(1);
    }
    peopleMap.set(key, data.id);
    peopleCreated++;
    console.log(`   created person: ${name}`);
  }
  console.log(`   people existing: ${peopleMap.size - peopleCreated}, created: ${peopleCreated}`);

  // 3) Delete existing tasks ONLY (people kept)
  console.log('\n[3/5] Deleting existing tasks (people are NOT deleted)...');
  const { error: delErr } = await supabase.from('tasks').delete().neq('id', ZERO_UUID);
  if (delErr) {
    console.error('Delete failed:', delErr.message);
    console.error(`Backup is safe at: ${path.relative(ROOT, tasksBackupPath)}`);
    process.exit(1);
  }
  console.log(`   deleted ${existingTasks?.length ?? 0} tasks.`);

  // 4) Insert new tasks
  console.log('\n[4/5] Inserting new tasks...');
  const payloads = parsed.tasks.map(t => ({
    title: t.title,
    description: t.description,
    notes: t.notes || null,
    status: t.status,
    priority: t.priority,
    responsible_person_id: t.responsible ? peopleMap.get(t.responsible.toLowerCase()) ?? null : null,
    due_date: t.due_date,
    closed_date: t.closed_date,
    type: t.type,
    source_file: t.source_file,
    source_raw_text: t.source_raw_text,
    import_hash: t.import_hash,
    archived: false,
  }));

  let inserted = 0;
  const BATCH = 100;
  for (let i = 0; i < payloads.length; i += BATCH) {
    const batch = payloads.slice(i, i + BATCH);
    const { data, error } = await supabase.from('tasks').insert(batch).select('id');
    if (error) {
      console.error(`\nINSERT FAILED on batch starting at index ${i}: ${error.message}`);
      console.error('\n!!! TASKS WERE DELETED BUT INSERT DID NOT FULLY COMPLETE !!!');
      console.error('To restore the previous tasks, run a restore using the backup:');
      console.error(`   backup file: ${path.relative(ROOT, tasksBackupPath)}`);
      console.error('   Restore approach: load that JSON and insert its `tasks` array back into the tasks table');
      console.error(`   (or import the backup via the Supabase dashboard).`);
      process.exit(1);
    }
    inserted += data?.length ?? 0;
  }
  console.log(`   inserted ${inserted} tasks.`);

  // 5) Verify
  console.log('\n[5/5] Verifying...');
  const { count: finalTasks } = await supabase.from('tasks').select('*', { count: 'exact', head: true });
  const { count: finalPeople } = await supabase.from('people').select('*', { count: 'exact', head: true });
  const { data: sample } = await supabase
    .from('tasks')
    .select('title,status,priority,due_date,responsible_person_id')
    .order('priority', { ascending: true })
    .limit(5);
  const { data: allForCounts } = await supabase.from('tasks').select('status,responsible_person_id');
  const { data: peopleList } = await supabase.from('people').select('id,name').order('name');

  const idToName = new Map((peopleList ?? []).map(p => [p.id, p.name]));
  const byStatus: Record<string, number> = {};
  const byPerson: Record<string, number> = {};
  for (const t of allForCounts ?? []) {
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    const nm = t.responsible_person_id ? idToName.get(t.responsible_person_id) ?? '(unknown)' : '(unassigned)';
    byPerson[nm] = (byPerson[nm] ?? 0) + 1;
  }

  console.log('\n========== APPLY VERIFICATION ==========');
  console.log(`Final tasks count : ${finalTasks}`);
  console.log(`Final people count: ${finalPeople}`);
  console.log('\nCount by status:');
  for (const [k, v] of Object.entries(byStatus)) console.log(`   ${k.padEnd(15)}: ${v}`);
  console.log('\nCount by responsible person:');
  for (const [k, v] of Object.entries(byPerson)) console.log(`   ${String(k).padEnd(15)}: ${v}`);
  console.log('\nPeople:');
  for (const p of peopleList ?? []) console.log(`   ${p.name}`);
  console.log('\nSample tasks (5):');
  (sample ?? []).forEach((t, i) => {
    const nm = t.responsible_person_id ? idToName.get(t.responsible_person_id) ?? '?' : '(unassigned)';
    console.log(`   ${i + 1}. [${nm}] P${t.priority} [${t.status}] ${t.title}`);
  });
  console.log('========================================\n');

  if (finalTasks !== inserted) {
    console.error(`WARNING: final count (${finalTasks}) != inserted (${inserted}). Please inspect.`);
    process.exit(1);
  }
  console.log(`APPLY complete: deleted ${existingTasks?.length ?? 0}, inserted ${inserted}, people created ${peopleCreated}.`);
  console.log(`Backups: ${path.relative(ROOT, tasksBackupPath)} , ${path.relative(ROOT, peopleBackupPath)}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
