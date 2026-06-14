// functions/api/briefing/items/[id].ts
//   PATCH  /api/briefing/items/:id  - edit a briefing item (text / item_date / project /
//                                     owner / status_label / status_class / context /
//                                     sort / done / section[reclassify]).
//   DELETE /api/briefing/items/:id  - soft-delete a briefing item.
//
// PB2b HUMAN write path. Mirrors functions/api/items/[id].ts (the project pattern)
// EXACTLY, plus the one new rule: OWNER-SCOPING. Briefing rows are private per user,
// so `owner_email` (from the validated JWT, never the client) is in the SQL of both
// the `before` read and the conditional UPDATE - a row owned by someone else reads as
// 404 (indistinguishable from missing) and a cross-user write is impossible (no TOCTOU).
//
// NOT role-gated: a user edits only their OWN briefing, so there is no admin/member
// split here. Host-gate + requireDelegatedOperator stay (PB3 agents still need a
// delegated operator). Write contract: host-gate -> op-gate -> owner-scoped before
// read -> owner-scoped compare-and-set on expected_version -> one audit row -> new
// state or 409.

import { json, error } from "../../../_lib/http.js";
import {
  requireWriteHost,
  requireDelegatedOperator,
  compareAndSet,
  writeAudit,
  pickFields,
  BRIEFING_ITEM_FIELDS,
  BRIEFING_EDITABLE_SECTIONS,
} from "../../../_lib/writes.js";

// `done` is stored 0/1; `sort` is an integer. Coerce client-supplied values, and
// stamp `done_at` SERVER-SIDE on a completion toggle (never trusted from the client):
// completing sets today's date, restoring clears it. done_at is not in the client
// whitelist, so this is the only path that can set it.
function coerce(fields: Record<string, any>) {
  if ("done" in fields) {
    fields.done = fields.done ? 1 : 0;
    fields.done_at = fields.done ? new Date().toISOString().slice(0, 10) : null;
  }
  if ("sort" in fields) fields.sort = Number.isInteger(fields.sort) ? fields.sort : 0;
  return fields;
}

export const onRequestPatch: PagesFunction = async ({ request, env, params, data }) => {
  const user = (data as any).user;

  const hostGate = requireWriteHost(request, env);
  if (hostGate) return hostGate;
  const opGate = requireDelegatedOperator(user);
  if (opGate) return opGate;

  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("invalid id", 400);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return error("invalid JSON body", 400);
  }

  const expectedVersion = body?.expected_version;
  if (!Number.isInteger(expectedVersion)) return error("expected_version required", 422);

  const { fields, rejected } = pickFields(body, BRIEFING_ITEM_FIELDS);
  if (rejected.length) return error(`unknown field(s): ${rejected.join(", ")}`, 422);
  if (Object.keys(fields).length === 0) return error("no editable fields provided", 422);
  // Reclassify is allowed only into an editable section (a bad value would also hit
  // the DB CHECK, but reject early with a clean 422).
  if ("section" in fields && !BRIEFING_EDITABLE_SECTIONS.includes(fields.section)) {
    return error(`section must be one of: ${BRIEFING_EDITABLE_SECTIONS.join(", ")}`, 422);
  }
  coerce(fields);

  try {
    // Owner-scoped before-read: a row that is not the requester's reads as 404.
    const before = await env.DB
      .prepare(`SELECT * FROM briefing_items WHERE id = ? AND owner_email = ? AND deleted_at IS NULL`)
      .bind(id, user.email)
      .first();
    if (!before) return error("not found", 404);

    const res = await compareAndSet(env.DB, {
      table: "briefing_items",
      id,
      fields,
      expectedVersion,
      updatedBy: user.email,
      ownerScope: { column: "owner_email", value: user.email },
    });

    if (!res.ok) {
      if (!res.current) return error("not found", 404);
      return error("version conflict", 409, {
        expected_version: expectedVersion,
        current_version: (res.current as any).version,
        current: res.current,
      });
    }

    await writeAudit(env.DB, {
      entityType: "briefing_item",
      entityId: id,
      action: "update",
      user,
      before,
      after: res.current,
    });

    return json(res.current);
  } catch (e) {
    console.error("PATCH /api/briefing/items/:id failed:", e);
    return error("failed to update briefing item", 500);
  }
};

export const onRequestDelete: PagesFunction = async ({ request, env, params, data }) => {
  const user = (data as any).user;

  const hostGate = requireWriteHost(request, env);
  if (hostGate) return hostGate;
  const opGate = requireDelegatedOperator(user);
  if (opGate) return opGate;

  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("invalid id", 400);

  let expectedVersion: any;
  try {
    const body = await request.json();
    expectedVersion = body?.expected_version;
  } catch {
    const q = new URL(request.url).searchParams.get("expected_version");
    expectedVersion = q == null ? undefined : Number(q);
  }
  if (!Number.isInteger(expectedVersion)) return error("expected_version required", 422);

  try {
    const before = await env.DB
      .prepare(`SELECT * FROM briefing_items WHERE id = ? AND owner_email = ? AND deleted_at IS NULL`)
      .bind(id, user.email)
      .first();
    if (!before) return error("not found", 404);

    const res = await compareAndSet(env.DB, {
      table: "briefing_items",
      id,
      fields: { deleted_at: new Date().toISOString() },
      expectedVersion,
      updatedBy: user.email,
      ownerScope: { column: "owner_email", value: user.email },
    });

    if (!res.ok) {
      if (!res.current) return error("not found", 404);
      return error("version conflict", 409, {
        expected_version: expectedVersion,
        current_version: (res.current as any).version,
        current: res.current,
      });
    }

    await writeAudit(env.DB, {
      entityType: "briefing_item",
      entityId: id,
      action: "delete",
      user,
      before,
      after: res.current,
    });

    return json(res.current);
  } catch (e) {
    console.error("DELETE /api/briefing/items/:id failed:", e);
    return error("failed to delete briefing item", 500);
  }
};
