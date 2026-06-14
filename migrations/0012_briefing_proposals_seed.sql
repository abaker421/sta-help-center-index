-- migrations/0012_briefing_proposals_seed.sql
-- Sample PENDING proposals so the "Pending Your Review" queue is exercisable before
-- PB3's agent generates real ones. Adapted from agenda-state.md (Waiting On / Customer
-- Situations / Pending). Idempotent + owner-scoped: deletes this owner's proposals,
-- then re-inserts. updated_by/created_by = 'seed' marks the import.
--
-- These mirror briefing_items content columns so Approve maps 1:1 into target_section.

DELETE FROM briefing_proposals WHERE owner_email = 'adamb@k12sta.com';

INSERT INTO briefing_proposals
  (id, owner_email, target_section, proposed_text, item_date, project, owner_field,
   status_label, status_class, context, source, status, created_by, updated_by) VALUES
  (1, 'adamb@k12sta.com', 'waiting_on',
   'Log "comp-time on clocks" as a feature request', '2026-06-11', 'TimeClock', 'Chris -> CMI',
   NULL, NULL,
   'South San Antonio + 1 other asked about comp-time support on clocks; likely not a current feature - log as a feature request in Trello pending Cody confirmation.',
   '6/11 Weekly Huddle', 'pending', 'seed', 'seed'),
  (2, 'adamb@k12sta.com', 'customer_situation',
   'Canyons RFP (products already purchased)', NULL, NULL, 'Pat',
   'Watch', 'watch',
   'RFP received for products Canyons already bought; Pat to contact Eric Taylor to understand it.',
   '6/10 Daily Connect', 'pending', 'seed', 'seed'),
  (3, 'adamb@k12sta.com', 'pending',
   'Send Wilson County session recording to Bennett', '2026-06-11', 'ID', 'Wilson County ID',
   NULL, NULL,
   'So Bennett can finish the last ID machine independently (pairs with the Waiting-On final-machine item).',
   '6/11 Wilson County ID Support', 'pending', 'seed', 'seed'),
  (4, 'adamb@k12sta.com', 'waiting_on',
   'Sandbox test data cleanup / replacement (blocks clean clock testing)', '2026-06-11', 'TimeClock', 'Cody (Skyward)',
   NULL, NULL,
   'Corrupted sandbox data to be replaced with a fresh internal dataset; blocks clean clock testing.',
   '6/11 TimeClock App Status check', 'pending', 'seed', 'seed');
