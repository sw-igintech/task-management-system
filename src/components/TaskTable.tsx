import { useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  type ColumnDef,
} from '@tanstack/react-table';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import type { Task } from '../types';
import type { SortField, SortDirection } from '../types';
import { TaskRow } from './TaskRow';

interface TaskTableProps {
  tasks: Task[];
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
  onEdit: (task: Task) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
}

const columns: ColumnDef<Task>[] = [
  { id: 'expand', header: '', size: 32 },
  { id: 'title', header: 'Title', accessorKey: 'title', size: 300 },
  { id: 'status', header: 'Status', accessorKey: 'status', size: 130 },
  { id: 'priority', header: 'Priority', accessorKey: 'priority', size: 120 },
  { id: 'responsible_person', header: 'Assigned To', size: 120 },
  { id: 'due_date', header: 'Due Date', accessorKey: 'due_date', size: 120 },
  { id: 'actions', header: '', size: 80 },
];

const SORTABLE_COLUMNS = new Set<string>(['title', 'status', 'priority', 'responsible_person', 'due_date']);

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

export function TaskTable({
  tasks,
  sortField,
  sortDirection,
  onSort,
  onEdit,
  onArchive,
  onRestore,
}: TaskTableProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

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
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const headerMap: Record<string, SortField> = {
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
                isExpanded={expandedIds.has(row.original.id)}
                onToggleExpand={() => toggleExpand(row.original.id)}
                onEdit={onEdit}
                onArchive={onArchive}
                onRestore={onRestore}
                rowIndex={idx}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
