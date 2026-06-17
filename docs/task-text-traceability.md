# Automatic Dated Text Traceability (Notes & Description)

> Lightweight in-text audit trail. When you start typing in a task's **Notes** or
> **Description** field, the app auto-inserts today's date as a plain-text prefix so
> updates are self-dated without any extra UI.

## What it does

When you click into the **Notes** or **Description** textarea and type your first
character, the app inserts a **bullet + date** prefix immediately before that character:

```
• (17.06.26) c
```

…then you keep typing normally:

```
• (17.06.26) checked with Amit, waiting for answer
```

There is **no button, checkbox, or toggle** — insertion is fully automatic, exactly once
per editing interaction (and again on each Enter, see below).

## Bullet + date format

`• (DD.MM.YY) ` — a real bullet `•`, a space, the date in parentheses (2-digit
`day.month.year`), then **one space**.

- `2026-06-17` → `• (17.06.26) `
- Built by `formatTracePrefix(new Date())` in `src/components/TaskForm.tsx`.

## Enter vs Shift+Enter (Word-style bullets)

Inside Description/Notes:

- **Enter** = start a **new dated bullet entry** on the next line: a newline plus a fresh
  `• (DD.MM.YY) `, caret placed right after it.
  ```
  • (17.06.26) first update
  • (17.06.26) ▮            ← caret here after pressing Enter
  ```
- **Shift+Enter** = a **plain newline** only (no bullet/date) — to continue the same bullet
  across multiple lines:
  ```
  • (17.06.26) first line
  continued line without new bullet
  ```

Applies to **both Description and Notes** (the same handlers are on both textareas).

## It is plain, editable text

- The prefix is ordinary text inserted into the field value. It is **not**:
  - a locked/immutable component,
  - stored in a separate variable, or
  - a separate DB column.
- It is saved as part of the existing `notes` / `description` text (no schema change).
- You can **delete it, edit it, or ignore it** freely. Nothing validates or requires it;
  it is **never mandatory for saving** and is **not re-inserted** if you delete it within
  the same editing interaction.

## When it inserts (anti-repeat rule)

- Inserted **once per focus interaction** on the **first printable keystroke**, **and** again
  each time you press **Enter** (new bullet line).
- A per-field flag (`tracePrefixDone`) is reset on `focus`, set after the first insertion. So
  you never get `• (17.06.26) • (17.06.26) …` from ordinary typing.
- Delete the prefix and keep typing in the **same** interaction → it is **not** re-added.
- Blur and later focus the field again for a **new** update → it inserts again (a fresh
  dated bullet for the new edit).

## What does NOT trigger insertion

Implemented via `keydown` — only single printable characters (`e.key.length === 1`) start the
first bullet, and **Enter** starts a new bullet. These never trigger a prefix:

- Modifiers & navigation: Shift, Ctrl, Alt, Meta, Tab, Escape, Arrow keys, Home/End,
  PageUp/PageDown.
- Editing-without-typing: Backspace, Delete.
- **Shift+Enter** — inserts a plain newline only (continue the same bullet).
- Shortcuts: Ctrl/Cmd/Alt combos (Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+Z, …).
- IME composition (see below).

## Paste

Pasting as the **first** content change of a focus interaction inserts the prefix before the
pasted text:

- Paste `checked with Amit` → `• (17.06.26) checked with Amit`.
- Handled by an `onPaste` handler (preventDefault + manual insert).

## Cursor / newline placement

`insertTracePrefix()` (first char) and `insertBulletLine()` (Enter) insert at the current
selection (`selectionStart`/`selectionEnd`):

| Situation | Result |
|---|---|
| Empty field, type `a` | `• (17.06.26) a` |
| End of `old note` (no trailing newline), type `n` | `old note`⏎`• (17.06.26) n` |
| End of `old note\n` (already ends with newline), type `n` | `old note`⏎`• (17.06.26) n` |
| Start of an empty line | `• (17.06.26) ` + typed char |
| Middle of a line | A newline is added before the prefix, then `• (17.06.26) ` + typed char, then the remaining text — surrounding text is preserved |
| **Text selected**, then type | The selection is **replaced** with `• (17.06.26) ` + typed char (documented, accepted behavior) |
| **Enter** at end of a bullet | newline + `• (17.06.26) `, caret after it |
| **Shift+Enter** | plain newline only, no bullet/date |

Rule: the prefix goes on its **own line** unless the cursor is at the very start of the field
or already right after a newline. The caret is restored to just after the inserted prefix +
typed text.

## IME / composition / Hebrew

- Hebrew (and English) type as direct `insertText` characters — fully supported; the prefix
  inserts on the first Hebrew/English character.
- Composition/IME events are **skipped** (`e.nativeEvent.isComposing`, `e.key === 'Process'`,
  `e.keyCode === 229`) so non-Latin IME input (CJK, dead-key accents) is not broken.
- **Known limitation:** if the very first input of an interaction is an IME-composed
  character, the prefix is not inserted for that first composed token (to avoid corrupting
  composition). This does not affect Hebrew/English direct typing.

## Scope

- Applies to **both Notes and Description** (same logic, both wired with the
  `onFocus`/`onKeyDown`/`onPaste` handlers).
- Lives entirely in `src/components/TaskForm.tsx`, which is used by **both** the Add Task
  modal and the inline expanded-row editor — so the behavior is identical in both places.
- No DB migration, no Supabase schema change, no import/sync script change.

## Implementation notes

- Fields are uncontrolled React Hook Form inputs (`register('notes'|'description')`). The
  handler reads the field name from `e.currentTarget.name`, computes the new value, and
  commits it with `setValue(field, value, { shouldDirty: true, shouldTouch: true })` (which
  updates the uncontrolled textarea via RHF's ref) — never a DOM-only mutation. The caret is
  restored in a `requestAnimationFrame` callback.
