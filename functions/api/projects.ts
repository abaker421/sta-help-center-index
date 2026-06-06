// functions/api/projects.ts
// GET /api/projects - the full tracker payload the Projects tab renders.
// Read path only (Phase B1). No POST/PATCH here - writes are Phase B2.
//
// Gated by functions/api/_middleware.ts, so context.data.user is already set
// from the validated Access JWT by the time this runs.

import { json, error } from "../_lib/http.js";
import { assembleProjects } from "../_lib/assemble.js";

export const onRequestGet: PagesFunction = async ({ env }) => {
  try {
    // One round trip: live projects + all their children, ordered for assembly.
    // Avoids N+1 (KB module-02). batch() returns results in input order.
    const [projects, items, history, timeline] = await env.DB.batch([
      env.DB.prepare(
        `SELECT id, "group", name, status, status_class, stage, stage_class,
                statusline, what_it_is, next_step, sort, updated_at
           FROM projects
          WHERE deleted_at IS NULL
          ORDER BY "group", sort`
      ),
      env.DB.prepare(
        `SELECT id, project_id, text, stage, stage_class, meta, sort
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
