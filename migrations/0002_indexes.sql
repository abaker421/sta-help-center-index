-- migrations/0002_indexes.sql
-- Indexes matching the read query patterns (KB module-01). At a few hundred rows
-- these are about query economy (fewer rows scanned -> lower cost/latency) more
-- than correctness, but they ship now so growth stays cheap.

-- Foreign-key lookups: fetch a project's children without a table scan.
CREATE INDEX idx_open_items_project    ON open_items(project_id);
CREATE INDEX idx_stage_history_project ON stage_history(project_id);
CREATE INDEX idx_timeline_project      ON timeline(project_id);

-- The hot read ("live projects by group, in sort order"). Partial index ignores
-- soft-deleted rows so the common query never scans them.
CREATE INDEX idx_projects_group        ON projects("group", sort) WHERE deleted_at IS NULL;

-- Audit lookups by entity (B2 read of an entity's change history).
CREATE INDEX idx_audit_entity          ON audit(entity_type, entity_id);
