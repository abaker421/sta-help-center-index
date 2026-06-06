// functions/_lib/assemble.js
// Pure reassembly of D1 rows into the EXACT shape the Projects tab renders:
//   { generated, source, stageLegend:[{key,label,desc}],
//     groups:[ { key, label, note, projects:[ {...} ] } ] }
//
// Kept dependency-free and side-effect-free so it can be unit-tested against a
// local SQLite without workerd (see scripts/verify-local.mjs). The handler
// (functions/api/projects.ts) does the D1 batch query and calls assembleProjects().

// stage_legend is a constant - emitted in the response, not modelled in D1 (KB b1 plan).
export const STAGE_LEGEND = [
  { key: "prelim", label: "Prelim",       desc: "Feasibility, design, research, prototyping. Nothing permanent built yet." },
  { key: "dev",    label: "Dev",          desc: "Net-new code through release. Includes pre-release QA and RC work." },
  { key: "post",   label: "Post-Release", desc: "Work on shipped features: bug fixes, patches, migrations, config, maintenance." },
  { key: "meet",   label: "Meetings",     desc: "Weekly status / team connects and project scoping calls." },
];

// Group metadata (label / note) is likewise a constant; the `group` column on
// projects buckets rows into these. Order here defines group render order.
export const GROUPS = [
  { key: "dev", label: "Product Development", note: "stage-tracked" },
  { key: "ops", label: "Business & Ops",     note: "no stage tag" },
];

export const SOURCE = "agenda-state.md (Work Personal Assistant) - single source of truth";

function bucketBy(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const k = row[key];
    let arr = map.get(k);
    if (!arr) { arr = []; map.set(k, arr); }
    arr.push(row);
  }
  return map;
}

/**
 * @param {{projects:any[], items:any[], history:any[], timeline:any[]}} rows
 * @returns the wrapped tab payload
 */
export function assembleProjects({ projects = [], items = [], history = [], timeline = [] }) {
  const itemsByProject   = bucketBy(items, "project_id");
  const historyByProject = bucketBy(history, "project_id");
  const tlByProject       = bucketBy(timeline, "project_id");

  const byGroup = new Map(GROUPS.map((g) => [g.key, []]));
  let generated = null;

  for (const row of projects) {
    if (row.updated_at && (generated === null || row.updated_at > generated)) {
      generated = row.updated_at;
    }

    // Build only the keys the live payload carries for this project kind, so the
    // shape matches the static project-data.json exactly (dev vs ops differ).
    // B2: `id` + `version` are carried so the edit UI can address the row and send
    // expected_version. They are additive - every other field stays byte-identical
    // to B1 (the read harness strips id/version before its deep-equal).
    const p = { id: row.id, version: row.version, name: row.name, status: row.status, statusClass: row.status_class };
    if (row.stage != null) {
      p.stage = row.stage;
      p.stageClass = row.stage_class;
    }
    if (row.statusline != null) p.statusline = row.statusline;
    if (row.what_it_is != null) p.whatItIs = row.what_it_is;

    const hist = historyByProject.get(row.id) || [];
    if (hist.length) {
      p.stageHistory = hist.map((h) => ({ when: h.when_label, note: h.note }));
    }

    p.openItems = (itemsByProject.get(row.id) || []).map((it) => {
      // B2: id + version (compare-and-set + addressing) and done (so the edit UI's
      // done checkbox reflects persisted state) carried per open_item. done is
      // emitted as a boolean for the UI; stored 0/1 in D1.
      const o = { id: it.id, version: it.version, text: it.text, meta: it.meta ?? "", done: !!it.done };
      if (it.stage != null) {
        o.stage = it.stage;
        o.stageClass = it.stage_class;
      }
      return o;
    });

    const tl = tlByProject.get(row.id) || [];
    if (tl.length) {
      p.timeline = tl.map((t) => ({ when: t.when_label, note: t.note }));
    }

    if (row.next_step != null) p.next = row.next_step;

    const bucket = byGroup.get(row.group);
    if (bucket) bucket.push(p);
  }

  return {
    generated: generated || new Date().toISOString(),
    source: SOURCE,
    stageLegend: STAGE_LEGEND,
    groups: GROUPS.map((g) => ({
      key: g.key,
      label: g.label,
      note: g.note,
      projects: byGroup.get(g.key) || [],
    })),
  };
}
