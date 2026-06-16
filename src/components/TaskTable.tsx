import { forwardRef, useImperativeHandle, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  type ColumnDef,
} from '@tanstack/react-table';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import type { Task, Person } from '../types';
import type { SortField, SortDirection } from '../types';
import type { TaskFormData } from './TaskForm';
import { TaskRow } from './TaskRow';

// Imperative API: lets the page open + scroll to a specific task (used when a
// cross-task @reference link is clicked).
export interface TaskTableHandle {
  openTask: (taskId: string) => void;
}

interface TaskTableProps {
  tasks: Task[];
  people: Person[];
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
  onUpdateTask: (id: string, data: TaskFormData) => Promise<Task | null>;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  getTaskByNumber: (n: number) => Task | undefined;
  onTaskReference: (n: number) => void;
}

const columns: ColumnDef<Task>[] = [
  { id: 'expand', header: '', size: 32 },
  { id: 'task_number', header: 'Key', size: 90 },
  { id: 'title', header: 'Title', accessorKey: 'title', size: 300 },
  { id: 'status', header: 'Status', accessorKey: 'status', size: 130 },
  { id: 'priority', header: 'Priority', accessorKey: 'priority', size: 120 },
  { id: 'responsible_person', header: 'Assigned To', size: 120 },
  { id: 'due_date', header: 'Due Date', accessorKey: 'due_date', size: 120 },
  { id: 'actions', header: '', size: 80 },
];

const SORTABLE_COLUMNS = new Set<string>(['task_number', 'title', 'status', 'priority', 'responsible_person', 'due_date']);

function SortIcon({ field, sortField, sortDirection }: {
  field: SortField;
  sortField: SortField;
  sortDirection: SortDirection;
}) {
  if (field !== sortField) return <ArrowUpDown size={12} className="text-gray-300" />;
  return sortDirection === 'asc'
    ? <ArrowUp size={12} className="text-blue-500" />
    : <ArrowDown size={12} className="text-blue-500" />;
}

export const TaskTable = forwardRef<TaskTableHandle, TaskTableProps>(function TaskTable({
  tasks,
  people,
  sortField,
  sortDirection,
  onSort,
  onUpdateTask,
  onArchive,
  onRestore,
  getTaskByNumber,
  onTaskReference,
}: TaskTableProps, ref) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // Expand + scroll to + briefly highlight a task. Called imperatively from the
  // page when a cross-task reference link is clicked. setState here runs in an
  // event/timeout context (not render/effect), so it doesn't trip the lint rules.
  useImperativeHandle(ref, () => ({
    openTask: (taskId: string) => {
      setEditingId(null);
      setExpandedIds(prev => {
        const next = new Set(prev);
        next.add(taskId);
        return next;
      });
      setHighlightId(taskId);
      // Scroll after the row is committed/visible; clear the highlight afterwards.
      window.setTimeout(() => {
        document
          .querySelector(`[data-task-id="${taskId}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 60);
      window.setTimeout(() => setHighlightId(cur => (cur === taskId ? null : cur)), 2200);
    },
  }), []);

  const table = useReactTable({
    data: tasks,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        // Collapsing the row also exits inline edit mode for that row.
        if (editingId === id) setEditingId(null);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Pencil: expand the row (if needed) and switch it into inline edit mode.
  const startEdit = (id: string) => {
    setExpandedIds(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setEditingId(id);
  };

  const stopEdit = () => setEditingId(null);

  const headerMap: Record<string, SortField> = {
    task_number: 'task_number',
    title: 'title',
    status: 'status',
    priority: 'priority',
    responsible_person: 'responsible_person',
    due_date: 'due_date',
  };

  if (tasks.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              {table.getFlatHeaders().map(header => (
                <th
                  key={header.id}
                  className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide"
                >
                  {String(header.column.columnDef.header ?? '')}
                </th>
              ))}
            </tr>
          </thead>
        </table>
        <div className="p-12 text-center text-gray-400">
          <p className="text-lg">No tasks found</p>
          <p className="text-sm mt-1">Try adjusting your filters or add a new task</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              {table.getFlatHeaders().map(header => {
                const id = header.id;
                const sortable = SORTABLE_COLUMNS.has(id);
                const label = String(header.column.columnDef.header ?? '');

                return (
                  <th
                    key={id}
                    className={`px-3 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap ${sortable ? 'cursor-pointer hover:bg-gray-100 select-none' : ''}`}
                    onClick={sortable ? () => onSort(headerMap[id]) : undefined}
                  >
                    {sortable ? (
                      <div className="flex items-center gap-1">
                        {label}
                        <SortIcon
                          field={headerMap[id]}
                          sortField={sortField}
                          sortDirection={sortDirection}
                        />
                      </div>
                    ) : label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, idx) => (
              <TaskRow
                key={row.original.id}
                row={row}
                people={people}
                isExpanded={expandedIds.has(row.original.id)}
                isEditing={editingId === row.original.id}
                isHighlighted={highlightId === row.original.id}
                onToggleExpand={() => toggleExpand(row.original.id)}
                onStartEdit={() => startEdit(row.original.id)}
                onStopEdit={stopEdit}
                onUpdateTask={onUpdateTask}
                onArchive={onArchive}
                onRestore={onRestore}
                getTaskByNumber={getTaskByNumber}
                onTaskReference={onTaskReference}
                rowIndex={idx}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});
