// Person-mention helpers for Notes/Description.
//
// Two distinct @-things live in task text:
//   * Task references — "@123", "@TASK-123", "@task-123" (numeric). Unchanged here;
//     resolved/linkified by TaskTextWithLinks.
//   * Person mentions — stored as the stable, rename-safe token "@person:<id>" and
//     displayed read-only as "@Name". Using the id (not the name) means renaming a
//     person never breaks existing mentions and duplicate names are unambiguous.
//
// These helpers are pure and side-effect free so they can be unit-checked in isolation.

import type { Task, Person } from '../types';

// Stored token prefix for a person mention.
export const PERSON_MENTION_PREFIX = '@person:';

// Matches a stored "@person:<id>" token. The id allows the characters produced by
// crypto.randomUUID() (hex + hyphen) plus generic id chars. The leading lookbehind
// rejects a "@" glued to a word char, so emails ("a@person:x" never occurs, but
// "foo@person" would not match either) and mid-word text don't false-trigger.
const PERSON_MENTION_SOURCE = '(?<![A-Za-z0-9_])@person:([A-Za-z0-9_-]+)';

// Builds the stored token for a person id.
export function buildPersonMention(personId: string): string {
  return `${PERSON_MENTION_PREFIX}${personId}`;
}

// Extracts the person ids mentioned in one text field, in first-seen order, deduped.
export function extractPersonMentionIds(text: string | null | undefined): string[] {
  if (!text) return [];
  const re = new RegExp(PERSON_MENTION_SOURCE, 'g');
  const ids: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      ids.push(m[1]);
    }
  }
  return ids;
}

// Unique person ids mentioned across BOTH description and notes (deduped union).
export function extractTaskPersonMentionIds(
  description?: string | null,
  notes?: string | null,
): string[] {
  const all = [...extractPersonMentionIds(description), ...extractPersonMentionIds(notes)];
  return Array.from(new Set(all));
}

// ── Display ⇄ storage conversion for person mentions ─────────────────────────
// Storage form (in DB):   "@person:<id>"  — stable, rename-safe.
// Display/edit form (UI): "@Name"         — friendly; never exposes the UUID.
// These three helpers convert between the two so the user never sees a raw token.

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Read-only / plain-text display: "@person:<id>" → "@Name" ("@unknown" if the id no
// longer resolves). The styled UI uses <TaskTextWithLinks>; this is the plain-text twin.
export function renderStoredMentionsForDisplay(text: string | null | undefined, people: Person[]): string {
  if (!text) return text ?? '';
  const byId = new Map(people.map(p => [p.id, p.name]));
  return text.replace(new RegExp(PERSON_MENTION_SOURCE, 'g'), (_m, id: string) => {
    const name = byId.get(id);
    return name ? `@${name}` : '@unknown';
  });
}

// Edit-mode prep: "@person:<id>" → "@Name" so the textarea shows friendly names. An id
// that no longer resolves is LEFT as the raw token (not "@unknown") so the mention is
// preserved verbatim on save rather than silently lost. Current people all resolve.
export function prepareMentionsForEditing(text: string | null | undefined, people: Person[]): string {
  if (!text) return text ?? '';
  const byId = new Map(people.map(p => [p.id, p.name]));
  return text.replace(new RegExp(PERSON_MENTION_SOURCE, 'g'), (m, id: string) => {
    const name = byId.get(id);
    return name ? `@${name}` : m;
  });
}

// Save-time serialization: "@Name" → "@person:<id>" for every known person name (matched
// case-insensitively, at a mention boundary, longest-name-first). It never touches
// "@TASK-123" task references (names are non-numeric), never re-wraps an existing
// "@person:<id>" token, and leaves unknown "@Foo" text untouched.
// Duplicate names (none currently) resolve deterministically to the lowest id.
export function serializeMentionsForStorage(text: string | null | undefined, people: Person[]): string {
  if (!text) return text ?? '';
  if (people.length === 0) return text;
  const byName = new Map<string, string>();
  for (const p of [...people].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const key = p.name.toLowerCase();
    if (!byName.has(key)) byName.set(key, p.id);
  }
  const alt = [...people]
    .map(p => p.name)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|');
  const re = new RegExp(`(?<![A-Za-z0-9_])@(${alt})(?![A-Za-z0-9_])`, 'gi');
  return text.replace(re, (m, name: string) => {
    const id = byName.get(name.toLowerCase());
    return id ? `${PERSON_MENTION_PREFIX}${id}` : m;
  });
}

// ── Tokenizer for highlighting (edit-mode preview) ───────────────────────────
// Splits text into typed segments so a preview can colour mentions/task refs blue.
// Handles the EDIT-form text (which contains friendly "@Name") as well as stored
// "@person:<id>" tokens; task references ("@TASK-135", "@task-135", "@135") are typed
// as 'task'. Person names are non-numeric, so they never collide with task numbers.
export type MentionSegment = { text: string; type: 'plain' | 'person' | 'task' };

export function tokenizeMentions(text: string, people: Person[]): MentionSegment[] {
  if (!text) return [];
  const byId = new Map(people.map(p => [p.id, p.name]));
  // Longest names first so e.g. "Anna Lee" wins over "Anna".
  const nameAlt = [...people]
    .map(p => p.name)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|');
  // person:<id>  |  @Name (known)  |  task ref (@TASK-n / @task-n / @n)
  const namePart = nameAlt ? `(${nameAlt})(?![A-Za-z0-9_])|` : '';
  const re = new RegExp(
    `(?<![A-Za-z0-9_])@(?:person:([A-Za-z0-9_-]+)|${namePart}(?:task-)?(\\d+)\\b)`,
    'gi',
  );

  const segments: MentionSegment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segments.push({ text: text.slice(last, m.index), type: 'plain' });
    const personId = m[1];
    const personName = nameAlt ? m[2] : undefined;
    if (personId !== undefined) {
      const name = byId.get(personId);
      segments.push({ text: name ? `@${name}` : '@unknown', type: 'person' });
    } else if (personName !== undefined) {
      segments.push({ text: m[0], type: 'person' });
    } else {
      segments.push({ text: m[0], type: 'task' });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), type: 'plain' });
  return segments;
}

// A single entry in the combined @-mention autocomplete dropdown.
export type MentionItem =
  | { kind: 'task'; task: Task }
  | { kind: 'person'; person: Person };

const TASK_LIMIT = 6;
const PERSON_LIMIT = 6;

// Builds the combined suggestion list for an in-progress "@<query>" token.
//  * Numeric (or empty / "task-" / "#" prefixed) queries surface task references,
//    preserving the previous task-only behaviour.
//  * Any query also surfaces people whose name contains it (empty query → all people).
// Tasks are listed first, then people; the dropdown groups them under headings.
export function getMentionItems(tasks: Task[], people: Person[], query: string): MentionItem[] {
  const lower = query.trim().toLowerCase();

  // Task branch: only when the query looks like a (possibly empty) task number.
  const numericQuery = lower.replace(/^#?(?:task-)?/, '');
  const isNumberQuery = /^\d*$/.test(numericQuery);
  let taskItems: MentionItem[] = [];
  if (isNumberQuery) {
    const withNumber = tasks.filter(t => t.task_number != null);
    const sorted = numericQuery === ''
      ? [...withNumber].sort((a, b) => (b.task_number ?? 0) - (a.task_number ?? 0))
      : withNumber
          .filter(t => String(t.task_number).startsWith(numericQuery))
          .sort((a, b) => (a.task_number ?? 0) - (b.task_number ?? 0));
    taskItems = sorted.slice(0, TASK_LIMIT).map(task => ({ kind: 'task', task }));
  }

  // People branch: name substring match (case-insensitive); empty query → all people.
  const personItems: MentionItem[] = people
    .filter(p => lower === '' || p.name.toLowerCase().includes(lower))
    .slice(0, PERSON_LIMIT)
    .map(person => ({ kind: 'person', person }));

  return [...taskItems, ...personItems];
}
