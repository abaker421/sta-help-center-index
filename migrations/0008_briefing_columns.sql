-- migrations/0008_briefing_columns.sql
-- Phase PB2a: additive, nullable columns on briefing_items so each section can render
-- as REAL source columns (a table), not one collapsed `text` blob + freeform `meta`.
--
-- ADDITIVE ONLY - no data loss. Existing PB1 rows keep working: the new columns are
-- NULL until the PB2a reseed (0009) repopulates them from the agenda-state.md columns.
-- `text` stays the primary item label; `meta` is retained for back-compat. Still
-- READ-ONLY this phase (PB2b adds the write path).
--
-- Column meaning (per pb2a-build-prompt.md mapping):
--   item_date     ISO date or short date the row is anchored to (flagged / sent / due / completed)
--   project       display label parsed from the item (NOT a FK; deep-link is a later backlog item)
--   owner         the person column (Owner / Sent to / Requested by), per section
--   status_label  human status text (e.g. "At risk", "Watch") - paired with status_class, never color-alone
--   status_class  machine status bucket for the pill style ("risk" | "watch" | "ok")
--   context       the long "why" (situation / reason carried / waiting context / notes) - tucked behind details/summary

ALTER TABLE briefing_items ADD COLUMN item_date    TEXT;
ALTER TABLE briefing_items ADD COLUMN project      TEXT;
ALTER TABLE briefing_items ADD COLUMN owner        TEXT;
ALTER TABLE briefing_items ADD COLUMN status_label TEXT;
ALTER TABLE briefing_items ADD COLUMN status_class TEXT;
ALTER TABLE briefing_items ADD COLUMN context      TEXT;
