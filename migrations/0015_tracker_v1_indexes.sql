-- DRAFT - migrations/0015_tracker_v1_indexes.sql
-- Indexes for the Projects tab v1 read patterns. Same reasoning as
-- 0002_indexes.sql: at ~30 rows this is query economy, not correctness, but it
-- ships with the schema so growth stays cheap and no later migration is needed.
--
-- Every partial index excludes soft-deleted rows, because every hot read does.

-- The board render: live items by section, in sort order.
CREATE INDEX idx_tr_items_section   ON tr_items(section_id, sort)   WHERE deleted_at IS NULL;

-- The active-only filter (status not in done/canc) and the View-all grouping.
CREATE INDEX idx_tr_items_status    ON tr_items(status)             WHERE deleted_at IS NULL;

-- Assignee filter chips and the per-person lens (finding 8).
CREATE INDEX idx_tr_items_assignee  ON tr_items(assignee_id)        WHERE deleted_at IS NULL;

-- The two dashboard flag lists, each aged from its own since date (D1 + D4).
CREATE INDEX idx_tr_items_waiting   ON tr_items(waiting_since)      WHERE waiting_who IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_tr_items_blocked   ON tr_items(blocked_since)      WHERE blocked_on  IS NOT NULL AND deleted_at IS NULL;

-- The Due-soon list (D3).
CREATE INDEX idx_tr_items_target    ON tr_items(target_date)        WHERE target_date IS NOT NULL AND deleted_at IS NULL;

-- Feature-request states: On-Hold and Archived come off the active board (D5).
CREATE INDEX idx_tr_items_reqstate  ON tr_items(req_state)          WHERE req_state IS NOT NULL AND deleted_at IS NULL;

-- Join lookups.
CREATE INDEX idx_tr_item_products_section ON tr_item_products(section_id);
CREATE INDEX idx_tr_item_vendors_vendor   ON tr_item_vendors(vendor_id);
CREATE INDEX idx_tr_subitems_item         ON tr_subitems(item_id, sort) WHERE deleted_at IS NULL;
CREATE INDEX idx_tr_history_item          ON tr_history(item_id, sort);

-- Dependency traversal. The forward direction is covered by the composite PK
-- (item_id, depends_on_id); this index serves the DERIVED "Required by" reverse
-- lookup the detail panel renders.
CREATE INDEX idx_tr_deps_reverse    ON tr_dependencies(depends_on_id);
