import { Fragment, type ReactNode } from 'react';
import type { Task } from '../types';
import { formatTaskKey } from '../lib/utils';

// Matches @123, @TASK-123, @task-123 — but NOT when preceded by a word char, so
// emails like "name@123x" are not linkified. Numeric-only @refs keep emails safe.
// Built fresh per call (a global regex carries mutable lastIndex state).
const REF_PATTERN = '(?<![A-Za-z0-9_])@(?:task-)?(\\d+)\\b';

interface TaskTextWithLinksProps {
  text: string;
  // Resolver: returns the task for a given number, or undefined if it doesn't exist.
  getTaskByNumber: (n: number) => Task | undefined;
  // Called when the user clicks a resolved reference.
  onReference: (n: number) => void;
  className?: string;
}

// Renders plain text while converting @<number> references into clickable task
// links. Line breaks are preserved via `whitespace-pre-wrap` (no dangerouslySetInnerHTML).
export function TaskTextWithLinks({ text, getTaskByNumber, onReference, className }: TaskTextWithLinksProps) {
  const nodes: ReactNode[] = [];
  const re = new RegExp(REF_PATTERN, 'gi');
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    const num = Number(match[1]);
    if (match.index > lastIndex) {
      nodes.push(<Fragment key={`t${lastIndex}`}>{text.slice(lastIndex, match.index)}</Fragment>);
    }
    const referenced = getTaskByNumber(num);
    if (referenced) {
      nodes.push(
        <button
          key={`r${match.index}`}
          type="button"
          className="task-ref-link"
          title={referenced.title}
          onClick={() => onReference(num)}
        >
          {formatTaskKey(num)}
        </button>,
      );
    } else {
      // Unresolved reference: keep the original text, styled subtly. Never crash.
      nodes.push(
        <span key={`r${match.index}`} className="task-ref-unresolved" title="Unknown task number">
          {match[0]}
        </span>,
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(<Fragment key={`t${lastIndex}`}>{text.slice(lastIndex)}</Fragment>);
  }

  return <span className={className} style={{ whiteSpace: 'pre-wrap' }}>{nodes}</span>;
}
