import { Fragment } from 'react';
import type { Person } from '../types';
import { tokenizeMentions } from '../lib/mentions';

interface MentionPreviewProps {
  text: string;
  people: Person[];
}

// Small read-only preview shown beneath a Description/Notes textarea while editing.
// A native <textarea> cannot colour only part of its own text, so this preview renders
// the same text with person mentions (@Name) and task references (@TASK-135) in blue —
// without touching the textarea's input, caret, bullet, or autocomplete behaviour.
// Non-interactive on purpose (no clickable links) so it never steals focus from typing.
export function MentionPreview({ text, people }: MentionPreviewProps) {
  if (!text.trim()) return null;
  const segments = tokenizeMentions(text, people);

  return (
    <div className="mt-1 rounded-md border border-gray-100 bg-gray-50 px-2 py-1.5">
      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Preview</p>
      <p className="text-sm text-gray-700" style={{ whiteSpace: 'pre-wrap' }}>
        {segments.map((seg, i) =>
          seg.type === 'plain' ? (
            <Fragment key={i}>{seg.text}</Fragment>
          ) : (
            <span key={i} className="font-medium text-blue-600">{seg.text}</span>
          ),
        )}
      </p>
    </div>
  );
}
