// functions/_lib/access.js
// Dependency-free Cloudflare Access JWT verification (KB module-03 "manual
// equivalent"), using only the Workers runtime globals (fetch, crypto.subtle,
// atob, TextEncoder). No npm import, so the Functions bundle resolves with zero
// external deps and the hub stays a no-build static + Functions deploy.
//
// Performs the four required checks: RS256 signature against the rotating JWKS,
// aud == the application AUD, iss == the team domain, and exp not passed.

const JWKS_TTL_MS = 60 * 60 * 1000; // cache keys 1h (Access rotates every ~6 weeks)
const jwksCache = new Map(); // teamDomain -> { keys, fetchedAt }

function b64urlToBytes(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64.length % 4 === 0 ? b64 : b64 + "=".repeat(4 - (b64.length % 4));
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function b64urlToJson(b64url) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(b64url)));
}

async function getJwks(teamDomain) {
  const cached = jwksCache.get(teamDomain);
  if (cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS) return cached.keys;
  const res = await fetch(`${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const body = await res.json();
  const keys = body.keys || [];
  jwksCache.set(teamDomain, { keys, fetchedAt: Date.now() });
  return keys;
}

async function importVerifyKey(jwk) {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
}

/**
 * Verify a Cloudflare Access assertion. Returns the validated payload, or null
 * if the token is missing / malformed / fails any check. Never throws to the
 * caller for an invalid token (only re-throws nothing - JWKS errors resolve to
 * a rejected verification = null).
 *
 * @param {string|null} token - the Cf-Access-Jwt-Assertion header value
 * @param {{teamDomain:string, aud:string}} opts
 */
export async function verifyAccessJwt(token, { teamDomain, aud }) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;

  let header, payload;
  try {
    header = b64urlToJson(headerB64);
    payload = b64urlToJson(payloadB64);
  } catch {
    return null;
  }
  if (header.alg !== "RS256") return null;

  let keys;
  try {
    keys = await getJwks(teamDomain);
  } catch {
    return null; // cannot reach JWKS -> fail closed
  }
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;

  let valid = false;
  try {
    const key = await importVerifyKey(jwk);
    valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      b64urlToBytes(sigB64),
      new TextEncoder().encode(`${headerB64}.${payloadB64}`)
    );
  } catch {
    return null;
  }
  if (!valid) return null;

  // Claims: exp (with small skew), iss, aud.
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === "number" && now >= payload.exp) return null;
  if (payload.iss !== teamDomain) return null;
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(aud)) return null;

  return payload;
}
