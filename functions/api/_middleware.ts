// functions/api/_middleware.ts
// Runs before every /api/* handler. Validates the Cloudflare Access JWT and sets
// context.data.user (email / kind / role) from the validated claims via a
// server-side allowlist. NEVER trust a client-supplied identity - only the
// cryptographically validated Access JWT.
//
// Verification is dependency-free (functions/_lib/access.js, Web Crypto), so the
// Functions bundle resolves with no npm install and the hub stays a no-build
// static + Functions deploy. This gates ALL /api/* routes, reads included, so
// only @k12sta.com sees data. Phase B1 is read-only; role is computed now and
// enforced by write handlers in B2.

import { verifyAccessJwt } from "../_lib/access.js";

// ---- Fill from the Cloudflare Zero Trust dashboard --------------------------
// Team domain (Zero Trust > Settings > team domain).
const ACCESS_TEAM_DOMAIN = "https://school-tech.cloudflareaccess.com";
// Application Audience (AUD) tag of the Access application gating this hub
// (Zero Trust > Access > Applications > [this app] > Overview).
const ACCESS_APP_AUD = "3b211e7c1ccc6e71090cd412e1934a2141b5b02545a215119b6b68162d05d3f0";
// -----------------------------------------------------------------------------

// Server-side role allowlist. Adam is the only admin; every other @k12sta.com
// user is a member. Keep authorization in code, never in a client claim.
const ADMINS = new Set<string>(["adamb@k12sta.com"]);

type AppUser = {
  email: string;
  kind: "human" | "agent";
  role: "admin" | "member";
  agent_name?: string | null;
};

// Maps a validated Access JWT payload to the app's identity + role. Handles both
// the identity shape (has `email`) and the service-token shape (no email; carries
// `common_name` = the token's Client ID).
function toAppUser(payload: any): AppUser {
  const email = (payload?.email ?? "").toLowerCase();
  const isService = !email && !!payload?.common_name;
  return {
    email: email || `service:${payload?.common_name}`,
    kind: isService ? "agent" : "human",
    role: ADMINS.has(email) ? "admin" : "member",
    agent_name: null, // attached by the MCP/service layer in B2/B3
  };
}

// Single gate middleware. In production it requires a valid Access JWT (403
// otherwise). The LOCAL_DEV branch is impossible in production because LOCAL_DEV
// is never set in the deployed Pages environment - it is only passed on the local
// CLI (`wrangler pages dev --binding LOCAL_DEV=1`).
export const onRequest: PagesFunction = async (context) => {
  if (context.env.LOCAL_DEV === "1") {
    // Dev-only fake identity (admin by default). Optionally overridable via X-Dev-*
    // headers so local write tests can simulate a member or a different operator
    // (STEP 4: member -> 403 on admin-only writes). These headers are honored ONLY
    // under LOCAL_DEV, which is never set in the deployed Pages environment, so they
    // can never spoof identity in production. Never read identity from a header in
    // the real (JWT) branch below.
    const h = context.request.headers;
    const email = (h.get("X-Dev-Email") || "adamb@k12sta.com").toLowerCase();
    let role: AppUser["role"] = ADMINS.has(email) ? "admin" : "member";
    if (h.get("X-Dev-Role") === "member") role = "member";
    context.data.user = {
      email,
      kind: "human",
      role,
      agent_name: null,
    } satisfies AppUser;
    return context.next();
  }

  const token = context.request.headers.get("Cf-Access-Jwt-Assertion");
  const payload = await verifyAccessJwt(token, {
    teamDomain: ACCESS_TEAM_DOMAIN,
    aud: ACCESS_APP_AUD,
  });
  if (!payload) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  context.data.user = toAppUser(payload);
  return context.next();
};
