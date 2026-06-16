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
        placeholder="Additional notes..."
        rows={4}
      />

      <Textarea
        label="Description"
        {...register('description')}
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
