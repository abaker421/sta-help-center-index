// scripts/verify-briefing-writes.mjs
// Offline verification of the PB2b briefing write contract WITHOUT workerd or a remote
// DB. Applies migrations 0001-0009 to a fresh in-memory SQLite (Node 24 node:sqlite),
// then drives the REAL functions/_lib/writes.js + _lib/briefing.js logic through a
// tiny D1-compatible shim, so the same code that runs at the edge is what gets asserted:
//
//   (a) correct expected_version + MATCHING owner bumps version and writes one audit row;
//   (b) a write with a DIFFERENT owner_email than the row -> owner-scoped read is null
//       (handler 404s) AND owner-scoped compareAndSet makes no change -> NO audit row;
//   (c) a STALE expected_version (correct owner) -> changes 0, live row returned (409),
//       NO audit row;
//   (d) a soft-delete drops the row out of the /api/briefing/me assembly;
//   (e) reclassify (change section) moves the item between sections in the assembly.
//
// Run:  node scripts/verify-briefing-writes.mjs
// (node:sqlite is experimental; an ExperimentalWarning to stderr is expected.)

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { strict as assert } from "node:assert";
import { assembleBriefing } from "../functions/_lib/briefing.js";
import {
  compareAndSet,
  writeAudit,
  pickFields,
  BRIEFING_ITEM_FIELDS,
  BRIEFING_EDITABLE_SECTIONS,
} from "../functions/_lib/writes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const read = (p) => readFileSync(resolve(repoRoot, p), "utf8");

// --- Minimal D1-compatible shim over node:sqlite (mirrors verify-writes.mjs) -------
function d1(db) {
  return {
    prepare(sql) {
      const stmt = db.prepare(sql);
      let args = [];
      const api = {
        bind(...a) { args = a; return api; },
        run() {
          const info = stmt.run(...args);
          return { success: true, meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) }, results: [] };
        },
        first() { const row = stmt.get(...args); return row === undefined ? null : row; },
        all() { return { success: true, results: stmt.all(...args), meta: {} }; },
      };
      return api;
    },
  };
}

const raw = new DatabaseSync(":memory:");
for (const m of [
  "0001_init.sql", "0002_indexes.sql", "0003_seed.sql", "0004_audit_indexes.sql",
  "0005_briefing_init.sql", "0006_briefing_indexes.sql", "0007_briefing_seed.sql",
  "0008_briefing_columns.sql", "0009_briefing_reseed.sql", "0010_briefing_reseed.sql",
]) raw.exec(read(`migrations/${m}`));
const db = d1(raw);

const OWNER = "adamb@k12sta.com";
const OTHER = "someoneelse@k12sta.com";

const auditCount = (entityType, entityId) =>
  raw.prepare(`SELECT COUNT(*) AS n FROM audit WHERE entity_type = ? AND entity_id = ?`).get(entityType, entityId).n;

// Owner-scoped before-read, exactly as the handler does it.
const ownedBefore = (id, owner) =>
  raw.prepare(`SELECT * FROM briefing_items WHERE id = ? AND owner_email = ? AND deleted_at IS NULL`).get(id, owner) ?? null;

// Re-run the /api/briefing/me assembly (live, owner-scoped) to prove soft-delete /
// reclassify are reflected in what the tab fetches.
function assembleNow(owner = OWNER) {
  const items = raw
    .prepare(
      `SELECT id, section, text, meta, item_date, project, owner, status_label, status_class,
              context, done, done_at, source, sort, version
         FROM briefing_items WHERE owner_email = ? AND deleted_at IS NULL ORDER BY section, sort, id`
    )
    .all(owner);
  return assembleBriefing({ owner, state: null, items, refs: [] });
}
const sectionOf = (payload, id) => {
  for (const [key, arr] of Object.entries(payload.sections)) {
    if (arr.some((r) => r.id === id)) return key;
  }
  return null;
};

let failures = 0;
const check = async (name, fn) => {
  try { await fn(); console.log(`  PASS  ${name}`); }
  catch (e) {
    failures += 1;
    console.log(`  FAIL  ${name}`);
    console.log(String(e.message).split("\n").slice(0, 12).map((l) => "        " + l).join("\n"));
  }
};

console.log("STA My Day - PB2b briefing write-contract verification\n");

// Pull a couple of adamb's seeded rows to operate on.
const pendingRow = raw.prepare(`SELECT * FROM briefing_items WHERE owner_email=? AND section='pending' ORDER BY id LIMIT 1`).get(OWNER);
const waitingRow = raw.prepare(`SELECT * FROM briefing_items WHERE owner_email=? AND section='waiting_on' ORDER BY id LIMIT 1`).get(OWNER);
assert.ok(pendingRow && waitingRow, "seed has pending + waiting_on rows for adamb");

// (a) correct expected_version + matching owner -> bump + one audit row -------------
await check("(a) owned PATCH with correct version bumps version + audits once", async () => {
  const id = pendingRow.id;
  const before = ownedBefore(id, OWNER);
  assert.ok(before, "owned before-read returns the row");
  const res = await compareAndSet(db, {
    table: "briefing_items", id, fields: { text: "Edited by PB2b test", done: 1 },
    expectedVersion: before.version, updatedBy: OWNER,
    ownerScope: { column: "owner_email", value: OWNER },
  });
  assert.equal(res.ok, true, "ok");
  assert.equal(res.current.version, before.version + 1, "version +1");
  assert.equal(res.current.text, "Edited by PB2b test", "field applied");
  assert.equal(res.current.done, 1, "done coerced/applied");
  await writeAudit(db, { entityType: "briefing_item", entityId: id, action: "update", user: { email: OWNER, kind: "human", agent_name: null }, before, after: res.current });
  assert.equal(auditCount("briefing_item", id), 1, "exactly one audit row");
  const a = raw.prepare(`SELECT * FROM audit WHERE entity_type='briefing_item' AND entity_id=?`).get(id);
  assert.equal(a.actor_email, OWNER, "actor_email from identity");
  assert.equal(a.actor_kind, "human", "actor_kind human");
});

// (b) cross-owner write -> 404 (read null) + no change + NO audit -------------------
await check("(b) cross-owner write reads 404 and writes NO audit", async () => {
  const id = waitingRow.id;
  // The handler's owner-scoped before-read with the WRONG owner must be null -> 404.
  assert.equal(ownedBefore(id, OTHER), null, "before-read is null for a non-owner");
  // Defense in depth: the owner-scoped compareAndSet with the wrong owner changes nothing.
  const res = await compareAndSet(db, {
    table: "briefing_items", id, fields: { text: "HACK by other owner" },
    expectedVersion: waitingRow.version, updatedBy: OTHER,
    ownerScope: { column: "owner_email", value: OTHER },
  });
  assert.equal(res.ok, false, "not ok");
  assert.equal(res.current, null, "owner-scoped re-read is null -> 404, no existence leak");
  // The row is untouched and (since the handler 404s before writeAudit) no audit row exists.
  const still = raw.prepare(`SELECT text, version FROM briefing_items WHERE id=?`).get(id);
  assert.equal(still.version, waitingRow.version, "version unchanged");
  assert.notEqual(still.text, "HACK by other owner", "text unchanged");
  assert.equal(auditCount("briefing_item", id), 0, "no audit row for the rejected cross-owner write");
});

// (c) stale expected_version (correct owner) -> 409, no change, no audit -------------
await check("(c) stale expected_version -> 409 (live row), no change, no audit", async () => {
  const id = waitingRow.id;
  const res = await compareAndSet(db, {
    table: "briefing_items", id, fields: { text: "stale edit" },
    expectedVersion: waitingRow.version - 1, updatedBy: OWNER,
    ownerScope: { column: "owner_email", value: OWNER },
  });
  assert.equal(res.ok, false, "not ok");
  assert.ok(res.current, "live row returned for the 409 reconcile");
  assert.equal(res.current.version, waitingRow.version, "current_version is the live version");
  assert.equal(auditCount("briefing_item", id), 0, "no audit row on a stale-version conflict");
});

// (d) soft-delete drops the row from the /api/briefing/me assembly ------------------
await check("(d) soft-delete hides the row from the GET assembly", async () => {
  const id = pendingRow.id;
  const live = raw.prepare(`SELECT version FROM briefing_items WHERE id=?`).get(id);
  assert.ok(sectionOf(assembleNow(), id), "row present before delete");
  const res = await compareAndSet(db, {
    table: "briefing_items", id, fields: { deleted_at: new Date().toISOString() },
    expectedVersion: live.version, updatedBy: OWNER,
    ownerScope: { column: "owner_email", value: OWNER },
  });
  assert.equal(res.ok, true, "soft-delete applied");
  assert.equal(sectionOf(assembleNow(), id), null, "row gone from the assembly after soft-delete");
});

// (e) reclassify moves the item between sections -----------------------------------
await check("(e) reclassify moves the item's section", async () => {
  const id = waitingRow.id;
  assert.equal(sectionOf(assembleNow(), id), "waitingOn", "starts in waitingOn");
  const live = raw.prepare(`SELECT version FROM briefing_items WHERE id=?`).get(id);
  // mirror the handler's section guard
  assert.ok(BRIEFING_EDITABLE_SECTIONS.includes("carryover"), "carryover is an editable target");
  const res = await compareAndSet(db, {
    table: "briefing_items", id, fields: { section: "carryover" },
    expectedVersion: live.version, updatedBy: OWNER,
    ownerScope: { column: "owner_email", value: OWNER },
  });
  assert.equal(res.ok, true, "reclassify applied");
  assert.equal(sectionOf(assembleNow(), id), "carryover", "now in carryover");
});

// pickFields guard: unknown/structural keys are rejected ----------------------------
await check("(f) pickFields rejects non-whitelisted keys (e.g. owner_email, id)", async () => {
  const { fields, rejected } = pickFields(
    { text: "ok", owner_email: "evil@x.com", id: 99, expected_version: 3 }, BRIEFING_ITEM_FIELDS
  );
  assert.deepEqual(Object.keys(fields), ["text"], "only whitelisted field kept");
  assert.ok(rejected.includes("owner_email") && rejected.includes("id"), "structural keys rejected");
});

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILED"}\n`);
process.exit(failures === 0 ? 0 : 1);
