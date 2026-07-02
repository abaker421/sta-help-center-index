// scripts/agenda-to-briefing.mjs
// One-time SEED INPUT for Phase PB1. Reads the Work PA's briefing-only state from
// agenda-state.md and emits data/briefing-data.json for owner adamb@k12sta.com in
// the shape documented in pb1-build-prompt.md:
//
//   { owner_email, generated, calibration_snapshot, needs_attention,
//     todays_meetings:[...],
//     items:[ {section, text, meta, done, done_at, source} ],     // section in:
//        carryover | pending | waiting_on | customer_situation | completed
//     project_refs:[ {project_id, name, personal_note, personal_timeline, sort} ] }
//
// AGENDA-STATE-BACKED SECTIONS ONLY (NOT live calendar). project_id is matched to
// the SHARED projects rows by name (via data/project-data.json, the same source the
// projects seed uses). A briefing project with no shared match gets a null
// project_id + the name in personal_note, and is listed in the run output - the
// script NEVER invents a shared projects row.
//
// Usage:
//   node scripts/agenda-to-briefing.mjs [<agenda-state.md>] [<out.json>]
// Defaults: the Architect workspace agenda-state.md -> repo data/briefing-data.json
//
// IMPORTANT: writes the JSON itself as UTF-8 (matches scripts/json-to-seed.js); do
// NOT pipe via PowerShell `>` (that produces UTF-16 and corrupts multi-byte chars).

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const OWNER = "adamb@k12sta.com";

const DEFAULT_AGENDA =
  "C:\\Users\\Adam\\Documents\\Claude\\Projects\\STA Projects\\The Architect\\project-blueprints\\work-personal-assistant\\agenda-state.md";

const agendaPath = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_AGENDA;
const outPath = process.argv[3]
  ? resolve(process.argv[3])
  : resolve(repoRoot, "data", "briefing-data.json");

// ---------------------------------------------------------------------------
// Markdown helpers
// ---------------------------------------------------------------------------

// Return the text block of a "## <heading>" section (up to the next "## " or EOF).
function sectionBlock(md, heading) {
  const lines = md.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === `## ${heading}`) { start = i + 1; break; }
  }
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (/^## /.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join("\n");
}

// Parse a GitHub-flavoured markdown table inside a block into arrays of cell strings
// (header + separator rows dropped). Ignores HTML comment lines.
function parseTable(block) {
  if (!block) return [];
  const rows = [];
  let sawHeader = false;
  for (const raw of block.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    // Separator row: every cell is only dashes/colons.
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
    if (!sawHeader) { sawHeader = true; continue; } // first non-separator row = header
    rows.push(cells);
  }
  return rows;
}

// Best-effort display project label parsed from an item string (PB2a). NOT a FK -
// a real deep-link into the Projects tab is a later backlog item. Returns null when
// nothing confident matches (the column then renders blank, never invented).
function parseProject(text) {
  if (!text) return null;
  // Leading "Name: ..." prefix (e.g. "SchoolTRAK: create dedicated subdomain").
  const prefix = text.match(/^([A-Za-z][\w./ ]*?):\s/);
  if (prefix) return prefix[1].trim();
  const t = text.toLowerCase();
  if (/\b(timeclock|time clock|gone for the day|tt7|tt3|tt10|clock)\b/.test(t)) return "TimeClock";
  if (/\b(schooltrak|school track|period[- ]rule|subdomain|kiosk|positive attendance|\bpa\b)\b/.test(t)) return "SchoolTRAK";
  if (/\bvirtuatime\b/.test(t)) return "VirtuaTime";
  if (/\b(rma|blue star|printer|diagnostic|hardware|enclosure|humidity)\b/.test(t)) return "Hardware/RMA";
  if (/\brenewal/.test(t)) return "Renewals";
  if (/\b(id badging|id product|id machine|id install|id relocation|id docs?)\b/.test(t)) return "ID";
  return null;
}

// PB2b.2: the parsed project token -> the canonical Product pick-list value (the same
// 7 products the tab's <select> offers). Anything that does not map (Hardware/RMA,
// Renewals, stray "Name:" prefixes, etc.) -> null (renders blank "-") and is collected
// for the run report so Adam can decide later. The pick list stays the source of truth.
const PRODUCT_NORMALIZE = {
  "schooltrak": "SchoolTRAK",
  "timeclock": "Time Clocks", "time clock": "Time Clocks", "time clocks": "Time Clocks",
  "virtuatime": "VirtuaTime",
  "id": "ID Badging", "id badging": "ID Badging",
  "positive attendance": "Positive Attendance",
  "tardy kiosk": "Tardy Kiosk",
  "food service": "Food Service",
};
const unmappedProducts = new Set();
function normProduct(text) {
  const raw = parseProject(text);
  if (!raw) return null;
  const canon = PRODUCT_NORMALIZE[raw.toLowerCase().trim()];
  if (canon) return canon;
  unmappedProducts.add(raw);
  return null;
}

// ---------------------------------------------------------------------------
// Read inputs
// ---------------------------------------------------------------------------

const md = readFileSync(agendaPath, "utf8");

// Shared-projects name -> id map, built the SAME way scripts/json-to-seed.js assigns
// ids (sequential across groups in order). Keeps the mapping in sync with 0003_seed.
const projData = JSON.parse(readFileSync(resolve(repoRoot, "data", "project-data.json"), "utf8"));
const nameToId = new Map();
{
  let pid = 0;
  for (const g of projData.groups || []) {
    for (const p of g.projects || []) {
      pid += 1;
      nameToId.set(p.name.trim(), pid);
    }
  }
}

// ---------------------------------------------------------------------------
// generated_at - from the "Last updated:" header line
// ---------------------------------------------------------------------------
let generated = null;
{
  const m = md.match(/^\*\*Last updated:\*\*\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/m);
  if (m) generated = `${m[1]}T00:00:00.000Z`;
}

// ---------------------------------------------------------------------------
// items - one entry per agenda-state row, tagged by section
// ---------------------------------------------------------------------------
const items = [];

// Map the agenda Status text to (label, class) for the pill (never color-alone:
// the label rides with the colour). Unknown -> watch (the softer bucket).
function statusToPill(raw) {
  const s = (raw || "").trim();
  if (!s) return { label: null, cls: null };
  const low = s.toLowerCase();
  if (/at risk|risk/.test(low)) return { label: s, cls: "risk" };
  if (/watch/.test(low)) return { label: s, cls: "watch" };
  return { label: s, cls: "watch" };
}

// Carryover Log: | Date flagged | Item | Reason carried over |
//   item_date=Date flagged, project=parsed, text=Item, context=Reason.
for (const r of parseTable(sectionBlock(md, "Carryover Log"))) {
  const [dateFlagged, item, reason] = r;
  if (!item) continue;
  items.push({
    section: "carryover",
    text: item,
    meta: [`flagged ${dateFlagged}`, reason].filter(Boolean).join(" - "), // back-compat
    item_date: dateFlagged || null,
    project: normProduct(item),
    owner: null,
    status_label: null,
    status_class: null,
    context: reason || null,
    done: 0,
    done_at: null,
    source: "Carryover Log",
  });
}

// Pending Adam's Action -> "Pending Your Action": | Item | Requested by | Date | Context |
//   text=Item, owner=Requested by, item_date=Date, context=Context.
for (const r of parseTable(sectionBlock(md, "Pending Adam's Action"))) {
  const [item, requestedBy, date, context] = r;
  if (!item) continue;
  items.push({
    section: "pending",
    text: item,
    meta: [requestedBy && `Requested by ${requestedBy}`, date, context].filter(Boolean).join(" - "),
    item_date: date || null,
    project: null,
    owner: requestedBy || null,
    status_label: null,
    status_class: null,
    context: context || null,
    done: 0,
    done_at: null,
    source: "Pending Adam's Action",
  });
}

// Waiting On Others: | Item | Sent to | Date sent | Context |
//   text=Item, owner=Sent to, item_date=Date sent, project=parsed, context=Context.
for (const r of parseTable(sectionBlock(md, "Waiting On Others"))) {
  const [item, sentTo, dateSent, context] = r;
  if (!item) continue;
  items.push({
    section: "waiting_on",
    text: item,
    meta: [sentTo && `Sent to ${sentTo}`, dateSent, context].filter(Boolean).join(" - "),
    item_date: dateSent || null,
    project: normProduct(item),
    owner: sentTo || null,
    status_label: null,
    status_class: null,
    context: context || null,
    done: 0,
    done_at: null,
    source: "Waiting On Others",
  });
}

// Customer Situations: | Customer | Situation | Owner | Status |
//   text=Customer (name), context=Situation, owner=Owner, status=Status pill.
for (const r of parseTable(sectionBlock(md, "Customer Situations"))) {
  const [customer, situation, owner, statusCol] = r;
  if (!customer && !situation) continue;
  const pill = statusToPill(statusCol);
  items.push({
    section: "customer_situation",
    text: customer || situation, // the name is the label / scan anchor
    meta: [owner && `Owner: ${owner}`, statusCol].filter(Boolean).join(" - "),
    item_date: null,
    project: null,
    owner: owner || null,
    status_label: pill.label,
    status_class: pill.cls,
    context: situation || null,
    done: 0,
    done_at: null,
    source: "Customer Situations",
  });
}

// Completed (last 30 days): | Date | Item | Notes |
//   item_date=Date, text=Item, context=Notes.
for (const r of parseTable(sectionBlock(md, "Completed (last 30 days)"))) {
  const [date, item, notes] = r;
  if (!item) continue;
  items.push({
    section: "completed",
    text: item,
    meta: notes || "",
    item_date: date || null,
    project: normProduct(item),
    owner: null,
    status_label: null,
    status_class: null,
    context: notes || null,
    done: 1,
    done_at: date || null,
    source: "Completed (last 30 days)",
  });
}

// (Sort indices are assigned AFTER the PB2b.1 re-route below, since that moves the
// stale/aging items into the carryover section and adds a calibration task.)

// ---------------------------------------------------------------------------
// calibration_snapshot - parse the snapshot table, derive a trend bullet list
// ---------------------------------------------------------------------------
let calibrationSnapshot = null;
{
  // | Date | Open cases | New vs prior | Closed vs prior | Aging 30d+ | Aging 90d+ | Oldest (days) |
  const rows = parseTable(sectionBlock(md, "Calibration Snapshot")).map((c) => ({
    date: c[0],
    open: c[1],
    new: c[2],
    closed: c[3],
    aging30: c[4],
    aging90: c[5],
    oldest: c[6],
  }));
  if (rows.length) {
    const latest = rows[rows.length - 1];
    calibrationSnapshot = {
      asOf: latest.date,
      open: latest.open,
      new: latest.new,
      closed: latest.closed,
      aging30: latest.aging30,
      aging90: latest.aging90,
      oldest: latest.oldest,
      trend: [
        `Open cases: ${latest.open} (as of ${latest.date})`,
        `New vs prior: ${latest.new}`,
        `Closed vs prior: ${latest.closed}`,
        `Aging 30d+: ${latest.aging30}; aging 90d+: ${latest.aging90}`,
        `Oldest open case: ${latest.oldest}`,
      ],
      rows,
    };
  }
}

// ---------------------------------------------------------------------------
// PB2b.1 "Your Tasks" re-route: fold the former Needs Attention strip into the
// carryover section as ordinary EDITABLE briefing_items (no separate read-only
// strip, no new section/CHECK). The stalest open items (7+ days) are MOVED into
// carryover (reclassified in place - not duplicated), and the synthetic
// calibration-aging line becomes a carryover task. briefing_state.needs_attention
// is left empty/unused (PB3's stale-detection will propose via the queue instead).
// ---------------------------------------------------------------------------
const needsAttention = []; // intentionally empty now (column retained, unused)
{
  const genMs = generated ? Date.parse(generated) : Date.now();
  // Source sections whose aged items graduate to "Your Tasks" (carryover).
  const AGED_FROM = new Set(["carryover", "pending", "waiting_on"]);
  const aged = [];
  for (const it of items) {
    if (!AGED_FROM.has(it.section)) continue;
    if (it.item_date && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(it.item_date)) {
      const days = Math.round((genMs - Date.parse(`${it.item_date}T00:00:00.000Z`)) / 86400000);
      if (days >= 7) aged.push({ it, days });
    }
  }
  aged
    .sort((x, y) => y.days - x.days)
    .slice(0, 8)
    .forEach((a) => {
      // Move it into carryover ("Your Tasks"); keep its columns + note the age in
      // context so the "why" row still explains it. It stays fully editable (PB2b).
      const ageNote = `Needs attention - ${a.days}d open`;
      a.it.context = a.it.context ? `${ageNote}. ${a.it.context}` : ageNote;
      a.it.section = "carryover";
    });

  if (calibrationSnapshot) {
    items.push({
      section: "carryover",
      text: "Support calibration aging",
      meta: "",
      item_date: calibrationSnapshot.asOf || null,
      project: null, // PB2b.2: not a product -> blank
      owner: null,
      status_label: null,
      status_class: null,
      context: `${calibrationSnapshot.aging30} cases 30d+, ${calibrationSnapshot.aging90} cases 90d+; oldest ${calibrationSnapshot.oldest}`,
      done: 0,
      done_at: null,
      source: "Calibration Snapshot",
    });
  }
}

// Stable sort index within each section (AFTER the re-route, so carryover/"Your
// Tasks" is contiguous and the moved items get sane order).
const sectionCounters = {};
for (const it of items) {
  const n = sectionCounters[it.section] || 0;
  it.sort = n;
  sectionCounters[it.section] = n + 1;
}

// ---------------------------------------------------------------------------
// project_refs - Active Projects "#### Name (id N)" headings, matched by name
// ---------------------------------------------------------------------------
const projectRefs = [];
const unmatched = [];
{
  const block = sectionBlock(md, "Active Projects") || "";
  let sort = 0;
  for (const raw of block.split(/\r?\n/)) {
    const m = raw.match(/^####\s+(.*\S)\s*$/);
    if (!m) continue;
    const name = m[1].replace(/\s*\(id\s+\d+\)\s*$/, "").trim();
    const projectId = nameToId.get(name) ?? null;
    if (projectId == null) unmatched.push(name);
    projectRefs.push({
      project_id: projectId,
      name,
      personal_note: projectId == null ? `Project: ${name} (no shared tracker match)` : null,
      personal_timeline: null,
      sort: sort++,
    });
  }
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------
const out = {
  owner_email: OWNER,
  generated,
  calibration_snapshot: calibrationSnapshot,
  needs_attention: needsAttention,
  todays_meetings: [], // PB1 seeds an empty snapshot; the PB3 daily task populates it
  items,
  project_refs: projectRefs,
};

writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n", "utf8");

// ---------------------------------------------------------------------------
// Run report
// ---------------------------------------------------------------------------
const counts = items.reduce((acc, it) => ((acc[it.section] = (acc[it.section] || 0) + 1), acc), {});
console.error(`Wrote ${outPath}`);
console.error(`  owner            ${OWNER}`);
console.error(`  generated        ${generated}`);
console.error(`  items            ${items.length}  ${JSON.stringify(counts)}`);
console.error(`  calibration      ${calibrationSnapshot ? `as of ${calibrationSnapshot.asOf}` : "none"}`);
console.error(`  needs_attention  ${needsAttention.length}`);
console.error(`  project_refs     ${projectRefs.length}`);
console.error(
  `  matched refs     ${projectRefs.filter((r) => r.project_id != null).map((r) => `${r.name}#${r.project_id}`).join(", ")}`
);
if (unmatched.length) {
  console.error(`  UNMATCHED refs (null project_id, name kept in personal_note - NOT invented as shared rows):`);
  for (const n of unmatched) console.error(`    - ${n}`);
} else {
  console.error(`  UNMATCHED refs   none (all Active Projects matched a shared projects row)`);
}
// PB2b.2: parsed project tokens that are NOT one of the 7 canonical Products -> set to
// blank "-". Listed here so Adam can decide whether any deserve a Product later.
if (unmappedProducts.size) {
  console.error(`  UNMAPPED products (-> blank "-"; not in the Product pick list): ${[...unmappedProducts].join(", ")}`);
} else {
  console.error(`  UNMAPPED products none`);
}
