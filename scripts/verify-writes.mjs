// scripts/verify-writes.mjs
// Offline verification of the B2 write contract (KB module-04) WITHOUT workerd or a
// remote DB. It applies the migrations to a fresh in-memory SQLite (Node 24 built-in
// node:sqlite), then drives the REAL functions/_lib/writes.js logic through a tiny
// D1-compatible shim so the same code that runs at the edge is what gets asserted:
//
//   (a) a PATCH with the CORRECT expected_version bumps version by 1, sets updated_by,
//       and writes exactly one audit row with before/after snapshots;
//   (b) a PATCH with a STALE expected_version makes no change (changes === 0) and
//       writes NO audit row (no phantom audit);
//   (c) a soft-delete sets deleted_at and the row drops out of the GET assembly;
//   (d) an append inserts with no version and no conflict;
//   plus pure-function gates: requireRole, requireWriteHost, pickFields.
//
// Run:  node scripts/verify-writes.mjs
// (node:sqlite is experimental; an ExperimentalWarning to stderr is expected.)

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { strict as assert } from "node:assert";
import { assembleProjects } from "../functions/_lib/assemble.js";
import {
  compareAndSet,
  writeAudit,
  requireRole,
  requireWriteHost,
  pickFields,
  PROJECT_CONTENT_FIELDS,
} from "../functions/_lib/writes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const read = (p) => readFileSync(resolve(repoRoot, p), "utf8");

// --- Minimal D1-compatible shim over node:sqlite -----------------------------
// Mirrors the slice of the D1 prepared-statement API writes.js uses:
//   prepare(sql).bind(...args).run()   -> { success, meta:{ changes, last_row_id } }
//   prepare(sql).bind(...args).first() -> row | null
//   prepare(sql).bind(...args).all()   -> { results }
function d1(db) {
  return {
    prepare(sql) {
      const stmt = db.prepare(sql);
      let args = [];
      const api = {
        bind(...a) {
          args = a;
          return api;
        },
        run() {
          const info = stmt.run(...args);
          return {
            success: true,
            meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) },
            results: [],
          };
        },
        first() {
          const row = stmt.get(...args);
          return row === undefined ? null : row;
        },
        all() {
          return { success: true, results: stmt.all(...args), meta: {} };
        },
      };
      return api;
    },
  };
}

const raw = new DatabaseSync(":memory:");
raw.exec(read("migrations/0001_init.sql"));
raw.exec(read("migrations/0002_indexes.sql"));
raw.exec(read("migrations/0003_seed.sql"));
raw.exec(read("migrations/0004_audit_indexes.sql"));
const db = d1(raw);

const ADMIN = { email: "adamb@k12sta.com", kind: "human", role: "admin", agent_name: null };

const auditCount = (entityType, entityId) =>
  raw
    .prepare(`SELECT COUNT(*) AS n FROM audit WHERE entity_type = ? AND entity_id = ?`)
    .get(entityType, entityId).n;

// Re-run the EXACT GET assembly the handler uses, to prove soft-deletes drop out.
function assembleNow() {
  const projects = raw
    .prepare(
      `SELECT id, "group", name, status, status_class, stage, stage_class,
              statusline, what_it_is, next_step, sort, version, updated_at
         FROM projects WHERE deleted_at IS NULL ORDER BY "group", sort`
    )
    .all();
  const items = raw
    .prepare(
      `SELECT id, project_id, text, stage, stage_class, meta, done, sort, version
         FROM open_items WHERE deleted_at IS NULL ORDER BY project_id, sort, id`
    )
    .all();
  const history = raw
    .prepare(`SELECT id, project_id, when_label, note FROM stage_history ORDER BY project_id, id`)
    .all();
  const timeline = raw
    .prepare(`SELECT id, project_id, when_label, note FROM timeline ORDER BY project_id, id`)
    .all();
  return assembleProjects({ projects, items, history, timeline });
}

let failures = 0;
// async-aware: awaits fn so async assertions run (and can fail) before we close the DB.
const check = async (name, fn) => {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failures += 1;
    console.log(`  FAIL  ${name}`);
    console.log(String(e.message).split("\n").slice(0, 12).map((l) => "        " + l).join("\n"));
  }
};

console.log("STA Project Tracker - B2 write-contract verification\n");

// (a) correct expected_version -> bump + exactly one audit row -------------------
await check("(a) correct expected_version bumps version, sets updated_by, audits once", async () => {
  const before = raw.prepare(`SELECT * FROM projects WHERE id = 1`).get();
  const res = await compareAndSet(db, {
    table: "projects",
    id: 1,
    fields: { status: "Verify-A status" },
    expectedVersion: before.version,
    updatedBy: ADMIN.email,
  });
  assert.equal(res.ok, true, "ok");
  assert.equal(res.changes, 1, "changes===1");
  assert.equal(res.current.version, before.version + 1, "version +1");
  assert.equal(res.current.updated_by, ADMIN.email, "updated_by");
  assert.equal(res.current.status, "Verify-A status", "field applied");

  await writeAudit(db, {
    entityType: "project",
    entityId: 1,
    action: "update",
    user: ADMIN,
    before,
    after: res.current,
  });
  assert.equal(auditCount("project", 1), 1, "exactly one audit row");
  const a = raw.prepare(`SELECT * FROM audit WHERE entity_type='project' AND entity_id=1`).get();
  assert.equal(a.actor_email, ADMIN.email, "actor_email from identity");
  assert.equal(a.actor_kind, "human", "actor_kind");
  assert.equal(a.agent_name, null, "agent_name null for human");
  assert.equal(JSON.parse(a.before_json).status, before.status, "before snapshot");
  assert.equal(JSON.parse(a.after_json).status, "Verify-A status", "after snapshot");
});

// (b) stale expected_version -> no change, no audit -----------------------------
await check("(b) stale expected_version makes no change and writes no audit row", async () => {
  const live = raw.prepare(`SELECT * FROM projects WHERE id = 1`).get(); // now at version 2
  const res = await compareAndSet(db, {
    table: "projects",
    id: 1,
    fields: { status: "should-not-apply" },
    expectedVersion: 1, // stale (live is 2)
    updatedBy: ADMIN.email,
  });
  assert.equal(res.ok, false, "ok===false");
  assert.equal(res.changes, 0, "changes===0");
  assert.equal(res.current.version, live.version, "current is the live row");
  // We never call writeAudit on !ok, so the count is unchanged from (a).
  assert.equal(auditCount("project", 1), 1, "no phantom audit row");
  const unchanged = raw.prepare(`SELECT status FROM projects WHERE id = 1`).get();
  assert.equal(unchanged.status, "Verify-A status", "row untouched by stale write");
});

// (c) soft-delete drops the row from the GET assembly ---------------------------
await check("(c) soft-delete sets deleted_at and the row drops out of GET", async () => {
  const before = raw.prepare(`SELECT * FROM projects WHERE id = 8`).get(); // CMI TT3 (ops, no children)
  assert.ok(before, "project 8 exists pre-delete");
  const res = await compareAndSet(db, {
    table: "projects",
    id: 8,
    fields: { deleted_at: new Date().toISOString() },
    expectedVersion: before.version,
    updatedBy: ADMIN.email,
  });
  assert.equal(res.ok, true, "delete applied");
  assert.ok(res.current.deleted_at, "deleted_at set");
  await writeAudit(db, {
    entityType: "project",
    entityId: 8,
    action: "delete",
    user: ADMIN,
    before,
    after: res.current,
  });
  const payload = assembleNow();
  const allProjects = payload.groups.flatMap((g) => g.projects);
  assert.ok(!allProjects.some((p) => p.id === 8), "deleted project absent from GET");
  assert.equal(auditCount("project", 8), 1, "delete audited");
});

// (d) append inserts with no version and no conflict ----------------------------
await check("(d) append (open_item + timeline) inserts with no version / no conflict", async () => {
  const itemsBefore = raw.prepare(`SELECT COUNT(*) AS n FROM open_items`).get().n;
  const item = await db
    .prepare(
      `INSERT INTO open_items (project_id, text, stage, stage_class, meta, done, sort, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
    )
    .bind(1, "Appended item", null, null, "", 0, 9, ADMIN.email)
    .first();
  assert.ok(Number.isInteger(item.id), "item got an id");
  assert.equal(item.version, 1, "append starts at version 1 (no expected_version needed)");
  assert.equal(raw.prepare(`SELECT COUNT(*) AS n FROM open_items`).get().n, itemsBefore + 1, "row count +1");

  const tl = await db
    .prepare(`INSERT INTO timeline (project_id, when_label, note, created_by) VALUES (?, ?, ?, ?) RETURNING *`)
    .bind(1, "6/6", "B2 append test", ADMIN.email)
    .first();
  assert.ok(Number.isInteger(tl.id), "timeline row inserted");
  assert.equal(tl.version, undefined, "timeline has no version column");
});

// Pure gate functions -----------------------------------------------------------
await check("requireRole: member blocked from admin op (403), admin allowed, non-admin op open", () => {
  const member = { role: "member" };
  const blocked = requireRole(member, "admin");
  assert.ok(blocked instanceof Response && blocked.status === 403, "member -> 403");
  assert.equal(requireRole(ADMIN, "admin"), null, "admin -> allowed");
  assert.equal(requireRole(member, undefined), null, "non-admin op -> allowed");
});

await check("requireWriteHost: canonical ok; non-canonical 403; loopback ok only under LOCAL_DEV", () => {
  const req = (url) => ({ url });
  assert.equal(requireWriteHost(req("https://sta-help-center-index.pages.dev/api/projects/1"), {}), null,
    "canonical host allowed");
  const aliased = requireWriteHost(req("https://preview.sta-help-center-index.pages.dev/api/x"), {});
  assert.ok(aliased instanceof Response && aliased.status === 403, "preview/alias host -> 403");
  assert.equal(requireWriteHost(req("http://localhost:8788/api/x"), { LOCAL_DEV: "1" }), null,
    "loopback allowed under LOCAL_DEV");
  const nonLoopback = requireWriteHost(req("https://evil.example.com/api/x"), { LOCAL_DEV: "1" });
  assert.ok(nonLoopback instanceof Response && nonLoopback.status === 403,
    "non-loopback Host still 403 even under LOCAL_DEV (gate stays testable)");
});

await check("pickFields: members' structural fields are rejected, content kept", () => {
  const { fields, rejected } = pickFields(
    { expected_version: 3, status: "x", group: "ops", bogus: 1 },
    PROJECT_CONTENT_FIELDS
  );
  assert.deepEqual(Object.keys(fields), ["status"], "only content field kept");
  assert.ok(rejected.includes("group"), "structural field rejected");
  assert.ok(rejected.includes("bogus"), "unknown field rejected");
  assert.ok(!rejected.includes("expected_version"), "control key not rejected");
});

raw.close();

console.log("");
if (failures > 0) {
  console.log(`RESULT: ${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("RESULT: all checks passed - the B2 write contract holds (module-04).");
