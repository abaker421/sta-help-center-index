// scripts/verify-identity.mjs
// Offline unit tests for the B3a identity resolution (service-token operator
// delegation) WITHOUT workerd. Drives the REAL functions/_lib/identity.js
// resolveIdentity (the exact function the middleware calls) and the REAL
// requireDelegatedOperator gate from functions/_lib/writes.js.
//
// Run:  node scripts/verify-identity.mjs

import { strict as assert } from "node:assert";
import { resolveIdentity, sanitizeAgentName, SERVICE_TOKENS } from "../functions/_lib/identity.js";
import { requireDelegatedOperator } from "../functions/_lib/writes.js";

const TOKEN_CN = "f944ae6462f5387dae59e9fd6df311f3.access"; // work-pa-tracker

// Case-insensitive header accessor mirroring Headers.get (returns null if absent).
const mkHeaders = (obj = {}) => {
  const m = new Map(Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v]));
  return (name) => (m.has(name.toLowerCase()) ? m.get(name.toLowerCase()) : null);
};

let failures = 0;
const check = (name, fn) => {
  try {
    fn();
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failures += 1;
    console.log(`  FAIL  ${name}`);
    console.log(String(e.message).split("\n").slice(0, 12).map((l) => "        " + l).join("\n"));
  }
};

console.log("STA Project Tracker - B3a identity / delegation verification\n");

// Sanity: the configured token is the one Adam set up.
check("SERVICE_TOKENS contains the work-pa token mapped to adam only", () => {
  assert.ok(SERVICE_TOKENS[TOKEN_CN], "token present");
  assert.ok(SERVICE_TOKENS[TOKEN_CN].operators.has("adamb@k12sta.com"), "adam allowed");
  assert.ok(!SERVICE_TOKENS[TOKEN_CN].operators.has("chris@k12sta.com"), "chris not allowed");
});

// (a) service token + allowlisted operator -> delegated agent, role from allowlist
check("(a) service token + allowlisted operator -> agent/admin with sanitized agent_name", () => {
  const r = resolveIdentity(
    { common_name: TOKEN_CN },
    mkHeaders({ "X-Operator-Email": "Adamb@K12sta.com", "X-Agent-Name": "Work-PA" })
  );
  assert.equal(r.ok, true);
  assert.equal(r.user.email, "adamb@k12sta.com", "operator lowercased");
  assert.equal(r.user.kind, "agent");
  assert.equal(r.user.role, "admin", "adam is admin via ADMINS allowlist");
  assert.equal(r.user.agent_name, "work-pa", "agent name sanitized + lowercased");
  assert.equal(requireDelegatedOperator(r.user), null, "delegated agent passes the write gate");
});

// (b) service token + non-allowlisted operator -> 403
check("(b) service token + non-allowlisted operator -> 403", () => {
  const r = resolveIdentity({ common_name: TOKEN_CN }, mkHeaders({ "X-Operator-Email": "chris@k12sta.com" }));
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
  assert.equal(r.error, "operator not permitted for this token");
});

// (c) service token + no operator -> operator-less agent; writes blocked, reads ok
check("(c) service token + no operator -> operator-less agent, writes blocked", () => {
  const r = resolveIdentity({ common_name: TOKEN_CN }, mkHeaders({}));
  assert.equal(r.ok, true);
  assert.equal(r.user.email, `service:${TOKEN_CN}`, "no operator -> service:<cn>");
  assert.equal(r.user.kind, "agent");
  assert.equal(r.user.role, "member");
  assert.equal(r.user.agent_name, null);
  const gate = requireDelegatedOperator(r.user);
  assert.ok(gate instanceof Response && gate.status === 403, "operator-less agent write -> 403");
});

// (d) human JWT with email -> unchanged; an operator header is IGNORED on human path
check("(d) human JWT -> human identity unchanged, operator header ignored", () => {
  const member = resolveIdentity(
    { email: "Chris@k12sta.com" },
    mkHeaders({ "X-Operator-Email": "adamb@k12sta.com", "X-Agent-Name": "evil" })
  );
  assert.equal(member.ok, true);
  assert.equal(member.user.email, "chris@k12sta.com");
  assert.equal(member.user.kind, "human");
  assert.equal(member.user.role, "member", "non-admin human is member");
  assert.equal(member.user.agent_name, null, "human never gets an agent_name");
  assert.equal(requireDelegatedOperator(member.user), null, "humans pass the write gate");

  const admin = resolveIdentity({ email: "adamb@k12sta.com" }, mkHeaders({}));
  assert.equal(admin.user.role, "admin", "adam human is admin");
});

// (e) X-Operator-Email with NO service token behind it -> ignored (not trusted)
check("(e) operator header with NO service token / no email -> 403, header ignored", () => {
  const r = resolveIdentity({}, mkHeaders({ "X-Operator-Email": "adamb@k12sta.com" }));
  assert.equal(r.ok, false, "no email + no common_name -> not resolvable");
  assert.equal(r.status, 403);
  assert.equal(r.error, "forbidden");
});

// (f) UNKNOWN service token (valid Access, not in our map) -> operator-less agent
check("(f) unknown service token (+operator header) -> operator-less agent, writes blocked", () => {
  const r = resolveIdentity(
    { common_name: "unknown-token.access" },
    mkHeaders({ "X-Operator-Email": "adamb@k12sta.com", "X-Agent-Name": "work-pa" })
  );
  assert.equal(r.ok, true);
  assert.equal(r.user.email, "service:unknown-token.access", "unknown token never delegates an operator");
  assert.equal(r.user.kind, "agent");
  assert.equal(r.user.role, "member");
  const gate = requireDelegatedOperator(r.user);
  assert.ok(gate instanceof Response && gate.status === 403, "unknown-token agent write -> 403");
});

// sanitizeAgentName behavior
check("sanitizeAgentName: lowercases, strips non [a-z0-9-], caps 64, null when empty", () => {
  assert.equal(sanitizeAgentName("Work PA!"), "workpa", "space + ! stripped, lowercased");
  assert.equal(sanitizeAgentName("  daily-ingest  "), "daily-ingest", "trim + keep hyphen");
  assert.equal(sanitizeAgentName("!!!"), null, "all-invalid -> null");
  assert.equal(sanitizeAgentName(""), null, "empty -> null");
  assert.equal(sanitizeAgentName(null), null, "null -> null");
  assert.equal(sanitizeAgentName("a".repeat(100)).length, 64, "capped at 64");
});

console.log("");
if (failures > 0) {
  console.log(`RESULT: ${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("RESULT: all checks passed - B3a identity resolution + delegation gate hold.");
