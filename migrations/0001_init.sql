-- migrations/0001_init.sql
-- Phase B1 schema for the STA Project Tracker, reconciled to the live
-- data/project-data.json shape the Projects tab already renders.
-- Read path only in B1; version / updated_at / updated_by / audit ship now so
-- B2 can add writes with no schema churn.
--
-- Conventions (per KB module-01):
--   - integer surrogate keys
--   - all timestamps stored as ISO-8601 UTC TEXT
--   - version / updated_at / updated_by on every mutable row
--   - soft delete via deleted_at (NULL = live)

PRAGMA foreign_keys = ON;

CREATE TABLE projects (
  id            INTEGER PRIMARY KEY,
  "group"       TEXT NOT NULL CHECK ("group" IN ('dev','ops')),  -- dev | ops
  name          TEXT NOT NULL,
  status        TEXT NOT NULL,
  status_class  TEXT NOT NULL DEFAULT 'info',          -- info | warn | ok
  stage         TEXT,                                  -- NULL for ops projects
  stage_class   TEXT,                                  -- dev | post | none | NULL
  statusline    TEXT,
  what_it_is    TEXT,                                  -- "What it is" detail (dev)
  next_step     TEXT,                                  -- optional "Next" line (rendered by the tab)
  sort          INTEGER NOT NULL DEFAULT 0,            -- render order within the group
  version       INTEGER NOT NULL DEFAULT 1,            -- optimistic concurrency (B2)
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by    TEXT NOT NULL DEFAULT 'system',
  deleted_at    TEXT                                   -- soft delete; NULL = live
);

CREATE TABLE open_items (
  id            INTEGER PRIMARY KEY,
  project_id    INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  text          TEXT NOT NULL,
  stage         TEXT,                                  -- per-item stage tag (dev); NULL for ops
  stage_class   TEXT,                                  -- dev | post | none | NULL
  meta          TEXT NOT NULL DEFAULT '',              -- "who / when" annotation
  done          INTEGER NOT NULL DEFAULT 0,            -- 0 = open, 1 = done (B2)
  sort          INTEGER NOT NULL DEFAULT 0,            -- render order within the project
  version       INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by    TEXT NOT NULL DEFAULT 'system',
  deleted_at    TEXT
);

-- Append-only event tables: no version (nobody edits a historical event).
CREATE TABLE stage_history (
  id            INTEGER PRIMARY KEY,
  project_id    INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  when_label    TEXT NOT NULL,                         -- free-text "when" (e.g. "Dev - 2025 -> now")
  note          TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by    TEXT NOT NULL DEFAULT 'system'
);

CREATE TABLE timeline (
  id            INTEGER PRIMARY KEY,
  project_id    INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  when_label    TEXT NOT NULL,                         -- free-text "when" (e.g. "6/4")
  note          TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by    TEXT NOT NULL DEFAULT 'system'
);

-- Attribution + human-edit-protection trail. Append-only. Populated by every
-- write path starting in B2; created now so no migration is needed then.
CREATE TABLE audit (
  id            INTEGER PRIMARY KEY,
  entity_type   TEXT NOT NULL,                         -- project | open_item | stage_history | timeline
  entity_id     INTEGER NOT NULL,
  action        TEXT NOT NULL,                         -- create | update | delete
  actor_email   TEXT NOT NULL,
  actor_kind    TEXT NOT NULL,                         -- human | agent
  agent_name    TEXT,                                  -- NULL when actor_kind = human
  before_json   TEXT,
  after_json    TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
