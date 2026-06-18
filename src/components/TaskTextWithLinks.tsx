import { Fragment, type ReactNode } from 'react';
import type { Task, Person } from '../types';
import { formatTaskKey } from '../lib/utils';

// One regex, two kinds of @-token (matched left-to-right, never overlapping):
//   * group 1 — person mention "@person:<id>" → rendered as "@Name".
//   * group 2 — task reference "@123" / "@TASK-123" / "@task-123" → clickable link.
// The leading lookbehind rejects a "@" glued to a word char, so emails ("name@123x")
// and mid-word text are never linkified. Built fresh per call (a global regex carries
// mutable lastIndex state).
const TOKEN_PATTERN = '(?<![A-Za-z0-9_])@(?:person:([A-Za-z0-9_-]+)|(?:task-)?(\\d+)\\b)';

interface TaskTextWithLinksProps {
  text: string;
  // Resolver: returns the task for a given number, or undefined if it doesn't exist.
  getTaskByNumber: (n: number) => Task | undefined;
  // Resolver: returns the person for a mention id, or undefined if unknown.
  getPersonById: (id: string) => Person | undefined;
  // Called when the user clicks a resolved task reference.
  onReference: (n: number) => void;
  className?: string;
}

// Renders plain text while converting @<number> task references into clickable links
// and @person:<id> mentions into highlighted "@Name". Line breaks are preserved via
// `whitespace-pre-wrap` (no dangerouslySetInnerHTML).
export function TaskTextWithLinks({ text, getTaskByNumber, getPersonById, onReference, className }: TaskTextWithLinksProps) {
  const nodes: ReactNode[] = [];
  const re = new RegExp(TOKEN_PATTERN, 'gi');
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(<Fragment key={`t${lastIndex}`}>{text.slice(lastIndex, match.index)}</Fragment>);
    }

    const personId = match[1];
    if (personId !== undefined) {
      // Person mention. Resolve to the CURRENT name (ids are rename-safe).
      const person = getPersonById(personId);
      if (person) {
        nodes.push(
          <span key={`p${match.index}`} className="person-mention" title={`Mentioned: ${person.name}`}>
            @{person.name}
          </span>,
        );
      } else {
        nodes.push(
          <span key={`p${match.index}`} className="person-mention-unresolved" title="Unknown person">
            @unknown
          </span>,
        );
      }
    } else {
      // Task reference.
      const num = Number(match[2]);
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
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(<Fragment key={`t${lastIndex}`}>{text.slice(lastIndex)}</Fragment>);
  }

  return <span className={className} style={{ whiteSpace: 'pre-wrap' }}>{nodes}</span>;
}
