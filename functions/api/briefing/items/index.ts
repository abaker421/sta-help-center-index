// functions/api/briefing/items/index.ts
//   POST /api/briefing/items  - add a briefing item to one of the user's OWN sections.
//
// PB2b HUMAN write path (add). Owner is ALWAYS the validated JWT email, never the
// client body, so a user can only ever insert into their own briefing. `section` is
// required and must be in the editable set; mutable fields are whitelisted; `text`
// is required (NOT NULL). One audit row per insert, from the validated identity.
//
// POST lives in index.ts (the collection); per-item PATCH/DELETE are in [id].ts.

import { json, error } from "../../../_lib/http.js";
import {
  requireWriteHost,
  requireDelegatedOperator,
  writeAudit,
  pickFields,
  BRIEFING_ITEM_FIELDS,
  BRIEFING_EDITABLE_SECTIONS,
} from "../../../_lib/writes.js";

export const onRequestPost: PagesFunction = async ({ request, env, data }) => {
  const user = (data as any).user;

  const hostGate = requireWriteHost(request, env);
  if (hostGate) return hostGate;
  const opGate = requireDelegatedOperator(user);
  if (opGate) return opGate;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return error("invalid JSON body", 400);
  }

  const section = body?.section;
  if (!BRIEFING_EDITABLE_SECTIONS.includes(section)) {
    return error(`section must be one of: ${BRIEFING_EDITABLE_SECTIONS.join(", ")}`, 422);
  }

  // Whitelist the rest of the body; `section` is handled explicitly above, owner_email
  // is forced from the JWT, so drop both from the field set.
  const { fields, rejected } = pickFields(body, BRIEFING_ITEM_FIELDS);
  if (rejected.length) return error(`unknown field(s): ${rejected.join(", ")}`, 422);
  delete fields.section;

  const text = typeof fields.text === "string" ? fields.text.trim() : "";
  if (!text) return error("text required", 422);
  fields.text = text;

  if ("done" in fields) fields.done = fields.done ? 1 : 0;
  if ("sort" in fields) fields.sort = Number.isInteger(fields.sort) ? fields.sort : 0;

  // Build the INSERT from forced + whitelisted-present columns only.
  const cols = ["owner_email", "section", "source", "updated_by"];
  const vals: any[] = [user.email, section, "manual", user.email];
  for (const f of BRIEFING_ITEM_FIELDS) {
    if (f === "section") continue;
    if (f in fields) { cols.push(f); vals.push(fields[f]); }
  }

  try {
    const placeholders = cols.map(() => "?").join(", ");
    const quoted = cols.map((c) => `"${c}"`).join(", ");
    const row = await env.DB
      .prepare(`INSERT INTO briefing_items (${quoted}) VALUES (${placeholders}) RETURNING *`)
      .bind(...vals)
      .first();

    await writeAudit(env.DB, {
      entityType: "briefing_item",
      entityId: (row as any).id,
      action: "create",
      user,
      before: null,
      after: row,
    });

    return json(row, 201);
  } catch (e) {
    console.error("POST /api/briefing/items failed:", e);
    return error("failed to add briefing item", 500);
  }
};
