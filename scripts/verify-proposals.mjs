// scripts/verify-proposals.mjs
// Offline verification of the PB2c proposal-queue contract WITHOUT workerd or a remote
// DB. Applies migrations 0001-0012 to a fresh in-memory SQLite (Node 24 node:sqlite),
// then drives the SAME SQL the approve.ts batch uses + the shipped compareAndSet (deny)
// through a D1-compatible shim:
//
//   (a) APPROVE (correct owner+version): inserts exactly ONE briefing_items row into the
//       proposal's target_section AND flips the proposal to 'approved' (version + 1) - atomic;
//   (b) APPROVE stale version: nothing inserted, proposal unchanged (the shared WHERE guard);
//   (c) APPROVE cross-owner: nothing inserted, proposal unchanged (owner predicate);
//   (d) DENY (correct owner+version via compareAndSet): flips to 'denied' with the reason, version + 1;
//   (e) DENY stale version -> changes 0, live row returned (409), unchanged;
//   (f) DENY cross-owner -> owner-scoped re-read null (404).
//
// Run:  node scripts/verify-proposals.mjs
// (node:sqlite is experimental; an ExperimentalWarning to stderr is expected.)

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { strict as assert } from "node:assert";
import { compareAndSet } from "../functions/_lib/writes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const read = (p) => readFileSync(resolve(repoRoot, p), "utf8");

function d1(db) {
  return {
    prepare(sql) {
      const stmt = db.prepare(sql);
      let args = [];
      const api = {
        bind(...a) { args = a; return api; },
        run() { const i = stmt.run(...args); return { success: true, meta: { changes: i.changes, last_row_id: Number(i.lastInsertRowid) }, results: [] }; },
        first() { const r = stmt.get(...args); return r === undefined ? null : r; },
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
  "0011_briefing_proposals.sql", "0012_briefing_proposals_seed.sql",
]) raw.exec(read(`migrations/${m}`));
const db = d1(raw);

const OWNER = "adamb@k12sta.com";
const OTHER = "someoneelse@k12sta.com";

// Mirror of the approve.ts batch SQL (kept in sync with the handler).
const INSERT_SQL =
  `INSERT INTO briefing_items
     (owner_email, section, text, item_date, project, owner, status_label, status_class, context, source, updated_by)
   SELECT ?, target_section, proposed_text, item_date, project, owner_field, status_label, status_class, context,
          COALESCE(source, 'proposal-approved'), ?
     FROM briefing_proposals
    WHERE id = ? AND owner_email = ? AND status = 'pending' AND deleted_at IS NULL AND version = ?`;
const UPDATE_SQL =
  `UPDATE briefing_proposals SET status = 'approved', approve_note = ?, decided_by = ?, decided_at = ?,
          version = version + 1, updated_at = ?, updated_by = ?
    WHERE id = ? AND owner_email = ? AND status = 'pending' AND deleted_at IS NULL AND version = ?`;
const approveBatch = (id, owner, expectedVersion) => {
  const now = "2026-06-14T00:00:00.000Z";
  const ins = raw.prepare(INSERT_SQL).run(owner, owner, id, owner, expectedVersion);
  const upd = raw.prepare(UPDATE_SQL).run(null, owner, now, now, owner, id, owner, expectedVersion);
  return { inserted: ins.changes, updated: upd.changes };
};
const itemCount = (section, text) =>
  raw.prepare(`SELECT COUNT(*) n FROM briefing_items WHERE section=? AND text=? AND owner_email=?`).get(section, text, OWNER).n;
const prop = (id) => raw.prepare(`SELECT * FROM briefing_proposals WHERE id=?`).get(id);

let failures = 0;
const check = async (name, fn) => {
  try { await fn(); console.log(`  PASS  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL  ${name}`); console.log(String(e.message).split("\n").slice(0, 12).map((l) => "        " + l).join("\n")); }
};

console.log("STA My Day - PB2c proposal-queue contract verification\n");

// (a) approve happy path: proposal 1 -> waiting_on item, proposal approved -----------
await check("(a) approve inserts ONE item in target_section + flips proposal to approved", async () => {
  const p = prop(1);
  assert.equal(p.status, "pending", "starts pending");
  const r = approveBatch(1, OWNER, p.version);
  assert.equal(r.inserted, 1, "exactly one item inserted");
  assert.equal(r.updated, 1, "proposal updated once");
  assert.equal(itemCount(p.target_section, p.proposed_text), 1, "item present in target_section");
  const after = prop(1);
  assert.equal(after.status, "approved", "proposal approved");
  assert.equal(after.version, p.version + 1, "version +1");
});

// (b) approve with STALE version: atomic no-op (nothing inserted, proposal unchanged) -
await check("(b) approve with stale version inserts nothing and does not flip", async () => {
  const p = prop(2);
  const r = approveBatch(2, OWNER, p.version - 1); // stale
  assert.equal(r.inserted, 0, "nothing inserted");
  assert.equal(r.updated, 0, "proposal not flipped");
  assert.equal(prop(2).status, "pending", "still pending");
  assert.equal(itemCount(p.target_section, p.proposed_text), 0, "no orphan item");
});

// (c) approve CROSS-OWNER: owner predicate blocks it (atomic no-op) -------------------
await check("(c) cross-owner approve inserts nothing and does not flip", async () => {
  const p = prop(2);
  const r = approveBatch(2, OTHER, p.version); // wrong owner
  assert.equal(r.inserted, 0, "nothing inserted for non-owner");
  assert.equal(r.updated, 0, "proposal not flipped for non-owner");
  assert.equal(prop(2).status, "pending", "still pending");
});

// (d) deny via the shipped compareAndSet (correct owner+version) ----------------------
await check("(d) deny flips to denied with reason + version bump (compareAndSet)", async () => {
  const p = prop(3);
  const res = await compareAndSet(db, {
    table: "briefing_proposals", id: 3,
    fields: { status: "denied", deny_reason: "not a real ask", decided_by: OWNER, decided_at: "2026-06-14T00:00:00.000Z" },
    expectedVersion: p.version, updatedBy: OWNER, ownerScope: { column: "owner_email", value: OWNER },
  });
  assert.equal(res.ok, true, "ok");
  assert.equal(res.current.status, "denied", "denied");
  assert.equal(res.current.deny_reason, "not a real ask", "reason captured");
  assert.equal(res.current.version, p.version + 1, "version +1");
});

// (e) deny stale version -> 409 (live row), unchanged --------------------------------
await check("(e) deny with stale version -> changes 0, live row (409), unchanged", async () => {
  const p = prop(4);
  const res = await compareAndSet(db, {
    table: "briefing_proposals", id: 4, fields: { status: "denied", deny_reason: "x" },
    expectedVersion: p.version - 1, updatedBy: OWNER, ownerScope: { column: "owner_email", value: OWNER },
  });
  assert.equal(res.ok, false, "not ok");
  assert.ok(res.current, "live row returned");
  assert.equal(res.current.version, p.version, "version unchanged");
  assert.equal(prop(4).status, "pending", "still pending");
});

// (f) deny cross-owner -> owner-scoped re-read null (404) -----------------------------
await check("(f) cross-owner deny -> 404 (owner-scoped re-read null)", async () => {
  const p = prop(4);
  const res = await compareAndSet(db, {
    table: "briefing_proposals", id: 4, fields: { status: "denied", deny_reason: "hack" },
    expectedVersion: p.version, updatedBy: OTHER, ownerScope: { column: "owner_email", value: OTHER },
  });
  assert.equal(res.ok, false, "not ok");
  assert.equal(res.current, null, "owner-scoped re-read null -> 404");
  assert.equal(prop(4).status, "pending", "untouched");
});

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILED"}\n`);
process.exit(failures === 0 ? 0 : 1);
