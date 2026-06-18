import { Fragment } from 'react';
import { AtSign } from 'lucide-react';
import { StatusBadge } from './ui/Badge';
import { formatTaskKey } from '../lib/utils';
import type { MentionItem } from '../lib/mentions';

interface MentionSuggestionsProps {
  items: MentionItem[];
  activeIndex: number;
  onSelect: (item: MentionItem) => void;
  onHover: (index: number) => void;
}

// Floating suggestion panel rendered below a textarea while an @-mention is being
// typed. Editing helper only. Selecting a task inserts plain "@TASK-<n>" text;
// selecting a person inserts the stable "@person:<id>" token (rendered as @Name in
// read-only views). The flat `items` list keeps keyboard navigation simple; section
// headers ("Tasks" / "People") are drawn before the first item of each kind.
export function MentionSuggestions({ items, activeIndex, onSelect, onHover }: MentionSuggestionsProps) {
  if (items.length === 0) return null;

  return (
    <div className="absolute left-0 top-full z-50 mt-1 w-full max-w-md overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg">
      <ul className="max-h-56 overflow-y-auto py-1" role="listbox">
        {items.map((item, i) => {
          const prev = items[i - 1];
          const showTaskHeader = item.kind === 'task' && (!prev || prev.kind !== 'task');
          const showPeopleHeader = item.kind === 'person' && (!prev || prev.kind !== 'person');
          const active = i === activeIndex;
          return (
            <Fragment key={item.kind === 'task' ? `t-${item.task.id}` : `p-${item.person.id}`}>
              {showTaskHeader && (
                <li className="px-3 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400" aria-hidden="true">
                  Tasks
                </li>
              )}
              {showPeopleHeader && (
                <li className="px-3 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400" aria-hidden="true">
                  People
                </li>
              )}
              <li role="option" aria-selected={active}>
                <button
                  type="button"
                  // Keep textarea focus: prevent the mousedown blur, then select on click.
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => onSelect(item)}
                  onMouseEnter={() => onHover(i)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                    active ? 'bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                >
                  {item.kind === 'task' ? (
                    <>
                      <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 font-mono text-xs font-semibold text-blue-700">
                        {formatTaskKey(item.task.task_number)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-gray-700">{item.task.title}</span>
                      <StatusBadge status={item.task.status} />
                    </>
                  ) : (
                    <>
                      <span className="flex shrink-0 items-center gap-1 rounded bg-violet-50 px-1.5 py-0.5 text-xs font-semibold text-violet-700">
                        <AtSign size={11} />
                        Person
                      </span>
                      <span className="min-w-0 flex-1 truncate text-gray-700">{item.person.name}</span>
                    </>
                  )}
                </button>
              </li>
            </Fragment>
          );
        })}
      </ul>
    </div>
  );
}
