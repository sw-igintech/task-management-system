import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClipboardList, LayoutDashboard, Wrench, Database } from 'lucide-react';
import { useTasks } from './hooks/useTasks';
import { TasksPage } from './pages/TasksPage';
import { DashboardPage } from './pages/DashboardPage';
import type { TaskFilters } from './types';
import './index.css';

const queryClient = new QueryClient();

type Tab = 'tasks' | 'dashboard';

function AppInner() {
  const [activeTab, setActiveTab] = useState<Tab>('tasks');
  const hookData = useTasks();

  const switchToTasksWithFilters = (filters?: Partial<TaskFilters>) => {
    if (filters) {
      hookData.setFilters(prev => ({ ...prev, ...filters }));
    }
    setActiveTab('tasks');
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-screen-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-blue-600 text-white p-1.5 rounded-lg">
              <Wrench size={18} />
            </div>
            <span className="font-bold text-gray-900 text-lg tracking-tight">
              Engineering Task Manager
            </span>
          </div>

          {/* Tab navigation */}
          <nav className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('tasks')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'tasks'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <ClipboardList size={15} />
              Tasks
            </button>
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'dashboard'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <LayoutDashboard size={15} />
              Dashboard
            </button>
          </nav>

          {/* Mock mode indicator */}
          {hookData.isMockMode && (
            <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
              <Database size={12} />
              Mock Mode (localStorage)
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-screen-2xl mx-auto w-full">
        {hookData.loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-400 text-sm">Loading tasks...</div>
          </div>
        ) : activeTab === 'tasks' ? (
          <TasksPage hookData={hookData} />
        ) : (
          <DashboardPage hookData={hookData} onNavigateToTasks={switchToTasksWithFilters} />
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
