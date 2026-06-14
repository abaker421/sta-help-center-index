// functions/api/briefing/proposals/:id/approve.ts
//   POST /api/briefing/proposals/:id/approve  - approve a pending proposal: its content
//   becomes a real briefing_items row in target_section, and the proposal is marked
//   'approved'. Optional approve_note.
//
// PB2c. Owner-scoped exactly like the briefing item writes: owner_email is ALWAYS the
// validated JWT email, in the SQL of every read/write; a proposal not owned by the
// requester reads as 404 (no existence leak). NOT role-gated (a user decides on their
// own proposals).
//
// ATOMICITY: the item INSERT and the proposal UPDATE run in ONE D1 batch, BOTH guarded
// by the same `id + owner_email + status='pending' + version` predicate. Either both
// apply (the proposal was still pending at the expected version) or neither does
// (concurrent decision / version drift) - so there is never an orphan item without an
// approved proposal, and double-clicks can't double-insert. expected_version is required.

import { json, error } from "../../../../_lib/http.js";
import { requireWriteHost, requireDelegatedOperator, writeAudit } from "../../../../_lib/writes.js";

export const onRequestPost: PagesFunction = async ({ request, env, params, data }) => {
  const user = (data as any).user;

  const hostGate = requireWriteHost(request, env);
  if (hostGate) return hostGate;
  const opGate = requireDelegatedOperator(user);
  if (opGate) return opGate;

  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("invalid id", 400);

  let body: any = {};
  try { body = await request.json(); } catch { /* empty body allowed - approve_note is optional */ }

  const expectedVersion = body?.expected_version;
  if (!Number.isInteger(expectedVersion)) return error("expected_version required", 422);
  const approveNote = typeof body?.approve_note === "string" && body.approve_note.trim() !== ""
    ? body.approve_note.trim() : null;

  const owner = user.email;
  const now = new Date().toISOString();

  try {
    // Owner-scoped read of the PENDING proposal: 404 if missing / not owned / not pending.
    const before = await env.DB
      .prepare(`SELECT * FROM briefing_proposals WHERE id = ? AND owner_email = ? AND status = 'pending' AND deleted_at IS NULL`)
      .bind(id, owner)
      .first();
    if (!before) return error("not found", 404);

    // ONE batch, both statements share the pending+version+owner guard (atomic).
    const insertSql =
      `INSERT INTO briefing_items
         (owner_email, section, text, item_date, project, owner, status_label, status_class, context, source, updated_by)
       SELECT ?, target_section, proposed_text, item_date, project, owner_field, status_label, status_class, context,
              COALESCE(source, 'proposal-approved'), ?
         FROM briefing_proposals
        WHERE id = ? AND owner_email = ? AND status = 'pending' AND deleted_at IS NULL AND version = ?
      RETURNING *`;
    const updateSql =
      `UPDATE briefing_proposals
          SET status = 'approved', approve_note = ?, decided_by = ?, decided_at = ?,
              version = version + 1, updated_at = ?, updated_by = ?
        WHERE id = ? AND owner_email = ? AND status = 'pending' AND deleted_at IS NULL AND version = ?`;

    const [insRes, updRes] = await env.DB.batch([
      env.DB.prepare(insertSql).bind(owner, owner, id, owner, expectedVersion),
      env.DB.prepare(updateSql).bind(approveNote, owner, now, now, owner, id, owner, expectedVersion),
    ]);

    if ((updRes as any).meta.changes !== 1) {
      // Nothing applied (and, sharing the same WHERE, nothing was inserted either).
      // Disambiguate: gone/not-owned -> 404; still here but moved -> 409.
      const live = await env.DB
        .prepare(`SELECT * FROM briefing_proposals WHERE id = ? AND owner_email = ? AND deleted_at IS NULL`)
        .bind(id, owner)
        .first();
      if (!live) return error("not found", 404);
      return error("version conflict", 409, {
        expected_version: expectedVersion,
        current_version: (live as any).version,
        current: live,
      });
    }

    const item = (insRes as any).results?.[0] ?? null;
    const proposal = await env.DB.prepare(`SELECT * FROM briefing_proposals WHERE id = ?`).bind(id).first();

    // Two audit rows from the validated identity: the new item, and the decision.
    if (item) {
      await writeAudit(env.DB, {
        entityType: "briefing_item", entityId: (item as any).id, action: "create",
        user, before: null, after: item,
      });
    }
    await writeAudit(env.DB, {
      entityType: "briefing_proposal", entityId: id, action: "approve",
      user, before, after: proposal,
    });

    return json({ item, proposal });
  } catch (e) {
    console.error("POST /api/briefing/proposals/:id/approve failed:", e);
    return error("failed to approve proposal", 500);
  }
};
