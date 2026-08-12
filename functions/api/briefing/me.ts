// functions/api/briefing/me.ts
// GET /api/briefing/me - the logged-in user's full personal briefing (Phase PB1
// READ PATH ONLY). NO write handlers here - PB2 adds PATCH/POST.
//
// Per-user scoping (Key design decision 1): owner is ALWAYS context.data.user.email
// from the validated Access JWT - NEVER a query param or request body. Every query
// filters on owner_email, so a user can only ever read their OWN briefing. A user
// with no rows gets a valid EMPTY briefing (200, empty sections), never a 404.
//
// Compose, don't duplicate (Key design decision 2): briefing_project_refs are JOINed
// to the live shared `projects` rows at read time (assembleProjectsById), never
// copied per user. Every mutable row in the payload carries id + version so PB2 adds
// writes with no payload change.
//
// Gated by functions/api/_middleware.ts, so context.data.user is already set from
// the validated Access JWT by the time this runs.

import { json, error } from "../../_lib/http.js";
import { assembleBriefing, emptySections } from "../../_lib/briefing.js";

export const onRequestGet: PagesFunction = async ({ env, data }) => {
  const owner = (data as any)?.user?.email;
  if (!owner) return error("forbidden", 403);

  try {
    // The owner's briefing rows (live, ordered for assembly). One round trip.
    const [stateRes, itemsRes, refsRes, propsRes] = await env.DB.batch([
      env.DB.prepare(
        `SELECT owner_email, generated_at, calibration_snapshot, needs_attention,
                todays_meetings, version
           FROM briefing_state
          WHERE owner_email = ?`
      ).bind(owner),
      env.DB.prepare(
        // id + version carried so PB2 can PATCH with expected_version (compare-and-set).
        // PB2a adds the structured columns (item_date/project/owner/status_*/context).
        `SELECT id, section, text, meta, item_date, project, owner, status_label,
                status_class, context, done, done_at, source, sort, version
           FROM briefing_items
          WHERE owner_email = ? AND deleted_at IS NULL
          ORDER BY section, sort, id`
      ).bind(owner),
      env.DB.prepare(
        // 0017 repoint: refs now carry section_id (FK -> tr_sections), not project_id.
        `SELECT id, section_id, personal_note, personal_timeline, sort, version
           FROM briefing_project_refs
          WHERE owner_email = ? AND deleted_at IS NULL
          ORDER BY sort, id`
      ).bind(owner),
      // PB2c: the owner's PENDING proposal queue (Pending Your Review). id + version
      // carried so Approve/Deny send expected_version (compare-and-set).
      env.DB.prepare(
        `SELECT id, version, target_section, proposed_text, item_date, project, owner_field,
                status_label, status_class, context, source
           FROM briefing_proposals
          WHERE owner_email = ? AND status = 'pending' AND deleted_at IS NULL
          ORDER BY created_at, id`
      ).bind(owner),
    ]);

    const state = (stateRes.results?.[0] as any) ?? null;
    const items = (itemsRes.results as any[]) ?? [];
    const refs = (refsRes.results as any[]) ?? [];
    const proposalRows = ((propsRes.results as any[]) ?? []);

    // camelCase the proposal rows the tab consumes (mirrors the item payload shape).
    const proposals = proposalRows.map((p) => ({
      id: p.id,
      version: p.version,
      targetSection: p.target_section,
      text: p.proposed_text,
      itemDate: p.item_date ?? null,
      project: p.project ?? null,
      owner: p.owner_field ?? null,
      statusLabel: p.status_label ?? null,
      statusClass: p.status_class ?? null,
      context: p.context ?? null,
      source: p.source ?? null,
    }));

    // A user with no rows at all -> valid empty briefing (200), not a 404. (proposals
    // counted too, so a proposals-only user still gets them; the truly-empty payload is
    // byte-identical to PB1.)
    if (!state && items.length === 0 && refs.length === 0 && proposals.length === 0) {
      return json({
        owner,
        generated: null,
        calibrationSnapshot: null,
        needsAttention: [],
        todaysMeetings: [],
        sections: emptySections(),
        openProjects: [],
      });
    }

    // Compose the referenced SHARED sections via JOIN (never duplicated per user).
    // 0017 repoint: the refs point at tr_sections now, so the "shared" row a ref
    // resolves to is the section {id, version, name} - the same grain the old
    // projects table held (a product line / workstream), and the faithful target
    // for a personal "where are we" note. Only fetch when refs actually point at one.
    let sectionsById = new Map<number, any>();
    const hasSectionRefs = refs.some((r) => r.section_id != null);
    if (hasSectionRefs) {
      const secRes = await env.DB.prepare(
        `SELECT id, version, name FROM tr_sections WHERE deleted_at IS NULL`
      ).all();
      sectionsById = new Map(
        ((secRes.results as any[]) ?? []).map((s) => [s.id, { id: s.id, version: s.version, name: s.name }])
      );
    }

    const payload = assembleBriefing({ owner, state, items, refs, projectsById: sectionsById });
    (payload as any).proposals = proposals;
    return json(payload);
  } catch (e) {
    // Never leak the raw exception to the client (KB module-02).
    console.error("GET /api/briefing/me failed:", e);
    return error("failed to load briefing", 500);
  }
};
