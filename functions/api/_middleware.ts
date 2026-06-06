// functions/api/_middleware.ts
// Runs before every /api/* handler. Two stages:
//   1. Gate  - validate the Cloudflare Access JWT (the official Pages plugin),
//              or, in LOCAL dev only, skip the gate.
//   2. Identity - turn the validated claims into context.data.user (email / kind
//              / role) via a server-side allowlist. NEVER trust a client-supplied
//              identity - only the cryptographically validated Access JWT.
//
// This gates ALL /api/* routes, reads included, so only @k12sta.com sees data.
// Phase B1 is read-only; role is computed now and enforced by write handlers in B2.

import cloudflareAccessPlugin from "@cloudflare/pages-plugin-cloudflare-access";

// ---- PLACEHOLDERS: fill from the Cloudflare Zero Trust dashboard -------------
// Your team domain (Zero Trust > Settings > Custom Pages / team domain).
const ACCESS_TEAM_DOMAIN = "https://school-tech.cloudflareaccess.com";
// The Application Audience (AUD) tag of the Access application gating this hub
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

// Maps a validated Access JWT payload to the app's identity + role.
// Handles both the identity shape (has `email`) and the service-token shape
// (no email; carries `common_name` = the token's Client ID).
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

const accessGate = cloudflareAccessPlugin({
  domain: ACCESS_TEAM_DOMAIN,
  aud: ACCESS_APP_AUD,
});

// Stage 1 - gate. In production this always runs the Access plugin (which 403s
// on a missing/invalid token). The LOCAL_DEV branch is impossible in production
// because LOCAL_DEV is never set in the deployed Pages environment - it is only
// passed on the local CLI (`wrangler pages dev --binding LOCAL_DEV=1`).
const gate: PagesFunction = async (context) => {
  if (context.env.LOCAL_DEV === "1") {
    return context.next();
  }
  return accessGate(context);
};

// Stage 2 - identity. Sets context.data.user from the validated JWT (or the
// fake dev identity under LOCAL_DEV).
const identity: PagesFunction = async (context) => {
  if (context.env.LOCAL_DEV === "1") {
    context.data.user = {
      email: "adamb@k12sta.com",
      kind: "human",
      role: "admin",
      agent_name: null,
    } satisfies AppUser;
    return context.next();
  }

  const payload = (context.data as any).cloudflareAccess?.JWT?.payload;
  if (!payload?.email && !payload?.common_name) {
    return new Response(JSON.stringify({ error: "unauthenticated" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  context.data.user = toAppUser(payload);
  return context.next();
};

export const onRequest: PagesFunction[] = [gate, identity];
