import { useState } from 'react';
import { ChevronDown, ChevronRight, Pencil, Archive, RotateCcw } from 'lucide-react';
import type { Row } from '@tanstack/react-table';
import type { Task, Person } from '../types';
import { StatusBadge, PriorityBadge } from './ui/Badge';
import { formatDate, formatTaskKey, isOverdue, cn } from '../lib/utils';
import { TaskExpandedView } from './TaskExpandedView';
import { TaskForm, type TaskFormData } from './TaskForm';

interface TaskRowProps {
  row: Row<Task>;
  people: Person[];
  isExpanded: boolean;
  isEditing: boolean;
  isHighlighted: boolean;
  onToggleExpand: () => void;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onUpdateTask: (id: string, data: TaskFormData) => Promise<Task | null>;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  getTaskByNumber: (n: number) => Task | undefined;
  onTaskReference: (n: number) => void;
  mentionTasks: Task[];
  rowIndex: number;
}

export function TaskRow({
  row,
  people,
  isExpanded,
  isEditing,
  isHighlighted,
  onToggleExpand,
  onStartEdit,
  onStopEdit,
  onUpdateTask,
  onArchive,
  onRestore,
  getTaskByNumber,
  onTaskReference,
  mentionTasks,
  rowIndex,
}: TaskRowProps) {
  const task = row.original;
  const overdue = isOverdue(task);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleInlineSubmit = async (data: TaskFormData) => {
    setSaving(true);
    setSaveError(null);
    const result = await onUpdateTask(task.id, data);
    setSaving(false);
    if (result) {
      onStopEdit(); // success: exit edit mode, keep row expanded showing updated values
    } else {
      // Failure: keep edit mode + the user's input; surface the error.
      setSaveError('Update failed — your changes were kept. Please try again.');
    }
  };

  const handleCancel = () => {
    setSaveError(null);
    onStopEdit();
  };

  return (
    <>
      <tr
        data-task-id={task.id}
        data-task-number={task.task_number ?? ''}
        className={cn(
          'task-row border-b border-gray-100 transition-colors',
          rowIndex % 2 === 1 && 'task-row-alt',
          task.archived && 'opacity-60',
          isHighlighted && 'task-row-highlight',
        )}
        onClick={onToggleExpand}
      >
        {/* Expand toggle */}
        <td className="w-8 pl-2 py-3 text-gray-400">
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </td>

        {/* Key */}
        <td className="px-3 py-3 whitespace-nowrap">
          <span className="text-xs font-semibold font-mono text-blue-700">
            {formatTaskKey(task.task_number)}
          </span>
        </td>

        {/* Title */}
        <td className="px-3 py-3 max-w-xs">
          <span className="text-sm font-medium text-gray-900 line-clamp-2">
            {task.title}
          </span>
        </td>

        {/* Status */}
        <td className="px-3 py-3 whitespace-nowrap">
          <StatusBadge status={task.status} />
        </td>

        {/* Priority */}
        <td className="px-3 py-3 whitespace-nowrap">
          <PriorityBadge priority={task.priority} />
        </td>

        {/* Person */}
        <td className="px-3 py-3 whitespace-nowrap">
          <span className="text-sm text-gray-700">
            {task.responsible_person?.name || '—'}
          </span>
        </td>

        {/* Due date */}
        <td className="px-3 py-3 whitespace-nowrap">
          {task.due_date ? (
            <span className={cn('text-sm', overdue && !task.archived ? 'date-overdue' : 'text-gray-600')}>
              {formatDate(task.due_date)}
              {overdue && !task.archived && ' ⚠'}
            </span>
          ) : (
            <span className="text-sm text-gray-400">—</span>
          )}
        </td>

        {/* Closed date */}
        <td className="px-3 py-3 whitespace-nowrap">
          {task.closed_date ? (
            <span className="text-sm text-gray-600">{formatDate(task.closed_date)}</span>
          ) : (
            <span className="text-sm text-gray-400">—</span>
          )}
        </td>

        {/* Actions */}
        <td
          className="px-3 py-3 whitespace-nowrap"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center gap-1">
            <button
              onClick={onStartEdit}
              className={cn(
                'p-1.5 rounded transition-colors',
                isEditing
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-400 hover:bg-blue-50 hover:text-blue-600',
              )}
              title="Edit task"
            >
              <Pencil size={13} />
            </button>
            {task.archived ? (
              <button
                onClick={() => onRestore(task.id)}
                className="p-1.5 rounded hover:bg-green-50 text-gray-400 hover:text-green-600 transition-colors"
                title="Restore task"
              >
                <RotateCcw size={13} />
              </button>
            ) : (
              <button
                onClick={() => onArchive(task.id)}
                className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                title="Archive task"
              >
                <Archive size={13} />
              </button>
            )}
          </div>
        </td>
      </tr>

      {/* Expanded row: inline edit form when editing, otherwise read-only details */}
      {isExpanded && (
        <tr>
          <td colSpan={9} className="p-0">
            {isEditing ? (
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Edit Task
                  </p>
                </div>
                {saveError && (
                  <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {saveError}
                  </div>
                )}
                <TaskForm
                  task={task}
                  people={people}
                  onSubmit={handleInlineSubmit}
                  onCancel={handleCancel}
                  isLoading={saving}
                  mentionTasks={mentionTasks}
                />
              </div>
            ) : (
              <TaskExpandedView
                task={task}
                getTaskByNumber={getTaskByNumber}
                onTaskReference={onTaskReference}
              />
            )}
          </td>
        </tr>
      )}
    </>
  );
}
