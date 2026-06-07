// functions/api/projects.ts
// /api/projects collection endpoint.
//   GET  - the full tracker payload the Projects tab renders (Phase B1 read path).
//   POST - create a project (Phase B2; ADMIN ONLY - structural change, Decision 2).
//
// POST lives here (not in projects/index.ts) because both files would map to the
// same /api/projects route in Pages file-routing and collide; the collection's
// GET and POST belong in one file. Per-project writes are in projects/[id].ts.
//
// Gated by functions/api/_middleware.ts, so context.data.user is already set
// from the validated Access JWT by the time this runs.

import { json, error } from "../_lib/http.js";
import { assembleProjects } from "../_lib/assemble.js";
import { requireWriteHost, requireRole, requireDelegatedOperator, writeAudit } from "../_lib/writes.js";

export const onRequestGet: PagesFunction = async ({ env }) => {
  try {
    // One round trip: live projects + all their children, ordered for assembly.
    // Avoids N+1 (KB module-02). batch() returns results in input order.
    const [projects, items, history, timeline] = await env.DB.batch([
      env.DB.prepare(
        // B2: `version` added so the edit UI can send expected_version (compare-and-set).
        `SELECT id, "group", name, status, status_class, stage, stage_class,
                statusline, what_it_is, next_step, sort, version, updated_at
           FROM projects
          WHERE deleted_at IS NULL
          ORDER BY "group", sort`
      ),
      env.DB.prepare(
        // B2: `version` (compare-and-set) + `done` (so the edit UI's done checkbox
        // reflects persisted state, not just write-and-forget) added on open_items.
        `SELECT id, project_id, text, stage, stage_class, meta, done, sort, version
           FROM open_items
          WHERE deleted_at IS NULL
          ORDER BY project_id, sort, id`
      ),
      env.DB.prepare(
        `SELECT id, project_id, when_label, note
           FROM stage_history
          ORDER BY project_id, id`
      ),
      env.DB.prepare(
        `SELECT id, project_id, when_label, note
           FROM timeline
          ORDER BY project_id, id`
      ),
    ]);

    const payload = assembleProjects({
      projects: projects.results,
      items: items.results,
      history: history.results,
      timeline: timeline.results,
    });

    return json(payload);
  } catch (e) {
    // Never leak the raw exception to the client (KB module-02).
    console.error("GET /api/projects failed:", e);
    return error("failed to load projects", 500);
  }
};

// POST /api/projects - create a project (ADMIN ONLY). Creating structure is an
// admin operation (Decision 2); members edit content inside existing projects.
// Inserts a new row (no version / no conflict on create) and writes one audit row.
export const onRequestPost: PagesFunction = async ({ request, env, data }) => {
  const user = (data as any).user;

  const hostGate = requireWriteHost(request, env);
  if (hostGate) return hostGate;
  const roleGate = requireRole(user, "admin");
  if (roleGate) return roleGate;
  const opGate = requireDelegatedOperator(user);
  if (opGate) return opGate;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return error("invalid JSON body", 400);
  }

  const group = body?.group;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const status = typeof body?.status === "string" ? body.status.trim() : "";
  if (group !== "dev" && group !== "ops") return error("group must be 'dev' or 'ops'", 422);
  if (!name) return error("name required", 422);
  if (!status) return error("status required", 422);

  try {
    const row = await env.DB.prepare(
      `INSERT INTO projects
         ("group", name, status, status_class, stage, stage_class,
          statusline, what_it_is, next_step, sort, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`
    )
      .bind(
        group,
        name,
        status,
        body?.status_class ?? "info",
        body?.stage ?? null,
        body?.stage_class ?? null,
        body?.statusline ?? null,
        body?.what_it_is ?? null,
        body?.next_step ?? null,
        Number.isInteger(body?.sort) ? body.sort : 0,
        user.email
      )
      .first();

    await writeAudit(env.DB, {
      entityType: "project",
      entityId: (row as any).id,
      action: "create",
      user,
      before: null,
      after: row,
    });

    return json(row, 201);
  } catch (e) {
    console.error("POST /api/projects failed:", e);
    return error("failed to create project", 500);
  }
};
