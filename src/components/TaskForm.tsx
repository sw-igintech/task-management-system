import { useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ClipboardEvent as ReactClipboardEvent, FocusEvent as ReactFocusEvent } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Task, Person } from '../types';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Textarea } from './ui/Textarea';
import { Button } from './ui/Button';
import { STATUS_LABELS, PRIORITY_LABELS } from '../lib/utils';

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
}

export function TaskForm({ task, people, onSubmit, onCancel, isLoading }: TaskFormProps) {
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

      <Textarea
        label="Notes"
        {...register('notes')}
        onFocus={handleTraceFocus}
        onKeyDown={handleTraceKeyDown}
        onPaste={handleTracePaste}
        placeholder="Additional notes..."
        rows={4}
      />

      <Textarea
        label="Description"
        {...register('description')}
        onFocus={handleTraceFocus}
        onKeyDown={handleTraceKeyDown}
        onPaste={handleTracePaste}
        placeholder="Detailed description (optional)..."
        rows={2}
      />

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
