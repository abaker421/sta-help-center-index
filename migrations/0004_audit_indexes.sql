-- migrations/0004_audit_indexes.sql
-- B2 (optional, additive, safe): indexes supporting audit-trail queries.
-- `idx_audit_entity` on audit(entity_type, entity_id) already shipped in
-- 0002_indexes.sql; this adds the time-ordered index for "recent changes" /
-- "what changed since T" reads. IF NOT EXISTS keeps it idempotent if 0002 grows.

CREATE INDEX IF NOT EXISTS idx_audit_entity  ON audit(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit(created_at);
