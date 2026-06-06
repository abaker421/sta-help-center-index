// functions/api/projects/[id]/items.ts
// POST /api/projects/:id/items - append an open item to a project (member ok).
// Appends are inserts: no version, no conflict (KB module-04). Still host-gated and
// audited (action 'create'). The parent project must exist and be live.

import { json, error } from "../../../_lib/http.js";
import { requireWriteHost, writeAudit } from "../../../_lib/writes.js";

export const onRequestPost: PagesFunction = async ({ request, env, params, data }) => {
  const user = (data as any).user;

  const hostGate = requireWriteHost(request, env);
  if (hostGate) return hostGate;

  const projectId = Number(params.id);
  if (!Number.isInteger(projectId)) return error("invalid id", 400);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return error("invalid JSON body", 400);
  }

  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return error("text required", 422);

  try {
    const parent = await env.DB
      .prepare(`SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL`)
      .bind(projectId)
      .first();
    if (!parent) return error("not found", 404);

    const row = await env.DB.prepare(
      `INSERT INTO open_items (project_id, text, stage, stage_class, meta, done, sort, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`
    )
      .bind(
        projectId,
        text,
        body?.stage ?? null,
        body?.stage_class ?? null,
        typeof body?.meta === "string" ? body.meta : "",
        body?.done ? 1 : 0,
        Number.isInteger(body?.sort) ? body.sort : 0,
        user.email
      )
      .first();

    await writeAudit(env.DB, {
      entityType: "open_item",
      entityId: (row as any).id,
      action: "create",
      user,
      before: null,
      after: row,
    });

    return json(row, 201);
  } catch (e) {
    console.error("POST /api/projects/:id/items failed:", e);
    return error("failed to add item", 500);
  }
};
