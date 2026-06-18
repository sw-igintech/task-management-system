import { useMemo } from 'react';
import { FileText, Calendar, User, UserPlus, Clock, Hash, Tag } from 'lucide-react';
import type { Task, Person } from '../types';
import { StatusBadge, PriorityBadge } from './ui/Badge';
import { formatDate, formatTaskKey, isOverdue } from '../lib/utils';
import { TaskTextWithLinks } from './TaskTextWithLinks';
import { format, parseISO } from 'date-fns';

interface TaskExpandedViewProps {
  task: Task;
  // People list, used to resolve @person:<id> mentions to the current @Name.
  people: Person[];
  // Resolver + handler for @<number> cross-task references inside Notes/Description.
  getTaskByNumber: (n: number) => Task | undefined;
  onTaskReference: (n: number) => void;
}

function formatDateTime(dt: string) {
  try {
    return format(parseISO(dt), 'MMM d, yyyy HH:mm');
  } catch {
    return dt;
  }
}

export function TaskExpandedView({ task, people, getTaskByNumber, onTaskReference }: TaskExpandedViewProps) {
  const overdue = isOverdue(task);
  const personById = useMemo(() => new Map(people.map(p => [p.id, p])), [people]);
  const getPersonById = (id: string) => personById.get(id);

  return (
    <div className="px-6 py-4 bg-slate-50 border-t border-slate-200">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: details — Description first, then Notes. Both always shown (separate
            fields); a task with only one of them still displays correctly. */}
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2">
            <FileText size={14} className="mt-0.5 text-gray-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-500 mb-0.5">Description</p>
              {task.description ? (
                <TaskTextWithLinks
                  text={task.description}
                  getTaskByNumber={getTaskByNumber}
                  getPersonById={getPersonById}
                  onReference={onTaskReference}
                  className="text-sm text-gray-700"
                />
              ) : (
                <span className="text-sm text-gray-400 italic">No description</span>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2">
            <FileText size={14} className="mt-0.5 text-gray-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-500 mb-0.5">Notes</p>
              {task.notes ? (
                <TaskTextWithLinks
                  text={task.notes}
                  getTaskByNumber={getTaskByNumber}
                  getPersonById={getPersonById}
                  onReference={onTaskReference}
                  className="text-sm text-gray-700"
                />
              ) : (
                <span className="text-sm text-gray-400 italic">No notes</span>
              )}
            </div>
          </div>
        </div>

        {/* Right: metadata */}
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex items-center gap-2">
            <Tag size={13} className="text-gray-400" />
            <span className="text-xs text-gray-500 w-20 shrink-0">Task</span>
            <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 font-mono">
              {formatTaskKey(task.task_number)}
            </span>
          </div>
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
            <Calendar size={13} className="text-gray-400" />
            <span className="text-xs text-gray-500 w-20 shrink-0">Closed date</span>
            <span className="text-sm text-gray-700">
              {task.closed_date ? formatDate(task.closed_date) : '—'}
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
              <Hash size={12} className="text-gray-300" />
              <span className="text-[10px] text-gray-400 w-16 shrink-0">hash (technical)</span>
              <span className="text-[10px] text-gray-400 font-mono truncate">{task.import_hash}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
