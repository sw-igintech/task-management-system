# Task Filtering

How the Tasks page filters work after the multi-select change.

## Filter model — `TaskFilters` (`src/types/index.ts`)

```ts
interface TaskFilters {
  search: string;
  statuses: TaskStatus[];      // [] = all
  priorities: PriorityLevel[]; // [] = all
  personIds: string[];         // [] = all
  show_archived: boolean;
  overdue_only: boolean;
  due_this_week: boolean;
}
```

- **Empty array = no filter / all values** (keeps the original "All Statuses" behavior).
- A non-empty array filters to those values.

## Filtering logic (`src/lib/storage.ts` → `getFilteredTasks`)

Evaluated per task, in order: archived → search → statuses → priorities → personIds → overdue → due-this-week.

- **OR within a category:** `statuses: ['in_progress','on_hold']` matches a task whose status is *either*.
- **AND across categories:** `(status ∈ statuses) AND (priority ∈ priorities) AND (person ∈ personIds)`.
- A task with no `responsible_person_id` is excluded when `personIds` is non-empty.
- Empty categories are skipped (no constraint).

Example: `statuses=[in_progress,on_hold]`, `priorities=[1,2]`, `personIds=[amit,elad]` →
`(In Progress OR On Hold) AND (P1 OR P2) AND (Amit OR Elad)`.

## Dropdown UI (`src/components/MultiSelectDropdown.tsx`)

- Checkbox-style menu; each option shows a ✓ when selected. Clicking toggles and keeps the menu open.
- Closes on outside click or **Escape**.
- Button summary: `All Statuses` when empty, else `N Status(es)` / `N Priorit(y/ies)` / `N Person/People`.
- **"All" row:**
  - ✓ when every option is selected; `–` (indeterminate) when some are selected; empty when none.
  - Click selects all options. Click again when all are selected → clears to neutral/all.
  - "Everything except Done": open Status → **All** → uncheck **Done**.

## Active filter chips (`src/components/ActiveFilterChips.tsx`)

- One removable chip **per selected value** (Status/Priority/Person) plus Search / Overdue only / Due this week / Show archived.
- Removing a chip drops only that value; removing the last value in a category returns it to "all".
- **Clear all** resets search + all arrays + the three booleans. The row is hidden when nothing is active and wraps on mobile.

## Smart Views (`src/components/SmartViews.tsx`)

Each view sets the array shape:

| View | Sets |
|---|---|
| All Active | all arrays `[]`, booleans `false` (neutral) |
| Overdue | `overdue_only: true` |
| Due This Week | `due_this_week: true` |
| High Priority | `priorities: [1]` |
| Need Review | `statuses: ['need_to_review']` |
| In Progress | `statuses: ['in_progress']` |
| By Person | **merges**: toggles `person.id` in the current `personIds`, preserving all other filters |

**Smart Views (top section)** replace the whole filter set (`DEFAULT_FILTERS + view.filters`) — that's the intended "jump to this view" behavior.

**By Person is different — it merges, it does not reset.** Clicking a person under BY PERSON keeps every other active filter (statuses / priorities / search / overdue / due-this-week / show_archived) and only updates `personIds`: it **adds** the person if not selected, or **removes** them if already selected (multi-select toggle). So applying top filters first and *then* clicking a person now keeps both (previously the person click reset everything). A person row is highlighted whenever it is in `personIds` (regardless of other active filters).

Active-state highlighting for the top views uses an array-aware (set) comparison. The sidebar count badges are computed from the task list in `TasksPage` (unchanged).
