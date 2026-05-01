import type { Person, Task } from '../types';

export const MOCK_PEOPLE: Person[] = [
  { id: 'person-amit', name: 'Amit', created_at: '2026-01-01T00:00:00Z' },
  { id: 'person-elad', name: 'Elad', created_at: '2026-01-01T00:00:00Z' },
  { id: 'person-guy', name: 'Guy', created_at: '2026-01-01T00:00:00Z' },
  { id: 'person-matan', name: 'Matan', created_at: '2026-01-01T00:00:00Z' },
  { id: 'person-tamir', name: 'Tamir', created_at: '2026-01-01T00:00:00Z' },
];

const personMap: Record<string, string> = {
  Amit: 'person-amit',
  Elad: 'person-elad',
  Guy: 'person-guy',
  Matan: 'person-matan',
  Tamir: 'person-tamir',
};

function makeTask(
  id: string,
  title: string,
  status: string,
  priority: number,
  notes: string,
  responsible: string,
  due_date: string | null,
  source_page: number,
): Task {
  const statusMap: Record<string, Task['status']> = {
    'In progress': 'in_progress',
    'Not started': 'not_started',
    'On hold': 'on_hold',
    'Need to review': 'need_to_review',
    'Done': 'done',
  };
  return {
    id,
    title,
    status: statusMap[status] ?? 'not_started',
    priority: priority as Task['priority'],
    notes,
    responsible_person_id: personMap[responsible],
    responsible_person: MOCK_PEOPLE.find(p => p.name === responsible),
    due_date,
    archived: false,
    source_file: 'New Engineering Tasks - 4.26 - Google Sheets.pdf',
    source_page,
    created_at: '2026-04-26T08:00:00Z',
    updated_at: '2026-04-26T08:00:00Z',
  };
}

export const MOCK_TASKS: Task[] = [
  // AMIT's Tasks (pages 1-2)
  makeTask('task-001', 'Type C cartridges assembly test', 'In progress', 1, 'Redesign robast', 'Amit', '2026-05-28', 1),
  makeTask('task-002', 'Update ASMmbly instrucations', 'Not started', 1, 'Waiting for new assembly instruction to verify it. All encoder magnet need to be at distance 0.6-0.9 mm aim to 0.75', 'Amit', '2026-04-30', 1),
  makeTask('task-003', 'Video approval', 'Not started', 1, 'Verify that this video also exists packaging inspiration, Explain about first setup machine', 'Amit', '2026-05-07', 1),
  makeTask('task-004', 'Inside fixture for transportation', 'Not started', 1, 'Need to design better fixture for transportation', 'Amit', '2026-04-30', 1),
  makeTask('task-005', 'SOW - Karrie, VC, Hungaria', 'Not started', 1, 'Prepare SOW for each stage', 'Amit', '2026-04-30', 1),
  makeTask('task-006', 'Calibration flow', 'Not started', 1, 'Test the new flow', 'Amit', '2026-04-30', 1),
  makeTask('task-007', 'PO definition - Omer', 'Not started', 1, 'QA definitions, procurement requirements', 'Amit', '2026-04-30', 1),
  makeTask('task-008', 'Packing redesign', 'Not started', 2, 'We need 2 people to unpack the machine and the machine can be damaged during the pack and unpack', 'Amit', '2026-04-23', 2),
  makeTask('task-009', 'Calibration protocol jigs', 'Not started', 2, 'Design JIGs for calibration protocol. Calibration jigs for gripper head - goal to prevent misalignment', 'Amit', '2026-04-23', 2),
  makeTask('task-010', 'Define warranty from Sanmina void issue', 'Not started', 2, 'Share with Avinoam', 'Amit', '2026-04-23', 2),
  makeTask('task-011', 'Order both all type of magnets', 'Not started', 2, '', 'Amit', '2026-04-26', 2),
  makeTask('task-012', 'ATP', 'Not started', 2, 'Update ATP - Yifat. Add reboot and shutdown from the screen for the protocol. Add BIOT check for errors. Export log from BIOT at the end of the ATP. Think if need to be more update', 'Amit', '2026-05-21', 2),
  makeTask('task-013', 'Failure points', 'Not started', 2, 'Search for point of failure in the assembly and calibration process - split it to small tasks', 'Amit', '2026-04-16', 2),
  makeTask('task-014', 'Reduce steps in calibration', 'Not started', 2, 'Reduce steps in calibration mode for all the motors and actuators. The value in the toml: Calibration MultiStep Amount = 100', 'Amit', '2026-04-16', 2),
  makeTask('task-015', 'Sanitizer liquid EU', 'Not started', 2, 'Dorian, think if we can test as is and take the risk - consult Avinoam', 'Amit', '2026-04-23', 2),

  // ELAD's Tasks (pages 2-3)
  makeTask('task-016', '6 machines - Assembly Process Tracking', 'Need to review', 1, '20,22 - Ready, need to pack. 23 - This machine is in Israel\'s office for tests, need to do ATP after we corrected his config', 'Elad', '2026-04-16', 2),
  makeTask('task-017', 'Dummy PCBA and update cable harness instructions', 'Need to review', 1, 'Amit need to check and assemble the cables and dummy PCBA to machine 11', 'Elad', '2026-04-14', 2),
  makeTask('task-018', 'Sheet metal and CNC parts - 1.2', 'Need to review', 1, 'Running Change Parts - Design and print - need to design with Amit', 'Elad', '2026-04-15', 2),
  makeTask('task-019', 'Update Karrie assembly instructions', 'In progress', 1, 'All encoder magnet need to be at distance 0.6-0.9 mm aim to 0.75', 'Elad', '2026-04-16', 2),
  makeTask('task-020', '10-02-168 cable tie design - 1.1', 'Not started', 1, 'Design the cable tie', 'Elad', '2026-04-16', 2),
  makeTask('task-021', '6 machines - Assembly Process Tracking (pack)', 'In progress', 1, '20,23 - Ready, need to pack. 22,24 - Waits for Omer\'s review', 'Elad', '2026-04-16', 2),
  makeTask('task-022', 'Dummy PCBA cable harness update machine 12', 'In progress', 1, 'Need to assemble the Drum on machine 12 and update the cable harness instructions', 'Elad', '2026-04-14', 2),
  makeTask('task-023', '10-02-168 new part design - 1.1', 'Not started', 1, 'Need to design the new part', 'Elad', '2026-04-16', 2),
  makeTask('task-024', 'Print 3 units of the Karrie tester', 'In progress', 1, 'Need to print 6 buttons and put inserts', 'Elad', '2026-04-13', 2),
  makeTask('task-025', 'Sanitizer Kit', 'Need to review', 1, '08-01-145 last batch and 1/4 check valve - rev c - required', 'Elad', '2026-04-16', 2),
  makeTask('task-026', 'Design a shipping bracket', 'Not started', 1, 'Design a shipping bracket to timing belt', 'Elad', null, 3),
  makeTask('task-027', 'Update assembly Karrie CAD', 'In progress', 1, '', 'Elad', null, 3),
  makeTask('task-028', 'Order 2 poron from Scute', 'Not started', 1, 'Part numbers: 06-01-276, 05-01-112', 'Elad', null, 3),
  makeTask('task-029', 'Add to sanitizer kit part that replaces the drawer', 'Not started', 1, '', 'Elad', null, 3),
  makeTask('task-030', 'Check issue related to new brushes', 'Not started', 2, 'Check type C without brushes, see if there is any change in the process + film it to see the error', 'Elad', '2026-04-23', 3),
  makeTask('task-031', 'Equipment for Rohan', 'On hold', 2, 'Send the new jigs for calibration', 'Elad', '2026-04-16', 3),
  makeTask('task-032', 'Order Brushes from Scute', 'Need to review', 2, 'I need to design a solution that provides a strong grip that is difficult to release, while still allowing controlled disassembly when needed', 'Elad', '2026-04-16', 3),
  makeTask('task-033', '10-02-168 septol holder - 1.2', 'In progress', 2, 'Running change part', 'Elad', '2026-04-16', 3),
  makeTask('task-034', 'Move sanitizer microswitch to Karrie', 'Not started', 2, 'Think to move the sanitizer microswitch to Karrie aswell - on the inside assembly we can save from page 20-39. Move pcba + electromagnet of bin to Karrie also - page 62-68', 'Elad', '2026-04-23', 3),
  makeTask('task-035', 'Verify fasteners for removal parts 1.15', 'In progress', 2, 'Make sure all fasteners are in the BOM for the removal parts 1.15', 'Elad', '2026-04-16', 3),
  makeTask('task-036', 'Prepare 3 sets for Dorian', 'Need to review', 2, 'I prepared 3 sets, Guy works on the electronic side', 'Elad', null, 3),
  makeTask('task-037', 'Order parts from Scute', 'Need to review', 2, 'Scute started, the first sample will be ready around 26th April. Amit and Avinoam got the PO and need to approve', 'Elad', '2026-04-16', 3),

  // GUY's Tasks (page 4)
  makeTask('task-038', 'Testing thermal pad on the inner light', 'Not started', 2, 'Need to test the thermal pad instead of the paste. Need to check what is the max temperature that the PCBA reaches in study state, then assemble the new Thermal paste and check what is the max temperature that the PCBA reaches in study state. Find the datasheet of the pad', 'Guy', '2026-04-23', 4),
  makeTask('task-039', 'Japan cable 2 pin', 'Not started', 2, 'Prepare a doc that explains the implication on the machine using power cable without ground', 'Guy', '2026-04-23', 4),
  makeTask('task-040', 'Define SW test for BON', 'Not started', 3, '', 'Guy', null, 4),

  // MATAN's Tasks (pages 4-5)
  makeTask('task-041', 'Logs - WiFi upload verification', 'Not started', 1, 'When the machine is not connected to WiFi the logs save to the usb/SOM, when the machine connects to wifi we need to verify that all the logs in the usb/SOM uploaded to BIOT', 'Matan', '2026-04-16', 4),
  makeTask('task-042', 'Machine cartridge DB issue', 'Not started', 1, 'Machine puts 0 on a new cartridge that is not in the machine DB (tandem said complete) - check if fixed - Yifat', 'Matan', '2026-04-16', 4),
  makeTask('task-043', 'Next SW release (after 10.24)', 'Not started', 1, 'Check after IMG release', 'Matan', '2026-04-30', 4),
  makeTask('task-044', 'Logs issue - partial log from BIOT', 'Not started', 1, 'The issue - After a long time that the machine worked and wasn\'t connected to wifi, when you ask from BIOT logs you get only part of the log. Need to understand the root cause and define how to solve it', 'Matan', '2026-04-23', 4),
  makeTask('task-045', 'Debug session issue', 'Not started', 1, 'BIOT report error but the link worked through BIOT', 'Matan', null, 4),
  makeTask('task-046', 'QA Update test', 'Not started', 2, 'Make sure it looks the same as we defined in the \'sw update protocol\' doc', 'Matan', '2026-04-23', 4),
  makeTask('task-047', 'Disposable count', 'Not started', 2, 'Check when it counts the disposable (when the SW decreases glove amount in cartridge)', 'Matan', '2026-04-30', 5),
  makeTask('task-048', 'Export local logs', 'Not started', 2, 'We want to have the option to get all the logs on the SOM (local from BIOT), maybe with range (Drill down with tandem)', 'Matan', '2026-04-30', 5),
  makeTask('task-049', 'Issue 364 FW solution', 'Not started', 2, 'Need to think how to implement the change', 'Matan', '2026-04-30', 5),
  makeTask('task-050', 'Cable disconnect test', 'Not started', 2, 'When a new IMG release - do this test', 'Matan', '2026-04-30', 5),
  makeTask('task-051', 'MAT - automatic diagnostic', 'Not started', 3, 'Think on automatic diagnostic and app connectivity', 'Matan', null, 5),
  makeTask('task-052', 'Next SW release - German language', 'Not started', 3, 'Add to the close SW release the German language', 'Matan', null, 5),

  // TAMIR's Tasks (page 5)
  makeTask('task-053', '1.2 version plan', 'In progress', 1, 'Need to update Gantt and RND task plan', 'Tamir', '2026-04-28', 5),
  makeTask('task-054', 'Shortages list from Sanmina 16 Machines', 'In progress', 1, 'To close all shortages', 'Tamir', '2026-04-23', 5),
  makeTask('task-055', 'Share test protocol and jig for 1.15 assembly with Karrie', 'Not started', 1, 'Share with Karrie all tester protocol & testers', 'Tamir', '2026-04-16', 5),
  makeTask('task-056', 'Open issue list Sanmina', 'In progress', 1, 'Waiting for Sanmina feedback', 'Tamir', '2026-04-16', 5),
  makeTask('task-057', 'CDR preparation', 'Not started', 1, '', 'Tamir', '2026-04-23', 5),
  makeTask('task-058', 'SOW plan B with Amit', 'Not started', 1, '', 'Tamir', '2026-04-16', 5),
  makeTask('task-059', 'IPC 610/620', 'Not started', 1, '', 'Tamir', null, 5),
  makeTask('task-060', 'Hermon lab - TUV Status', 'In progress', 2, 'TUV - need to schedule audit at Sanmina', 'Tamir', '2026-04-28', 5),
  makeTask('task-061', 'Update TUV certification', 'Not started', 2, 'Block By TUV approve certification. Need to update TUV certification for new actuators', 'Tamir', '2026-04-28', 5),
  makeTask('task-062', 'Karrie mold status', 'Not started', 2, 'Status', 'Tamir', '2026-04-16', 5),
  makeTask('task-063', 'Prepare list for Karrie visit', 'Not started', 2, '', 'Tamir', '2026-04-23', 5),
];
