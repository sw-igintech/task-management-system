import { useState } from 'react';
import { Plus, Menu, X } from 'lucide-react';
import type { Task } from '../types';
import { useTasks } from '../hooks/useTasks';
import { TaskTable } from '../components/TaskTable';
import { FilterBar } from '../components/FilterBar';
import { SmartViews } from '../components/SmartViews';
import { TaskForm } from '../components/TaskForm';
import { PeopleManager } from '../components/PeopleManager';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { isOverdue, isDueThisWeek } from '../lib/utils';

interface TasksPageProps {
  hookData: ReturnType<typeof useTasks>;
}

export function TasksPage({ hookData }: TasksPageProps) {
  const {
    tasks,
    filteredTasks,
    people,
    filters,
    setFilters,
    sortField,
    sortDirection,
    setSortField,
    addTask,
    updateTask,
    archiveTask,
    restoreTask,
    addPerson,
  } = hookData;

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const activeTasks = tasks.filter(t => !t.archived);
  const taskCounts = {
    'all-active': activeTasks.filter(t => t.status !== 'done').length,
    'overdue': activeTasks.filter(t => isOverdue(t)).length,
    'due-this-week': activeTasks.filter(t => isDueThisWeek(t)).length,
    'high-priority': activeTasks.filter(t => t.priority === 1).length,
    'need-review': activeTasks.filter(t => t.status === 'need_to_review').length,
    'in-progress': activeTasks.filter(t => t.status === 'in_progress').length,
  };

  const handleAddTask = (data: {
    title: string;
    status: Task['status'];
    priority: number;
    responsible_person_id?: string;
    due_date?: string | null;
    notes?: string;
    description?: string;
  }) => {
    addTask({
      title: data.title,
      status: data.status,
      priority: data.priority as Task['priority'],
      responsible_person_id: data.responsible_person_id || undefined,
      due_date: data.due_date || null,
      notes: data.notes,
      description: data.description,
    });
    setAddModalOpen(false);
  };

  const handleEditTask = (data: {
    title: string;
    status: Task['status'];
    priority: number;
    responsible_person_id?: string;
    due_date?: string | null;
    notes?: string;
    description?: string;
  }) => {
    if (!editTask) return;
    updateTask(editTask.id, {
      title: data.title,
      status: data.status,
      priority: data.priority as Task['priority'],
      responsible_person_id: data.responsible_person_id || undefined,
      due_date: data.due_date || null,
      notes: data.notes,
      description: data.description,
    });
    setEditTask(null);
  };

  const closeMobileSidebar = () => setMobileSidebarOpen(false);

  return (
    <div className="flex gap-4 p-3 md:p-4">

      {/* ── Desktop sidebar (md+): always visible, static ── */}
      <div className="hidden md:block md:shrink-0">
        <SmartViews
          filters={filters}
          people={people}
          onChange={setFilters}
          taskCounts={taskCounts}
        />
      </div>

      {/* ── Mobile drawer ── */}
      {mobileSidebarOpen && (
        <>
          {/* Backdrop */}
          <div
            className="md:hidden fixed inset-0 bg-black/40 z-40"
            onClick={closeMobileSidebar}
            aria-hidden="true"
          />
          {/* Drawer panel */}
          <div
            className="md:hidden fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-2xl flex flex-col"
            role="dialog"
            aria-label="Smart Views navigation"
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <span className="font-semibold text-gray-800 text-sm">Views</span>
              <button
                onClick={closeMobileSidebar}
                className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 transition-colors"
                aria-label="Close menu"
              >
                <X size={16} />
              </button>
            </div>
            {/* SmartViews inside drawer */}
            <div className="flex-1 overflow-y-auto p-3">
              <SmartViews
                filters={filters}
                people={people}
                onChange={setFilters}
                taskCounts={taskCounts}
                onClose={closeMobileSidebar}
              />
            </div>
          </div>
        </>
      )}

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        {/* Top bar */}
        <div className="flex items-center gap-2">
          {/* Hamburger: mobile only */}
          <button
            className="md:hidden p-1.5 rounded-md text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
            onClick={() => setMobileSidebarOpen(true)}
            aria-label="Open Smart Views"
          >
            <Menu size={18} />
          </button>

          <h1 className="text-xl font-bold text-gray-900 flex-1">Tasks</h1>

          <div className="flex items-center gap-2">
            <PeopleManager
              people={people}
              onAddPerson={(name, email) => addPerson(name, email)}
            />
            <Button
              size="sm"
              onClick={() => setAddModalOpen(true)}
            >
              <Plus size={14} />
              <span className="hidden sm:inline">Add Task</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </div>
        </div>

        {/* Filter bar */}
        <FilterBar
          filters={filters}
          people={people}
          onChange={setFilters}
          totalCount={tasks.filter(t => filters.show_archived ? t.archived : !t.archived).length}
          filteredCount={filteredTasks.length}
        />

        {/* Table */}
        <TaskTable
          tasks={filteredTasks}
          sortField={sortField}
          sortDirection={sortDirection}
          onSort={setSortField}
          onEdit={setEditTask}
          onArchive={archiveTask}
          onRestore={restoreTask}
        />
      </div>

      {/* Add Task Modal */}
      <Modal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Add New Task"
      >
        <TaskForm
          people={people}
          onSubmit={handleAddTask}
          onCancel={() => setAddModalOpen(false)}
        />
      </Modal>

      {/* Edit Task Modal */}
      <Modal
        open={editTask !== null}
        onClose={() => setEditTask(null)}
        title="Edit Task"
      >
        {editTask && (
          <TaskForm
            task={editTask}
            people={people}
            onSubmit={handleEditTask}
            onCancel={() => setEditTask(null)}
          />
        )}
      </Modal>
    </div>
  );
}
