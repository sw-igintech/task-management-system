/**
 * Safe CSV → Supabase VERIFICATION / SYNC workflow for the Engineering Task Manager.
 *
 * Unlike scripts/import_excel_tasks.ts (which does a destructive delete + re-insert),
 * this script is ADDITIVE and NON-DESTRUCTIVE:
 *
 *   - It compares every CSV task against the current Supabase `tasks`.
 *   - It INSERTS tasks that are missing from the DB.
 *   - It CREATES people that exist in the CSV but not in the DB (then assigns them).
 *   - It UPDATES existing tasks only when the match is deterministic and a field differs.
 *   - It NEVER deletes anything. DB tasks not present in the CSV are reported as
 *     `extra_in_db` and left untouched.
 *
 * Usage:
 *   npm run sync:tasks -- --file "New Engineering Tasks - 2026 - Engineering Tasks.csv" --dry-run
 *   npm run sync:tasks -- --file "New Engineering Tasks - 2026 - Engineering Tasks.csv" --apply
 *
 * Or directly:
 *   npx tsx scripts/sync_csv_tasks.ts --file "<file>" --dry-run
 *   npx tsx scripts/sync_csv_tasks.ts --file "<file>" --apply
 *
 * Safety:
 *   - --dry-run : never touches Supabase. Parses, normalizes, compares, reports.
 *                 Writes reports/task-sync-dry-run-<ts>.json
 *   - --apply   : backs up tasks + people to backups/ first, creates missing people,
 *                 inserts missing tasks, updates deterministically-matched tasks,
 *                 NEVER deletes, then verifies and reports.
 *                 Writes reports/task-sync-apply-<ts>.json
 *
 * Secrets: reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (and optional
 * SUPABASE_SERVICE_ROLE_KEY) from .env. Never prints key values — only the host.
 *
 * Matching strategy (most → least reliable, first hit wins):
 *   1. sync_id  — the CSV "Sync ID" column matched against a DB row's
 *                 source_raw_text.sync_id (this script writes sync_id into
 *                 source_raw_text, so future syncs are robust to any field edit).
 *   2. import_hash — sha256(title|responsible|due|notes), the SAME formula the
 *                 importer used, so rows imported previously match exactly.
 *   3. (normalized title + normalized responsible) — only when it is unique on
 *                 BOTH the CSV side and the DB side; otherwise reported as
 *                 ambiguous_match and left untouched.
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

// ---------------------------------------------------------------------------
// .env loader (no dependency). Never prints values.
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
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM

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
  row.push(field);
  rows.push(row);

  while (rows.length && rows[rows.length - 1].every(c => c.trim() === '')) rows.pop();
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
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' });
  return rows.map(r => r.map(c => (c == null ? '' : String(c))));
}

// ---------------------------------------------------------------------------
// Header mapping
// ---------------------------------------------------------------------------
function normalizeHeader(h: string): string {
  return h.replace(/\s+/g, ' ').trim().toLowerCase();
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
  sync_id: number;
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
    sync_id: -1,
  };

  // Title preference: "title" > "task description" > "task"
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
    if (map.sync_id === -1 && (h === 'sync id' || h === 'syncid' || h === 'sync_id')) map.sync_id = idx;
    if (map.description === -1 && h === 'description' && idx !== map.title) map.description = idx;
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
  if ((VALID_STATUSES as readonly string[]).includes(s)) return { value: s as TaskStatus, warned: false };
  return { value: 'not_started', warned: true };
}

function normPriority(raw: string): { value: number; warned: boolean } {
  const s = (raw || '').trim().toLowerCase();
  if (!s) return { value: 3, warned: true };
  const m = s.match(/^(\d)/); // leading number wins: "1", "1 - High", "5- Low"
  if (m) {
    const num = parseInt(m[1], 10);
    if (num >= 1 && num <= 5) return { value: num, warned: false };
  }
  if (s.includes('high') || s === 'urgent' || s === 'critical') return { value: 1, warned: false };
  if (s.includes('medium') || s.includes('normal')) return { value: 3, warned: false };
  if (s.includes('low')) return { value: 5, warned: false };
  return { value: 3, warned: true };
}

function normDueDate(raw: string): { value: string | null; warned: boolean } {
  const s = (raw || '').trim();
  if (!s) return { value: null, warned: false };
  if (/^[dmy]+[/\-.][dmy]+[/\-.][dmy]+$/i.test(s)) return { value: null, warned: false }; // placeholder

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); // yyyy-mm-dd
  if (m) {
    const iso = toIso(+m[1], +m[2], +m[3]);
    return iso ? { value: iso, warned: false } : { value: null, warned: true };
  }
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/); // dd/mm/yyyy etc.
  if (m) {
    let year = +m[3];
    if (year < 100) year += 2000;
    const iso = toIso(year, +m[2], +m[1]);
    return iso ? { value: iso, warned: false } : { value: null, warned: true };
  }
  const d = new Date(s); // fallback
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
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function collapse(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

function makeImportHash(title: string, responsible: string, due: string | null, notes: string): string {
  const raw = [
    collapse(title).toLowerCase(),
    collapse(responsible).toLowerCase(),
    due ?? 'null',
    collapse(notes).toLowerCase(),
  ].join('|');
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

// (normalized title + normalized responsible) — secondary deterministic key
function titleResponsibleKey(title: string, responsible: string | null): string {
  return `${collapse(title).toLowerCase()}|${collapse(responsible ?? '').toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// Parsed CSV task shape
// ---------------------------------------------------------------------------
interface ParsedTask {
  rowNumber: number; // 1-based data-row number (excludes header)
  title: string;
  description: string | null;
  notes: string;
  status: TaskStatus;
  priority: number;
  responsible: string | null;
  due_date: string | null;
  closed_date: string | null;
  type: string | null;
  sync_id: string | null;
  source_file: string;
  source_raw_text: string;
  import_hash: string;
}

interface ParseResult {
  headers: string[];
  columnMap: ColumnMap;
  rawRowCount: number;
  tasks: ParsedTask[];
  invalidRows: { rowNumber: number; reason: string }[];
  duplicateRows: { rowNumber: number; title: string; keptRow: number; conflict?: string }[];
  warnings: Record<string, number>;
  people: string[];
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
  const bump = (k: string) => {
    warnings[k] = (warnings[k] ?? 0) + 1;
  };

  const invalidRows: { rowNumber: number; reason: string }[] = [];
  const duplicateRows: { rowNumber: number; title: string; keptRow: number; conflict?: string }[] = [];
  const seenByHash = new Map<string, ParsedTask>(); // import_hash -> first kept task
  const tasks: ParsedTask[] = [];
  const peopleSet = new Map<string, string>(); // lowercased -> display name

  dataRows.forEach((cells, i) => {
    const rowNumber = i + 1;
    if (cells.every(c => (c ?? '').trim() === '')) return; // silently skip blank rows

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
    const syncIdRaw = columnMap.sync_id >= 0 ? get(cells, columnMap.sync_id) : '';
    const sync_id = syncIdRaw || null;

    const import_hash = makeImportHash(title, responsible ?? '', due_date, notes);

    // Dedup by import_hash — this is the DB's UNIQUE key, so two CSV rows sharing
    // a hash can never both live in the DB (the import_hash excludes status/priority).
    // The first occurrence wins; later copies are reported as duplicates. If a later
    // copy differs in status/priority (a conflicting duplicate in the source sheet),
    // the conflict is recorded so it is not silently lost.
    const prior = seenByHash.get(import_hash);
    if (prior) {
      const conflicts: string[] = [];
      if (prior.status !== status) conflicts.push(`status (kept '${prior.status}', ignored '${status}')`);
      if (prior.priority !== priority) conflicts.push(`priority (kept ${prior.priority}, ignored ${priority})`);
      duplicateRows.push({
        rowNumber,
        title,
        keptRow: prior.rowNumber,
        conflict: conflicts.length ? conflicts.join('; ') : undefined,
      });
      bump('duplicate_in_csv');
      if (conflicts.length) bump('duplicate_with_conflict');
      return;
    }

    const parsedTask: ParsedTask = {
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
      sync_id,
      source_file: sourceFile,
      source_raw_text: JSON.stringify({
        title,
        status: statusRaw,
        priority: priorityRaw,
        notes,
        responsible: responsibleRaw,
        due_date: dueRaw,
        sync_id: sync_id ?? undefined,
      }),
      import_hash,
    };
    seenByHash.set(import_hash, parsedTask);
    tasks.push(parsedTask);
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
interface DbPerson {
  id: string;
  name: string;
  email?: string | null;
  created_at?: string;
}
interface DbTask {
  id: string;
  title: string;
  description: string | null;
  notes: string | null;
  status: string;
  priority: number;
  responsible_person_id: string | null;
  due_date: string | null;
  closed_date: string | null;
  type: string | null;
  source_file: string | null;
  source_raw_text: string | null;
  import_hash: string | null;
  archived: boolean;
}

async function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    '';

  if (!url || url.includes('placeholder') || url === 'your-project-url-here') {
    throw new Error('Supabase URL not configured. Set VITE_SUPABASE_URL in .env.');
  }
  if (!key) throw new Error('Supabase key not configured. Set VITE_SUPABASE_ANON_KEY in .env.');

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

function extractSyncId(t: DbTask): string | null {
  if (!t.source_raw_text) return null;
  try {
    const obj = JSON.parse(t.source_raw_text);
    const sid = obj?.sync_id;
    return typeof sid === 'string' && sid.trim() ? sid.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------
type Category =
  | 'already_correct'
  | 'missing_in_db'
  | 'different_in_db'
  | 'ambiguous_match';

interface FieldDiff {
  field: string;
  csv: string | number | null;
  db: string | number | null;
}

interface CompareRow {
  csv: ParsedTask;
  category: Category;
  matchedBy?: 'sync_id' | 'import_hash' | 'title+responsible';
  dbTaskId?: string;
  diffs?: FieldDiff[];
  note?: string;
}

interface CompareResult {
  rows: CompareRow[];
  extraInDb: { id: string; title: string; status: string; responsible: string | null }[];
  peopleMissing: string[]; // CSV people not in DB (display names)
}

function compare(
  parsed: ParseResult,
  dbTasks: DbTask[],
  dbPeople: DbPerson[],
): CompareResult {
  const personIdToName = new Map(dbPeople.map(p => [p.id, p.name]));
  const personNameToId = new Map(dbPeople.map(p => [collapse(p.name).toLowerCase(), p.id]));

  // Indexes over DB tasks
  const bySyncId = new Map<string, DbTask[]>();
  const byHash = new Map<string, DbTask[]>();
  const byTitleResp = new Map<string, DbTask[]>();
  for (const t of dbTasks) {
    const sid = extractSyncId(t);
    if (sid) (bySyncId.get(sid) ?? bySyncId.set(sid, []).get(sid)!).push(t);
    if (t.import_hash) (byHash.get(t.import_hash) ?? byHash.set(t.import_hash, []).get(t.import_hash)!).push(t);
    const respName = t.responsible_person_id ? personIdToName.get(t.responsible_person_id) ?? '' : '';
    const k = titleResponsibleKey(t.title, respName);
    (byTitleResp.get(k) ?? byTitleResp.set(k, []).get(k)!).push(t);
  }

  // Count CSV rows per (title+responsible) so we only secondary-match when unique on BOTH sides
  const csvTitleRespCount = new Map<string, number>();
  for (const c of parsed.tasks) {
    const k = titleResponsibleKey(c.title, c.responsible);
    csvTitleRespCount.set(k, (csvTitleRespCount.get(k) ?? 0) + 1);
  }

  const matchedDbIds = new Set<string>();
  const rows: CompareRow[] = [];

  for (const csv of parsed.tasks) {
    let match: DbTask | undefined;
    let matchedBy: CompareRow['matchedBy'] | undefined;
    let ambiguous = false;
    let note: string | undefined;

    // 1) sync_id
    if (csv.sync_id) {
      const cands = (bySyncId.get(csv.sync_id.toLowerCase()) ?? []).filter(t => !matchedDbIds.has(t.id));
      if (cands.length === 1) {
        match = cands[0];
        matchedBy = 'sync_id';
      } else if (cands.length > 1) {
        ambiguous = true;
        note = `sync_id matches ${cands.length} DB rows`;
      }
    }

    // 2) import_hash
    if (!match && !ambiguous) {
      const cands = (byHash.get(csv.import_hash) ?? []).filter(t => !matchedDbIds.has(t.id));
      if (cands.length === 1) {
        match = cands[0];
        matchedBy = 'import_hash';
      } else if (cands.length > 1) {
        ambiguous = true;
        note = `import_hash matches ${cands.length} DB rows`;
      }
    }

    // 3) (title + responsible) — only if unique on BOTH sides
    if (!match && !ambiguous) {
      const k = titleResponsibleKey(csv.title, csv.responsible);
      const cands = (byTitleResp.get(k) ?? []).filter(t => !matchedDbIds.has(t.id));
      if (cands.length === 1 && (csvTitleRespCount.get(k) ?? 0) === 1) {
        match = cands[0];
        matchedBy = 'title+responsible';
      } else if (cands.length >= 1) {
        ambiguous = true;
        note = `title+responsible matches ${cands.length} DB row(s) / ${csvTitleRespCount.get(k)} CSV row(s)`;
      }
    }

    if (ambiguous) {
      rows.push({ csv, category: 'ambiguous_match', note });
      continue;
    }
    if (!match) {
      rows.push({ csv, category: 'missing_in_db' });
      continue;
    }

    matchedDbIds.add(match.id);
    const diffs = diffFields(csv, match, personIdToName, personNameToId);
    rows.push({
      csv,
      category: diffs.length ? 'different_in_db' : 'already_correct',
      matchedBy,
      dbTaskId: match.id,
      diffs: diffs.length ? diffs : undefined,
    });
  }

  const extraInDb = dbTasks
    .filter(t => !matchedDbIds.has(t.id))
    .map(t => ({
      id: t.id,
      title: t.title,
      status: t.status,
      responsible: t.responsible_person_id ? personIdToName.get(t.responsible_person_id) ?? null : null,
    }));

  const dbPeopleLower = new Set(dbPeople.map(p => collapse(p.name).toLowerCase()));
  const peopleMissing = parsed.people.filter(name => !dbPeopleLower.has(collapse(name).toLowerCase()));

  return { rows, extraInDb, peopleMissing };
}

function diffFields(
  csv: ParsedTask,
  db: DbTask,
  personIdToName: Map<string, string>,
  personNameToId: Map<string, string>,
): FieldDiff[] {
  const diffs: FieldDiff[] = [];

  if (collapse(csv.title) !== collapse(db.title)) {
    diffs.push({ field: 'title', csv: collapse(csv.title), db: collapse(db.title) });
  }
  if (csv.status !== db.status) diffs.push({ field: 'status', csv: csv.status, db: db.status });
  if (csv.priority !== db.priority) diffs.push({ field: 'priority', csv: csv.priority, db: db.priority });

  const dbDue = db.due_date ? String(db.due_date).slice(0, 10) : null;
  if ((csv.due_date ?? null) !== (dbDue ?? null)) {
    diffs.push({ field: 'due_date', csv: csv.due_date, db: dbDue });
  }

  const dbClosed = db.closed_date ? String(db.closed_date).slice(0, 10) : null;
  if ((csv.closed_date ?? null) !== (dbClosed ?? null)) {
    diffs.push({ field: 'closed_date', csv: csv.closed_date, db: dbClosed });
  }

  if (collapse(csv.notes) !== collapse(db.notes ?? '')) {
    diffs.push({ field: 'notes', csv: collapse(csv.notes), db: collapse(db.notes ?? '') });
  }

  // responsible person (compare by name; report resolvability)
  const csvName = csv.responsible ? collapse(csv.responsible).toLowerCase() : null;
  const dbName = db.responsible_person_id
    ? collapse(personIdToName.get(db.responsible_person_id) ?? '').toLowerCase() || null
    : null;
  if (csvName !== dbName) {
    diffs.push({
      field: 'responsible_person',
      csv: csv.responsible ?? null,
      db: db.responsible_person_id ? personIdToName.get(db.responsible_person_id) ?? '(unknown)' : null,
    });
  }

  if (db.archived === true) diffs.push({ field: 'archived', csv: false, db: true });

  // touch personNameToId to keep signature consistent / future use
  void personNameToId;
  return diffs;
}

// ---------------------------------------------------------------------------
// Reporting helpers
// ---------------------------------------------------------------------------
function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}-${p(
    d.getMinutes(),
  )}-${p(d.getSeconds())}`;
}

function tally(rows: CompareRow[]): Record<Category, number> {
  const t: Record<Category, number> = {
    already_correct: 0,
    missing_in_db: 0,
    different_in_db: 0,
    ambiguous_match: 0,
  };
  for (const r of rows) t[r.category]++;
  return t;
}

function printReport(
  file: string,
  parsed: ParseResult,
  cmp: CompareResult,
  dbTaskCount: number,
  dbPeopleCount: number,
  mode: 'DRY-RUN' | 'APPLY',
) {
  const counts = tally(cmp.rows);
  console.log(`\n========== CSV ↔ SUPABASE ${mode} REPORT ==========`);
  console.log(`CSV file used            : ${file}`);
  console.log(`Detected headers         : ${parsed.headers.map(normalizeHeader).filter(Boolean).join(' | ')}`);
  console.log('Column mapping (col idx) :');
  console.log(`   title       -> ${parsed.columnMap.title}`);
  console.log(`   description -> ${parsed.columnMap.description}`);
  console.log(`   status      -> ${parsed.columnMap.status}`);
  console.log(`   priority    -> ${parsed.columnMap.priority}`);
  console.log(`   notes       -> ${parsed.columnMap.notes}`);
  console.log(`   responsible -> ${parsed.columnMap.responsible}`);
  console.log(`   due_date    -> ${parsed.columnMap.due_date}`);
  console.log(`   type        -> ${parsed.columnMap.type}`);
  console.log(`   sync_id     -> ${parsed.columnMap.sync_id}`);
  console.log('');
  console.log(`Raw non-empty CSV rows   : ${parsed.rawRowCount}`);
  console.log(`Valid CSV tasks (deduped): ${parsed.tasks.length}`);
  console.log(`Invalid / skipped rows   : ${parsed.invalidRows.length}`);
  console.log(`Duplicate CSV rows       : ${parsed.duplicateRows.length}`);
  console.log(`People in CSV            : ${parsed.people.length}  [${parsed.people.join(', ')}]`);
  console.log(`People missing from DB   : ${cmp.peopleMissing.length}  [${cmp.peopleMissing.join(', ') || '—'}]`);
  console.log(`Tasks currently in DB    : ${dbTaskCount}`);
  console.log(`People currently in DB   : ${dbPeopleCount}`);
  console.log('');
  console.log('Comparison categories:');
  console.log(`   already_correct : ${counts.already_correct}`);
  console.log(`   missing_in_db   : ${counts.missing_in_db}`);
  console.log(`   different_in_db : ${counts.different_in_db}`);
  console.log(`   ambiguous_match : ${counts.ambiguous_match}`);
  console.log(`   extra_in_db     : ${cmp.extraInDb.length}  (reported only — never deleted)`);
  console.log(`   invalid_csv_row : ${parsed.invalidRows.length}`);

  console.log('\nWarnings by type:');
  if (Object.keys(parsed.warnings).length === 0) console.log('   (none)');
  else for (const [k, v] of Object.entries(parsed.warnings)) console.log(`   ${k}: ${v}`);

  if (parsed.invalidRows.length) {
    console.log('\nInvalid / skipped rows (data-row #, reason):');
    parsed.invalidRows.forEach(x => console.log(`   row ${x.rowNumber}: ${x.reason}`));
  }
  if (parsed.duplicateRows.length) {
    console.log('\nDuplicate CSV rows collapsed (data-row #, kept row #, title):');
    parsed.duplicateRows.forEach(x =>
      console.log(`   row ${x.rowNumber} (kept ${x.keptRow}): ${x.title}${x.conflict ? `  [CONFLICT: ${x.conflict}]` : ''}`),
    );
  }

  const missing = cmp.rows.filter(r => r.category === 'missing_in_db');
  if (missing.length) {
    console.log(`\nProposed INSERTS (${missing.length}):`);
    missing.slice(0, 40).forEach(r =>
      console.log(
        `   row ${r.csv.rowNumber}: [${r.csv.responsible ?? '—'}] P${r.csv.priority} [${r.csv.status}] ${r.csv.title.slice(0, 60)}`,
      ),
    );
    if (missing.length > 40) console.log(`   ... and ${missing.length - 40} more`);
  }

  const different = cmp.rows.filter(r => r.category === 'different_in_db');
  if (different.length) {
    console.log(`\nProposed UPDATES (${different.length}):`);
    different.forEach(r => {
      const fields = (r.diffs ?? []).map(d => `${d.field}: ${JSON.stringify(d.db)} -> ${JSON.stringify(d.csv)}`);
      console.log(`   row ${r.csv.rowNumber} [match:${r.matchedBy}] "${r.csv.title.slice(0, 50)}"`);
      fields.forEach(f => console.log(`        ${f}`));
    });
  }

  const ambiguous = cmp.rows.filter(r => r.category === 'ambiguous_match');
  if (ambiguous.length) {
    console.log(`\nAMBIGUOUS (left untouched) (${ambiguous.length}):`);
    ambiguous.forEach(r => console.log(`   row ${r.csv.rowNumber}: "${r.csv.title.slice(0, 50)}" — ${r.note}`));
  }

  if (cmp.peopleMissing.length) {
    console.log(`\nProposed PEOPLE CREATES (${cmp.peopleMissing.length}): ${cmp.peopleMissing.join(', ')}`);
  }

  if (cmp.extraInDb.length) {
    console.log(`\nEXTRA in DB (not in CSV — NEVER deleted) (${cmp.extraInDb.length}):`);
    cmp.extraInDb.slice(0, 40).forEach(x =>
      console.log(`   [${x.responsible ?? '—'}] [${x.status}] ${x.title.slice(0, 60)}`),
    );
    if (cmp.extraInDb.length > 40) console.log(`   ... and ${cmp.extraInDb.length - 40} more`);
  }
  console.log('====================================================\n');
}

function buildReportObject(
  file: string,
  parsed: ParseResult,
  cmp: CompareResult,
  dbTaskCount: number,
  dbPeopleCount: number,
  applied?: unknown,
) {
  const counts = tally(cmp.rows);
  return {
    file,
    generated_at: timestamp(),
    headers: parsed.headers,
    columnMap: parsed.columnMap,
    rawRowCount: parsed.rawRowCount,
    validTasks: parsed.tasks.length,
    invalidRows: parsed.invalidRows,
    duplicateRows: parsed.duplicateRows,
    warnings: parsed.warnings,
    peopleInCsv: parsed.people,
    peopleMissingFromDb: cmp.peopleMissing,
    dbTaskCount,
    dbPeopleCount,
    categoryCounts: { ...counts, extra_in_db: cmp.extraInDb.length, invalid_csv_row: parsed.invalidRows.length },
    missing_in_db: cmp.rows
      .filter(r => r.category === 'missing_in_db')
      .map(r => ({ row: r.csv.rowNumber, title: r.csv.title, responsible: r.csv.responsible })),
    different_in_db: cmp.rows
      .filter(r => r.category === 'different_in_db')
      .map(r => ({ row: r.csv.rowNumber, title: r.csv.title, matchedBy: r.matchedBy, dbTaskId: r.dbTaskId, diffs: r.diffs })),
    ambiguous_match: cmp.rows
      .filter(r => r.category === 'ambiguous_match')
      .map(r => ({ row: r.csv.rowNumber, title: r.csv.title, note: r.note })),
    extra_in_db: cmp.extraInDb,
    applied: applied ?? null,
  };
}

// ---------------------------------------------------------------------------
// DB fetch
// ---------------------------------------------------------------------------
// supabase-js is loosely typed for our purposes; keep `any` local to the boundary.
/* eslint-disable @typescript-eslint/no-explicit-any */
async function fetchAll(supabase: any) {
  const { data: dbTasks, error: tErr } = await supabase.from('tasks').select('*');
  if (tErr) throw new Error(`tasks fetch failed: ${tErr.message}`);
  const { data: dbPeople, error: pErr } = await supabase.from('people').select('*');
  if (pErr) throw new Error(`people fetch failed: ${pErr.message}`);
  return { dbTasks: (dbTasks ?? []) as DbTask[], dbPeople: (dbPeople ?? []) as DbPerson[] };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

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
    const def = 'New Engineering Tasks - 2026 - Engineering Tasks.csv';
    if (fs.existsSync(path.join(ROOT, def))) {
      file = def;
    } else {
      const candidates = fs.readdirSync(ROOT).filter(f => f.toLowerCase().endsWith('.csv'));
      console.error('ERROR: no --file provided and the default CSV was not found.');
      console.error('Candidate CSV files in project root:');
      candidates.forEach(c => console.error(`   ${c}`));
      console.error('Re-run with --file "<one of the above>". Stopping (no guessing).');
      process.exit(1);
    }
  }

  const absFile = path.isAbsolute(file) ? file : path.join(ROOT, file);
  if (!fs.existsSync(absFile)) {
    console.error(`ERROR: file not found: ${absFile}`);
    const candidates = fs.readdirSync(ROOT).filter(f => f.toLowerCase().endsWith('.csv'));
    if (candidates.length) {
      console.error('Candidate CSV files in project root:');
      candidates.forEach(c => console.error(`   ${c}`));
    }
    process.exit(1);
  }
  if (!dryRun && !apply) {
    console.error('ERROR: specify either --dry-run or --apply.');
    console.error('  npm run sync:tasks -- --file "<file>" --dry-run');
    console.error('  npm run sync:tasks -- --file "<file>" --apply');
    process.exit(1);
  }

  loadEnv();

  const ext = path.extname(absFile).toLowerCase();
  const rows = ext === '.xlsx' || ext === '.xls' ? await parseXlsx(absFile) : parseCsv(fs.readFileSync(absFile, 'utf8'));
  const sourceFile = path.basename(absFile);
  const parsed = parseTasks(rows, sourceFile);

  const reportDir = path.join(ROOT, 'reports');
  fs.mkdirSync(reportDir, { recursive: true });

  // Connect + fetch current DB state (needed for both modes)
  const { supabase, host } = await getSupabase();
  const { dbTasks, dbPeople } = await fetchAll(supabase);
  const cmp = compare(parsed, dbTasks, dbPeople);

  // -------------------- DRY RUN --------------------
  if (dryRun) {
    printReport(sourceFile, parsed, cmp, dbTasks.length, dbPeople.length, 'DRY-RUN');
    const reportPath = path.join(reportDir, `task-sync-dry-run-${timestamp()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(buildReportObject(sourceFile, parsed, cmp, dbTasks.length, dbPeople.length), null, 2));
    console.log(`Dry-run report written to: ${path.relative(ROOT, reportPath)}`);
    console.log('DRY RUN complete — no data was written to Supabase.\n');
    return;
  }

  // -------------------- APPLY --------------------
  printReport(sourceFile, parsed, cmp, dbTasks.length, dbPeople.length, 'APPLY');

  // 1) Backup tasks + people FIRST
  console.log('[1/6] Backing up current Supabase data...');
  const backupDir = path.join(ROOT, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const ts = timestamp();
  const tasksBackupPath = path.join(backupDir, `tasks-before-sync-${ts}.json`);
  const peopleBackupPath = path.join(backupDir, `people-before-sync-${ts}.json`);
  fs.writeFileSync(tasksBackupPath, JSON.stringify({ timestamp: ts, supabase_host: host, row_count: dbTasks.length, tasks: dbTasks }, null, 2));
  fs.writeFileSync(peopleBackupPath, JSON.stringify({ timestamp: ts, supabase_host: host, row_count: dbPeople.length, people: dbPeople }, null, 2));
  console.log(`   tasks backup : ${path.relative(ROOT, tasksBackupPath)} (${dbTasks.length} rows)`);
  console.log(`   people backup: ${path.relative(ROOT, peopleBackupPath)} (${dbPeople.length} rows)`);

  // 2) Create missing people (never delete)
  console.log('\n[2/6] Creating missing people (never deletes)...');
  const peopleMap = new Map<string, string>(); // lowercased name -> id
  for (const p of dbPeople) peopleMap.set(collapse(p.name).toLowerCase(), p.id);
  let peopleCreated = 0;
  const peopleCreatedNames: string[] = [];
  for (const name of cmp.peopleMissing) {
    const { data, error } = await supabase.from('people').insert([{ name }]).select().single();
    if (error) {
      console.error(`   ERROR creating person "${name}": ${error.message}`);
      console.error('   Aborting before any task insert/update. No destructive change was made.');
      process.exit(1);
    }
    peopleMap.set(collapse(name).toLowerCase(), data.id);
    peopleCreated++;
    peopleCreatedNames.push(name);
    console.log(`   created person: ${name}`);
  }
  console.log(`   people created: ${peopleCreated}`);

  const resolvePerson = (resp: string | null): string | null =>
    resp ? peopleMap.get(collapse(resp).toLowerCase()) ?? null : null;

  // 3) Insert missing tasks
  const toInsert = cmp.rows.filter(r => r.category === 'missing_in_db');
  console.log(`\n[3/6] Inserting missing tasks (${toInsert.length})...`);
  const insertPayloads = toInsert.map(r => ({
    title: r.csv.title,
    description: r.csv.description,
    notes: r.csv.notes || null,
    status: r.csv.status,
    priority: r.csv.priority,
    responsible_person_id: resolvePerson(r.csv.responsible),
    due_date: r.csv.due_date,
    closed_date: r.csv.closed_date,
    type: r.csv.type,
    source_file: r.csv.source_file,
    source_raw_text: r.csv.source_raw_text,
    import_hash: r.csv.import_hash,
    archived: false,
  }));
  let inserted = 0;
  const insertErrors: { title: string; error: string }[] = [];
  const BATCH = 100;
  for (let i = 0; i < insertPayloads.length; i += BATCH) {
    const batch = insertPayloads.slice(i, i + BATCH);
    const { data, error } = await supabase.from('tasks').insert(batch).select('id');
    if (error) {
      // Fall back to per-row inserts so one bad row (e.g. import_hash unique clash) doesn't sink the batch.
      console.error(`   batch insert error (${error.message}); retrying row-by-row...`);
      for (let j = i; j < Math.min(i + BATCH, insertPayloads.length); j++) {
        const { error: e2 } = await supabase.from('tasks').insert([insertPayloads[j]]).select('id');
        if (e2) insertErrors.push({ title: toInsert[j].csv.title, error: e2.message });
        else inserted++;
      }
    } else {
      inserted += data?.length ?? 0;
    }
  }
  console.log(`   inserted ${inserted} tasks.`);
  if (insertErrors.length) {
    console.log(`   ${insertErrors.length} insert(s) failed (left as-is):`);
    insertErrors.forEach(e => console.log(`      "${e.title.slice(0, 50)}": ${e.error}`));
  }

  // 4) Update deterministically-matched, differing tasks
  const toUpdate = cmp.rows.filter(r => r.category === 'different_in_db' && r.dbTaskId);
  console.log(`\n[4/6] Updating changed tasks (${toUpdate.length}, only deterministic matches)...`);
  let updated = 0;
  const updateErrors: { title: string; error: string }[] = [];
  for (const r of toUpdate) {
    const payload = {
      title: r.csv.title,
      description: r.csv.description,
      notes: r.csv.notes || null,
      status: r.csv.status,
      priority: r.csv.priority,
      responsible_person_id: resolvePerson(r.csv.responsible),
      due_date: r.csv.due_date,
      closed_date: r.csv.closed_date,
      type: r.csv.type,
      source_file: r.csv.source_file,
      source_raw_text: r.csv.source_raw_text,
      import_hash: r.csv.import_hash,
      archived: false,
    };
    const { error } = await supabase.from('tasks').update(payload).eq('id', r.dbTaskId);
    if (error) updateErrors.push({ title: r.csv.title, error: error.message });
    else updated++;
  }
  console.log(`   updated ${updated} tasks.`);
  if (updateErrors.length) {
    console.log(`   ${updateErrors.length} update(s) failed (left as-is):`);
    updateErrors.forEach(e => console.log(`      "${e.title.slice(0, 50)}": ${e.error}`));
  }

  const skippedAmbiguous = cmp.rows.filter(r => r.category === 'ambiguous_match').length;

  // 5) Verify final state
  console.log('\n[5/6] Verifying final Supabase state...');
  const { dbTasks: finalTasks, dbPeople: finalPeople } = await fetchAll(supabase);
  const idToName = new Map(finalPeople.map(p => [p.id, p.name]));
  const byStatus: Record<string, number> = {};
  const byPerson: Record<string, number> = {};
  for (const t of finalTasks) {
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    const nm = t.responsible_person_id ? idToName.get(t.responsible_person_id) ?? '(unknown)' : '(unassigned)';
    byPerson[nm] = (byPerson[nm] ?? 0) + 1;
  }

  console.log('\n========== APPLY VERIFICATION ==========');
  console.log(`Final tasks count        : ${finalTasks.length}`);
  console.log(`Final people count       : ${finalPeople.length}`);
  console.log(`People created           : ${peopleCreated}  [${peopleCreatedNames.join(', ') || '—'}]`);
  console.log(`Tasks inserted           : ${inserted}`);
  console.log(`Tasks updated            : ${updated}`);
  console.log(`Tasks skipped (ambiguous): ${skippedAmbiguous}`);
  console.log(`Insert failures          : ${insertErrors.length}`);
  console.log(`Update failures          : ${updateErrors.length}`);
  console.log(`Extra-in-DB still present: ${cmp.extraInDb.length}  (never deleted)`);
  console.log('\nCount by status:');
  for (const [k, v] of Object.entries(byStatus)) console.log(`   ${k.padEnd(15)}: ${v}`);
  console.log('\nCount by responsible person:');
  for (const [k, v] of Object.entries(byPerson)) console.log(`   ${String(k).padEnd(15)}: ${v}`);
  console.log('\nSample tasks (5):');
  finalTasks.slice(0, 5).forEach((t, i) => {
    const nm = t.responsible_person_id ? idToName.get(t.responsible_person_id) ?? '?' : '(unassigned)';
    console.log(`   ${i + 1}. [${nm}] P${t.priority} [${t.status}] ${t.title.slice(0, 50)}`);
  });
  console.log('========================================');

  // 6) Write apply report
  console.log('\n[6/6] Writing apply report...');
  const applied = {
    backups: { tasks: path.relative(ROOT, tasksBackupPath), people: path.relative(ROOT, peopleBackupPath) },
    peopleCreated: peopleCreatedNames,
    inserted,
    updated,
    skippedAmbiguous,
    insertErrors,
    updateErrors,
    extraInDbStillPresent: cmp.extraInDb.length,
    finalTaskCount: finalTasks.length,
    finalPeopleCount: finalPeople.length,
    byStatus,
    byPerson,
  };
  const reportPath = path.join(reportDir, `task-sync-apply-${timestamp()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(buildReportObject(sourceFile, parsed, cmp, dbTasks.length, dbPeople.length, applied), null, 2));
  console.log(`   apply report written to: ${path.relative(ROOT, reportPath)}`);
  console.log(
    `\nAPPLY complete: created ${peopleCreated} people, inserted ${inserted}, updated ${updated}, skipped ${skippedAmbiguous} ambiguous. Nothing deleted.`,
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
