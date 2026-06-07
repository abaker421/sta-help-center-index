// functions/api/_middleware.ts
// Runs before every /api/* handler. Validates the Cloudflare Access JWT and sets
// context.data.user (email / kind / role / agent_name) from the validated claims.
// NEVER trust a client-supplied identity - only the cryptographically validated
// Access JWT (and, for agents, a header that is BACKED by a valid service token).
//
// Verification is dependency-free (functions/_lib/access.js, Web Crypto), so the
// Functions bundle resolves with no npm install and the hub stays a no-build
// static + Functions deploy. This gates ALL /api/* routes, reads included.
//
// B3a: the human path is unchanged; service-token requests can now carry an
// X-Operator-Email (bounded delegation) - the mapping logic lives in the PURE,
// unit-tested functions/_lib/identity.js (resolveIdentity).

import { verifyAccessJwt } from "../_lib/access.js";
import { resolveIdentity, ADMINS } from "../_lib/identity.js";

// ---- Fill from the Cloudflare Zero Trust dashboard --------------------------
// Team domain (Zero Trust > Settings > team domain).
const ACCESS_TEAM_DOMAIN = "https://school-tech.cloudflareaccess.com";
// Application Audience (AUD) tag of the Access application gating this hub
// (Zero Trust > Access > Applications > [this app] > Overview).
const ACCESS_APP_AUD = "3b211e7c1ccc6e71090cd412e1934a2141b5b02545a215119b6b68162d05d3f0";
// -----------------------------------------------------------------------------

type AppUser = {
  email: string;
  kind: "human" | "agent";
  role: "admin" | "member";
  agent_name?: string | null;
};

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

  // Map the validated claims (+ delegation headers, for service tokens) to identity.
  // resolveIdentity is pure + unit-tested; it returns a 403 result for a service
  // token claiming an operator it is not permitted to act for.
  const getHeader = (name: string) => context.request.headers.get(name);
  const resolved = resolveIdentity(payload, getHeader);
  if (!resolved.ok) {
    return new Response(JSON.stringify({ error: resolved.error }), {
      status: resolved.status,
      headers: { "content-type": "application/json" },
    });
  }

  context.data.user = resolved.user satisfies AppUser;
  return context.next();
};
