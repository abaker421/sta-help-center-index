// functions/api/briefing/proposals/:id/deny.ts
//   POST /api/briefing/proposals/:id/deny  - deny a pending proposal with a REQUIRED
//   reason. Nothing is added to the briefing; the proposal is marked 'denied' and the
//   reason is captured (the signal the PB3/Phase C learn-from-denials loop will later
//   consume - PB2c only stores it).
//
// Owner-scoped like approve: owner_email is ALWAYS the validated JWT email, in the SQL;
// a proposal not owned by the requester reads as 404. NOT role-gated. deny_reason is
// REQUIRED (422 if missing/empty). expected_version guards double-apply (compare-and-set).

import { json, error } from "../../../../_lib/http.js";
import { requireWriteHost, requireDelegatedOperator, compareAndSet, writeAudit } from "../../../../_lib/writes.js";

export const onRequestPost: PagesFunction = async ({ request, env, params, data }) => {
  const user = (data as any).user;

  const hostGate = requireWriteHost(request, env);
  if (hostGate) return hostGate;
  const opGate = requireDelegatedOperator(user);
  if (opGate) return opGate;

  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("invalid id", 400);

  let body: any;
  try { body = await request.json(); } catch { return error("invalid JSON body", 400); }

  const expectedVersion = body?.expected_version;
  if (!Number.isInteger(expectedVersion)) return error("expected_version required", 422);

  // deny_reason is REQUIRED - the whole point of a denial is the captured reason.
  const denyReason = typeof body?.deny_reason === "string" ? body.deny_reason.trim() : "";
  if (!denyReason) return error("deny_reason required", 422);

  const owner = user.email;
  const now = new Date().toISOString();

  try {
    // Owner-scoped read of the PENDING proposal: 404 if missing / not owned / not pending.
    const before = await env.DB
      .prepare(`SELECT * FROM briefing_proposals WHERE id = ? AND owner_email = ? AND status = 'pending' AND deleted_at IS NULL`)
      .bind(id, owner)
      .first();
    if (!before) return error("not found", 404);

    const res = await compareAndSet(env.DB, {
      table: "briefing_proposals",
      id,
      fields: { status: "denied", deny_reason: denyReason, decided_by: owner, decided_at: now },
      expectedVersion,
      updatedBy: owner,
      ownerScope: { column: "owner_email", value: owner },
    });

    if (!res.ok) {
      if (!res.current) return error("not found", 404);
      return error("version conflict", 409, {
        expected_version: expectedVersion,
        current_version: (res.current as any).version,
        current: res.current,
      });
    }

    // One audit row from the validated identity; the reason rides in after_json.
    await writeAudit(env.DB, {
      entityType: "briefing_proposal", entityId: id, action: "deny",
      user, before, after: res.current,
    });

    return json(res.current);
  } catch (e) {
    console.error("POST /api/briefing/proposals/:id/deny failed:", e);
    return error("failed to deny proposal", 500);
  }
};
