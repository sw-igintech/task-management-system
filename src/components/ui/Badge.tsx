import { cn } from '../../lib/utils';
import type { TaskStatus, PriorityLevel } from '../../types';
import { STATUS_BADGE_CLASS, STATUS_LABELS, PRIORITY_BADGE_CLASS, PRIORITY_LABELS } from '../../lib/utils';

interface BadgeProps {
  className?: string;
  children: React.ReactNode;
}

export function Badge({ className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <Badge className={STATUS_BADGE_CLASS[status]}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: PriorityLevel }) {
  return (
    <Badge className={cn(PRIORITY_BADGE_CLASS[priority], 'text-xs font-semibold')}>
      {PRIORITY_LABELS[priority]}
    </Badge>
  );
}
