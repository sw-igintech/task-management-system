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
