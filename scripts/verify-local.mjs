// scripts/verify-local.mjs
// Offline verification of the B1 read path WITHOUT workerd:
//   1. apply migrations 0001 + 0002 + 0003 to a fresh in-memory SQLite
//      (Node 24 built-in node:sqlite),
//   2. run the EXACT queries functions/api/projects.ts issues,
//   3. assembleProjects() the rows with the SAME module the handler uses,
//   4. deep-compare the result against data/project-data.json (ignoring the
//      `generated` timestamp, which is now derived from updated_at).
//
// This proves the schema applies, the seed reproduces the tracker content, and
// the reassembly returns the exact shape the tab renders. The Access middleware
// and the live HTTP path are exercised separately via `wrangler pages dev`.
//
// Run:  node scripts/verify-local.mjs
// (node:sqlite is experimental; an ExperimentalWarning to stderr is expected.)

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { strict as assert } from "node:assert";
import { assembleProjects } from "../functions/_lib/assemble.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const read = (p) => readFileSync(resolve(repoRoot, p), "utf8");

const db = new DatabaseSync(":memory:");
db.exec(read("migrations/0001_init.sql"));
db.exec(read("migrations/0002_indexes.sql"));
db.exec(read("migrations/0003_seed.sql"));

// Same SQL as functions/api/projects.ts
const projects = db
  .prepare(
    `SELECT id, "group", name, status, status_class, stage, stage_class,
            statusline, what_it_is, next_step, sort, version, updated_at
       FROM projects WHERE deleted_at IS NULL ORDER BY "group", sort`
  )
  .all();
const items = db
  .prepare(
    `SELECT id, project_id, text, stage, stage_class, meta, sort, version
       FROM open_items WHERE deleted_at IS NULL ORDER BY project_id, sort, id`
  )
  .all();
const history = db
  .prepare(
    `SELECT id, project_id, when_label, note FROM stage_history ORDER BY project_id, id`
  )
  .all();
const timeline = db
  .prepare(
    `SELECT id, project_id, when_label, note FROM timeline ORDER BY project_id, id`
  )
  .all();

const payload = assembleProjects({ projects, items, history, timeline });
const expected = JSON.parse(read("data/project-data.json"));

// B2 added `id` + `version` to every project and open_item in the payload. The B1
// guarantee is that EVERY OTHER field stays byte-identical to project-data.json,
// so strip the two new keys before the deep-equal (Decision 4: re-run the deep-equal
// harness against the non-id/version fields).
function stripIdVersion(groups) {
  return groups.map((g) => ({
    ...g,
    projects: (g.projects || []).map((p) => {
      const { id, version, openItems, ...rest } = p;
      const out = { ...rest };
      if (openItems) {
        out.openItems = openItems.map((it) => {
          const { id: _i, version: _v, ...itRest } = it;
          return itRest;
        });
      }
      return out;
    }),
  }));
}
const payloadGroupsStripped = stripIdVersion(payload.groups);

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

console.log("STA Project Tracker - B1 read-path verification\n");

check("response is wrapped { generated, source, stageLegend, groups }", () => {
  assert.deepEqual(Object.keys(payload).sort(), ["generated", "groups", "source", "stageLegend"]);
});
check("generated is a non-empty string (max updated_at)", () => {
  assert.equal(typeof payload.generated, "string");
  assert.ok(payload.generated.length > 0);
});
check("source matches the live feed", () => {
  assert.equal(payload.source, expected.source);
});
check("stageLegend matches exactly", () => {
  assert.deepStrictEqual(payload.stageLegend, expected.stageLegend);
});
check("groups (key/label/note + every project) match the live feed exactly (id/version stripped)", () => {
  assert.deepStrictEqual(payloadGroupsStripped, expected.groups);
});
check("every project + open_item now carries numeric id and version (B2)", () => {
  for (const g of payload.groups) {
    for (const p of g.projects) {
      assert.equal(typeof p.id, "number", "project id");
      assert.equal(typeof p.version, "number", "project version");
      for (const it of p.openItems || []) {
        assert.equal(typeof it.id, "number", "open_item id");
        assert.equal(typeof it.version, "number", "open_item version");
      }
    }
  }
});
check("project + open-item counts match the feed", () => {
  const projCount = (g) => g.reduce((n, grp) => n + grp.projects.length, 0);
  const itemCount = (g) =>
    g.reduce((n, grp) => n + grp.projects.reduce((m, p) => m + (p.openItems?.length || 0), 0), 0);
  assert.equal(projCount(payload.groups), projCount(expected.groups), "project count");
  assert.equal(items.length, itemCount(expected.groups), "seeded open_items vs feed");
});

db.close();

console.log("");
if (failures > 0) {
  console.log(`RESULT: ${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("RESULT: all checks passed - /api/projects will return the exact tab shape.");
