-- migrations/0017_briefing_refs_repoint.sql
-- EXPAND phase. Adds briefing_project_refs.section_id alongside the existing
-- project_id and backfills it, so the refs can point at the redesigned tracker
-- (tr_sections) while the Phase-A projects table is still there.
--
-- Adam's call 2026-08-12: repoint (not drop the feature).
--
-- ADDITIVE ONLY. Nothing is dropped, nothing is rebuilt, nothing is recreated - the
-- existing table is altered in place. project_id is KEPT deliberately - it is both
-- the rollback path and the reason the currently deployed API keeps working while
-- this is applied. Dropping
-- it is the CONTRACT phase: a separate migration, in a separate PR, authorized
-- separately, and only AFTER the section-aware API is live and verified.
--
-- SAFE TO RUN BEFORE THE FRONT-END CUTOVER, and here is why: the migration only
-- adds a nullable column and fills it, so the deployed API - which still reads
-- project_id - is unaffected and keeps returning the same rows. The new API reads
-- section_id and falls back to project_id, so it is correct against both shapes.
-- Migration and deploy can therefore ship in either order, with no coordination
-- window and no outage. (The previous version of this file rebuilt the table and
-- dropped project_id, which made that claim false; it was rewritten 2026-09-10.)
--
-- WHY tr_sections AND NOT tr_items:
-- The eight Phase-A projects rows are product lines and workstreams -
-- 'SchoolTRAK', 'VirtuaTime', 'Skyward Partnership & Lead Gen' - not work items.
-- The same grain in the new model is a SECTION, not an item. Pointing a personal
-- project note at an individual item would silently change what the My Day tab's
-- project refs mean. Section is the faithful target: clicking a product line IS
-- the "where are we" view (2026-07-23 decision).
--
-- OPERATOR CHECK - the backfill must not change the row count. Run before and
-- after and compare; they must be equal:
--   SELECT COUNT(*) FROM briefing_project_refs;
-- The mapping is many-to-one (two projects -> timeclocks, two -> ops). That is
-- fine for a lookup because this is an UPDATE of existing rows, not a join that
-- can fan out - no row is inserted or removed by anything below.

-- 1. ADD the column. Nullable, no default, so SQLite accepts the REFERENCES
--    clause on ALTER TABLE ADD COLUMN.
ALTER TABLE briefing_project_refs
  ADD COLUMN section_id INTEGER REFERENCES tr_sections(id);

-- 2. BACKFILL from project_id through the Phase-A project name.
--    Mapping, by name (all eight seeded rows are covered):
--      SchoolTRAK                        -> schooltrak
--      TimeClock App / Gone for the Day  -> timeclocks
--      CMI TT3 hardware                  -> timeclocks
--      VirtuaTime                        -> virtuatime
--      ID Badging (STA)                  -> idbadging
--      ID Product (Brian's)              -> standalone   (Brian Bangtson's Vidix Control lives there)
--      Skyward Partnership & Lead Gen    -> ops
--      Podcast (Behind the Bell)         -> ops
UPDATE briefing_project_refs
   SET section_id = (
     SELECT s.id
       FROM tr_sections s
      WHERE s.deleted_at IS NULL
        AND s.key = CASE (SELECT p.name FROM projects p WHERE p.id = briefing_project_refs.project_id)
              WHEN 'SchoolTRAK'                       THEN 'schooltrak'
              WHEN 'TimeClock App / Gone for the Day' THEN 'timeclocks'
              WHEN 'CMI TT3 hardware'                 THEN 'timeclocks'
              WHEN 'VirtuaTime'                       THEN 'virtuatime'
              WHEN 'ID Badging (STA)'                 THEN 'idbadging'
              WHEN 'ID Product (Brian''s)'            THEN 'standalone'
              WHEN 'Skyward Partnership & Lead Gen'   THEN 'ops'
              WHEN 'Podcast (Behind the Bell)'        THEN 'ops'
            END
   )
 WHERE project_id IS NOT NULL;

-- 3. NO SILENT LOSS. Park the old project name in personal_note for any ref whose
--    section_id did not RESOLVE.
--
--    CodeRabbit finding 2, fixed on its merits (2026-09-10): the previous version
--    fired this when the mapping KEY was null, which is the wrong test. A
--    recognized key can still resolve to no tr_sections row - the section may be
--    absent, renamed or soft-deleted - and that case wrote a NULL section_id while
--    skipping the fallback, losing old_name silently. The correct condition is the
--    RESOLVED value: section_id IS NULL. All six keys being seeded by 0016 today is
--    a coincidence that holds this week, not a guarantee.
UPDATE briefing_project_refs
   SET personal_note = COALESCE(personal_note || ' ', '')
                       || '[was: '
                       || (SELECT p.name FROM projects p WHERE p.id = briefing_project_refs.project_id)
                       || ']'
 WHERE section_id IS NULL
   AND project_id IS NOT NULL
   AND (SELECT p.name FROM projects p WHERE p.id = briefing_project_refs.project_id) IS NOT NULL;

-- 4. INDEXES. idx_briefing_refs_owner already exists from
--    0006_briefing_indexes.sql and survives, because this migration does not drop
--    the table - IF NOT EXISTS makes that explicit rather than incidental.
CREATE INDEX IF NOT EXISTS idx_briefing_refs_owner
  ON briefing_project_refs(owner_email, sort) WHERE deleted_at IS NULL;

-- New: the section join the My Day tab does on every render.
CREATE INDEX IF NOT EXISTS idx_briefing_refs_section
  ON briefing_project_refs(section_id) WHERE deleted_at IS NULL;

-- Front-end note: /api/briefing/me reads section_id and FALLS BACK to project_id
-- when section_id is NULL, so it is correct against both schema shapes and the two
-- can ship in either order. Do not remove that fallback until the CONTRACT
-- migration has dropped project_id.
