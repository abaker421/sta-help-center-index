// functions/api/items/[id].ts
//   PATCH  /api/items/:id  - edit an open item (text / stage / stage_class / meta /
//                            done / sort). Member ok - editing content within a
//                            project is a member capability (Decision 2).
//   DELETE /api/items/:id  - soft-delete an open item (member ok).
//
// Write contract (KB module-04): host-gate -> read `before` -> compare-and-set on
// expected_version -> on success write ONE audit row -> return new state or 409.

import { json, error } from "../../_lib/http.js";
import {
  requireWriteHost,
  compareAndSet,
  writeAudit,
  pickFields,
  ITEM_FIELDS,
} from "../../_lib/writes.js";

// `done` is stored 0/1; accept a boolean or number from the client and coerce.
function coerce(fields: Record<string, any>) {
  if ("done" in fields) fields.done = fields.done ? 1 : 0;
  if ("sort" in fields) fields.sort = Number.isInteger(fields.sort) ? fields.sort : 0;
  return fields;
}

export const onRequestPatch: PagesFunction = async ({ request, env, params, data }) => {
  const user = (data as any).user;

  const hostGate = requireWriteHost(request, env);
  if (hostGate) return hostGate;

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

  const { fields, rejected } = pickFields(body, ITEM_FIELDS);
  if (rejected.length) return error(`unknown field(s): ${rejected.join(", ")}`, 422);
  if (Object.keys(fields).length === 0) return error("no editable fields provided", 422);
  coerce(fields);

  try {
    const before = await env.DB
      .prepare(`SELECT * FROM open_items WHERE id = ? AND deleted_at IS NULL`)
      .bind(id)
      .first();
    if (!before) return error("not found", 404);

    const res = await compareAndSet(env.DB, {
      table: "open_items",
      id,
      fields,
      expectedVersion,
      updatedBy: user.email,
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
      entityType: "open_item",
      entityId: id,
      action: "update",
      user,
      before,
      after: res.current,
    });

    return json(res.current);
  } catch (e) {
    console.error("PATCH /api/items/:id failed:", e);
    return error("failed to update item", 500);
  }
};

export const onRequestDelete: PagesFunction = async ({ request, env, params, data }) => {
  const user = (data as any).user;

  const hostGate = requireWriteHost(request, env);
  if (hostGate) return hostGate;

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
      .prepare(`SELECT * FROM open_items WHERE id = ? AND deleted_at IS NULL`)
      .bind(id)
      .first();
    if (!before) return error("not found", 404);

    const res = await compareAndSet(env.DB, {
      table: "open_items",
      id,
      fields: { deleted_at: new Date().toISOString() },
      expectedVersion,
      updatedBy: user.email,
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
      entityType: "open_item",
      entityId: id,
      action: "delete",
      user,
      before,
      after: res.current,
    });

    return json(res.current);
  } catch (e) {
    console.error("DELETE /api/items/:id failed:", e);
    return error("failed to delete item", 500);
  }
};
