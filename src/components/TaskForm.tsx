import { useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ClipboardEvent as ReactClipboardEvent, FocusEvent as ReactFocusEvent, MouseEvent as ReactMouseEvent } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Task, Person } from '../types';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Textarea } from './ui/Textarea';
import { Button } from './ui/Button';
import { MentionSuggestions } from './MentionSuggestions';
import { STATUS_LABELS, PRIORITY_LABELS } from '../lib/utils';

const MENTION_LIMIT = 8;

// Detects an in-progress @-mention token ending at the caret. The @ must be at the
// start of the field or after a separator (space/newline/( [ { : ,), so emails like
// "name@example.com" never trigger it. Returns the token's start index, end index,
// and the numeric query typed after @ (empty while just "@" or "@TASK-").
function detectMentionToken(value: string, caret: number): { start: number; end: number; query: string } | null {
  const before = value.slice(0, caret);
  const m = before.match(/(?<=^|[\s([{:,\n])@(?:task-)?(\d*)$/i);
  if (!m) return null;
  return { start: caret - m[0].length, end: caret, query: m[1] };
}

// Builds the suggestion list for a mention query from the loaded tasks. Only tasks
// that have a task_number are eligible. Empty query → most-recent (highest) numbers.
function getMentionSuggestions(tasks: Task[], query: string): Task[] {
  const withNumber = tasks.filter(t => t.task_number != null);
  const sorted = query === ''
    ? [...withNumber].sort((a, b) => (b.task_number ?? 0) - (a.task_number ?? 0))
    : withNumber
        .filter(t => String(t.task_number).startsWith(query))
        .sort((a, b) => (a.task_number ?? 0) - (b.task_number ?? 0));
  return sorted.slice(0, MENTION_LIMIT);
}

const taskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  status: z.enum(['not_started', 'in_progress', 'on_hold', 'need_to_review', 'done']),
  priority: z.coerce.number().int().min(1).max(5),
  responsible_person_id: z.string().optional(),
  // "Opened by" is required for both create and edit (existing tasks with no
  // value must have one selected before saving).
  opened_by_person_id: z.string().min(1, 'Opened by is required'),
  due_date: z.string().optional().nullable(),
  notes: z.string().optional(),
  description: z.string().optional(),
});

export type TaskFormData = z.infer<typeof taskSchema>;

// Text fields that receive the automatic dated traceability prefix.
type TraceField = 'notes' | 'description';

// Builds the "(DD.MM.YY) " trace prefix (parentheses + one trailing space).
// e.g. 2026-06-17 -> "(17.06.26) ". It is plain, editable text saved inline in
// the field — not a separate component, lock, or DB column.
function formatTraceDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear() % 100).padStart(2, '0');
  return `(${dd}.${mm}.${yy}) `;
}

interface TaskFormProps {
  task?: Task;
  people: Person[];
  onSubmit: (data: TaskFormData) => void;
  onCancel: () => void;
  isLoading?: boolean;
  // Source for @-mention autocomplete suggestions (the loaded task list). Optional
  // so existing callers without it simply get no suggestions.
  mentionTasks?: Task[];
}

export function TaskForm({ task, people, onSubmit, onCancel, isLoading, mentionTasks = [] }: TaskFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } = useForm<TaskFormData>({
    resolver: zodResolver(taskSchema) as any,
    defaultValues: {
      title: task?.title ?? '',
      status: task?.status ?? 'not_started',
      priority: task?.priority ?? 2,
      responsible_person_id: task?.responsible_person_id ?? '',
      opened_by_person_id: task?.opened_by_person_id ?? '',
      due_date: task?.due_date ?? '',
      notes: task?.notes ?? '',
      description: task?.description ?? '',
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onFormSubmit = handleSubmit((data: any) => onSubmit(data as TaskFormData));

  // Automatic dated traceability prefix for Notes/Description.
  // Per-field flag: whether the CURRENT focus interaction already auto-inserted a
  // prefix. Reset on focus so each new editing interaction inserts exactly once
  // (avoids "(17.06.26) (17.06.26) ..." on every keystroke). The inserted text is
  // ordinary editable text — the user may delete/keep/ignore it and we never re-add it.
  const tracePrefixDone = useRef<Record<TraceField, boolean>>({ notes: false, description: false });

  // Inserts "(DD.MM.YY) " + the just-typed/pasted text at the cursor, replacing any
  // selection, then restores focus and places the caret right after the typed text.
  const insertTracePrefix = (el: HTMLTextAreaElement, field: TraceField, typed: string) => {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const before = el.value.slice(0, start);
    const after = el.value.slice(end);
    // Put the trace on its own line unless we're at the very start or already right
    // after a newline (keeps existing text intact; predictable for mid-line edits).
    const lead = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
    const head = before + lead + formatTraceDate(new Date()) + typed;
    setValue(field, head + after, { shouldDirty: true, shouldTouch: true });
    tracePrefixDone.current[field] = true;
    // setValue updates the uncontrolled textarea's value via RHF's ref; restore the
    // caret on the next frame so it lands after the inserted prefix + typed text.
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(head.length, head.length);
    });
  };

  // The field name comes from the textarea's `name` attribute (set by register()),
  // so these stay single, directly-assigned event handlers (no currying at render).
  // New editing interaction → re-arm the auto-insert for the next typed character.
  const handleTraceFocus = (e: ReactFocusEvent<HTMLTextAreaElement>) => {
    tracePrefixDone.current[e.currentTarget.name as TraceField] = false;
  };

  const handleTraceKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    const field = e.currentTarget.name as TraceField;
    if (tracePrefixDone.current[field]) return;        // already inserted this interaction
    if (e.nativeEvent.isComposing || e.key === 'Process' || e.keyCode === 229) return; // IME composition (e.g. dead keys / CJK): don't interfere
    if (e.ctrlKey || e.metaKey || e.altKey) return;    // shortcuts (Ctrl+A/C/V/Z…); paste handled separately
    if (e.key.length !== 1) return;                    // only printable chars; excludes Enter, Tab, arrows, Backspace, Delete, Home/End, PageUp/Down, Esc, modifiers
    // First printable keystroke of this interaction → insert prefix + this char.
    e.preventDefault();
    insertTracePrefix(e.currentTarget, field, e.key);
  };

  const handleTracePaste = (e: ReactClipboardEvent<HTMLTextAreaElement>) => {
    const field = e.currentTarget.name as TraceField;
    if (tracePrefixDone.current[field]) return;
    const text = e.clipboardData.getData('text');
    if (!text) return;
    e.preventDefault();
    insertTracePrefix(e.currentTarget, field, text);
  };

  // ── @-mention autocomplete for Notes/Description ──────────────────────────
  // Editing helper only: it inserts plain "@<number>" text; nothing is stored as a
  // rich object and the read-only renderer (TaskTextWithLinks) linkifies it later.
  const [mention, setMention] = useState<{ field: TraceField; start: number; end: number; query: string } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const suggestions = mention ? getMentionSuggestions(mentionTasks, mention.query) : [];
  const NAV_KEYS = ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'];

  // Re-evaluate whether the caret sits inside a mention token; open/close the popup.
  const recomputeMention = (el: HTMLTextAreaElement) => {
    const token = detectMentionToken(el.value, el.selectionStart ?? el.value.length);
    if (token) {
      setMention({ field: el.name as TraceField, ...token });
      setActiveIndex(0);
    } else {
      setMention(null);
    }
  };

  // Replace the active mention token with a clean "@TASK-<number> " reference (the
  // read-only renderer accepts @123, @TASK-123 and @task-123, so older @123 notes
  // still link). The active textarea is the focused element (suggestion clicks use
  // mousedown-preventDefault, so focus stays put) — avoids a React ref read in render.
  const selectSuggestion = (taskToRef: Task) => {
    const el = document.activeElement;
    if (!mention || taskToRef.task_number == null) return;
    if (!(el instanceof HTMLTextAreaElement) || el.name !== mention.field) return;
    const value = el.value;
    const rest = value.slice(mention.end);
    const insert = `@TASK-${taskToRef.task_number}` + (rest.startsWith(' ') ? '' : ' ');
    const newValue = value.slice(0, mention.start) + insert + rest;
    setValue(mention.field, newValue, { shouldDirty: true, shouldTouch: true });
    const caret = mention.start + insert.length;
    setMention(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  // Combined keydown: when the popup is open it owns Arrow/Enter/Tab/Escape; otherwise
  // the existing trace-prefix logic runs (and plain Enter keeps making newlines).
  const handleTextareaKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    const field = e.currentTarget.name as TraceField;
    if (mention && mention.field === field && suggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => (i + 1) % suggestions.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => (i - 1 + suggestions.length) % suggestions.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); selectSuggestion(suggestions[activeIndex]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setMention(null); return; }
    }
    handleTraceKeyDown(e);
  };

  // After a content key, recompute the mention (skip the nav keys handled above so we
  // don't reset the highlighted index while arrowing through the list).
  const handleTextareaKeyUp = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (NAV_KEYS.includes(e.key)) return;
    recomputeMention(e.currentTarget);
  };

  const handleTextareaClick = (e: ReactMouseEvent<HTMLTextAreaElement>) => {
    recomputeMention(e.currentTarget);
  };

  // register() objects captured once so the textarea onBlur can compose RHF's own
  // onBlur with closing the mention popup. (Handlers are assigned directly as JSX
  // event props below so the React Compiler recognises them as event handlers.)
  const notesReg = register('notes');
  const descReg = register('description');

  return (
    <form onSubmit={onFormSubmit} className="flex flex-col gap-4">
      <Input
        label="Title *"
        {...register('title')}
        error={errors.title?.message}
        placeholder="Task title..."
      />

      <div className="grid grid-cols-2 gap-4">
        <Select label="Status" {...register('status')} error={errors.status?.message}>
          {Object.entries(STATUS_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </Select>

        <Select label="Priority" {...register('priority')} error={errors.priority?.message}>
          {Object.entries(PRIORITY_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Select label="Responsible Person" {...register('responsible_person_id')}>
          <option value="">— Unassigned —</option>
          {people.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>

        <Input
          label="Due Date"
          type="date"
          {...register('due_date')}
          error={errors.due_date?.message}
        />
      </div>

      <Select
        label="Opened by *"
        {...register('opened_by_person_id')}
        error={errors.opened_by_person_id?.message}
      >
        <option value="">Select opener</option>
        {people.map(p => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </Select>

      <div className="relative">
        <Textarea
          label="Notes"
          {...notesReg}
          onFocus={handleTraceFocus}
          onPaste={handleTracePaste}
          onKeyDown={handleTextareaKeyDown}
          onKeyUp={handleTextareaKeyUp}
          onClick={handleTextareaClick}
          onBlur={e => { notesReg.onBlur(e); setMention(m => (m?.field === 'notes' ? null : m)); }}
          placeholder="Additional notes... (type @ to reference a task)"
          rows={4}
        />
        {mention?.field === 'notes' && (
          <MentionSuggestions
            suggestions={suggestions}
            activeIndex={activeIndex}
            onSelect={selectSuggestion}
            onHover={setActiveIndex}
          />
        )}
      </div>

      <div className="relative">
        <Textarea
          label="Description"
          {...descReg}
          onFocus={handleTraceFocus}
          onPaste={handleTracePaste}
          onKeyDown={handleTextareaKeyDown}
          onKeyUp={handleTextareaKeyUp}
          onClick={handleTextareaClick}
          onBlur={e => { descReg.onBlur(e); setMention(m => (m?.field === 'description' ? null : m)); }}
          placeholder="Detailed description (optional)... (type @ to reference a task)"
          rows={2}
        />
        {mention?.field === 'description' && (
          <MentionSuggestions
            suggestions={suggestions}
            activeIndex={activeIndex}
            onSelect={selectSuggestion}
            onHover={setActiveIndex}
          />
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Saving...' : task ? 'Update Task' : 'Add Task'}
        </Button>
      </div>
    </form>
  );
}
