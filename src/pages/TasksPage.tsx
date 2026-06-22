import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { Plus, Menu, X } from 'lucide-react';
import type { Task } from '../types';
import { useTasks } from '../hooks/useTasks';
import { TaskTable, type TaskTableHandle } from '../components/TaskTable';
import { FilterBar } from '../components/FilterBar';
import { SmartViews } from '../components/SmartViews';
import { TaskForm, type TaskFormData } from '../components/TaskForm';
import { PeopleManager } from '../components/PeopleManager';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { isOverdue, isDueThisWeek, buildTaskQuery, parseTaskParam } from '../lib/utils';

interface TasksPageProps {
  hookData: ReturnType<typeof useTasks>;
  // Selected current user id (actor), or null. Forwarded as actor_person_id on
  // create/update and used by TaskForm to gate saving newly added person mentions.
  currentUserId: string | null;
}

export function TasksPage({ hookData, currentUserId }: TasksPageProps) {
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
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const tableRef = useRef<TaskTableHandle>(null);

  // Lookup of task_number -> task, for resolving @<number> cross-task references.
  const taskByNumber = useMemo(() => {
    const map = new Map<number, Task>();
    for (const t of tasks) {
      if (t.task_number != null) map.set(t.task_number, t);
    }
    return map;
  }, [tasks]);

  const getTaskByNumber = useCallback((n: number) => taskByNumber.get(n), [taskByNumber]);

  // Clicking a @reference (or following a ?task= deep link): reveal the target (resetting
  // filters that could hide it, matching its archived state), ask the table to expand +
  // scroll to it, and sync the URL to ?task=TASK-<n> so the view is shareable.
  const handleTaskReference = useCallback((n: number) => {
    const target = taskByNumber.get(n);
    if (!target) {
      console.warn(`[task-ref] TASK-${n} not found — nothing to open.`);
      return;
    }
    setFilters(prev => ({
      ...prev,
      search: '',
      statuses: [],
      priorities: [],
      personIds: [],
      overdue_only: false,
      due_this_week: false,
      show_archived: target.archived,
    }));
    tableRef.current?.openTask(target.id);
    // Keep the address bar in sync without a router (replace, so Back isn't polluted).
    if (target.task_number != null) {
      window.history.replaceState(null, '', `${window.location.pathname}${buildTaskQuery(target.task_number)}`);
    }
  }, [taskByNumber, setFilters]);

  // Deep link: on first load (once tasks are available), if the URL carries
  // ?task=TASK-<n>, open that task expanded. Deferred to a timer so the state updates
  // run outside the effect body (no synchronous setState-in-effect). Runs once.
  const deepLinkHandled = useRef(false);
  useEffect(() => {
    if (deepLinkHandled.current || tasks.length === 0) return;
    const n = parseTaskParam(new URLSearchParams(window.location.search).get('task'));
    if (n == null) { deepLinkHandled.current = true; return; }
    if (!taskByNumber.has(n)) return; // task list may still be loading the target
    deepLinkHandled.current = true;
    const id = window.setTimeout(() => handleTaskReference(n), 0);
    return () => window.clearTimeout(id);
  }, [tasks, taskByNumber, handleTaskReference]);

  const activeTasks = tasks.filter(t => !t.archived);
  const taskCounts = {
    'all-active': activeTasks.filter(t => t.status !== 'done').length,
    'overdue': activeTasks.filter(t => isOverdue(t)).length,
    'due-this-week': activeTasks.filter(t => isDueThisWeek(t)).length,
    'high-priority': activeTasks.filter(t => t.priority === 1).length,
    'need-review': activeTasks.filter(t => t.status === 'need_to_review').length,
    'in-progress': activeTasks.filter(t => t.status === 'in_progress').length,
  };

  const handleAddTask = (data: TaskFormData) => {
    addTask({
      title: data.title,
      status: data.status,
      priority: data.priority as Task['priority'],
      responsible_person_id: data.responsible_person_id || undefined,
      opened_by_person_id: data.opened_by_person_id,
      due_date: data.due_date || null,
      closed_date: data.closed_date || null,
      notes: data.notes,
      description: data.description,
    }, currentUserId);
    setAddModalOpen(false);
  };

  // Inline edit (expanded row) — saves via the existing updateTask logic.
  const handleUpdateTask = (id: string, data: TaskFormData) =>
    updateTask(id, {
      title: data.title,
      status: data.status,
      priority: data.priority as Task['priority'],
      responsible_person_id: data.responsible_person_id || undefined,
      opened_by_person_id: data.opened_by_person_id,
      due_date: data.due_date || null,
      closed_date: data.closed_date || null,
      notes: data.notes,
      description: data.description,
    }, currentUserId);

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
          ref={tableRef}
          tasks={filteredTasks}
          people={people}
          sortField={sortField}
          sortDirection={sortDirection}
          onSort={setSortField}
          onUpdateTask={handleUpdateTask}
          onArchive={archiveTask}
          onRestore={restoreTask}
          getTaskByNumber={getTaskByNumber}
          onTaskReference={handleTaskReference}
          mentionTasks={tasks}
          currentUserId={currentUserId}
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
          mentionTasks={tasks}
          currentUserId={currentUserId}
        />
      </Modal>
    </div>
  );
}
