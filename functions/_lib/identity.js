// functions/_lib/identity.js
// PURE identity resolution from an ALREADY-VALIDATED Access JWT payload + request
// headers. Imported by functions/api/_middleware.ts (the gate) AND the offline
// harness (scripts/verify-identity.mjs), so the exact production logic is what
// gets unit-tested. Dependency-free ESM (standard JS only - no Workers/Node globals).
//
// The JWT signature/aud/iss/exp are verified by the caller (access.js); this module
// only MAPS validated claims + headers to an app identity and enforces the
// server-side allowlists. It never trusts a header that is not backed by a valid
// service token (the spoofable-header pitfall, KB modules 03 + 05).

// Server-side role allowlist. Adam is the only admin; every other validated
// @k12sta.com identity is a member. Authorization stays in code, never a client claim.
export const ADMINS = new Set(["adamb@k12sta.com"]);

// Service-token bounded delegation (KB module-05). Maps a service token's Client ID
// (= the JWT `common_name`) to the set of operators that token may act FOR. A service
// token authenticates the MACHINE; the operator it acts for is checked here against
// this allowlist, and that operator's role is looked up from ADMINS - so a token can
// never escalate an operator to admin unless the allowlist already says so.
// EXTEND HERE when a new service token / operator pairing is approved.
export const SERVICE_TOKENS = {
  // work-pa-tracker service token (created 2026-06-06); may act for Adam only.
  "f944ae6462f5387dae59e9fd6df311f3.access": { operators: new Set(["adamb@k12sta.com"]) },
};

// Sanitize X-Agent-Name for the audit table: lowercase, keep only [a-z0-9-], cap at
// 64 chars. (Lowercasing first keeps friendly names like "Work-PA" -> "work-pa"
// rather than stripping the uppercase letters.) Returns null if nothing usable.
export function sanitizeAgentName(raw) {
  if (!raw || typeof raw !== "string") return null;
  const cleaned = raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 64);
  return cleaned || null;
}

/**
 * @typedef {{email:string, kind:"human"|"agent", role:"admin"|"member", agent_name:(string|null)}} AppUser
 */

/**
 * Resolve app identity from a validated JWT payload + a header accessor.
 * PURE: no I/O, no globals. Returns a discriminated result so the middleware can
 * 403 without this function constructing an HTTP Response.
 *
 * @param {object} payload  validated JWT claims: {email} for humans, {common_name} for service tokens
 * @param {(name:string)=>(string|null|undefined)} getHeader  case-insensitive header accessor
 * @param {{admins?:Set<string>, serviceTokens?:object}} [opts]  overridable for tests
 * @returns {{ok:true, user:AppUser} | {ok:false, status:number, error:string}}
 */
export function resolveIdentity(payload, getHeader, opts = {}) {
  const admins = opts.admins || ADMINS;
  const serviceTokens = opts.serviceTokens || SERVICE_TOKENS;

  const email = (payload?.email ?? "").toLowerCase();

  // --- Human identity: a real email in the validated JWT (unchanged from B1/B2) ---
  // Takes precedence; an X-Operator-Email header is irrelevant on the human path.
  if (email) {
    return {
      ok: true,
      user: { email, kind: "human", role: admins.has(email) ? "admin" : "member", agent_name: null },
    };
  }

  // --- Service-token identity: no email; common_name = the token's Client ID ---
  const cn = payload?.common_name;
  if (cn) {
    const token = serviceTokens[cn]; // undefined => token not in our allowlist
    const operatorRaw = getHeader("X-Operator-Email");
    const operator = operatorRaw ? String(operatorRaw).trim().toLowerCase() : "";
    const agentHeader = sanitizeAgentName(getHeader("X-Agent-Name"));

    // Unknown token -> an unidentified agent. Reads allowed; writes rejected
    // downstream (no real operator to attribute). Any operator header is ignored.
    if (!token) {
      return {
        ok: true,
        user: { email: `service:${cn}`, kind: "agent", role: "member", agent_name: agentHeader },
      };
    }

    // Known token + a claimed operator: honor ONLY if this token may act for it.
    if (operator) {
      if (token.operators.has(operator)) {
        return {
          ok: true,
          user: {
            email: operator,
            kind: "agent",
            role: admins.has(operator) ? "admin" : "member",
            agent_name: agentHeader || "agent",
          },
        };
      }
      // Claimed operator is not in this token's allowlist.
      return { ok: false, status: 403, error: "operator not permitted for this token" };
    }

    // Known token, no operator claimed -> operator-less agent. Reads only.
    return {
      ok: true,
      user: { email: `service:${cn}`, kind: "agent", role: "member", agent_name: agentHeader },
    };
  }

  // Neither email nor common_name -> malformed/unsupported identity.
  return { ok: false, status: 403, error: "forbidden" };
}
