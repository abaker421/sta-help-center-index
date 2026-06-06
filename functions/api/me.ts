// functions/api/me.ts
// GET /api/me - returns the VALIDATED identity (context.data.user) so the edit UI
// can tailor admin-only controls. Role is still enforced server-side in every write
// handler; this endpoint is a convenience for the UI, never the authorization gate.
//
// Gated by functions/api/_middleware.ts, so data.user is already set from the
// validated Access JWT by the time this runs.

import { json } from "../_lib/http.js";

export const onRequestGet: PagesFunction = async ({ data }) => json((data as any).user);
