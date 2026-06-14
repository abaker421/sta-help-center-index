-- migrations/0005_briefing_init.sql
-- Phase PB1 schema: per-user briefing state on the existing sta-tracker D1.
-- READ PATH ONLY in PB1; version / updated_at / updated_by / deleted_at / done all
-- ship now so PB2 adds the write path with no schema churn.
--
-- Per-user scoping (PB1 Key design decision 1): owner_email is the scoping key on
-- every briefing table. Every read and write filters on it server-side, derived
-- from the validated Access JWT - never client-supplied.
--
-- Compose, don't duplicate (Key design decision 2): briefing_project_refs holds
-- ONLY the user's personal annotations + a nullable FK to the shared projects row.
-- The shared project state is JOINed in at read time, never copied per user.
--
-- Conventions (per KB module-01, matching 0001_init.sql):
--   - integer surrogate keys
--   - all timestamps stored as ISO-8601 UTC TEXT
--   - version / updated_at / updated_by on every mutable row
--   - soft delete via deleted_at (NULL = live)

PRAGMA foreign_keys = ON;

-- One row per user: the day's top-level briefing state. owner_email is the PK
-- (a user has exactly one current briefing). calibration_snapshot / needs_attention
-- / todays_meetings are stored as TEXT (JSON) snapshots the tab renders; the PB3
-- daily task refreshes todays_meetings.
CREATE TABLE briefing_state (
  owner_email          TEXT PRIMARY KEY,
  generated_at         TEXT,                                 -- ISO-8601 UTC; when this briefing was produced
  calibration_snapshot TEXT,                                 -- JSON: trend + snapshot rows
  needs_attention      TEXT,                                 -- JSON: array of stale-item lines
  todays_meetings      TEXT,                                 -- JSON: array snapshot (PB3 daily task refreshes)
  version              INTEGER NOT NULL DEFAULT 1,           -- optimistic concurrency (PB2)
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by           TEXT NOT NULL DEFAULT 'system'
);

-- The briefing's section items. section buckets each row into the briefing layout.
-- done / done_at carry completion (PB2 write path; rendered struck-through read-only
-- in PB1). Soft-deletable so PB2 reclassify/remove never hard-deletes.
CREATE TABLE briefing_items (
  id            INTEGER PRIMARY KEY,
  owner_email   TEXT NOT NULL,
  section       TEXT NOT NULL CHECK (section IN
                  ('carryover','pending','waiting_on','customer_situation','completed')),
  text          TEXT NOT NULL,
  meta          TEXT NOT NULL DEFAULT '',                    -- who / when / context annotation
  done          INTEGER NOT NULL DEFAULT 0,                  -- 0 = open, 1 = done
  done_at       TEXT,                                        -- ISO date stamp when completed
  source        TEXT,                                        -- provenance (agenda-state section / meeting)
  sort          INTEGER NOT NULL DEFAULT 0,                  -- render order within the section
  version       INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by    TEXT NOT NULL DEFAULT 'system',
  deleted_at    TEXT                                         -- soft delete; NULL = live
);

-- The user's personal annotations layered on a SHARED project (Key design decision 2).
-- project_id is a NULLABLE FK to the shared projects table: a ref with a match
-- composes the live shared project at read time; a ref with no shared match keeps
-- the project name in personal_note (the seed flags these - it never invents a
-- shared projects row). No ON DELETE CASCADE: projects soft-delete via deleted_at,
-- so a ref is never orphaned by a hard delete.
CREATE TABLE briefing_project_refs (
  id                INTEGER PRIMARY KEY,
  owner_email       TEXT NOT NULL,
  project_id        INTEGER REFERENCES projects(id),         -- nullable FK -> shared projects
  personal_note     TEXT,                                    -- the user's private note on this project
  personal_timeline TEXT,                                    -- JSON: the user's personal mini-timeline
  sort              INTEGER NOT NULL DEFAULT 0,              -- render order
  version           INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by        TEXT NOT NULL DEFAULT 'system',
  deleted_at        TEXT
);
