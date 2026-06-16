import type { Task } from '../types';
import { StatusBadge } from './ui/Badge';
import { formatTaskKey } from '../lib/utils';

interface MentionSuggestionsProps {
  suggestions: Task[];
  activeIndex: number;
  onSelect: (task: Task) => void;
  onHover: (index: number) => void;
}

// Floating suggestion panel rendered below a textarea while an @-mention is being
// typed. Editing helper only — it inserts plain "@<number>" text, stores nothing.
export function MentionSuggestions({ suggestions, activeIndex, onSelect, onHover }: MentionSuggestionsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="absolute left-0 top-full z-50 mt-1 w-full max-w-md overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg">
      <ul className="max-h-56 overflow-y-auto py-1" role="listbox">
        {suggestions.map((task, i) => (
          <li key={task.id} role="option" aria-selected={i === activeIndex}>
            <button
              type="button"
              // Keep textarea focus: prevent the mousedown blur, then select on click.
              onMouseDown={e => e.preventDefault()}
              onClick={() => onSelect(task)}
              onMouseEnter={() => onHover(i)}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                i === activeIndex ? 'bg-blue-50' : 'hover:bg-gray-50'
              }`}
            >
              <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 font-mono text-xs font-semibold text-blue-700">
                {formatTaskKey(task.task_number)}
              </span>
              <span className="min-w-0 flex-1 truncate text-gray-700">{task.title}</span>
              <StatusBadge status={task.status} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
