// functions/_lib/tracker.js
// Pure reassembly of the tr_* rows into the EXACT shape the redesigned Projects
// tab renders (Phase PT1 READ PATH ONLY). Kept dependency-free and side-effect-
// free (mirrors _lib/assemble.js and _lib/briefing.js) so it can be unit-tested
// against a local SQLite without workerd. The handlers (functions/api/tracker/
// board.ts and items/[slug].ts) do the D1 batch queries and call these.
//
// The four PT1 design decisions live here as *read-time* derivations, nothing
// stored twice (Key design decision 4):
//   - "active" is computed, never stored: status NOT IN (done,canc) AND the
//     request lifecycle is null-or-'requested'. Every item carries the server's
//     verdict as a boolean so the client never re-derives it.
//   - The dashboard (who-owes-a-move, open-bug / blocked counts, due-soon) is
//     computed over the ACTIVE set only, ordered oldest-first from each flag's
//     OWN since date (Key design decisions 1 + 2 - Waiting On and Blocked are
//     parallel flags, each aged from its own since, never from updated_at).
//   - Sub-item counts, section totals, and the module sub-labels are derived.
//   - "Required by" (items/[slug]) is the reverse of tr_dependencies, derived.
//
// Ages in DAYS are intentionally NOT computed here: the tab renders them against
// the real current date (the raw YYYY-MM-DD since/target dates are passed through
// and the client subtracts today). This keeps a single clock - the viewer's - and
// avoids baking a snapshot date into the payload.

// Status is exactly four values (Key design decision: Waiting On is never a status).
export const STATUS_LABEL = { open: "Open", prog: "In Progress", done: "Done", canc: "Canceled" };
export const STATUS_GLYPH = { open: "○", prog: "◐", done: "✓", canc: "⊘" };
export const TYPE_SHORT = { bug: "Bug", feature: "Feat", newproduct: "New", decision: "Dec", request: "Req" };
export const TYPE_LONG = { bug: "Bug fix", feature: "Feature", newproduct: "New product", decision: "Strategic decision", request: "Feature request" };
export const WHO_LABEL = { schooltech: "School Tech", vendor: "Vendor", customer: "Customer" };
export const REQ_LABEL = { requested: "Requested", onhold: "On Hold", archived: "Archived" };

// An item is active iff it is neither closed (done/canc) nor an off-board request
// (on-hold / archived). deleted_at is already excluded by the queries.
export function isActive(row) {
  if (row.status === "done" || row.status === "canc") return false;
  if (row.req_state != null && row.req_state !== "requested") return false;
  return true;
}

function bucketList(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const k = row[key];
    let arr = map.get(k);
    if (!arr) { arr = []; map.set(k, arr); }
    arr.push(row);
  }
  return map;
}

// Build the per-item object the board rows and the filter logic consume. Carries
// id + version on the mutable row so PT2 (writes) needs no payload change.
function itemObject(row, { sectionKeyById, vendorsByItem, affectsByItem, subCountByItem, depsByItem }) {
  const waiting = row.waiting_who != null
    ? { who: row.waiting_who, since: row.waiting_since, note: row.waiting_note ?? null }
    : null;
  const blocked = row.blocked_on != null
    ? { on: row.blocked_on, since: row.blocked_since }
    : null;
  const sub = subCountByItem.get(row.id) || { total: 0, done: 0 };
  const deps = depsByItem.get(row.id) || [];
  return {
    id: row.id,
    version: row.version,
    slug: row.slug,
    section: sectionKeyById.get(row.section_id) || null,
    module: row.module ?? null,
    type: row.type,
    title: row.title,
    status: row.status,
    statusChangedAt: row.status_changed_at ?? null,
    reqState: row.req_state ?? null,
    assignee: row.asg_key ? { key: row.asg_key, name: row.asg_name } : null,
    targetDate: row.target_date ?? null,
    waiting,
    blocked,
    vendors: vendorsByItem.get(row.id) || [],
    affects: affectsByItem.get(row.id) || [],
    subCounts: { done: sub.done, total: sub.total },
    dependsOn: deps,                    // [{ slug, qualifier }]
    hasDependency: deps.length > 0,
    active: isActive(row),
  };
}

/**
 * Assemble the whole board payload.
 *
 * @param {{
 *   sections:any[], items:any[], products:any[], vendors:any[],
 *   subcounts:any[], deps:any[], people:any[], vendorList:any[],
 *   includeAll?:boolean
 * }} rows
 */
export function assembleBoard({
  sections = [], items = [], products = [], vendors = [],
  subcounts = [], deps = [], people = [], vendorList = [], includeAll = false,
}) {
  const sectionKeyById = new Map(sections.map((s) => [s.id, s.key]));

  // also-affects: section keys per item (home section is NOT among these - D2).
  const affectsByItem = new Map();
  for (const r of products) {
    const key = sectionKeyById.get(r.section_id);
    if (!key) continue;
    let arr = affectsByItem.get(r.item_id);
    if (!arr) { arr = []; affectsByItem.set(r.item_id, arr); }
    arr.push(key);
  }

  // vendor names per item (ordered by the query's vendor sort).
  const vendorsByItem = new Map();
  for (const r of vendors) {
    let arr = vendorsByItem.get(r.item_id);
    if (!arr) { arr = []; vendorsByItem.set(r.item_id, arr); }
    arr.push(r.name);
  }

  const subCountByItem = new Map(subcounts.map((r) => [r.item_id, { total: r.total, done: r.done }]));

  const depsByItem = new Map();
  for (const r of deps) {
    let arr = depsByItem.get(r.item_id);
    if (!arr) { arr = []; depsByItem.set(r.item_id, arr); }
    arr.push({ slug: r.depends_on_slug, qualifier: r.qualifier ?? null });
  }

  const ctx = { sectionKeyById, vendorsByItem, affectsByItem, subCountByItem, depsByItem };
  const all = items.map((row) => itemObject(row, ctx));
  const activeItems = all.filter((it) => it.active);

  const itemsBySection = bucketList(all, "section");

  const sectionsOut = sections.map((s) => {
    const mine = itemsBySection.get(s.key) || [];
    const active = mine.filter((it) => it.active);
    const shown = includeAll ? mine : active;
    // module sub-labels: distinct non-null modules among the ACTIVE items, in order.
    const modules = [];
    for (const it of active) {
      if (it.module && !modules.includes(it.module)) modules.push(it.module);
    }
    return {
      key: s.key,
      name: s.name,
      kind: s.kind,
      blurb: s.blurb || "",
      sort: s.sort,
      modules,
      activeCount: active.length,
      totalCount: mine.length,
      items: shown,
    };
  });

  // ---- Dashboard (over the ACTIVE set only) --------------------------------
  // Who owes a move: one row per raised flag, each aged from its OWN since date.
  // An item that is both waiting AND blocked contributes two rows (D1).
  const whoOwes = [];
  for (const it of activeItems) {
    if (it.waiting) {
      whoOwes.push({
        slug: it.slug, title: it.title, kind: "waiting",
        who: it.waiting.who, since: it.waiting.since, note: it.waiting.note,
      });
    }
    if (it.blocked) {
      whoOwes.push({
        slug: it.slug, title: it.title, kind: "blocked",
        who: null, since: it.blocked.since, note: it.blocked.on,
      });
    }
  }
  // Oldest first, from each flag's own since. Deterministic tie-break by slug/kind.
  whoOwes.sort((a, b) =>
    a.since < b.since ? -1 : a.since > b.since ? 1 :
    a.slug < b.slug ? -1 : a.slug > b.slug ? 1 :
    a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0
  );

  const dueSoon = activeItems
    .filter((it) => it.targetDate)
    .map((it) => ({ slug: it.slug, title: it.title, targetDate: it.targetDate }))
    .sort((a, b) =>
      a.targetDate < b.targetDate ? -1 : a.targetDate > b.targetDate ? 1 :
      a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0
    );

  const dashboard = {
    whoOwes,
    openBugs: activeItems.filter((it) => it.type === "bug").length,
    blocked: activeItems.filter((it) => it.blocked).length,
    waiting: activeItems.filter((it) => it.waiting).length,
    dated: dueSoon.length,
    dueSoon,
  };

  // Filter chips: only people / vendors that actually appear on an ACTIVE item,
  // so a chip never filters the board down to nothing.
  const presentPeople = new Set(activeItems.map((it) => it.assignee && it.assignee.key).filter(Boolean));
  const presentVendors = new Set(activeItems.flatMap((it) => it.vendors));
  const peopleOut = people.filter((p) => presentPeople.has(p.key)).map((p) => ({ key: p.key, name: p.name, email: p.email ?? null }));
  const vendorsOut = vendorList.filter((v) => presentVendors.has(v.name)).map((v) => v.name);

  return {
    generated: new Date().toISOString(),
    includeAll,
    counts: { total: all.length, active: activeItems.length },
    sections: sectionsOut,
    dashboard,
    people: peopleOut,
    vendors: vendorsOut,
  };
}

/**
 * Assemble one item's full detail (the slide-over): the item, its live sub-items,
 * dependencies in BOTH directions (depends-on stored, required-by derived), and
 * its append-only history.
 *
 * @param {{
 *   item:any, sectionKey:string|null, vendors:any[], affects:any[],
 *   subitems:any[], dependsOn:any[], requiredBy:any[], history:any[]
 * }} rows
 */
export function assembleItem({
  item, sectionKey = null, vendors = [], affects = [],
  subitems = [], dependsOn = [], requiredBy = [], history = [],
}) {
  const waiting = item.waiting_who != null
    ? { who: item.waiting_who, since: item.waiting_since, note: item.waiting_note ?? null }
    : null;
  const blocked = item.blocked_on != null
    ? { on: item.blocked_on, since: item.blocked_since }
    : null;
  return {
    id: item.id,
    version: item.version,
    slug: item.slug,
    section: sectionKey,
    module: item.module ?? null,
    type: item.type,
    title: item.title,
    status: item.status,
    statusChangedAt: item.status_changed_at ?? null,
    reqState: item.req_state ?? null,
    assignee: item.asg_key ? { key: item.asg_key, name: item.asg_name } : null,
    targetDate: item.target_date ?? null,
    waiting,
    blocked,
    stage: item.stage ?? null,
    department: item.department ?? null,
    vendors: vendors.map((v) => v.name),
    affects: affects.map((a) => a.key),
    updatedAt: item.updated_at ?? null,
    updatedBy: item.updated_by ?? null,
    active: isActive(item),
    subitems: subitems.map((s) => ({
      id: s.id, version: s.version, text: s.text, done: !!s.done,
      doneAt: s.done_at ?? null, sort: s.sort,
    })),
    dependsOn: dependsOn.map((d) => ({ slug: d.slug, title: d.title, qualifier: d.qualifier ?? null })),
    requiredBy: requiredBy.map((d) => ({ slug: d.slug, title: d.title, qualifier: d.qualifier ?? null })),
    history: history.map((h) => ({ whenLabel: h.when_label ?? "", occurredOn: h.occurred_on ?? null, note: h.note })),
  };
}
