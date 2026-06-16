import { FileText, Calendar, User, UserPlus, Clock, Hash } from 'lucide-react';
import type { Task } from '../types';
import { StatusBadge, PriorityBadge } from './ui/Badge';
import { formatDate, isOverdue } from '../lib/utils';
import { format, parseISO } from 'date-fns';

interface TaskExpandedViewProps {
  task: Task;
}

function formatDateTime(dt: string) {
  try {
    return format(parseISO(dt), 'MMM d, yyyy HH:mm');
  } catch {
    return dt;
  }
}

export function TaskExpandedView({ task }: TaskExpandedViewProps) {
  const overdue = isOverdue(task);

  return (
    <div className="px-6 py-4 bg-slate-50 border-t border-slate-200">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: details */}
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2">
            <FileText size={14} className="mt-0.5 text-gray-400 shrink-0" />
            <div>
              <p className="text-xs font-medium text-gray-500 mb-0.5">Notes</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {task.notes || <span className="text-gray-400 italic">No notes</span>}
              </p>
            </div>
          </div>

          {task.description && (
            <div className="flex items-start gap-2">
              <FileText size={14} className="mt-0.5 text-gray-400 shrink-0" />
              <div>
                <p className="text-xs font-medium text-gray-500 mb-0.5">Description</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.description}</p>
              </div>
            </div>
          )}
        </div>

        {/* Right: metadata */}
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-24 shrink-0">Status</span>
            <StatusBadge status={task.status} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-24 shrink-0">Priority</span>
            <PriorityBadge priority={task.priority} />
          </div>
          <div className="flex items-center gap-2">
            <User size={13} className="text-gray-400" />
            <span className="text-xs text-gray-500 w-20 shrink-0">Assigned to</span>
            <span className="text-sm text-gray-700">
              {task.responsible_person?.name || '—'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <UserPlus size={13} className="text-gray-400" />
            <span className="text-xs text-gray-500 w-20 shrink-0">Opened by</span>
            <span className="text-sm text-gray-700">
              {task.opened_by_person?.name || '—'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar size={13} className="text-gray-400" />
            <span className="text-xs text-gray-500 w-20 shrink-0">Due date</span>
            <span className={overdue ? 'date-overdue text-sm' : 'text-sm text-gray-700'}>
              {task.due_date ? formatDate(task.due_date) : '—'}
              {overdue && ' (overdue)'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Clock size={13} className="text-gray-400" />
            <span className="text-xs text-gray-500 w-20 shrink-0">Created</span>
            <span className="text-sm text-gray-700">{formatDateTime(task.created_at)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock size={13} className="text-gray-400" />
            <span className="text-xs text-gray-500 w-20 shrink-0">Updated</span>
            <span className="text-sm text-gray-700">{formatDateTime(task.updated_at)}</span>
          </div>
          {task.source_file && (
            <div className="flex items-start gap-2">
              <Hash size={13} className="text-gray-400 mt-0.5" />
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Source</p>
                <p className="text-xs text-gray-600">
                  {task.source_file}
                  {task.source_page ? ` (page ${task.source_page})` : ''}
                </p>
              </div>
            </div>
          )}
          {task.import_hash && (
            <div className="flex items-center gap-2">
              <Hash size={13} className="text-gray-400" />
              <span className="text-xs text-gray-400 font-mono truncate">{task.import_hash}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
