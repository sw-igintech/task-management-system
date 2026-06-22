import { useMemo, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ClipboardEvent as ReactClipboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Task, Person } from '../types';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Textarea } from './ui/Textarea';
import { Button } from './ui/Button';
import { MentionSuggestions } from './MentionSuggestions';
import {
  getMentionItems,
  prepareMentionsForEditing,
  serializeMentionsForStorage,
  getTaskPersonMentionIdsFromEditableText,
  type MentionItem,
} from '../lib/mentions';
import { STATUS_LABELS, PRIORITY_LABELS, formatOverdue } from '../lib/utils';

// Detects an in-progress @-mention token ending at the caret. The @ must be at the
// start of the field or after a separator (space/newline/( [ { : ,), so emails like
// "name@example.com" never trigger it. The query (text typed after @) may be a task
// number ("123", "task-12") OR the start of a person's name ("Mat"); a stored
// "@person:<id>" token never re-triggers because its ":" breaks the [\w-] run.
// Returns the token's start index, end index, and the raw query typed after @.
function detectMentionToken(value: string, caret: number): { start: number; end: number; query: string } | null {
  const before = value.slice(0, caret);
  const m = before.match(/(?<=^|[\s([{:,\n])@([\w-]*)$/);
  if (!m) return null;
  return { start: caret - m[0].length, end: caret, query: m[1] };
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
  // Actual closure date — optional, distinct from due_date.
  closed_date: z.string().optional().nullable(),
  notes: z.string().optional(),
  description: z.string().optional(),
});

export type TaskFormData = z.infer<typeof taskSchema>;

// Text fields that receive the automatic dated traceability prefix.
type TraceField = 'notes' | 'description';

// Builds the bullet-style trace prefix "• (DD.MM.YY) " (bullet + space + date in
// parentheses + one trailing space). e.g. 2026-06-17 -> "• (17.06.26) ". It is
// plain, editable text saved inline in the field — not a component, lock, or DB column.
function formatTracePrefix(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear() % 100).padStart(2, '0');
  return `• (${dd}.${mm}.${yy}) `;
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
  // Selected current user id (actor), or null. Required when the save adds NEW person
  // mentions OR will send the responsible-person update notification — see onFormSubmit.
  // Optional so non-mention callers are unaffected.
  currentUserId?: string | null;
  // Called when a save is blocked for a missing Current user, so the header selector can
  // show its attention cue. Optional — callers without it just get the inline message.
  onCurrentUserRequired?: () => void;
}

export function TaskForm({ task, people, onSubmit, onCancel, isLoading, mentionTasks = [], currentUserId, onCurrentUserRequired }: TaskFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<TaskFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(taskSchema) as any,
    defaultValues: {
      title: task?.title ?? '',
      status: task?.status ?? 'not_started',
      priority: task?.priority ?? 2,
      responsible_person_id: task?.responsible_person_id ?? '',
      opened_by_person_id: task?.opened_by_person_id ?? '',
      due_date: task?.due_date ?? '',
      closed_date: task?.closed_date ?? '',
      // Show friendly "@Name" while editing; raw "@person:<id>" tokens never reach the UI.
      notes: prepareMentionsForEditing(task?.notes ?? '', people),
      description: prepareMentionsForEditing(task?.description ?? '', people),
    },
  });

  // Inline validation flag: a save was ATTEMPTED while no Current user is selected but the
  // save would send an actor-dependent email (new mention, or a Description/Notes update to
  // an assigned person). Shown next to the Save button; never a modal/popup/alert.
  const [blockedForCurrentUser, setBlockedForCurrentUser] = useState(false);

  // Person-mention ids ALREADY on the task before this edit (stored "@person:<id>" form).
  // Empty for a brand-new task → every person mention then counts as newly added.
  const previousMentionIds = useMemo(
    () => new Set(getTaskPersonMentionIdsFromEditableText(task?.description, task?.notes, people)),
    [task?.description, task?.notes, people],
  );

  // Live editable values. watch() keeps these in sync with every keystroke so the derived
  // warning below clears the moment the triggering content is removed.
  const liveDescription = watch('description');
  const liveNotes = watch('notes');
  const liveResponsibleId = watch('responsible_person_id');

  // Live person-mention ids in the editable textareas. Detected DIRECTLY from the editable
  // text (both visible "@Name" and stored "@person:<id>") — NOT via serialization — so a
  // "@Name" mention is caught even if serialization would be a no-op.
  const hasNewlyAddedMention = useMemo(() => {
    const current = getTaskPersonMentionIdsFromEditableText(liveDescription, liveNotes, people);
    return current.some(id => !previousMentionIds.has(id));
  }, [liveDescription, liveNotes, people, previousMentionIds]);

  // Will saving this edit send the responsible-person "task updated" notification (which
  // names the actor)? Only on EDITS, to an assigned responsible person who HAS an email,
  // when the serialized Description or Notes actually differ from what is stored. Mirrors
  // the Worker's send rule so the Current-user requirement matches exactly when an
  // actor-dependent update email will go out. (Create assigns via the opener-based
  // assignment email, which needs no actor — so it is excluded.)
  const willNotifyResponsibleOnUpdate = useMemo(() => {
    if (!task) return false;
    const respId = liveResponsibleId || undefined;
    if (!respId) return false;
    const resp = people.find(p => p.id === respId);
    if (!resp?.email) return false;
    const newDescription = serializeMentionsForStorage(liveDescription ?? '', people);
    const newNotes = serializeMentionsForStorage(liveNotes ?? '', people);
    return newDescription !== (task.description ?? '') || newNotes !== (task.notes ?? '');
  }, [task, people, liveResponsibleId, liveDescription, liveNotes]);

  // A save needs a Current user when it would send an actor-dependent email.
  const saveNeedsCurrentUser = hasNewlyAddedMention || willNotifyResponsibleOnUpdate;

  // The inline message is DERIVED, so it auto-clears the moment any of these change:
  //   • a Current user is selected (currentUserId becomes truthy),
  //   • the triggering content is removed (saveNeedsCurrentUser becomes false),
  //   • the form saves successfully (the form unmounts/closes).
  const showCurrentUserWarning = blockedForCurrentUser && !currentUserId && saveNeedsCurrentUser;
  const currentUserWarningMessage = hasNewlyAddedMention
    ? 'Please select Current user before saving mentions.'
    : 'Please select Current user before saving changes.';

  // On save, convert the friendly "@Name" mentions back to the stable "@person:<id>"
  // storage form. @TASK references and ordinary text are left untouched.
  //
  // Guard: block the submit (keeping form data intact, no modal) when no Current user is
  // selected AND the save would send an actor-dependent email — i.e. it adds a NEW person
  // mention, OR it changes Description/Notes on a task assigned to someone with an email.
  // Ordinary edits, @TASK-only edits, unchanged mentions, and unassigned tasks all save
  // without a Current user. Mention detection is serialization-independent; the Desc/Notes
  // change check compares the serialized new value against the stored task value.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onFormSubmit = handleSubmit((data: any) => {
    const submittedDescription = serializeMentionsForStorage(data.description ?? '', people);
    const submittedNotes = serializeMentionsForStorage(data.notes ?? '', people);

    const currentMentionIds = getTaskPersonMentionIdsFromEditableText(data.description, data.notes, people);
    const hasNewMentions = currentMentionIds.some(id => !previousMentionIds.has(id));

    // Mirror of willNotifyResponsibleOnUpdate, recomputed from the submitted data.
    const willNotifyResponsible = (() => {
      if (!task) return false;
      const respId = data.responsible_person_id || undefined;
      if (!respId) return false;
      const resp = people.find(p => p.id === respId);
      if (!resp?.email) return false;
      return submittedDescription !== (task.description ?? '') || submittedNotes !== (task.notes ?? '');
    })();

    if ((hasNewMentions || willNotifyResponsible) && !currentUserId) {
      setBlockedForCurrentUser(true);
      onCurrentUserRequired?.(); // light the header attention cue
      return; // keep the form intact; do not submit
    }

    setBlockedForCurrentUser(false);
    onSubmit({ ...(data as TaskFormData), description: submittedDescription, notes: submittedNotes });
  });

  // Live overdue indicator under the Due Date field (display-only; mutates nothing).
  const overdueLabel = formatOverdue({
    due_date: watch('due_date'),
    status: watch('status'),
    closed_date: watch('closed_date'),
  });

  // Automatic dated traceability prefix for Notes/Description.
  // The prefix is inserted ONLY on the first meaningful typing/paste into an EMPTY field,
  // or on Enter (a new dated bullet line). It is NOT tied to focus — focusing, blurring,
  // clicking out and back in never insert anything (the previous focus-armed flag caused a
  // spurious bullet on refocus of a populated field). Once any text exists, typing is plain.

  // Inserts "• (DD.MM.YY) " + the just-typed/pasted text into an empty field, then restores
  // focus and places the caret right after the typed text.
  const insertTracePrefix = (el: HTMLTextAreaElement, field: TraceField, typed: string) => {
    const head = formatTracePrefix(new Date()) + typed;
    setValue(field, head, { shouldDirty: true, shouldTouch: true });
    // setValue updates the uncontrolled textarea's value via RHF's ref; restore the
    // caret on the next frame so it lands after the inserted prefix + typed text.
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(head.length, head.length);
    });
  };

  // Enter (without Shift): start a new line with a fresh "• (DD.MM.YY) " bullet and
  // place the caret after it. Shift+Enter is left to the browser (a plain newline,
  // for continuing the same bullet across lines).
  const insertBulletLine = (el: HTMLTextAreaElement, field: TraceField) => {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const before = el.value.slice(0, start);
    const after = el.value.slice(end);
    const lead = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
    const head = before + lead + formatTracePrefix(new Date());
    setValue(field, head + after, { shouldDirty: true, shouldTouch: true });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(head.length, head.length);
    });
  };

  // The field name comes from the textarea's `name` attribute (set by register()),
  // so these stay single, directly-assigned event handlers (no currying at render).
  const handleTraceKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    const field = e.currentTarget.name as TraceField;
    if (e.currentTarget.value !== '') return;          // only auto-prefix an EMPTY field
    if (e.nativeEvent.isComposing || e.key === 'Process' || e.keyCode === 229) return; // IME composition (e.g. dead keys / CJK): don't interfere
    if (e.ctrlKey || e.metaKey || e.altKey) return;    // shortcuts (Ctrl+A/C/V/Z…); paste handled separately
    if (e.key.length !== 1) return;                    // only printable chars; excludes Enter, Tab, arrows, Backspace, Delete, Home/End, PageUp/Down, Esc, modifiers
    // First printable keystroke into the empty field → insert prefix + this char.
    e.preventDefault();
    insertTracePrefix(e.currentTarget, field, e.key);
  };

  const handleTracePaste = (e: ReactClipboardEvent<HTMLTextAreaElement>) => {
    const field = e.currentTarget.name as TraceField;
    if (e.currentTarget.value !== '') return;          // only auto-prefix an EMPTY field
    const text = e.clipboardData.getData('text');
    if (!text) return;
    e.preventDefault();
    insertTracePrefix(e.currentTarget, field, text);
  };

  // ── @-mention autocomplete for Notes/Description ──────────────────────────
  // Editing helper only. A task pick inserts plain "@TASK-<n>" text; a person pick
  // inserts the stable "@person:<id>" token. Read-only views (TaskTextWithLinks)
  // linkify task refs and render person tokens as @Name.
  const [mention, setMention] = useState<{ field: TraceField; start: number; end: number; query: string } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const items: MentionItem[] = mention ? getMentionItems(mentionTasks, people, mention.query) : [];
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

  // Replace the active mention token with the chosen reference. Tasks insert a clean
  // "@TASK-<number> " (the read-only renderer accepts @123, @TASK-123 and @task-123, so
  // older @123 notes still link). People insert the stable "@person:<id> " token. The
  // active textarea is the focused element (suggestion clicks use mousedown-preventDefault,
  // so focus stays put) — avoids a React ref read in render.
  const selectSuggestion = (item: MentionItem) => {
    const el = document.activeElement;
    if (!mention) return;
    if (!(el instanceof HTMLTextAreaElement) || el.name !== mention.field) return;
    let core: string;
    if (item.kind === 'task') {
      if (item.task.task_number == null) return;
      core = `@TASK-${item.task.task_number}`;
    } else {
      // Insert the friendly display form; serialized to "@person:<id>" on save.
      core = `@${item.person.name}`;
    }
    const value = el.value;
    const rest = value.slice(mention.end);
    const insert = core + (rest.startsWith(' ') ? '' : ' ');
    const newValue = value.slice(0, mention.start) + insert + rest;
    setValue(mention.field, newValue, { shouldDirty: true, shouldTouch: true });
    const caret = mention.start + insert.length;
    setMention(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  // Combined keydown:
  //  1. When the mention popup is open it owns Arrow/Enter/Tab/Escape.
  //  2. Enter (no Shift) starts a new dated "• (DD.MM.YY) " bullet line.
  //  3. Shift+Enter falls through to the browser (plain newline, same bullet).
  //  4. Otherwise the first-printable-char trace-prefix logic runs.
  const handleTextareaKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    const field = e.currentTarget.name as TraceField;
    if (mention && mention.field === field && items.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => (i + 1) % items.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => (i - 1 + items.length) % items.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); selectSuggestion(items[activeIndex]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setMention(null); return; }
    }
    if (
      e.key === 'Enter' && !e.shiftKey &&
      !e.nativeEvent.isComposing && e.keyCode !== 229
    ) {
      // New dated bullet entry. Shift+Enter is intentionally NOT handled → plain newline.
      e.preventDefault();
      insertBulletLine(e.currentTarget, field);
      return;
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

        <div>
          <Input
            label="Due Date"
            type="date"
            {...register('due_date')}
            error={errors.due_date?.message}
          />
          {overdueLabel && (
            <p className="text-xs text-red-600 mt-1">{overdueLabel}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Closed Date"
          type="date"
          {...register('closed_date')}
          error={errors.closed_date?.message}
        />

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
      </div>

      {/* Description first, then Notes (kept as two separate fields). */}
      <div className="relative">
        <Textarea
          label="Description"
          {...descReg}
          onPaste={handleTracePaste}
          onKeyDown={handleTextareaKeyDown}
          onKeyUp={handleTextareaKeyUp}
          onClick={handleTextareaClick}
          onBlur={e => { descReg.onBlur(e); setMention(m => (m?.field === 'description' ? null : m)); }}
          placeholder="Task description / what needs to be done... (Enter = new dated bullet, Shift+Enter = same line, @ to reference a task or mention a person)"
          rows={3}
        />
        {mention?.field === 'description' && (
          <MentionSuggestions
            items={items}
            activeIndex={activeIndex}
            onSelect={selectSuggestion}
            onHover={setActiveIndex}
          />
        )}
      </div>

      <div className="relative">
        <Textarea
          label="Notes"
          {...notesReg}
          onPaste={handleTracePaste}
          onKeyDown={handleTextareaKeyDown}
          onKeyUp={handleTextareaKeyUp}
          onClick={handleTextareaClick}
          onBlur={e => { notesReg.onBlur(e); setMention(m => (m?.field === 'notes' ? null : m)); }}
          placeholder="Updates / comments / ongoing log... (Enter = new dated bullet, Shift+Enter = same line, @ to reference a task or mention a person)"
          rows={4}
        />
        {mention?.field === 'notes' && (
          <MentionSuggestions
            items={items}
            activeIndex={activeIndex}
            onSelect={selectSuggestion}
            onHover={setActiveIndex}
          />
        )}
      </div>

      <div className="flex flex-col items-end gap-1 pt-2">
        {showCurrentUserWarning && (
          <p className="text-xs text-red-600" role="alert">
            {currentUserWarningMessage}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Saving...' : task ? 'Update Task' : 'Add Task'}
          </Button>
        </div>
      </div>
    </form>
  );
}
