# CSV → Supabase Task Sync (verification / additive sync)

Operator guide for `scripts/sync_csv_tasks.ts`.

## Purpose

Verify that every task in the source CSV exists in Supabase under the correct
responsible person and with the correct fields, and reconcile the differences —
**without ever deleting anything**.

This is different from `scripts/import_excel_tasks.ts`, which does a **destructive
delete + full re-insert**. Use **sync** for incremental, safe reconciliation; use
**import** only when you intentionally want to wipe and rebuild the `tasks` table.

| | `sync:tasks` (this script) | `import:tasks` |
|---|---|---|
| Deletes existing tasks | **Never** | Yes (all of them) |
| Inserts missing tasks | Yes | Yes (everything) |
| Updates changed tasks | Yes (deterministic matches only) | N/A (rebuilt) |
| Creates missing people | Yes | Yes |
| Best for | Routine reconciliation | One-time full rebuild |

## Commands

Dry-run (no writes — always run this first):

```bash
npm run sync:tasks -- --file "New Engineering Tasks - 2026 - Engineering Tasks.csv" --dry-run
```

Apply (writes to Supabase; backs up first):

```bash
npm run sync:tasks -- --file "New Engineering Tasks - 2026 - Engineering Tasks.csv" --apply
```

If `--file` is omitted, the script defaults to the canonical CSV above. If that file
is missing, it lists candidate `.csv` files in the project root and stops (no guessing).
You must pass exactly one of `--dry-run` or `--apply`.

Secrets: reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (and optional
`SUPABASE_SERVICE_ROLE_KEY`) from `.env`. Key values are never printed — only the host.

## Field mapping

| DB column | CSV source |
|---|---|
| `title` | `Task description` |
| `status` | `Status` (normalized) |
| `priority` | `Priority` (numeric 1–5; word/`"1 - High"` forms handled) |
| `notes` | `Notes` |
| `responsible_person_id` | `Responsibility` → matched/created in `people` |
| `due_date` | `Due date` (`dd/mm/yyyy`, `yyyy-mm-dd`, empty, placeholder → null) |
| `closed_date` | `Close date` / `Closed date` (header `startsWith('close')`; same date parsing; empty/invalid → null) — actual closure date, distinct from `due_date`. Also compared/updated by sync. |
| `description` | null (no description column in this CSV) |
| `type` | null (no type column in this CSV) |
| `source_file` | CSV filename |
| `source_raw_text` | JSON snapshot of the row, **including `sync_id`** |
| `import_hash` | `sha256(title \| responsible \| due \| notes)`, first 16 hex chars |
| `archived` | `false` |

Normalization rules (status/priority/date/people) match `import_excel_tasks.ts` exactly,
so previously-imported rows compare cleanly. Empty status → `not_started` (warned);
empty/invalid priority → `3` (warned); invalid date → `null` (warned).

## Matching strategy

For each CSV row, the first matching rule wins:

1. **`sync_id`** — the CSV `Sync ID` is matched against a DB row's
   `source_raw_text.sync_id`. This script writes `sync_id` into `source_raw_text`, so
   after the first apply, future syncs are robust to *any* field edit.
2. **`import_hash`** — `sha256(title|responsible|due|notes)`. The same formula the
   importer uses, so rows that were imported earlier match exactly.
3. **`title + responsible`** — only when unique on **both** the CSV side and the DB
   side. Otherwise the row is reported as `ambiguous_match` and left untouched.

Comparison categories: `already_correct`, `missing_in_db`, `different_in_db`,
`ambiguous_match`, `extra_in_db`, `invalid_csv_row`.

### Duplicate handling

CSV rows are de-duplicated by **`import_hash`**, which is the DB's `UNIQUE` key —
two rows sharing a hash can never both exist in the DB. The first occurrence is kept;
later copies are reported as `duplicate_in_csv`. Because the hash excludes
`status`/`priority`, a later copy that differs only in those is flagged as a
**conflicting duplicate** (the kept row's values are recorded, the ignored ones noted),
so nothing is silently lost.

## What gets inserted

All `missing_in_db` rows are inserted with the mapping above (and `archived = false`).
Inserts are batched; if a batch hits the `import_hash` unique constraint, it retries
row-by-row so one bad row can't sink the rest. Any still-failing row is reported and
left as-is.

## What gets updated

Only `different_in_db` rows whose match is **deterministic** (rules 1–3 above). The
update rewrites the content fields plus `source_raw_text`/`import_hash`/`source_file`
and sets `archived = false`. Differences are listed field-by-field in the report.

## What NEVER gets deleted

Nothing. DB tasks not present in the CSV are reported as `extra_in_db` and left
untouched. People are never deleted. Deletion is out of scope for this script.

## Backup location

Before any write, `--apply` backs up the current tables to (gitignored) `backups/`:

- `backups/tasks-before-sync-YYYY-MM-DD-HH-mm-ss.json`
- `backups/people-before-sync-YYYY-MM-DD-HH-mm-ss.json`

## Report location

Both modes write a timestamped JSON report to (gitignored) `reports/`:

- `reports/task-sync-dry-run-YYYY-MM-DD-HH-mm-ss.json`
- `reports/task-sync-apply-YYYY-MM-DD-HH-mm-ss.json` (includes the applied actions)

## Restore guidance

This sync is additive (no deletes), so restores are rarely needed. If you must revert
an inserted or updated row, use the pre-sync backup:

1. Open `backups/tasks-before-sync-<ts>.json` — its `tasks` array is the exact prior state.
2. For an over-written row, `update` the DB row (matched by `id`) back to the backed-up
   values via a small script or the Supabase dashboard.
3. For an unwanted insert, delete that single row by `id` (manual, intentional).

## Known limitations

- The DB has no `sync_id` column (schema is fixed), so `sync_id` lives inside
  `source_raw_text`. Rows imported before this script ran have no `sync_id`, so the
  **first** sync falls back to `import_hash`; subsequent syncs benefit from `sync_id`.
- `import_hash` excludes `status`/`priority`. Two source rows identical except for those
  cannot both exist in the DB; they are collapsed and reported as conflicting duplicates.
- A row whose `title + responsible` is non-unique and whose hash/sync_id don't match is
  reported `ambiguous_match` and is **not** modified — verify and fix the source instead.
- `extra_in_db` rows are never removed; clean those up manually if desired.
