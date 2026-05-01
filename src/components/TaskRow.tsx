import { ChevronDown, ChevronRight, Pencil, Archive, RotateCcw } from 'lucide-react';
import type { Row } from '@tanstack/react-table';
import type { Task } from '../types';
import { StatusBadge, PriorityBadge } from './ui/Badge';
import { formatDate, isOverdue, cn } from '../lib/utils';
import { TaskExpandedView } from './TaskExpandedView';

interface TaskRowProps {
  row: Row<Task>;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: (task: Task) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  rowIndex: number;
}

export function TaskRow({
  row,
  isExpanded,
  onToggleExpand,
  onEdit,
  onArchive,
  onRestore,
  rowIndex,
}: TaskRowProps) {
  const task = row.original;
  const overdue = isOverdue(task);

  return (
    <>
      <tr
        className={cn(
          'task-row border-b border-gray-100 transition-colors',
          rowIndex % 2 === 1 && 'task-row-alt',
          task.archived && 'opacity-60',
        )}
        onClick={onToggleExpand}
      >
        {/* Expand toggle */}
        <td className="w-8 pl-2 py-3 text-gray-400">
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
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

        {/* Actions */}
        <td
          className="px-3 py-3 whitespace-nowrap"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center gap-1">
            <button
              onClick={() => onEdit(task)}
              className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
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

      {/* Expanded row */}
      {isExpanded && (
        <tr>
          <td colSpan={7} className="p-0">
            <TaskExpandedView task={task} />
          </td>
        </tr>
      )}
    </>
  );
}
