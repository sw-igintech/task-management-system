import { Dashboard } from '../components/Dashboard';
import { useTasks } from '../hooks/useTasks';
import type { TaskFilters } from '../types';

interface DashboardPageProps {
  hookData: ReturnType<typeof useTasks>;
  onNavigateToTasks: (filters?: Partial<TaskFilters>) => void;
}

export function DashboardPage({ hookData, onNavigateToTasks }: DashboardPageProps) {
  const { stats } = hookData;

  return (
    <div>
      <Dashboard
        stats={stats}
        onFilterChange={filters => {
          onNavigateToTasks(filters);
        }}
      />
    </div>
  );
}
