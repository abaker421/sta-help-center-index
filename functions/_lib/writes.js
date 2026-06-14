// functions/_lib/writes.js
// The write contract (KB module-04), implemented once and reused by every mutating
// handler so it holds identically for humans now and agents in B3:
//   1. host-gate  - only the canonical production host (or local dev) may mutate.
//   2. role-gate  - admin-only operations rejected for members, server-side.
//   3. compareAndSet - optimistic concurrency: conditional UPDATE on expected_version.
//   4. writeAudit - one audit row per CONFIRMED mutation, from the VALIDATED identity.
//
// Dependency-free ESM (Web Crypto / Workers runtime only), mirroring _lib/http.js,
// so the Functions bundle resolves with no npm install (the hub is a no-build deploy).

import { error } from "./http.js";

// ---------------------------------------------------------------------------
// 1. Host-gate (Decision 1 - preview-DB isolation)
// ---------------------------------------------------------------------------
// The Pages binding namespace is flat: preview/alias deploys share the prod `DB`
// binding. Reads are Access-gated; writes are additionally HOST-gated so only the
// canonical production host can mutate `sta-tracker`. Preview deploys are therefore
// structurally read-only regardless of which DB the binding points at.
//
// EXTEND HERE when the hub moves to a custom domain - add that host in the SAME
// change that cuts the domain over (logged in backlog.md / b1-deploy-checklist).
export const CANONICAL_WRITE_HOSTS = ["sta-help-center-index.pages.dev"];

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Allow a write only from a canonical production host, or - under LOCAL_DEV - from
 * a loopback host (`wrangler pages dev`). Scoping the LOCAL_DEV bypass to loopback
 * (rather than bypassing the gate wholesale) keeps the host-gate exercisable locally:
 * a request carrying a non-loopback Host header still 403s, so STEP 4 can prove it.
 * @returns {Response|null} 403 Response if disallowed, else null (allowed).
 */
export function requireWriteHost(request, env) {
  const host = new URL(request.url).hostname;
  if (CANONICAL_WRITE_HOSTS.includes(host)) return null;
  if (env.LOCAL_DEV === "1" && LOOPBACK_HOSTS.has(host)) return null;
  return error("writes disabled on this host", 403);
}

// ---------------------------------------------------------------------------
// 2. Role-gate (Decision 2 - capability matrix; KB module-03)
// ---------------------------------------------------------------------------
// Role comes ONLY from context.data.user (the validated Access JWT), never a client
// field. Members edit content inside a project; only admin changes the set/shape of
// projects (create / delete project, change group / cross-project sort).
/** @returns {Response|null} 403 if the identity lacks the needed role, else null. */
export function requireRole(user, need) {
  if (need === "admin" && user.role !== "admin") return error("forbidden", 403);
  return null;
}

// ---------------------------------------------------------------------------
// 2b. Delegated-operator gate (B3a; KB module-05 bounded delegation)
// ---------------------------------------------------------------------------
// Every write must be attributable to a real person (module-04 audit contract).
// A service-token request with no delegated operator resolves to an operator-less
// agent (email still 'service:<common_name>'); such an agent may READ but must not
// WRITE. Humans and properly-delegated agents (real operator email) pass. Call this
// in every write handler after the host-gate and role-gate.
/** @returns {Response|null} 403 if an operator-less agent, else null. */
export function requireDelegatedOperator(user) {
  if (user.kind === "agent" && typeof user.email === "string" && user.email.startsWith("service:")) {
    return error("agent write requires a delegated operator", 403);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Mutable-field whitelists (Decision 2). Anything not listed is rejected so a
// client (or a member) cannot smuggle a structural or unknown column into an UPDATE.
// ---------------------------------------------------------------------------
export const PROJECT_CONTENT_FIELDS = [
  "status", "status_class", "stage", "stage_class", "statusline", "what_it_is", "next_step",
];
// Structural fields - admin only (change the shape/placement of projects).
export const PROJECT_STRUCTURE_FIELDS = ["group", "sort"];
export const ITEM_FIELDS = ["text", "stage", "stage_class", "meta", "done", "sort"];

// Briefing items (PB2b). Owner-scoped, private-per-user rows. `section` is included
// so reclassify (move an item between sections) goes through the same whitelist;
// anything not listed is rejected. NOTE: there is no admin/member split on a user's
// OWN briefing - these endpoints drop requireRole and gate on owner_email instead.
export const BRIEFING_ITEM_FIELDS = [
  "text", "item_date", "project", "owner", "status_label", "status_class", "context", "sort", "done", "section",
  // PB2b.1: meta carries the optional completion note as JSON ({"done_note":"..."}).
  // done_at is NOT whitelisted - the PATCH handler stamps it server-side on completion.
  "meta",
];
// Sections a human may add to / reclassify into. Mirrors the DB CHECK on
// briefing_items.section minus `completed` (reached via the done flag, not the
// section dropdown). `needs_attention` is intentionally absent: it is a derived
// alert strip (briefing_state JSON), not a briefing_items section - making it an
// editable row would need a schema+data migration this phase deliberately avoids.
export const BRIEFING_EDITABLE_SECTIONS = ["carryover", "pending", "waiting_on", "customer_situation"];

const CONTROL_KEYS = new Set(["expected_version"]);

/**
 * Split a request body's keys against an `allowed` whitelist.
 * @returns {{fields:Object, rejected:string[]}} fields = allowed+present (whitelisted);
 *   rejected = present keys that are NOT allowed and NOT control keys.
 */
export function pickFields(body, allowed) {
  const fields = {};
  const rejected = [];
  for (const [k, v] of Object.entries(body || {})) {
    if (CONTROL_KEYS.has(k)) continue;
    if (allowed.includes(k)) fields[k] = v;
    else rejected.push(k);
  }
  return { fields, rejected };
}

// ---------------------------------------------------------------------------
// 3. compareAndSet (KB module-04 - optimistic concurrency)
// ---------------------------------------------------------------------------
/**
 * Conditional UPDATE on expected_version. Builds:
 *   UPDATE <table> SET <fields...>, version = version + 1, updated_at = ?, updated_by = ?
 *    WHERE id = ? AND deleted_at IS NULL AND version = ?
 * and inspects meta.changes (D1 return-object semantics):
 *   - changes === 1  -> { ok:true,  changes:1, current:<new row> }       (applied)
 *   - changes === 0  -> re-read the live row to disambiguate:
 *       row exists   -> { ok:false, changes:0, current:<live row> }      (409: stale version)
 *       row gone     -> { ok:false, changes:0, current:null }            (404: missing/deleted)
 *
 * ownerScope (PB2b, optional): {column, value} appended as `AND "<column>" = ?` to
 * BOTH the conditional UPDATE and the disambiguating re-read, so an owner-scoped write
 * is atomic (no TOCTOU) and a row owned by someone else reads as gone -> 404 (the
 * handler must NOT distinguish "not yours" from "missing", so existence does not leak).
 *
 * @param {object} db   D1Database (or a compatible shim in the offline harness)
 * @param {{table:string, id:number, fields:Object, expectedVersion:number, updatedBy:string, ownerScope?:{column:string,value:any}|null}} opts
 */
export async function compareAndSet(db, { table, id, fields, expectedVersion, updatedBy, ownerScope = null }) {
  const cols = Object.keys(fields);
  const setParts = cols.map((c) => `"${c}" = ?`);
  const now = new Date().toISOString();
  const ownerPred = ownerScope ? ` AND "${ownerScope.column}" = ?` : "";
  const sql =
    `UPDATE "${table}" SET ${setParts.length ? setParts.join(", ") + ", " : ""}` +
    `version = version + 1, updated_at = ?, updated_by = ? ` +
    `WHERE id = ? AND deleted_at IS NULL AND version = ?${ownerPred}`;
  const binds = [...cols.map((c) => fields[c]), now, updatedBy, id, expectedVersion];
  if (ownerScope) binds.push(ownerScope.value);

  const res = await db.prepare(sql).bind(...binds).run();
  if (res.meta.changes === 1) {
    // Re-read WITHOUT the deleted_at filter so a soft-delete still returns the
    // (now-deleted) row for the audit after-snapshot. (id is the PK; the UPDATE only
    // applied because the owner predicate already matched, so id alone is safe here.)
    const current = await db.prepare(`SELECT * FROM "${table}" WHERE id = ?`).bind(id).first();
    return { ok: true, changes: 1, current };
  }
  // No row matched: version moved underneath us, the row is gone, OR it is not ours.
  // The re-read carries the SAME owner predicate, so a cross-owner row returns null
  // -> current:null -> the handler answers 404, never 409 (no existence leak).
  const liveSql = `SELECT * FROM "${table}" WHERE id = ? AND deleted_at IS NULL${ownerPred}`;
  const liveBinds = ownerScope ? [id, ownerScope.value] : [id];
  const live = await db.prepare(liveSql).bind(...liveBinds).first();
  return { ok: false, changes: 0, current: live || null };
}

// ---------------------------------------------------------------------------
// 4. writeAudit (KB module-04 - attribution trail)
// ---------------------------------------------------------------------------
/**
 * Insert exactly one audit row from the VALIDATED identity (context.data.user) -
 * never from the request body. Call ONLY after a confirmed changes === 1 (or a
 * confirmed insert) so a no-op conditional UPDATE never records a phantom audit row
 * (the read-confirm-then-write sequence, module-04).
 *
 * @param {object} db
 * @param {{entityType:string, entityId:number, action:string, user:{email:string,kind:string,agent_name?:string|null}, before:any, after:any}} opts
 */
export async function writeAudit(db, { entityType, entityId, action, user, before, after }) {
  await db
    .prepare(
      `INSERT INTO audit
         (entity_type, entity_id, action, actor_email, actor_kind, agent_name, before_json, after_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      entityType,
      entityId,
      action,
      user.email,
      user.kind,
      user.agent_name ?? null,
      before == null ? null : JSON.stringify(before),
      after == null ? null : JSON.stringify(after)
    )
    .run();
}
