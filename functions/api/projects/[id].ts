// functions/api/projects/[id].ts
//   GET    /api/projects/:id  - one live project + its children (read-before-write
//                              source for agents; B3a). 404 if missing/soft-deleted.
//   PATCH  /api/projects/:id  - edit project content (member ok); structural fields
//                              (group / sort) are admin-only (Decision 2).
//   DELETE /api/projects/:id  - soft-delete a project (ADMIN ONLY, structural).
//
// The writes follow the write contract (KB module-04): host-gate -> role-gate ->
// delegated-operator gate -> read `before` -> compare-and-set on expected_version ->
// on success write ONE audit row -> return new state, or 409 with current. No silent
// overwrite, ever.

import { json, error } from "../../_lib/http.js";
import { assembleProject } from "../../_lib/assemble.js";
import {
  requireWriteHost,
  requireRole,
  requireDelegatedOperator,
  compareAndSet,
  writeAudit,
  pickFields,
  PROJECT_CONTENT_FIELDS,
  PROJECT_STRUCTURE_FIELDS,
} from "../../_lib/writes.js";

const KNOWN_FIELDS = [...PROJECT_CONTENT_FIELDS, ...PROJECT_STRUCTURE_FIELDS];

// GET /api/projects/:id - one live project + its live open_items + stage_history +
// timeline, in the same per-project shape the collection emits (id + version on the
// project and each open_item). Gated by the middleware like every /api/* route, so
// any validated identity (human or agent, read-only) may read. 404 if the project is
// missing or soft-deleted.
export const onRequestGet: PagesFunction = async ({ env, params }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("invalid id", 400);

  try {
    const [proj, items, history, timeline] = await env.DB.batch([
      env.DB.prepare(
        `SELECT id, "group", name, status, status_class, stage, stage_class,
                statusline, what_it_is, next_step, sort, version, updated_at
           FROM projects
          WHERE id = ? AND deleted_at IS NULL`
      ).bind(id),
      env.DB.prepare(
        `SELECT id, project_id, text, stage, stage_class, meta, done, sort, version
           FROM open_items
          WHERE project_id = ? AND deleted_at IS NULL
          ORDER BY sort, id`
      ).bind(id),
      env.DB.prepare(
        `SELECT id, project_id, when_label, note
           FROM stage_history WHERE project_id = ? ORDER BY id`
      ).bind(id),
      env.DB.prepare(
        `SELECT id, project_id, when_label, note
           FROM timeline WHERE project_id = ? ORDER BY id`
      ).bind(id),
    ]);

    const project = proj.results[0];
    if (!project) return error("not found", 404);

    return json(
      assembleProject({
        project,
        items: items.results,
        history: history.results,
        timeline: timeline.results,
      })
    );
  } catch (e) {
    console.error("GET /api/projects/:id failed:", e);
    return error("failed to load project", 500);
  }
};

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

  // Members may edit content; only admin may touch structural fields.
  const allowed = user.role === "admin" ? KNOWN_FIELDS : PROJECT_CONTENT_FIELDS;
  const { fields, rejected } = pickFields(body, allowed);

  const unknown = rejected.filter((k) => !KNOWN_FIELDS.includes(k));
  if (unknown.length) return error(`unknown field(s): ${unknown.join(", ")}`, 422);
  if (rejected.length) {
    // The only remaining rejected keys are structural fields a member tried to set.
    return error("members cannot change project structure (admin only)", 403);
  }
  if (Object.keys(fields).length === 0) return error("no editable fields provided", 422);

  try {
    const before = await env.DB
      .prepare(`SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL`)
      .bind(id)
      .first();
    if (!before) return error("not found", 404);

    const res = await compareAndSet(env.DB, {
      table: "projects",
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
      entityType: "project",
      entityId: id,
      action: "update",
      user,
      before,
      after: res.current,
    });

    return json(res.current);
  } catch (e) {
    console.error("PATCH /api/projects/:id failed:", e);
    return error("failed to update project", 500);
  }
};

export const onRequestDelete: PagesFunction = async ({ request, env, params, data }) => {
  const user = (data as any).user;

  const hostGate = requireWriteHost(request, env);
  if (hostGate) return hostGate;
  // Deleting a project is structural - admin only (Decision 2).
  const roleGate = requireRole(user, "admin");
  if (roleGate) return roleGate;
  const opGate = requireDelegatedOperator(user);
  if (opGate) return opGate;

  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("invalid id", 400);

  // expected_version comes from a JSON body, or ?expected_version= as a fallback
  // (some clients omit DELETE bodies). Soft-delete is compare-and-set like any UPDATE.
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
      .prepare(`SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL`)
      .bind(id)
      .first();
    if (!before) return error("not found", 404);

    const res = await compareAndSet(env.DB, {
      table: "projects",
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
      entityType: "project",
      entityId: id,
      action: "delete",
      user,
      before,
      after: res.current,
    });

    return json(res.current);
  } catch (e) {
    console.error("DELETE /api/projects/:id failed:", e);
    return error("failed to delete project", 500);
  }
};
