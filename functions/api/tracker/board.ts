// functions/api/tracker/board.ts
// GET /api/tracker/board - everything the redesigned Projects tab needs in one
// payload (Phase PT1 READ PATH ONLY). NO write handlers here - item CRUD, the two
// flags, sub-items, promote and dependency editing are all PT2.
//
//   - Default: the ACTIVE board (status NOT IN done/canc AND req lifecycle is
//     null-or-'requested'). ?include=all also returns done, canceled, on-hold and
//     archived so the section "View all" pages can group them by status.
//   - Every rollup is derived server-side (Key design decision 4): the who-owes-a-
//     move list (both flag types, each aged from its own since), the open-bug /
//     blocked / waiting / dated counts, the due-soon list, section totals and
//     sub-item counts. Nothing derivable is stored twice.
//   - Every mutable row carries id + version so PT2 adds writes with no payload
//     change.
//
// Gated by functions/api/_middleware.ts, so context.data.user is already set from
// the validated Access JWT by the time this runs (reads included).

import { json, error } from "../../_lib/http.js";
import { assembleBoard } from "../../_lib/tracker.js";

export const onRequestGet: PagesFunction = async ({ request, env, data }) => {
  const owner = (data as any)?.user?.email;
  if (!owner) return error("forbidden", 403);

  const includeAll = new URL(request.url).searchParams.get("include") === "all";

  try {
    // One round trip: sections + all live items (+ assignee) + the join tables that
    // feed tags, counts and dependency markers, plus the people / vendor picklists
    // that drive the filter chips. Assembly (active-filtering, dashboard, ordering)
    // happens in the pure _lib/tracker.js so it is unit-testable without workerd.
    const [sections, items, products, vendors, subcounts, deps, people, vendorList] =
      await env.DB.batch([
        env.DB.prepare(
          `SELECT id, key, name, kind, blurb, sort, version
             FROM tr_sections
            WHERE deleted_at IS NULL
            ORDER BY sort`
        ),
        env.DB.prepare(
          `SELECT i.id, i.slug, i.section_id, i.module, i.type, i.title,
                  i.status, i.status_changed_at, i.req_state, i.assignee_id,
                  i.target_date, i.waiting_who, i.waiting_since, i.waiting_note,
                  i.blocked_on, i.blocked_since, i.stage, i.department,
                  i.sort, i.version,
                  p.key AS asg_key, p.name AS asg_name
             FROM tr_items i
             LEFT JOIN tr_people p ON p.id = i.assignee_id
            WHERE i.deleted_at IS NULL
            ORDER BY i.section_id, i.sort, i.id`
        ),
        env.DB.prepare(
          `SELECT item_id, section_id FROM tr_item_products`
        ),
        env.DB.prepare(
          `SELECT iv.item_id, v.name
             FROM tr_item_vendors iv
             JOIN tr_vendors v ON v.id = iv.vendor_id
            WHERE v.deleted_at IS NULL
            ORDER BY v.sort, v.name`
        ),
        env.DB.prepare(
          `SELECT item_id,
                  COUNT(*) AS total,
                  SUM(CASE WHEN done = 1 THEN 1 ELSE 0 END) AS done
             FROM tr_subitems
            WHERE deleted_at IS NULL
            GROUP BY item_id`
        ),
        env.DB.prepare(
          `SELECT d.item_id, d.qualifier, t.slug AS depends_on_slug
             FROM tr_dependencies d
             JOIN tr_items t ON t.id = d.depends_on_id
            WHERE t.deleted_at IS NULL`
        ),
        env.DB.prepare(
          `SELECT key, name, email
             FROM tr_people
            WHERE active = 1 AND deleted_at IS NULL
            ORDER BY sort, name`
        ),
        env.DB.prepare(
          `SELECT name FROM tr_vendors WHERE deleted_at IS NULL ORDER BY sort, name`
        ),
      ]);

    const payload = assembleBoard({
      sections: sections.results,
      items: items.results,
      products: products.results,
      vendors: vendors.results,
      subcounts: subcounts.results,
      deps: deps.results,
      people: people.results,
      vendorList: vendorList.results,
      includeAll,
    });

    return json(payload);
  } catch (e) {
    // Never leak the raw exception to the client (KB module-02).
    console.error("GET /api/tracker/board failed:", e);
    return error("failed to load board", 500);
  }
};
