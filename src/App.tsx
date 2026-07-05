import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ClipboardList,
  LayoutDashboard,
  Wrench,
  Database,
  User,
  AtSign,
  Bell,
} from "lucide-react";
import { useTasks } from "./hooks/useTasks";
import { useCurrentUser } from "./hooks/useCurrentUser";
import { useMentions } from "./hooks/useMentions";
import { useActivity } from "./hooks/useActivity";
import { TasksPage } from "./pages/TasksPage";
import { DashboardPage } from "./pages/DashboardPage";
import { MentionsPage } from "./pages/MentionsPage";
import { ActivityPage } from "./pages/ActivityPage";
import type { TaskFilters } from "./types";
import "./index.css";

const queryClient = new QueryClient();

type Tab = "tasks" | "dashboard" | "mentions" | "activity";

function AppInner() {
  const [activeTab, setActiveTab] = useState<Tab>("tasks");
  const hookData = useTasks();
  // Lightweight actor selector (not auth). Stored in localStorage; used as the actor for
  // mention notification emails. Validated against the loaded people list.
  const { currentUserId, setCurrentUserId, needsSelection, requestSelection } =
    useCurrentUser(hookData.people);
  // My Mentions inbox for the Current user — drives the header @ badge and the Mentions view.
  const {
    mentions,
    unreadCount,
    loading: mentionsLoading,
    markOpened,
  } = useMentions(currentUserId);
  // General Activity feed (history) for the Current user — drives the bell button + view.
  const activity = useActivity(currentUserId);

  const switchToTasksWithFilters = (filters?: Partial<TaskFilters>) => {
    if (filters) {
      hookData.setFilters((prev) => ({ ...prev, ...filters }));
    }
    setActiveTab("tasks");
  };

  // Open a task by number from the Mentions view: write the ?task= deep-link param and switch
  // to the Tasks tab. TasksPage remounts and its existing deep-link effect expands the task —
  // reusing the same mechanism as email deep links and @TASK references (no duplicate logic).
  const openTaskByNumber = (taskNumber: number) => {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?task=TASK-${taskNumber}`,
    );
    setActiveTab("tasks");
  };

  // Header @ button: open the Mentions view. With no Current user selected, also light the
  // header attention cue (the view itself shows the inline "Select Current user…" empty state).
  const openMentions = () => {
    if (!currentUserId) requestSelection();
    setActiveTab("mentions");
  };

  // Header bell button: open the Activity view. Same no-Current-user treatment as @.
  const openActivity = () => {
    if (!currentUserId) requestSelection();
    setActiveTab("activity");
  };

  // Shared styling for the compact header action icons (@ and bell): identical size, radius,
  // hover/focus. Active view → filled blue; otherwise subtle until hover.
  const iconButtonClass = (active: boolean) =>
    `relative flex items-center justify-center w-9 h-9 rounded-md border transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
      active
        ? "bg-blue-600 border-blue-600 text-white"
        : "border-gray-200 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
    }`;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-screen-2xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* Brand: clicking the logo or title navigates to the Tasks page (keyboard
              accessible button; no full page reload — single-page tab switch). */}
          <button
            type="button"
            onClick={() => setActiveTab("tasks")}
            className="flex items-center gap-2.5 rounded-lg cursor-pointer hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Engineering Task Manager — go to Tasks"
            title="Go to Tasks"
          >
            <div className="bg-blue-600 text-white p-1.5 rounded-lg">
              <Wrench size={18} />
            </div>
            <span className="font-bold text-gray-900 text-lg tracking-tight">
              Engineering Task Manager
            </span>
          </button>

          {/* Tab navigation */}
          <nav className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab("tasks")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === "tasks"
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <ClipboardList size={15} />
              Tasks
            </button>
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === "dashboard"
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <LayoutDashboard size={15} />
              Dashboard
            </button>
          </nav>

          <div className="flex items-center gap-2">
            {/* Header action icons — compact icon-only group (social-app style), consistent
                size/radius/hover/focus/badge styling. @ = My Mentions (unread inbox, red
                badge), bell = Activity (read-only history; no always-on badge since Activity
                has no unread concept). Both icon-only with tooltips/aria-labels. */}
            <div className="flex items-center gap-1">
              {/* My Mentions */}
              <button
                onClick={openMentions}
                className={iconButtonClass(activeTab === "mentions")}
                title="My Mentions"
                aria-label={
                  unreadCount > 0
                    ? `My Mentions (${unreadCount} unread)`
                    : "My Mentions"
                }
              >
                <AtSign size={17} />
                {unreadCount > 0 && (
                  <span
                    className="absolute -top-1.5 -right-1.5 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold leading-none flex items-center justify-center ring-2 ring-white"
                    aria-hidden="true"
                  >
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>

              {/* Activity */}
              <button
                onClick={openActivity}
                className={iconButtonClass(activeTab === "activity")}
                title="Activity"
                aria-label="Activity"
              >
                <Bell size={17} />
              </button>
            </div>

            {/* Current user — lightweight actor selector (not authentication). Persisted in
                localStorage; used as the actor for notification emails. When a save is
                blocked for a missing Current user, `needsSelection` adds a pulsing red ring
                (the .current-user-attention cue) to draw the eye here. */}
            <label
              className={`flex items-center gap-1.5 text-xs ${needsSelection ? "text-red-600 font-medium" : "text-gray-600"}`}
            >
              <User
                size={13}
                className={needsSelection ? "text-red-500" : "text-gray-400"}
              />
              <span className="hidden sm:inline">Current user:</span>
              <select
                value={currentUserId ?? ""}
                onChange={(e) => setCurrentUserId(e.target.value || null)}
                className={`rounded-md border bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                  needsSelection
                    ? "current-user-attention"
                    : "border-gray-300 focus:border-blue-500"
                }`}
                aria-label="Current user"
              >
                <option value="">Select user</option>
                {hookData.people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            {/* Backend indicator — Worker API takes precedence over the Mock badge */}
            {hookData.backend === "worker" ? (
              <div className="flex items-center gap-1.5 text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md px-2 py-1">
                <Database size={12} />
                Backend: Worker API
              </div>
            ) : hookData.backend === "mock" ? (
              <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
                <Database size={12} />
                Mock Mode (localStorage)
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-screen-2xl mx-auto w-full">
        {hookData.loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-400 text-sm">Loading tasks...</div>
          </div>
        ) : activeTab === "tasks" ? (
          <TasksPage
            hookData={hookData}
            currentUserId={currentUserId}
            onCurrentUserRequired={requestSelection}
          />
        ) : activeTab === "mentions" ? (
          <MentionsPage
            mentions={mentions}
            loading={mentionsLoading}
            currentUserId={currentUserId}
            onMarkOpened={markOpened}
            onOpenTask={openTaskByNumber}
          />
        ) : activeTab === "activity" ? (
          <ActivityPage
            events={activity.events}
            loading={activity.loading}
            currentUserId={currentUserId}
            people={hookData.people}
            filters={activity.filters}
            setFilters={activity.setFilters}
            onOpenTask={openTaskByNumber}
          />
        ) : (
          <DashboardPage
            hookData={hookData}
            onNavigateToTasks={switchToTasksWithFilters}
          />
        )}
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppInner />
    </QueryClientProvider>
  );
}

export default App;
