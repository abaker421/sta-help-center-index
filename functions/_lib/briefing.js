// functions/_lib/briefing.js
// Pure reassembly of per-user briefing rows into the EXACT shape the "My Day" tab
// renders. Kept dependency-free and side-effect-free (mirrors _lib/assemble.js) so
// it can be unit-tested against a local SQLite without workerd (scripts/verify-
// briefing.mjs). The handler (functions/api/briefing/me.ts) does the D1 queries and
// calls these.
//
// Key design decision 2 (compose, don't duplicate): the shared project state is
// JOINed in via assembleProject() from _lib/assemble.js - never copied into the
// per-user rows. briefing_project_refs contribute ONLY personalNote / personalTimeline
// / sort and the nullable project_id.
//
// Every MUTABLE row in the payload carries id + version so PB2 adds the write path
// with no payload change: items carry {id, version}; openProjects carry {refId,
// refVersion} for the personal ref (and the shared project's own id/version).

import { assembleProject } from "./assemble.js";

// briefing_items.section (DB) -> payload section key (camelCase the tab consumes).
export const SECTION_KEY = {
  carryover: "carryover",
  pending: "pending",
  waiting_on: "waitingOn",
  customer_situation: "customerSituations",
  completed: "completed",
};

// A valid EMPTY briefing keeps every section present as an empty array, so the tab
// renders an empty-state for a user with no rows (200, never a 404).
export function emptySections() {
  return { carryover: [], pending: [], waitingOn: [], customerSituations: [], completed: [] };
}

// Parse a JSON TEXT column; return the fallback on null/empty/invalid (stored
// content is untrusted - never throw out of the read path on a bad snapshot).
function parseJson(value, fallback) {
  if (value == null || value === "") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

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
 * Assemble the SHARED projects rows (+ children) into a Map of project_id ->
 * the per-project object assembleProject() emits (the same shape the Projects tab
 * uses, carrying id + version). The briefing JOINs against this map.
 *
 * @param {{projects:any[], items:any[], history:any[], timeline:any[]}} rows
 * @returns {Map<number, object>}
 */
export function assembleProjectsById({ projects = [], items = [], history = [], timeline = [] }) {
  const itemsByProject = bucketBy(items, "project_id");
  const historyByProject = bucketBy(history, "project_id");
  const tlByProject = bucketBy(timeline, "project_id");

  const map = new Map();
  for (const row of projects) {
    map.set(
      row.id,
      assembleProject({
        project: row,
        items: itemsByProject.get(row.id) || [],
        history: historyByProject.get(row.id) || [],
        timeline: tlByProject.get(row.id) || [],
      })
    );
  }
  return map;
}

/**
 * Reassemble one owner's briefing into the tab payload.
 *
 * @param {{
 *   owner:string,
 *   state:(object|null),
 *   items:any[],
 *   refs:any[],
 *   projectsById?:Map<number, object>
 * }} input
 * @returns the briefing payload
 */
export function assembleBriefing({ owner, state = null, items = [], refs = [], projectsById = new Map() }) {
  const sections = emptySections();
  for (const it of items) {
    const key = SECTION_KEY[it.section];
    if (!key) continue; // unknown section value - skip (defensive; CHECK constraint guards the DB)
    sections[key].push({
      id: it.id,
      version: it.version,
      section: it.section,
      text: it.text,
      meta: it.meta ?? "",
      // PB2a structured columns (nullable; the tab renders them as real table columns).
      itemDate: it.item_date ?? null,
      project: it.project ?? null,
      owner: it.owner ?? null,
      statusLabel: it.status_label ?? null,
      statusClass: it.status_class ?? null,
      context: it.context ?? null,
      done: !!it.done,
      doneAt: it.done_at ?? null,
      source: it.source ?? null,
      sort: it.sort,
    });
  }

  const openProjects = refs.map((ref) => {
    const shared = ref.project_id != null ? projectsById.get(ref.project_id) : null;
    // refId / refVersion address the personal ref row (PB2 edits personalNote /
    // personalTimeline against them). The shared project keeps its own id / version.
    const personal = {
      refId: ref.id,
      refVersion: ref.version,
      personalNote: ref.personal_note ?? null,
      personalTimeline: parseJson(ref.personal_timeline, null),
    };
    if (shared) return { ...shared, ...personal };
    // No shared match (null project_id or soft-deleted project): render from the
    // personal annotations alone. The seed parked the project name in personalNote.
    return { name: null, ...personal };
  });

  return {
    owner,
    generated: state?.generated_at ?? null,
    calibrationSnapshot: parseJson(state?.calibration_snapshot, null),
    needsAttention: parseJson(state?.needs_attention, []),
    todaysMeetings: parseJson(state?.todays_meetings, []),
    sections,
    openProjects,
  };
}
