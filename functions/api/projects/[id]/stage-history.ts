// functions/api/projects/[id]/stage-history.ts
// POST /api/projects/:id/stage-history - append a stage-history entry (member ok).
// Append-only insert: no version, no conflict (KB module-04). Host-gated + audited.

import { json, error } from "../../../_lib/http.js";
import { requireWriteHost, requireDelegatedOperator, writeAudit } from "../../../_lib/writes.js";

export const onRequestPost: PagesFunction = async ({ request, env, params, data }) => {
  const user = (data as any).user;

  const hostGate = requireWriteHost(request, env);
  if (hostGate) return hostGate;
  const opGate = requireDelegatedOperator(user);
  if (opGate) return opGate;

  const projectId = Number(params.id);
  if (!Number.isInteger(projectId)) return error("invalid id", 400);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return error("invalid JSON body", 400);
  }

  const whenLabel = typeof body?.when_label === "string" ? body.when_label.trim() : "";
  const note = typeof body?.note === "string" ? body.note.trim() : "";
  if (!whenLabel) return error("when_label required", 422);
  if (!note) return error("note required", 422);

  try {
    const parent = await env.DB
      .prepare(`SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL`)
      .bind(projectId)
      .first();
    if (!parent) return error("not found", 404);

    const row = await env.DB.prepare(
      `INSERT INTO stage_history (project_id, when_label, note, created_by)
       VALUES (?, ?, ?, ?)
       RETURNING *`
    )
      .bind(projectId, whenLabel, note, user.email)
      .first();

    await writeAudit(env.DB, {
      entityType: "stage_history",
      entityId: (row as any).id,
      action: "create",
      user,
      before: null,
      after: row,
    });

    return json(row, 201);
  } catch (e) {
    console.error("POST /api/projects/:id/stage-history failed:", e);
    return error("failed to add stage-history entry", 500);
  }
};
