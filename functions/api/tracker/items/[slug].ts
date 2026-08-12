// functions/api/tracker/items/[slug].ts
// GET /api/tracker/items/:slug - one item's full detail for the slide-over panel
// (Phase PT1 READ PATH ONLY). NO write handlers here - editing an item, its flags,
// its sub-items (toggle / promote) and its dependencies are all PT2.
//
// Returns the item, its live sub-items, dependencies in BOTH directions (depends-on
// is stored; "required by" is the DERIVED reverse of tr_dependencies - never stored,
// Key design decision 4), and its append-only history. id + version ride on every
// mutable row so PT2 adds writes with no payload change.
//
// Gated by functions/api/_middleware.ts (reads included).

import { json, error } from "../../../_lib/http.js";
import { assembleItem } from "../../../_lib/tracker.js";

export const onRequestGet: PagesFunction = async ({ params, env, data }) => {
  const owner = (data as any)?.user?.email;
  if (!owner) return error("forbidden", 403);

  const slug = String(params.slug || "");
  if (!slug) return error("slug required", 400);

  try {
    // Resolve the item first (also gives its home-section key and assignee). A
    // soft-deleted or unknown slug is a 404, never a leaked empty object.
    const item = await env.DB.prepare(
      `SELECT i.id, i.slug, i.section_id, i.module, i.type, i.title,
              i.status, i.status_changed_at, i.req_state, i.assignee_id,
              i.target_date, i.waiting_who, i.waiting_since, i.waiting_note,
              i.blocked_on, i.blocked_since, i.stage, i.department,
              i.sort, i.version, i.updated_at, i.updated_by,
              p.key AS asg_key, p.name AS asg_name,
              s.key AS section_key
         FROM tr_items i
         LEFT JOIN tr_people p ON p.id = i.assignee_id
         JOIN tr_sections s ON s.id = i.section_id
        WHERE i.slug = ? AND i.deleted_at IS NULL`
    ).bind(slug).first();

    if (!item) return error("not found", 404);
    const id = (item as any).id;

    const [subitems, dependsOn, requiredBy, history, vendors, affects] =
      await env.DB.batch([
        env.DB.prepare(
          `SELECT id, version, text, done, done_at, sort
             FROM tr_subitems
            WHERE item_id = ? AND deleted_at IS NULL
            ORDER BY sort, id`
        ).bind(id),
        // depends-on (stored direction): what THIS item waits on.
        env.DB.prepare(
          `SELECT d.qualifier, t.slug, t.title
             FROM tr_dependencies d
             JOIN tr_items t ON t.id = d.depends_on_id
            WHERE d.item_id = ? AND t.deleted_at IS NULL
            ORDER BY t.sort, t.id`
        ).bind(id),
        // required-by (DERIVED reverse): what depends on THIS item.
        env.DB.prepare(
          `SELECT d.qualifier, t.slug, t.title
             FROM tr_dependencies d
             JOIN tr_items t ON t.id = d.item_id
            WHERE d.depends_on_id = ? AND t.deleted_at IS NULL
            ORDER BY t.sort, t.id`
        ).bind(id),
        env.DB.prepare(
          `SELECT when_label, occurred_on, note, sort
             FROM tr_history
            WHERE item_id = ?
            ORDER BY sort, id`
        ).bind(id),
        env.DB.prepare(
          `SELECT v.name
             FROM tr_item_vendors iv
             JOIN tr_vendors v ON v.id = iv.vendor_id
            WHERE iv.item_id = ? AND v.deleted_at IS NULL
            ORDER BY v.sort, v.name`
        ).bind(id),
        env.DB.prepare(
          `SELECT s.key
             FROM tr_item_products ip
             JOIN tr_sections s ON s.id = ip.section_id
            WHERE ip.item_id = ?
            ORDER BY s.sort`
        ).bind(id),
      ]);

    const payload = assembleItem({
      item,
      sectionKey: (item as any).section_key,
      vendors: vendors.results,
      affects: affects.results,
      subitems: subitems.results,
      dependsOn: dependsOn.results,
      requiredBy: requiredBy.results,
      history: history.results,
    });

    return json(payload);
  } catch (e) {
    console.error("GET /api/tracker/items/:slug failed:", e);
    return error("failed to load item", 500);
  }
};
