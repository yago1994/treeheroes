/**
 * One-off backfill for permits scraped before the TREE SPECS parser was fixed.
 *
 * The old scraper read the permit detail page twice: once through the DOM
 * (which kept overwriting one set of fields, so multi-tree permits ended up
 * holding the LAST tree's values) and once through regexes over the whole page
 * text (which picked the FIRST tree, but only when the pattern happened to
 * match). Records therefore mix fields from different trees, and
 * `tree_description` swallowed every later tree plus the Parcel Information
 * panel that follows the table.
 *
 * That swallowed text is a complete, parseable copy of the remaining trees, so
 * the correct data can be recovered from the store we already have:
 *
 *   node scripts/repair-tree-data.mjs --dry-run   # report only (default)
 *   node scripts/repair-tree-data.mjs --write     # rewrite docs/data
 */
import fs from "node:fs/promises";
import { parseTreeSpecs, TREE_FIELD_KEYS, cleanTreeValue } from "./lib/tree-specs.mjs";
import { writeMonthFiles } from "./lib/month-index.mjs";

const ALL_NDJSON = "docs/data/all.ndjson";
const RECENT_NDJSON = "docs/data/recent.ndjson";
const OUT_GEOJSON = "docs/data/atl_arborist_ddh.geojson";
const MONTHS_DIR = "docs/data/months";

const WRITE = process.argv.includes("--write");

const same = (a, b) =>
  String(a ?? "").replace(/\s+/g, " ").trim().toLowerCase() ===
  String(b ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Whether the old `Species:` regex — /Species:\s*([^T]+?)(?=Tree Size|$)/i —
 * could have produced this value. Its `[^T]` class (case-insensitive) cannot
 * cross a "t", so any species containing one proves the regex failed and the
 * stored value is the DOM leftover from the permit's LAST tree.
 */
const speciesCameFromFirstTree = (value) => !!value && !/t/i.test(value);

/** Same tell for `Tree location:` — /([^D]+?)(?=Description|$)/i cannot cross a "d". */
const locationCameFromFirstTree = (value) => !!value && !/d/i.test(value);

/**
 * Reconstruct tree #1. The blob holds its description/reason/comments; its
 * species, size and location survive only in the stored top-level fields, so
 * take those unless they are provably the last tree's values bleeding over.
 */
function recoverFirstTree(row, parsed, lastTree) {
  const tree = { ...parsed };
  const dropped = [];

  const adopt = (key, storedValue, trustworthy) => {
    if (tree[key] != null || storedValue == null) return;
    const cleaned = cleanTreeValue(storedValue);
    if (cleaned == null) return;
    // Only ambiguous when it matches the carry-over AND the regex that would
    // have yielded tree #1 could not have produced it.
    if (lastTree && same(cleaned, lastTree[key]) && !trustworthy(cleaned)) {
      dropped.push(key);
      return;
    }
    tree[key] = cleaned;
  };

  // `Tree number:(\d+)` and `Tree Size (DBH):(\d+)` always matched, so those
  // stored values are the first tree's.
  adopt("tree_number", row.tree_number, () => true);
  adopt("tree_dbh", row.tree_dbh, () => true);
  adopt("species", row.species, speciesCameFromFirstTree);
  // A bare number in `species` is the DBH (or tree number) that slid into the
  // field when the permit left Species blank; it is not a species.
  if (tree.species != null && /^\d+$/.test(tree.species)) {
    dropped.push("species");
    tree.species = null;
  }
  adopt("tree_location", row.tree_location, locationCameFromFirstTree);
  adopt("reason_removal", row.reason_removal, () => true);

  return { tree, dropped };
}

function repairRow(row, stats) {
  // Already repaired (or scraped by the fixed scraper): `trees` is the source
  // of truth and the blob it was recovered from is gone, so re-parsing would
  // collapse the permit back to a single tree.
  if (Array.isArray(row.trees) && row.trees.length) {
    stats.skipped++;
    stats.trees += row.trees.length;
    return row;
  }

  const blob = row.tree_description;
  const parsed = blob ? parseTreeSpecs(blob, { leadingField: "tree_description" }) : [];

  let trees;
  if (parsed.length === 0) {
    // Nothing to re-derive; keep what we have as a single tree.
    trees = [Object.fromEntries(TREE_FIELD_KEYS.map((k) => [k, cleanTreeValue(row[k] ?? null)]))];
  } else if (parsed.length === 1) {
    // Single-tree permit: no cross-tree contamination was possible.
    const { tree } = recoverFirstTree(row, parsed[0], null);
    trees = [tree];
  } else {
    const { tree, dropped } = recoverFirstTree(row, parsed[0], parsed[parsed.length - 1]);
    dropped.forEach((k) => stats.dropped.set(k, (stats.dropped.get(k) || 0) + 1));
    trees = [tree, ...parsed.slice(1)];
    stats.multi++;
  }

  if (!trees.some((t) => TREE_FIELD_KEYS.some((k) => t[k] != null))) trees = [];

  const first = trees[0] || {};
  const out = {
    ...row,
    tree_number: first.tree_number ?? null,
    species: first.species ?? null,
    tree_dbh: first.tree_dbh ?? null,
    tree_location: first.tree_location ?? null,
    tree_description: first.tree_description ?? null,
    reason_removal: first.reason_removal ?? null,
    comments: first.comments ?? null,
    tree_count: trees.length || null,
    trees: trees.length ? trees : null,
  };

  for (const key of ["species", "tree_location", "reason_removal", "tree_description"]) {
    if (!same(row[key], out[key])) stats.changed.set(key, (stats.changed.get(key) || 0) + 1);
  }
  stats.trees += trees.length;
  return out;
}

const raw = await fs.readFile(ALL_NDJSON, "utf8");
const rows = raw.split(/\r?\n/).filter(Boolean).map((ln) => JSON.parse(ln));

const stats = { multi: 0, trees: 0, skipped: 0, changed: new Map(), dropped: new Map() };
const repaired = rows.map((r) => repairRow(r, stats));

console.log(`records: ${rows.length} (${stats.skipped} already carry a trees array, left alone)`);
console.log(`multi-tree permits repaired: ${stats.multi}`);
console.log(`trees recovered: ${stats.trees} (was ${rows.filter((r) => r.species || r.tree_dbh).length} single-tree rows)`);
console.log(`fields changed: ${[...stats.changed].map(([k, v]) => `${k}=${v}`).join(", ")}`);
console.log(`tree #1 values cleared as unrecoverable: ${[...stats.dropped].map(([k, v]) => `${k}=${v}`).join(", ") || "none"}`);

if (!WRITE) {
  console.log("\ndry run — pass --write to update docs/data");
  process.exit(0);
}

const byKey = new Map(repaired.map((o) => [o.key, o]));
const byRecord = new Map(repaired.filter((o) => o.record).map((o) => [o.record, o]));

await fs.writeFile(ALL_NDJSON, repaired.map((o) => JSON.stringify(o)).join("\n") + "\n");

// The derived files are date-windowed slices that scrape.mjs rebuilds on its
// own schedule. Repair their contents in place rather than re-windowing them,
// so this backfill changes field values and nothing else.
const recentRaw = await fs.readFile(RECENT_NDJSON, "utf8");
const recentRows = recentRaw
  .split(/\r?\n/)
  .filter(Boolean)
  .map((ln) => JSON.parse(ln))
  .map((o) => byKey.get(o.key) || byRecord.get(o.record) || o);
await fs.writeFile(RECENT_NDJSON, recentRows.map((o) => JSON.stringify(o)).join("\n") + "\n");

const geo = JSON.parse(await fs.readFile(OUT_GEOJSON, "utf8"));
geo.features = geo.features.map((f) => {
  const fixed = byRecord.get(f.properties?.record);
  if (!fixed) return f;
  const { key, coords, ...properties } = fixed;
  return { ...f, properties };
});
await fs.writeFile(OUT_GEOJSON, JSON.stringify(geo, null, 2));

const monthManifest = await writeMonthFiles(repaired, MONTHS_DIR);

console.log(
  `\nwrote ${ALL_NDJSON} (${repaired.length}), ${RECENT_NDJSON} (${recentRows.length}), ${OUT_GEOJSON} (${geo.features.length}), ${MONTHS_DIR} (${monthManifest.length} months)`
);
