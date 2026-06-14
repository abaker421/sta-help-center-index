// scripts/verify-briefing.mjs
// Offline verification of the PB1 briefing read path WITHOUT workerd:
//   1. apply migrations 0001/0002/0003 (shared projects) + 0005/0006/0007 (briefing)
//      to a fresh in-memory SQLite (Node built-in node:sqlite),
//   2. run the EXACT queries functions/api/briefing/me.ts issues, for TWO identities,
//   3. assemble with the SAME modules the handler uses (_lib/briefing.js), and
//   4. assert: Adam gets his seeded briefing in the documented shape; a DIFFERENT
//      identity gets a valid EMPTY briefing (proving owner-scoping derives from the
//      identity, not a param); the payload composes shared projects via JOIN and
//      carries id + version on every mutable row.
//
// This proves the schema applies, the seed reproduces agenda-state.md, the per-user
// scoping holds, and the reassembly returns the exact tab shape - all without a
// remote DB or a deploy. The live Access gate + HTTP path are exercised separately
// via `wrangler pages dev` (see the PB1 verify + deploy checklist).
//
// Run:  node scripts/verify-briefing.mjs
// (node:sqlite is experimental; an ExperimentalWarning to stderr is expected.)

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { strict as assert } from "node:assert";
import { assembleBriefing, assembleProjectsById, emptySections } from "../functions/_lib/briefing.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const read = (p) => readFileSync(resolve(repoRoot, p), "utf8");

const db = new DatabaseSync(":memory:");
db.exec(read("migrations/0001_init.sql"));
db.exec(read("migrations/0002_indexes.sql"));
db.exec(read("migrations/0003_seed.sql"));
db.exec(read("migrations/0005_briefing_init.sql"));
db.exec(read("migrations/0006_briefing_indexes.sql"));
db.exec(read("migrations/0007_briefing_seed.sql"));

// The EXACT read logic functions/api/briefing/me.ts runs, parameterised by owner.
function loadBriefing(owner) {
  const state =
    db
      .prepare(
        `SELECT owner_email, generated_at, calibration_snapshot, needs_attention,
                todays_meetings, version
           FROM briefing_state WHERE owner_email = ?`
      )
      .get(owner) || null;
  const items = db
    .prepare(
      `SELECT id, section, text, meta, done, done_at, source, sort, version
         FROM briefing_items
        WHERE owner_email = ? AND deleted_at IS NULL
        ORDER BY section, sort, id`
    )
    .all(owner);
  const refs = db
    .prepare(
      `SELECT id, project_id, personal_note, personal_timeline, sort, version
         FROM briefing_project_refs
        WHERE owner_email = ? AND deleted_at IS NULL
        ORDER BY sort, id`
    )
    .all(owner);

  if (!state && items.length === 0 && refs.length === 0) {
    return {
      owner,
      generated: null,
      calibrationSnapshot: null,
      needsAttention: [],
      todaysMeetings: [],
      sections: emptySections(),
      openProjects: [],
    };
  }

  let projectsById = new Map();
  if (refs.some((r) => r.project_id != null)) {
    const projects = db
      .prepare(
        `SELECT id, "group", name, status, status_class, stage, stage_class,
                statusline, what_it_is, next_step, sort, version, updated_at
           FROM projects WHERE deleted_at IS NULL`
      )
      .all();
    const openItems = db
      .prepare(
        `SELECT id, project_id, text, stage, stage_class, meta, done, sort, version
           FROM open_items WHERE deleted_at IS NULL ORDER BY project_id, sort, id`
      )
      .all();
    const history = db
      .prepare(`SELECT id, project_id, when_label, note FROM stage_history ORDER BY project_id, id`)
      .all();
    const timeline = db
      .prepare(`SELECT id, project_id, when_label, note FROM timeline ORDER BY project_id, id`)
      .all();
    projectsById = assembleProjectsById({ projects, items: openItems, history, timeline });
  }

  return assembleBriefing({ owner, state, items, refs, projectsById });
}

const seed = JSON.parse(read("data/briefing-data.json"));

let failures = 0;
const check = (name, fn) => {
  try {
    fn();
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failures += 1;
    console.log(`  FAIL  ${name}`);
    console.log(String(e.message).split("\n").slice(0, 12).map((l) => "        " + l).join("\n"));
  }
};

console.log("STA briefing - PB1 read-path verification\n");

const adam = loadBriefing("adamb@k12sta.com");
const other = loadBriefing("chris@k12sta.com");

check("payload is wrapped { owner, generated, calibrationSnapshot, needsAttention, todaysMeetings, sections, openProjects }", () => {
  assert.deepEqual(
    Object.keys(adam).sort(),
    ["calibrationSnapshot", "generated", "needsAttention", "openProjects", "owner", "sections", "todaysMeetings"]
  );
});
check("owner is derived (echoes the queried identity)", () => {
  assert.equal(adam.owner, "adamb@k12sta.com");
});
check("generated matches the seed", () => {
  assert.equal(adam.generated, seed.generated);
});
check("sections has all five keys, each an array", () => {
  assert.deepEqual(Object.keys(adam.sections).sort(), ["carryover", "completed", "customerSituations", "pending", "waitingOn"]);
  for (const k of Object.keys(adam.sections)) assert.ok(Array.isArray(adam.sections[k]), k);
});
check("section item counts reproduce agenda-state.md", () => {
  const bySection = seed.items.reduce((a, it) => ((a[it.section] = (a[it.section] || 0) + 1), a), {});
  assert.equal(adam.sections.carryover.length, bySection.carryover || 0, "carryover");
  assert.equal(adam.sections.pending.length, bySection.pending || 0, "pending");
  assert.equal(adam.sections.waitingOn.length, bySection.waiting_on || 0, "waiting_on");
  assert.equal(adam.sections.customerSituations.length, bySection.customer_situation || 0, "customer_situation");
  assert.equal(adam.sections.completed.length, bySection.completed || 0, "completed");
});
check("every item carries id + version (PB2-ready) and a boolean done", () => {
  for (const k of Object.keys(adam.sections)) {
    for (const it of adam.sections[k]) {
      assert.equal(typeof it.id, "number", "item id");
      assert.equal(typeof it.version, "number", "item version");
      assert.equal(typeof it.done, "boolean", "item done");
    }
  }
});
check("completed items are done with a doneAt date", () => {
  assert.ok(adam.sections.completed.length > 0);
  for (const it of adam.sections.completed) {
    assert.equal(it.done, true, "completed.done");
    assert.ok(it.doneAt, "completed.doneAt present");
  }
});
check("calibrationSnapshot is parsed JSON (trend + rows)", () => {
  assert.ok(adam.calibrationSnapshot && typeof adam.calibrationSnapshot === "object");
  assert.ok(Array.isArray(adam.calibrationSnapshot.trend));
  assert.ok(Array.isArray(adam.calibrationSnapshot.rows));
});
check("needsAttention is a parsed JSON array", () => {
  assert.ok(Array.isArray(adam.needsAttention));
  assert.ok(adam.needsAttention.length > 0);
});
check("openProjects compose the SHARED projects via JOIN (no duplicated state)", () => {
  assert.equal(adam.openProjects.length, seed.project_refs.length);
  const schoolTrak = adam.openProjects.find((p) => p.name === "SchoolTRAK");
  assert.ok(schoolTrak, "SchoolTRAK composed");
  // Shared project fields present (came from the JOIN, not the per-user row):
  assert.equal(typeof schoolTrak.id, "number", "shared project id");
  assert.equal(typeof schoolTrak.version, "number", "shared project version");
  assert.ok(schoolTrak.whatItIs, "shared whatItIs");
  assert.ok(Array.isArray(schoolTrak.openItems) && schoolTrak.openItems.length > 0, "shared openItems");
  assert.ok(Array.isArray(schoolTrak.timeline) && schoolTrak.timeline.length > 0, "shared timeline");
});
check("each openProject carries refId + refVersion (PB2 edits personal annotations against them)", () => {
  for (const p of adam.openProjects) {
    assert.equal(typeof p.refId, "number", "refId");
    assert.equal(typeof p.refVersion, "number", "refVersion");
    assert.ok("personalNote" in p, "personalNote present");
    assert.ok("personalTimeline" in p, "personalTimeline present");
  }
});
check("OWNER-SCOPING: a different identity gets a valid EMPTY briefing (200-shape), not Adam's data, not a 404", () => {
  assert.equal(other.owner, "chris@k12sta.com");
  assert.equal(other.generated, null);
  assert.equal(other.calibrationSnapshot, null);
  assert.deepEqual(other.needsAttention, []);
  assert.deepEqual(other.todaysMeetings, []);
  assert.deepEqual(other.openProjects, []);
  for (const k of Object.keys(other.sections)) assert.equal(other.sections[k].length, 0, `empty ${k}`);
});

db.close();

console.log("");
if (failures > 0) {
  console.log(`RESULT: ${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("RESULT: all checks passed - GET /api/briefing/me will return the documented owner-scoped shape.");
