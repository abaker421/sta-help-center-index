-- DRAFT - migrations/0017_briefing_refs_repoint.sql
-- Repoints briefing_project_refs off the Phase-A projects table and onto the
-- redesigned tracker, so the Phase-A tables can be dropped in 0018.
--
-- Adam's call 2026-08-12: repoint (not drop the feature).
--
-- WHY tr_sections AND NOT tr_items:
-- The eight Phase-A projects rows are product lines and workstreams -
-- 'SchoolTRAK', 'VirtuaTime', 'Skyward Partnership & Lead Gen' - not work items.
-- The same grain in the new model is a SECTION, not an item. Pointing a personal
-- project note at an individual item would silently change what the My Day tab's
-- project refs mean. Section is the faithful target: clicking a product line IS
-- the "where are we" view (2026-07-23 decision).
--
-- SQLite cannot ALTER a foreign key, so this is the standard table rebuild:
-- create, copy, drop, rename, re-index. Run it in a single transaction.
--
-- SAFE TO RUN BEFORE THE FRONT-END CUTOVER. 0018 (the drop) is not.

PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

CREATE TABLE briefing_project_refs_new (
  id                INTEGER PRIMARY KEY,
  owner_email       TEXT NOT NULL,
  section_id        INTEGER REFERENCES tr_sections(id),   -- nullable FK -> redesigned sections
  personal_note     TEXT,
  personal_timeline TEXT,
  sort              INTEGER NOT NULL DEFAULT 0,
  version           INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by        TEXT NOT NULL DEFAULT 'system',
  deleted_at        TEXT
);

-- Mapping, by the Phase-A project name (all eight seeded rows are covered):
--   SchoolTRAK                        -> schooltrak
--   TimeClock App / Gone for the Day  -> timeclocks
--   CMI TT3 hardware                  -> timeclocks
--   VirtuaTime                        -> virtuatime
--   ID Badging (STA)                  -> idbadging
--   ID Product (Brian's)              -> standalone   (Brian Bangtson's Vidix Control lives there)
--   Skyward Partnership & Lead Gen    -> ops
--   Podcast (Behind the Bell)         -> ops
-- Anything unmapped keeps its old project name inside personal_note rather than
-- being dropped - the same no-silent-loss pattern 0005_briefing_init already used
-- for refs with no shared match.
WITH mapped AS (
  SELECT
    r.id, r.owner_email, r.personal_note, r.personal_timeline, r.sort, r.version,
    r.created_at, r.updated_at, r.updated_by, r.deleted_at,
    p.name AS old_name,
    CASE p.name
      WHEN 'SchoolTRAK'                       THEN 'schooltrak'
      WHEN 'TimeClock App / Gone for the Day' THEN 'timeclocks'
      WHEN 'CMI TT3 hardware'                 THEN 'timeclocks'
      WHEN 'VirtuaTime'                       THEN 'virtuatime'
      WHEN 'ID Badging (STA)'                 THEN 'idbadging'
      WHEN 'ID Product (Brian''s)'            THEN 'standalone'
      WHEN 'Skyward Partnership & Lead Gen'   THEN 'ops'
      WHEN 'Podcast (Behind the Bell)'        THEN 'ops'
    END AS sec_key
  FROM briefing_project_refs r
  LEFT JOIN projects p ON p.id = r.project_id
)
INSERT INTO briefing_project_refs_new
  (id, owner_email, section_id, personal_note, personal_timeline, sort, version,
   created_at, updated_at, updated_by, deleted_at)
SELECT
  m.id,
  m.owner_email,
  (SELECT s.id FROM tr_sections s WHERE s.key = m.sec_key),
  CASE
    WHEN m.old_name IS NOT NULL AND m.sec_key IS NULL
      THEN COALESCE(m.personal_note || ' ', '') || '[was: ' || m.old_name || ']'
    ELSE m.personal_note
  END,
  m.personal_timeline, m.sort, m.version,
  m.created_at, m.updated_at, m.updated_by, m.deleted_at
FROM mapped m;

DROP TABLE briefing_project_refs;
ALTER TABLE briefing_project_refs_new RENAME TO briefing_project_refs;

-- Recreate the index dropped with the old table (was idx_briefing_refs_owner in
-- 0006_briefing_indexes.sql; same definition).
CREATE INDEX idx_briefing_refs_owner
  ON briefing_project_refs(owner_email, sort) WHERE deleted_at IS NULL;

-- New: the section join the My Day tab does on every render.
CREATE INDEX idx_briefing_refs_section
  ON briefing_project_refs(section_id) WHERE deleted_at IS NULL;

COMMIT;

PRAGMA foreign_keys = ON;

-- Front-end note: /api/briefing/me must select section_id (and join tr_sections
-- for the name) instead of project_id. Ship that API change in the same PR as
-- this migration, or the My Day tab's project refs render empty.
