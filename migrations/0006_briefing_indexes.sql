-- migrations/0006_briefing_indexes.sql
-- Indexes for the per-user briefing read path (KB module-01). owner_email is the
-- hot filter on every briefing query (GET /api/briefing/me derives it from the
-- JWT). Partial WHERE deleted_at IS NULL keeps the common live-row query from
-- scanning soft-deleted rows. briefing_state needs no index - owner_email is its PK.

CREATE INDEX idx_briefing_items_owner
  ON briefing_items(owner_email, section, sort) WHERE deleted_at IS NULL;

CREATE INDEX idx_briefing_refs_owner
  ON briefing_project_refs(owner_email, sort) WHERE deleted_at IS NULL;
