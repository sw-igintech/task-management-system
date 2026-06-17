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
- Accepted reference forms: `@123`, `@TASK-123`, `@task-123` (case-insensitive) — all resolve
  to the same task number and render identically. Typing any of them manually works.
- **Emails are safe:** the matcher ignores an `@` that is preceded by a word character, so
  `name@123.com` is *not* turned into a link. (A reference must start on its own, e.g. after a
  space or at the start of the line.)

## Autocomplete while typing `@` (editing helper)

While editing **Notes** or **Description** (Add Task modal *and* inline edit), typing `@`
opens a suggestion popup below the textarea — like @-mentioning a person in Slack/Notion.

- **Trigger:** `@` at the start of the field or after a separator (space, newline, `(` `[`
  `{` `:` `,`). It is **not** triggered mid-word, so emails (`name@example.com`) never open it.
- **Filtering:** keep typing digits — `@13` filters to task numbers that *start with* `13`
  (`TASK-13`, `TASK-130`, `TASK-131`, `TASK-139`, …). `@TASK-13` / `@task-13` work too. With
  just `@` (empty query) it shows the most recent tasks (highest numbers), max 8.
- Each suggestion shows the **`TASK-<n>`** key, the **title**, and a **status** badge. Only
  tasks that have a `task_number` appear.
- **Keyboard:** `↓`/`↑` move the highlight, `Enter` or `Tab` selects, `Esc` closes. **Mouse:**
  click a suggestion to select; clicking outside (blur) closes it.
- **What gets inserted:** the current `@…` token is replaced with a clean **`@TASK-<number>`**
  plus a trailing space (e.g. selecting TASK-139 turns `@13` into `@TASK-139 `). The cursor
  lands right after it and focus stays in the textarea. The saved text is **still plain text**
  — no rich object, no markdown/HTML, no DB column. The read-only renderer linkifies it later
  (see above). Notes saved earlier with the bare `@139` form still render and link unchanged.
- **Available in both Description and Notes** (the autocomplete handlers are on both fields).
- **Works with the dated bullet prefix:** if `@` is your first character, the auto prefix still
  fires first → `• (DD.MM.YY) @`, and the popup opens as you type digits → `• (DD.MM.YY) @139`.
  After pressing Enter (new bullet) then `@`, autocomplete works on the new line too.

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
