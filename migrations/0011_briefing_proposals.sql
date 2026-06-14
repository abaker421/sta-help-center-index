-- migrations/0011_briefing_proposals.sql
-- Phase PB2c: the "Pending Your Review" proposal queue store.
--
-- A briefing_proposal is an agent-PROPOSED addition to a user's briefing, awaiting
-- that user's decision. Approve -> the proposal's content becomes a real
-- briefing_items row in target_section (attributed, audited); proposal -> 'approved'.
-- Deny -> proposal -> 'denied' with a REQUIRED deny_reason (the signal the PB3/Phase C
-- learning loop will later consume; PB2c only CAPTURES it).
--
-- Owner-scoped exactly like briefing_items (Key design decision 1): owner_email is the
-- scoping key; every read/write filters on it server-side from the validated JWT.
-- The content columns MIRROR briefing_items so an approved proposal maps 1:1 into a new
-- item (owner_field -> briefing_items.owner; proposed_text -> text).
--
-- Conventions (KB module-01 / module-04): integer PK; ISO-8601 UTC TEXT timestamps;
-- version + updated_at + updated_by on the mutable row (so the shipped compareAndSet
-- write contract applies unchanged); decided_by/decided_at record WHO decided + WHEN;
-- soft delete via deleted_at.

CREATE TABLE briefing_proposals (
  id             INTEGER PRIMARY KEY,
  owner_email    TEXT NOT NULL,
  target_section TEXT NOT NULL CHECK (target_section IN
                   ('carryover','pending','waiting_on','customer_situation')),
  proposed_text  TEXT NOT NULL,                              -- -> briefing_items.text
  item_date      TEXT,                                       -- mirrors briefing_items columns
  project        TEXT,
  owner_field    TEXT,                                       -- -> briefing_items.owner
  status_label   TEXT,
  status_class   TEXT,
  context        TEXT,
  source         TEXT,                                       -- provenance (meeting / detection)
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
  deny_reason    TEXT,                                        -- REQUIRED on deny (enforced in the handler)
  approve_note   TEXT,                                        -- optional note on approve
  decided_by     TEXT,                                        -- email of the decider (from JWT)
  decided_at     TEXT,                                        -- ISO-8601 UTC when decided
  version        INTEGER NOT NULL DEFAULT 1,                  -- optimistic concurrency (expected_version)
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by     TEXT NOT NULL DEFAULT 'system',
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by     TEXT NOT NULL DEFAULT 'system',
  deleted_at     TEXT                                         -- soft delete; NULL = live
);

-- The queue read is always WHERE owner_email = ? AND status = 'pending'.
CREATE INDEX idx_briefing_proposals_owner_status ON briefing_proposals(owner_email, status);
