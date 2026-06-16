# Task Numbers & Cross-Task References

> Human-readable task keys (Jira-style `TASK-123`) plus `@123` cross-task links inside
> Notes/Description.

## Task numbers

- Every task has a stable integer `task_number`, displayed everywhere as **`TASK-<n>`**
  (e.g. `TASK-123`) via `formatTaskKey()` in `src/lib/utils.ts`.
- **DB-assigned**, never entered by the user:
  - Column: `tasks.task_number integer UNIQUE NOT NULL`, default `nextval(tasks_task_number_seq)`.
  - New inserts get the next number automatically (safe for concurrent inserts). The app
    never sends `task_number` (it is stripped from write payloads in `useTasks.toDbPayload`).
- The UUID `id` remains the internal primary key; `task_number` is purely the user-facing id.
- Shown in the table's new **Key** column (sortable) and prominently at the top of the
  expanded task details (`Task: TASK-123`). The raw `import_hash` is now demoted to a tiny
  "hash (technical)" line for debugging only.

## Search by number

The search box matches a task number in addition to title/notes/person. Accepted forms
(exact number match, case-insensitive), via `matchesTaskNumber()`:

- `123`
- `TASK-123`
- `task-123`
- `#123`

Existing title / notes / person search is unchanged; number matching is an additional OR.

## Referencing another task: `@123`

Type a reference inside **Notes** or **Description** while editing:

```
blocked by @123, see also @TASK-45
```

- The **raw text is stored exactly as typed** (`@123`) — nothing is rewritten on save, so the
  text stays editable and never corrupts. Linkification happens only at **render time** in the
  read-only expanded view (`TaskTextWithLinks`).
- Accepted reference forms: `@123`, `@TASK-123`, `@task-123` (case-insensitive).
- **Emails are safe:** the matcher ignores an `@` that is preceded by a word character, so
  `name@123.com` is *not* turned into a link. (A reference must start on its own, e.g. after a
  space or at the start of the line.)

## What happens when you click a reference

1. Resolve the number → task (via the `task_number → task` map built in `TasksPage`).
2. **Reveal it:** filters that could hide the target are reset (search/status/priority/person/
   overdue/due-this-week cleared; `show_archived` set to match the target's archived state).
3. The table imperatively **expands** the target row, **scrolls** it into view
   (`scrollIntoView`, centered), and **briefly highlights** it (~2 s amber background).

Rows expose `data-task-id` / `data-task-number` attributes for the scroll lookup.

## Rendering safety

- References render as React nodes (an inline `<button class="task-ref-link">`), never via
  `dangerouslySetInnerHTML`.
- Line breaks in Notes/Description are preserved with `white-space: pre-wrap`.
- A reference to a **non-existent** number (e.g. `@999999`) renders as subtle dotted-underline
  plain text (`task-ref-unresolved`) and does nothing on click — it never crashes.

## Limitations

- Linkification is read-only; while editing you see the raw `@123` text (by design — safer,
  fully editable).
- Number matching in search is exact (`123` matches `TASK-123`, but `12` does not).
- A reference glued to a preceding word (`see@123`) is intentionally not linked (email safety).
- Until the DB migration is applied, tasks have no `task_number` and keys show `—`
  (see `supabase/add_task_number_to_tasks.sql` and `docs/context.md`).
