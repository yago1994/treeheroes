/**
 * Splits the permit store into one ndjson file per calendar month, plus a
 * small `index.json` manifest, so the frontend's month picker never has to
 * download the full multi-year history just to render a permit or two.
 */
import fs from "node:fs/promises";
import path from "node:path";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function parseUsDateToUtc(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const m = dateStr.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  if (!m) return null;
  const mm = Number(m[1]);
  const dd = Number(m[2]);
  const yyyy = Number(m[3].length === 2 ? Number(m[3]) + 2000 : m[3]);
  if (!yyyy || !mm || !dd) return null;
  const d = new Date(Date.UTC(yyyy, mm - 1, dd));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "YYYY-MM" for a row's `date` field, or null when it can't be parsed. */
export function monthKeyFor(row) {
  const date = parseUsDateToUtc(row?.date);
  if (!date) return null;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Writes `${outDir}/${YYYY-MM}.ndjson` for every month present in `rows`,
 * removes month files for months no longer present, and writes
 * `${outDir}/index.json` (newest first) for the frontend to build its picker
 * from without fetching any of the month files themselves.
 */
export async function writeMonthFiles(rows, outDir) {
  const byMonth = new Map();
  for (const row of rows) {
    const key = monthKeyFor(row);
    if (!key) continue;
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(row);
  }

  await fs.mkdir(outDir, { recursive: true });

  const existing = await fs.readdir(outDir).catch(() => []);
  const wanted = new Set([...byMonth.keys()].map((k) => `${k}.ndjson`));
  await Promise.all(
    existing
      .filter((f) => f.endsWith(".ndjson") && !wanted.has(f))
      .map((f) => fs.unlink(path.join(outDir, f)))
  );

  const manifest = [];
  for (const [key, monthRows] of byMonth) {
    monthRows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    await fs.writeFile(
      path.join(outDir, `${key}.ndjson`),
      monthRows.map((o) => JSON.stringify(o)).join("\n") + "\n"
    );
    const [year, month] = key.split("-").map(Number);
    manifest.push({ key, label: `${MONTH_NAMES[month - 1]} ${year}`, count: monthRows.length });
  }

  manifest.sort((a, b) => (a.key < b.key ? 1 : -1));
  await fs.writeFile(path.join(outDir, "index.json"), JSON.stringify(manifest, null, 2) + "\n");

  return manifest;
}
