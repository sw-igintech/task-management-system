-- Seed: Engineering team members
INSERT INTO people (id, name, email) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Amit', 'amit@company.com'),
  ('00000000-0000-0000-0000-000000000002', 'Elad', 'elad@company.com'),
  ('00000000-0000-0000-0000-000000000003', 'Guy', 'guy@company.com'),
  ('00000000-0000-0000-0000-000000000004', 'Matan', 'matan@igintech.com'),
  ('00000000-0000-0000-0000-000000000005', 'Tamir', 'tamir@company.com')
ON CONFLICT (id) DO NOTHING;

-- Seed: All 63 tasks from PDF "New Engineering Tasks - 4.26 - Google Sheets.pdf"
-- Run scripts/import_pdf_tasks.ts --import for a proper import with deduplication

-- AMIT's Tasks (pages 1-2)
INSERT INTO tasks (title, status, priority, responsible_person_id, due_date, notes, source_file, source_page, import_hash) VALUES
  ('Type C cartridges assembly test', 'in_progress', 1, '00000000-0000-0000-0000-000000000001', '2026-05-28', 'Redesign robast', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 1, 'amit-type-c-cartridges-2026-05-28'),
  ('Update ASMmbly instrucations', 'not_started', 1, '00000000-0000-0000-0000-000000000001', '2026-04-30', 'Waiting for new assembly instruction to verify it. All encoder magnet need to be at distance 0.6-0.9 mm aim to 0.75', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 1, 'amit-update-asmmbly-2026-04-30'),
  ('Video approval', 'not_started', 1, '00000000-0000-0000-0000-000000000001', '2026-05-07', 'Verify that this video also exists packaging inspiration, Explain about first setup machine', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 1, 'amit-video-approval-2026-05-07'),
  ('Inside fixture for transportation', 'not_started', 1, '00000000-0000-0000-0000-000000000001', '2026-04-30', 'Need to design better fixture for transportation', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 1, 'amit-inside-fixture-2026-04-30'),
  ('SOW - Karrie, VC, Hungaria', 'not_started', 1, '00000000-0000-0000-0000-000000000001', '2026-04-30', 'Prepare SOW for each stage', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 1, 'amit-sow-karrie-2026-04-30'),
  ('Calibration flow', 'not_started', 1, '00000000-0000-0000-0000-000000000001', '2026-04-30', 'Test the new flow', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 1, 'amit-calibration-flow-2026-04-30'),
  ('PO definition - Omer', 'not_started', 1, '00000000-0000-0000-0000-000000000001', '2026-04-30', 'QA definitions, procurement requirements', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 1, 'amit-po-definition-2026-04-30'),
  ('Packing redesign', 'not_started', 2, '00000000-0000-0000-0000-000000000001', '2026-04-23', 'We need 2 people to unpack the machine and the machine can be damaged during the pack and unpack', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 2, 'amit-packing-redesign-2026-04-23'),
  ('Calibration protocol jigs', 'not_started', 2, '00000000-0000-0000-0000-000000000001', '2026-04-23', 'Design JIGs for calibration protocol. Calibration jigs for gripper head - goal to prevent misalignment', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 2, 'amit-calibration-protocol-2026-04-23'),
  ('Define warranty from Sanmina void issue', 'not_started', 2, '00000000-0000-0000-0000-000000000001', '2026-04-23', 'Share with Avinoam', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 2, 'amit-define-warranty-2026-04-23'),
  ('Order both all type of magnets', 'not_started', 2, '00000000-0000-0000-0000-000000000001', '2026-04-26', '', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 2, 'amit-order-magnets-2026-04-26'),
  ('ATP', 'not_started', 2, '00000000-0000-0000-0000-000000000001', '2026-05-21', 'Update ATP - Yifat. Add reboot and shutdown from the screen for the protocol. Add BIOT check for errors. Export log from BIOT at the end of the ATP. Think if need to be more update', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 2, 'amit-atp-2026-05-21'),
  ('Failure points', 'not_started', 2, '00000000-0000-0000-0000-000000000001', '2026-04-16', 'Search for point of failure in the assembly and calibration process - split it to small tasks', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 2, 'amit-failure-points-2026-04-16'),
  ('Reduce steps in calibration', 'not_started', 2, '00000000-0000-0000-0000-000000000001', '2026-04-16', 'Reduce steps in calibration mode for all the motors and actuators. The value in the toml: Calibration MultiStep Amount = 100', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 2, 'amit-reduce-steps-2026-04-16'),
  ('Sanitizer liquid EU', 'not_started', 2, '00000000-0000-0000-0000-000000000001', '2026-04-23', 'Dorian, think if we can test as is and take the risk - consult Avinoam', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 2, 'amit-sanitizer-liquid-2026-04-23')
ON CONFLICT (import_hash) DO NOTHING;

-- ELAD's Tasks (pages 2-3)
INSERT INTO tasks (title, status, priority, responsible_person_id, due_date, notes, source_file, source_page, import_hash) VALUES
  ('6 machines - Assembly Process Tracking', 'need_to_review', 1, '00000000-0000-0000-0000-000000000002', '2026-04-16', '20,22 - Ready, need to pack. 23 - This machine is in Israel''s office for tests, need to do ATP after we corrected his config', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 2, 'elad-6-machines-assembly-2026-04-16'),
  ('Dummy PCBA and update cable harness instructions', 'need_to_review', 1, '00000000-0000-0000-0000-000000000002', '2026-04-14', 'Amit need to check and assemble the cables and dummy PCBA to machine 11', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 2, 'elad-dummy-pcba-harness-2026-04-14'),
  ('Sheet metal and CNC parts - 1.2', 'need_to_review', 1, '00000000-0000-0000-0000-000000000002', '2026-04-15', 'Running Change Parts - Design and print - need to design with Amit', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 2, 'elad-sheet-metal-1-2-2026-04-15'),
  ('Update Karrie assembly instructions', 'in_progress', 1, '00000000-0000-0000-0000-000000000002', '2026-04-16', 'All encoder magnet need to be at distance 0.6-0.9 mm aim to 0.75', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 2, 'elad-update-karrie-assembly-2026-04-16'),
  ('10-02-168 cable tie design - 1.1', 'not_started', 1, '00000000-0000-0000-0000-000000000002', '2026-04-16', 'Design the cable tie', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 2, 'elad-cable-tie-design-2026-04-16'),
  ('6 machines - Assembly Process Tracking (pack)', 'in_progress', 1, '00000000-0000-0000-0000-000000000002', '2026-04-16', '20,23 - Ready, need to pack. 22,24 - Waits for Omer''s review', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 2, 'elad-6-machines-pack-2026-04-16'),
  ('Dummy PCBA cable harness update machine 12', 'in_progress', 1, '00000000-0000-0000-0000-000000000002', '2026-04-14', 'Need to assemble the Drum on machine 12 and update the cable harness instructions', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 2, 'elad-dummy-pcba-machine12-2026-04-14'),
  ('10-02-168 new part design - 1.1', 'not_started', 1, '00000000-0000-0000-0000-000000000002', '2026-04-16', 'Need to design the new part', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 2, 'elad-new-part-design-2026-04-16'),
  ('Print 3 units of the Karrie tester', 'in_progress', 1, '00000000-0000-0000-0000-000000000002', '2026-04-13', 'Need to print 6 buttons and put inserts', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 2, 'elad-print-karrie-tester-2026-04-13'),
  ('Sanitizer Kit', 'need_to_review', 1, '00000000-0000-0000-0000-000000000002', '2026-04-16', '08-01-145 last batch and 1/4 check valve - rev c - required', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 2, 'elad-sanitizer-kit-2026-04-16'),
  ('Design a shipping bracket', 'not_started', 1, '00000000-0000-0000-0000-000000000002', NULL, 'Design a shipping bracket to timing belt', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 3, 'elad-shipping-bracket-null'),
  ('Update assembly Karrie CAD', 'in_progress', 1, '00000000-0000-0000-0000-000000000002', NULL, '', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 3, 'elad-update-karrie-cad-null'),
  ('Order 2 poron from Scute', 'not_started', 1, '00000000-0000-0000-0000-000000000002', NULL, 'Part numbers: 06-01-276, 05-01-112', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 3, 'elad-order-poron-null'),
  ('Add to sanitizer kit part that replaces the drawer', 'not_started', 1, '00000000-0000-0000-0000-000000000002', NULL, '', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 3, 'elad-sanitizer-drawer-null'),
  ('Check issue related to new brushes', 'not_started', 2, '00000000-0000-0000-0000-000000000002', '2026-04-23', 'Check type C without brushes, see if there is any change in the process + film it to see the error', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 3, 'elad-check-brushes-2026-04-23'),
  ('Equipment for Rohan', 'on_hold', 2, '00000000-0000-0000-0000-000000000002', '2026-04-16', 'Send the new jigs for calibration', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 3, 'elad-equipment-rohan-2026-04-16'),
  ('Order Brushes from Scute', 'need_to_review', 2, '00000000-0000-0000-0000-000000000002', '2026-04-16', 'I need to design a solution that provides a strong grip that is difficult to release, while still allowing controlled disassembly when needed', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 3, 'elad-order-brushes-2026-04-16'),
  ('10-02-168 septol holder - 1.2', 'in_progress', 2, '00000000-0000-0000-0000-000000000002', '2026-04-16', 'Running change part', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 3, 'elad-septol-holder-2026-04-16'),
  ('Move sanitizer microswitch to Karrie', 'not_started', 2, '00000000-0000-0000-0000-000000000002', '2026-04-23', 'Think to move the sanitizer microswitch to Karrie aswell - on the inside assembly we can save from page 20-39. Move pcba + electromagnet of bin to Karrie also - page 62-68', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 3, 'elad-microswitch-karrie-2026-04-23'),
  ('Verify fasteners for removal parts 1.15', 'in_progress', 2, '00000000-0000-0000-0000-000000000002', '2026-04-16', 'Make sure all fasteners are in the BOM for the removal parts 1.15', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 3, 'elad-verify-fasteners-2026-04-16'),
  ('Prepare 3 sets for Dorian', 'need_to_review', 2, '00000000-0000-0000-0000-000000000002', NULL, 'I prepared 3 sets, Guy works on the electronic side', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 3, 'elad-prepare-dorian-null'),
  ('Order parts from Scute', 'need_to_review', 2, '00000000-0000-0000-0000-000000000002', '2026-04-16', 'Scute started, the first sample will be ready around 26th April. Amit and Avinoam got the PO and need to approve', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 3, 'elad-order-scute-2026-04-16')
ON CONFLICT (import_hash) DO NOTHING;

-- GUY's Tasks (page 4)
INSERT INTO tasks (title, status, priority, responsible_person_id, due_date, notes, source_file, source_page, import_hash) VALUES
  ('Testing thermal pad on the inner light', 'not_started', 2, '00000000-0000-0000-0000-000000000003', '2026-04-23', 'Need to test the thermal pad instead of the paste. Need to check what is the max temperature that the PCBA reaches in study state, then assemble the new Thermal paste and check what is the max temperature that the PCBA reaches in study state. Find the datasheet of the pad', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 4, 'guy-thermal-pad-2026-04-23'),
  ('Japan cable 2 pin', 'not_started', 2, '00000000-0000-0000-0000-000000000003', '2026-04-23', 'Prepare a doc that explains the implication on the machine using power cable without ground', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 4, 'guy-japan-cable-2026-04-23'),
  ('Define SW test for BON', 'not_started', 3, '00000000-0000-0000-0000-000000000003', NULL, '', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 4, 'guy-sw-test-bon-null')
ON CONFLICT (import_hash) DO NOTHING;

-- MATAN's Tasks (pages 4-5)
INSERT INTO tasks (title, status, priority, responsible_person_id, due_date, notes, source_file, source_page, import_hash) VALUES
  ('Logs - WiFi upload verification', 'not_started', 1, '00000000-0000-0000-0000-000000000004', '2026-04-16', 'When the machine is not connected to WiFi the logs save to the usb/SOM, when the machine connects to wifi we need to verify that all the logs in the usb/SOM uploaded to BIOT', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 4, 'matan-logs-wifi-2026-04-16'),
  ('Machine cartridge DB issue', 'not_started', 1, '00000000-0000-0000-0000-000000000004', '2026-04-16', 'Machine puts 0 on a new cartridge that is not in the machine DB (tandem said complete) - check if fixed - Yifat', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 4, 'matan-cartridge-db-2026-04-16'),
  ('Next SW release (after 10.24)', 'not_started', 1, '00000000-0000-0000-0000-000000000004', '2026-04-30', 'Check after IMG release', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 4, 'matan-next-sw-release-2026-04-30'),
  ('Logs issue - partial log from BIOT', 'not_started', 1, '00000000-0000-0000-0000-000000000004', '2026-04-23', 'The issue - After a long time that the machine worked and wasn''t connected to wifi, when you ask from BIOT logs you get only part of the log. Need to understand the root cause and define how to solve it', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 4, 'matan-partial-log-2026-04-23'),
  ('Debug session issue', 'not_started', 1, '00000000-0000-0000-0000-000000000004', NULL, 'BIOT report error but the link worked through BIOT', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 4, 'matan-debug-session-null'),
  ('QA Update test', 'not_started', 2, '00000000-0000-0000-0000-000000000004', '2026-04-23', 'Make sure it looks the same as we defined in the ''sw update protocol'' doc', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 4, 'matan-qa-update-test-2026-04-23'),
  ('Disposable count', 'not_started', 2, '00000000-0000-0000-0000-000000000004', '2026-04-30', 'Check when it counts the disposable (when the SW decreases glove amount in cartridge)', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 5, 'matan-disposable-count-2026-04-30'),
  ('Export local logs', 'not_started', 2, '00000000-0000-0000-0000-000000000004', '2026-04-30', 'We want to have the option to get all the logs on the SOM (local from BIOT), maybe with range (Drill down with tandem)', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 5, 'matan-export-local-logs-2026-04-30'),
  ('Issue 364 FW solution', 'not_started', 2, '00000000-0000-0000-0000-000000000004', '2026-04-30', 'Need to think how to implement the change', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 5, 'matan-issue-364-2026-04-30'),
  ('Cable disconnect test', 'not_started', 2, '00000000-0000-0000-0000-000000000004', '2026-04-30', 'When a new IMG release - do this test', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 5, 'matan-cable-disconnect-2026-04-30'),
  ('MAT - automatic diagnostic', 'not_started', 3, '00000000-0000-0000-0000-000000000004', NULL, 'Think on automatic diagnostic and app connectivity', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 5, 'matan-mat-diagnostic-null'),
  ('Next SW release - German language', 'not_started', 3, '00000000-0000-0000-0000-000000000004', NULL, 'Add to the close SW release the German language', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 5, 'matan-german-language-null')
ON CONFLICT (import_hash) DO NOTHING;

-- TAMIR's Tasks (page 5)
INSERT INTO tasks (title, status, priority, responsible_person_id, due_date, notes, source_file, source_page, import_hash) VALUES
  ('1.2 version plan', 'in_progress', 1, '00000000-0000-0000-0000-000000000005', '2026-04-28', 'Need to update Gantt and RND task plan', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 5, 'tamir-version-plan-2026-04-28'),
  ('Shortages list from Sanmina 16 Machines', 'in_progress', 1, '00000000-0000-0000-0000-000000000005', '2026-04-23', 'To close all shortages', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 5, 'tamir-shortages-list-2026-04-23'),
  ('Share test protocol and jig for 1.15 assembly with Karrie', 'not_started', 1, '00000000-0000-0000-0000-000000000005', '2026-04-16', 'Share with Karrie all tester protocol & testers', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 5, 'tamir-share-protocol-2026-04-16'),
  ('Open issue list Sanmina', 'in_progress', 1, '00000000-0000-0000-0000-000000000005', '2026-04-16', 'Waiting for Sanmina feedback', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 5, 'tamir-open-issue-sanmina-2026-04-16'),
  ('CDR preparation', 'not_started', 1, '00000000-0000-0000-0000-000000000005', '2026-04-23', '', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 5, 'tamir-cdr-preparation-2026-04-23'),
  ('SOW plan B with Amit', 'not_started', 1, '00000000-0000-0000-0000-000000000005', '2026-04-16', '', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 5, 'tamir-sow-plan-b-2026-04-16'),
  ('IPC 610/620', 'not_started', 1, '00000000-0000-0000-0000-000000000005', NULL, '', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 5, 'tamir-ipc-null'),
  ('Hermon lab - TUV Status', 'in_progress', 2, '00000000-0000-0000-0000-000000000005', '2026-04-28', 'TUV - need to schedule audit at Sanmina', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 5, 'tamir-hermon-tuv-2026-04-28'),
  ('Update TUV certification', 'not_started', 2, '00000000-0000-0000-0000-000000000005', '2026-04-28', 'Block By TUV approve certification. Need to update TUV certification for new actuators', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 5, 'tamir-update-tuv-2026-04-28'),
  ('Karrie mold status', 'not_started', 2, '00000000-0000-0000-0000-000000000005', '2026-04-16', 'Status', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 5, 'tamir-karrie-mold-2026-04-16'),
  ('Prepare list for Karrie visit', 'not_started', 2, '00000000-0000-0000-0000-000000000005', '2026-04-23', '', 'New Engineering Tasks - 4.26 - Google Sheets.pdf', 5, 'tamir-karrie-visit-list-2026-04-23')
ON CONFLICT (import_hash) DO NOTHING;
