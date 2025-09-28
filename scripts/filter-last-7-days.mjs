import fs from "fs/promises";

const GEOJSON_PATH = "docs/data/atl_arborist_ddh.geojson";

function parseUsDateToUtc(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const m = dateStr.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  if (!m) return null;
  const mm = Number(m[1]);
  const dd = Number(m[2]);
  const yyyy = Number(m[3].length === 2 ? (Number(m[3]) + 2000) : m[3]);
  if (!yyyy || !mm || !dd) return null;
  // Construct a Date in UTC at midnight for stable comparisons
  const d = new Date(Date.UTC(yyyy, mm - 1, dd, 0, 0, 0));
  return isNaN(d.getTime()) ? null : d;
}

function isWithinLastNDays(dateUtc, days) {
  if (!dateUtc) return false;
  const now = new Date();
  const nowUtcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const cutoffMs = nowUtcMidnight.getTime() - (days - 1) * 24 * 60 * 60 * 1000; // inclusive window
  return dateUtc.getTime() >= cutoffMs;
}

(async () => {
  try {
    const raw = await fs.readFile(GEOJSON_PATH, "utf8");
    const json = JSON.parse(raw);
    const features = Array.isArray(json?.features) ? json.features : [];

    const enriched = features.map((f) => {
      const dateStr = f?.properties?.date;
      const parsed = parseUsDateToUtc(dateStr);
      return { f, parsed };
    });

    const filtered = enriched
      .filter(({ parsed }) => isWithinLastNDays(parsed, 7))
      .sort((a, b) => {
        const at = a.parsed ? a.parsed.getTime() : 0;
        const bt = b.parsed ? b.parsed.getTime() : 0;
        return bt - at;
      })
      .map(({ f }) => f);

    const out = { ...json, features: filtered };
    await fs.writeFile(GEOJSON_PATH, JSON.stringify(out, null, 2));

    // Optionally, write a derived date range file for UI consumption
    const timestamps = enriched
      .filter(({ parsed }) => parsed)
      .map(({ parsed }) => parsed.getTime())
      .filter((t) => isWithinLastNDays(new Date(t), 7));
    if (timestamps.length > 0) {
      const min = new Date(Math.min(...timestamps));
      const max = new Date(Math.max(...timestamps));
      const fmt = (d) => {
        const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(d.getUTCDate()).padStart(2, "0");
        const yyyy = d.getUTCFullYear();
        return `${mm}/${dd}/${yyyy}`;
      };
      await fs.mkdir("docs/data", { recursive: true });
      await fs.writeFile(
        "docs/data/date-range.json",
        JSON.stringify({ start: fmt(min), end: fmt(max) }, null, 2)
      );
    }

    console.log(`Filtered to last 7 days: ${filtered.length} features`);
  } catch (err) {
    console.error("Failed to filter GeoJSON:", err?.message || err);
    process.exitCode = 1;
  }
})();


