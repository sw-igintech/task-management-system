/**
 * Import script for PDF task data.
 *
 * Usage:
 *   npx tsx scripts/import_pdf_tasks.ts --dry-run    # Just generate parsed_tasks.json
 *   npx tsx scripts/import_pdf_tasks.ts --import     # Import to Supabase (requires env vars)
 *
 * The task data is hardcoded here from the parsed PDF:
 * "New Engineering Tasks - 4.26 - Google Sheets.pdf"
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_FILE = 'New Engineering Tasks - 4.26 - Google Sheets.pdf';

const PEOPLE = [
  { id: 'person-amit', name: 'Amit' },
  { id: 'person-elad', name: 'Elad' },
  { id: 'person-guy', name: 'Guy' },
  { id: 'person-matan', name: 'Matan' },
  { id: 'person-tamir', name: 'Tamir' },
];

interface RawTask {
  title: string;
  status: string;
  priority: number;
  notes: string;
  responsible: string;
  due_date: string | null;
  source_page: number;
}

const RAW_TASKS: RawTask[] = [
  // AMIT's Tasks
  { title: 'Type C cartridges assembly test', status: 'In progress', priority: 1, notes: 'Redesign robast', responsible: 'Amit', due_date: '2026-05-28', source_page: 1 },
  { title: 'Update ASMmbly instrucations', status: 'Not started', priority: 1, notes: 'Waiting for new assembly instruction to verify it. All encoder magnet need to be at distance 0.6-0.9 mm aim to 0.75', responsible: 'Amit', due_date: '2026-04-30', source_page: 1 },
  { title: 'Video approval', status: 'Not started', priority: 1, notes: 'Verify that this video also exists packaging inspiration, Explain about first setup machine', responsible: 'Amit', due_date: '2026-05-07', source_page: 1 },
  { title: 'Inside fixture for transportation', status: 'Not started', priority: 1, notes: 'Need to design better fixture for transportation', responsible: 'Amit', due_date: '2026-04-30', source_page: 1 },
  { title: 'SOW - Karrie, VC, Hungaria', status: 'Not started', priority: 1, notes: 'Prepare SOW for each stage', responsible: 'Amit', due_date: '2026-04-30', source_page: 1 },
  { title: 'Calibration flow', status: 'Not started', priority: 1, notes: 'Test the new flow', responsible: 'Amit', due_date: '2026-04-30', source_page: 1 },
  { title: 'PO definition - Omer', status: 'Not started', priority: 1, notes: 'QA definitions, procurement requirements', responsible: 'Amit', due_date: '2026-04-30', source_page: 1 },
  { title: 'Packing redesign', status: 'Not started', priority: 2, notes: 'We need 2 people to unpack the machine and the machine can be damaged during the pack and unpack', responsible: 'Amit', due_date: '2026-04-23', source_page: 2 },
  { title: 'Calibration protocol jigs', status: 'Not started', priority: 2, notes: 'Design JIGs for calibration protocol. Calibration jigs for gripper head - goal to prevent misalignment', responsible: 'Amit', due_date: '2026-04-23', source_page: 2 },
  { title: 'Define warranty from Sanmina void issue', status: 'Not started', priority: 2, notes: 'Share with Avinoam', responsible: 'Amit', due_date: '2026-04-23', source_page: 2 },
  { title: 'Order both all type of magnets', status: 'Not started', priority: 2, notes: '', responsible: 'Amit', due_date: '2026-04-26', source_page: 2 },
  { title: 'ATP', status: 'Not started', priority: 2, notes: 'Update ATP - Yifat. Add reboot and shutdown from the screen for the protocol. Add BIOT check for errors. Export log from BIOT at the end of the ATP. Think if need to be more update', responsible: 'Amit', due_date: '2026-05-21', source_page: 2 },
  { title: 'Failure points', status: 'Not started', priority: 2, notes: 'Search for point of failure in the assembly and calibration process - split it to small tasks', responsible: 'Amit', due_date: '2026-04-16', source_page: 2 },
  { title: 'Reduce steps in calibration', status: 'Not started', priority: 2, notes: 'Reduce steps in calibration mode for all the motors and actuators. The value in the toml: Calibration MultiStep Amount = 100', responsible: 'Amit', due_date: '2026-04-16', source_page: 2 },
  { title: 'Sanitizer liquid EU', status: 'Not started', priority: 2, notes: 'Dorian, think if we can test as is and take the risk - consult Avinoam', responsible: 'Amit', due_date: '2026-04-23', source_page: 2 },

  // ELAD's Tasks
  { title: '6 machines - Assembly Process Tracking', status: 'Need to review', priority: 1, notes: "20,22 - Ready, need to pack. 23 - This machine is in Israel's office for tests, need to do ATP after we corrected his config", responsible: 'Elad', due_date: '2026-04-16', source_page: 2 },
  { title: 'Dummy PCBA and update cable harness instructions', status: 'Need to review', priority: 1, notes: 'Amit need to check and assemble the cables and dummy PCBA to machine 11', responsible: 'Elad', due_date: '2026-04-14', source_page: 2 },
  { title: 'Sheet metal and CNC parts - 1.2', status: 'Need to review', priority: 1, notes: 'Running Change Parts - Design and print - need to design with Amit', responsible: 'Elad', due_date: '2026-04-15', source_page: 2 },
  { title: 'Update Karrie assembly instructions', status: 'In progress', priority: 1, notes: 'All encoder magnet need to be at distance 0.6-0.9 mm aim to 0.75', responsible: 'Elad', due_date: '2026-04-16', source_page: 2 },
  { title: '10-02-168 cable tie design - 1.1', status: 'Not started', priority: 1, notes: 'Design the cable tie', responsible: 'Elad', due_date: '2026-04-16', source_page: 2 },
  { title: '6 machines - Assembly Process Tracking (pack)', status: 'In progress', priority: 1, notes: "20,23 - Ready, need to pack. 22,24 - Waits for Omer's review", responsible: 'Elad', due_date: '2026-04-16', source_page: 2 },
  { title: 'Dummy PCBA cable harness update machine 12', status: 'In progress', priority: 1, notes: 'Need to assemble the Drum on machine 12 and update the cable harness instructions', responsible: 'Elad', due_date: '2026-04-14', source_page: 2 },
  { title: '10-02-168 new part design - 1.1', status: 'Not started', priority: 1, notes: 'Need to design the new part', responsible: 'Elad', due_date: '2026-04-16', source_page: 2 },
  { title: 'Print 3 units of the Karrie tester', status: 'In progress', priority: 1, notes: 'Need to print 6 buttons and put inserts', responsible: 'Elad', due_date: '2026-04-13', source_page: 2 },
  { title: 'Sanitizer Kit', status: 'Need to review', priority: 1, notes: '08-01-145 last batch and 1/4 check valve - rev c - required', responsible: 'Elad', due_date: '2026-04-16', source_page: 2 },
  { title: 'Design a shipping bracket', status: 'Not started', priority: 1, notes: 'Design a shipping bracket to timing belt', responsible: 'Elad', due_date: null, source_page: 3 },
  { title: 'Update assembly Karrie CAD', status: 'In progress', priority: 1, notes: '', responsible: 'Elad', due_date: null, source_page: 3 },
  { title: 'Order 2 poron from Scute', status: 'Not started', priority: 1, notes: 'Part numbers: 06-01-276, 05-01-112', responsible: 'Elad', due_date: null, source_page: 3 },
  { title: 'Add to sanitizer kit part that replaces the drawer', status: 'Not started', priority: 1, notes: '', responsible: 'Elad', due_date: null, source_page: 3 },
  { title: 'Check issue related to new brushes', status: 'Not started', priority: 2, notes: 'Check type C without brushes, see if there is any change in the process + film it to see the error', responsible: 'Elad', due_date: '2026-04-23', source_page: 3 },
  { title: 'Equipment for Rohan', status: 'On hold', priority: 2, notes: 'Send the new jigs for calibration', responsible: 'Elad', due_date: '2026-04-16', source_page: 3 },
  { title: 'Order Brushes from Scute', status: 'Need to review', priority: 2, notes: 'I need to design a solution that provides a strong grip that is difficult to release, while still allowing controlled disassembly when needed', responsible: 'Elad', due_date: '2026-04-16', source_page: 3 },
  { title: '10-02-168 septol holder - 1.2', status: 'In progress', priority: 2, notes: 'Running change part', responsible: 'Elad', due_date: '2026-04-16', source_page: 3 },
  { title: 'Move sanitizer microswitch to Karrie', status: 'Not started', priority: 2, notes: 'Think to move the sanitizer microswitch to Karrie aswell - on the inside assembly we can save from page 20-39. Move pcba + electromagnet of bin to Karrie also - page 62-68', responsible: 'Elad', due_date: '2026-04-23', source_page: 3 },
  { title: 'Verify fasteners for removal parts 1.15', status: 'In progress', priority: 2, notes: 'Make sure all fasteners are in the BOM for the removal parts 1.15', responsible: 'Elad', due_date: '2026-04-16', source_page: 3 },
  { title: 'Prepare 3 sets for Dorian', status: 'Need to review', priority: 2, notes: 'I prepared 3 sets, Guy works on the electronic side', responsible: 'Elad', due_date: null, source_page: 3 },
  { title: 'Order parts from Scute', status: 'Need to review', priority: 2, notes: 'Scute started, the first sample will be ready around 26th April. Amit and Avinoam got the PO and need to approve', responsible: 'Elad', due_date: '2026-04-16', source_page: 3 },

  // GUY's Tasks
  { title: 'Testing thermal pad on the inner light', status: 'Not started', priority: 2, notes: 'Need to test the thermal pad instead of the paste. Need to check what is the max temperature that the PCBA reaches in study state, then assemble the new Thermal paste and check what is the max temperature that the PCBA reaches in study state. Find the datasheet of the pad', responsible: 'Guy', due_date: '2026-04-23', source_page: 4 },
  { title: 'Japan cable 2 pin', status: 'Not started', priority: 2, notes: 'Prepare a doc that explains the implication on the machine using power cable without ground', responsible: 'Guy', due_date: '2026-04-23', source_page: 4 },
  { title: 'Define SW test for BON', status: 'Not started', priority: 3, notes: '', responsible: 'Guy', due_date: null, source_page: 4 },

  // MATAN's Tasks
  { title: 'Logs - WiFi upload verification', status: 'Not started', priority: 1, notes: 'When the machine is not connected to WiFi the logs save to the usb/SOM, when the machine connects to wifi we need to verify that all the logs in the usb/SOM uploaded to BIOT', responsible: 'Matan', due_date: '2026-04-16', source_page: 4 },
  { title: 'Machine cartridge DB issue', status: 'Not started', priority: 1, notes: 'Machine puts 0 on a new cartridge that is not in the machine DB (tandem said complete) - check if fixed - Yifat', responsible: 'Matan', due_date: '2026-04-16', source_page: 4 },
  { title: 'Next SW release (after 10.24)', status: 'Not started', priority: 1, notes: 'Check after IMG release', responsible: 'Matan', due_date: '2026-04-30', source_page: 4 },
  { title: 'Logs issue - partial log from BIOT', status: 'Not started', priority: 1, notes: "The issue - After a long time that the machine worked and wasn't connected to wifi, when you ask from BIOT logs you get only part of the log. Need to understand the root cause and define how to solve it", responsible: 'Matan', due_date: '2026-04-23', source_page: 4 },
  { title: 'Debug session issue', status: 'Not started', priority: 1, notes: 'BIOT report error but the link worked through BIOT', responsible: 'Matan', due_date: null, source_page: 4 },
  { title: 'QA Update test', status: 'Not started', priority: 2, notes: "Make sure it looks the same as we defined in the 'sw update protocol' doc", responsible: 'Matan', due_date: '2026-04-23', source_page: 4 },
  { title: 'Disposable count', status: 'Not started', priority: 2, notes: 'Check when it counts the disposable (when the SW decreases glove amount in cartridge)', responsible: 'Matan', due_date: '2026-04-30', source_page: 5 },
  { title: 'Export local logs', status: 'Not started', priority: 2, notes: 'We want to have the option to get all the logs on the SOM (local from BIOT), maybe with range (Drill down with tandem)', responsible: 'Matan', due_date: '2026-04-30', source_page: 5 },
  { title: 'Issue 364 FW solution', status: 'Not started', priority: 2, notes: 'Need to think how to implement the change', responsible: 'Matan', due_date: '2026-04-30', source_page: 5 },
  { title: 'Cable disconnect test', status: 'Not started', priority: 2, notes: 'When a new IMG release - do this test', responsible: 'Matan', due_date: '2026-04-30', source_page: 5 },
  { title: 'MAT - automatic diagnostic', status: 'Not started', priority: 3, notes: 'Think on automatic diagnostic and app connectivity', responsible: 'Matan', due_date: null, source_page: 5 },
  { title: 'Next SW release - German language', status: 'Not started', priority: 3, notes: 'Add to the close SW release the German language', responsible: 'Matan', due_date: null, source_page: 5 },

  // TAMIR's Tasks
  { title: '1.2 version plan', status: 'In progress', priority: 1, notes: 'Need to update Gantt and RND task plan', responsible: 'Tamir', due_date: '2026-04-28', source_page: 5 },
  { title: 'Shortages list from Sanmina 16 Machines', status: 'In progress', priority: 1, notes: 'To close all shortages', responsible: 'Tamir', due_date: '2026-04-23', source_page: 5 },
  { title: 'Share test protocol and jig for 1.15 assembly with Karrie', status: 'Not started', priority: 1, notes: 'Share with Karrie all tester protocol & testers', responsible: 'Tamir', due_date: '2026-04-16', source_page: 5 },
  { title: 'Open issue list Sanmina', status: 'In progress', priority: 1, notes: 'Waiting for Sanmina feedback', responsible: 'Tamir', due_date: '2026-04-16', source_page: 5 },
  { title: 'CDR preparation', status: 'Not started', priority: 1, notes: '', responsible: 'Tamir', due_date: '2026-04-23', source_page: 5 },
  { title: 'SOW plan B with Amit', status: 'Not started', priority: 1, notes: '', responsible: 'Tamir', due_date: '2026-04-16', source_page: 5 },
  { title: 'IPC 610/620', status: 'Not started', priority: 1, notes: '', responsible: 'Tamir', due_date: null, source_page: 5 },
  { title: 'Hermon lab - TUV Status', status: 'In progress', priority: 2, notes: 'TUV - need to schedule audit at Sanmina', responsible: 'Tamir', due_date: '2026-04-28', source_page: 5 },
  { title: 'Update TUV certification', status: 'Not started', priority: 2, notes: 'Block By TUV approve certification. Need to update TUV certification for new actuators', responsible: 'Tamir', due_date: '2026-04-28', source_page: 5 },
  { title: 'Karrie mold status', status: 'Not started', priority: 2, notes: 'Status', responsible: 'Tamir', due_date: '2026-04-16', source_page: 5 },
  { title: 'Prepare list for Karrie visit', status: 'Not started', priority: 2, notes: '', responsible: 'Tamir', due_date: '2026-04-23', source_page: 5 },
];

function makeImportHash(title: string, responsible: string, due_date: string | null): string {
  const raw = `${title}|${responsible}|${due_date ?? 'null'}`;
  return crypto.createHash('sha256').update(raw).digest('hex').substring(0, 12);
}

function mapStatus(raw: string): string {
  const map: Record<string, string> = {
    'In progress': 'in_progress',
    'Not started': 'not_started',
    'On hold': 'on_hold',
    'Need to review': 'need_to_review',
    'Done': 'done',
  };
  return map[raw] ?? 'not_started';
}

interface ParsedTask {
  title: string;
  status: string;
  priority: number;
  notes: string;
  responsible: string;
  responsible_id: string;
  due_date: string | null;
  source_file: string;
  source_page: number;
  import_hash: string;
  archived: boolean;
}

function buildParsedTasks(): ParsedTask[] {
  return RAW_TASKS.map(t => {
    const person = PEOPLE.find(p => p.name === t.responsible);
    return {
      title: t.title,
      status: mapStatus(t.status),
      priority: t.priority,
      notes: t.notes,
      responsible: t.responsible,
      responsible_id: person?.id ?? '',
      due_date: t.due_date,
      source_file: SOURCE_FILE,
      source_page: t.source_page,
      import_hash: makeImportHash(t.title, t.responsible, t.due_date),
      archived: false,
    };
  });
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const doImport = args.includes('--import');

  const tasks = buildParsedTasks();

  console.log(`\nParsed ${tasks.length} tasks from PDF data`);
  console.log(`People: ${PEOPLE.map(p => p.name).join(', ')}`);

  // Always write the JSON
  const outPath = path.join(__dirname, 'parsed_tasks.json');
  fs.writeFileSync(outPath, JSON.stringify({ people: PEOPLE, tasks }, null, 2));
  console.log(`\nWrote parsed data to: ${outPath}`);

  if (dryRun) {
    console.log('\n--- DRY RUN: Task Preview ---');
    tasks.forEach((t, i) => {
      console.log(`${String(i + 1).padStart(2, '0')}. [${t.responsible.padEnd(6)}] P${t.priority} [${t.status.padEnd(14)}] ${t.title.substring(0, 60)}`);
    });
    console.log('\nDry run complete. No data was written to Supabase.');
    return;
  }

  if (doImport) {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    if (!supabaseUrl || supabaseUrl.includes('placeholder')) {
      console.error('\nERROR: Supabase URL not configured. Set VITE_SUPABASE_URL or SUPABASE_URL env var.');
      process.exit(1);
    }

    console.log(`\nConnecting to Supabase: ${supabaseUrl}`);

    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Upsert people
      const { error: peopleErr } = await supabase.from('people').upsert(
        PEOPLE.map(p => ({ id: p.id, name: p.name })),
        { onConflict: 'id' }
      );
      if (peopleErr) throw peopleErr;
      console.log(`Upserted ${PEOPLE.length} people`);

      // Insert tasks (skip on conflict with import_hash)
      let imported = 0;
      let skipped = 0;
      for (const t of tasks) {
        const { error } = await supabase.from('tasks').insert({
          title: t.title,
          status: t.status,
          priority: t.priority,
          notes: t.notes,
          responsible_person_id: t.responsible_id || null,
          due_date: t.due_date,
          source_file: t.source_file,
          source_page: t.source_page,
          import_hash: t.import_hash,
          archived: false,
        });
        if (error) {
          if (error.code === '23505') {
            skipped++;
          } else {
            console.error(`Error importing "${t.title}":`, error.message);
          }
        } else {
          imported++;
        }
      }

      console.log(`\nImport complete: ${imported} imported, ${skipped} skipped (duplicates)`);
    } catch (err) {
      console.error('Import failed:', err);
      process.exit(1);
    }

    return;
  }

  console.log('\nUsage:');
  console.log('  npx tsx scripts/import_pdf_tasks.ts --dry-run    # Preview tasks');
  console.log('  npx tsx scripts/import_pdf_tasks.ts --import     # Import to Supabase');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
