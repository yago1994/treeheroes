import { PermitRecord, WeekOption, WeekRange } from './types';

function normalizeText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

type RawFeature = {
  type?: string;
  geometry?: {
    coordinates?: unknown;
  };
  properties?: Record<string, unknown>;
  coords?: unknown;
  coordinates?: unknown;
} & Record<string, unknown>;

export function normalizeRecord(input: unknown): PermitRecord | null {
  if (!input || typeof input !== 'object') return null;

  const rawInput = input as RawFeature;
  let source: RawFeature = rawInput;

  if (rawInput.type === 'Feature') {
    const props = (rawInput.properties ?? {}) as Record<string, unknown>;
    source = { ...props } as RawFeature;
    if (rawInput.geometry && Array.isArray(rawInput.geometry.coordinates)) {
      source.coords = rawInput.geometry.coordinates;
    }
  }

  const coordinates = Array.isArray(source.coords)
    ? source.coords
    : Array.isArray(source.coordinates)
      ? source.coordinates
      : null;

  if (!coordinates || coordinates.length < 2) return null;

  const lon = Number(coordinates[0]);
  const lat = Number(coordinates[1]);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const id =
    normalizeText((source as Record<string, unknown>).record) ||
    normalizeText((source as Record<string, unknown>).Record) ||
    normalizeText((source as Record<string, unknown>).permit_number) ||
    normalizeText((source as Record<string, unknown>).permit) ||
    normalizeText((source as Record<string, unknown>).id) ||
    `${lon.toFixed(6)},${lat.toFixed(6)}`;

  const record = normalizeText((source as Record<string, unknown>).record) ||
    normalizeText((source as Record<string, unknown>).Record);

  return {
    id,
    coords: [lon, lat],
    latLng: { lat, lng: lon },
    record,
    address:
      normalizeText((source as Record<string, unknown>).address) ||
      normalizeText((source as Record<string, unknown>).Address) ||
      normalizeText((source as Record<string, unknown>).site_address),
    status: normalizeText((source as Record<string, unknown>).status) ||
      normalizeText((source as Record<string, unknown>).Status),
    date: normalizeText((source as Record<string, unknown>).date) ||
      normalizeText((source as Record<string, unknown>).Date) ||
      normalizeText((source as Record<string, unknown>).submitted_date),
    description: normalizeText((source as Record<string, unknown>).description) ||
      normalizeText((source as Record<string, unknown>).Description),
    owner: normalizeText((source as Record<string, unknown>).owner) ||
      normalizeText((source as Record<string, unknown>).Owner),
    tree_dbh: normalizeText((source as Record<string, unknown>).tree_dbh) ||
      normalizeText((source as Record<string, unknown>).DBH) ||
      normalizeText((source as Record<string, unknown>).dbh),
    tree_location: normalizeText((source as Record<string, unknown>).tree_location) ||
      normalizeText((source as Record<string, unknown>).TreeLocation),
    reason_removal: normalizeText((source as Record<string, unknown>).reason_removal) ||
      normalizeText((source as Record<string, unknown>).Reason) ||
      normalizeText((source as Record<string, unknown>).reason),
    tree_description: normalizeText((source as Record<string, unknown>).tree_description) ||
      normalizeText((source as Record<string, unknown>).TreeDescription),
    tree_number: normalizeText((source as Record<string, unknown>).tree_number) ||
      normalizeText((source as Record<string, unknown>).TreeNumber),
    species: normalizeText((source as Record<string, unknown>).species) ||
      normalizeText((source as Record<string, unknown>).Species),
    raw: source,
  };
}

async function fetchNdjson(url?: string): Promise<PermitRecord[]> {
  if (!url) return [];
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}`);
  }
  const text = await res.text();
  const lines = text.split(/\r?\n/);
  const records: PermitRecord[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as unknown;
      const normalized = normalizeRecord(parsed);
      if (normalized) {
        records.push(normalized);
      }
    } catch (err) {
      // Skip malformed NDJSON lines silently in production
    }
  }

  return records;
}

async function fetchGeojson(url?: string): Promise<PermitRecord[]> {
  if (!url) return [];
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}`);
  }
  const data = (await res.json()) as { features?: unknown };
  if (!data || !Array.isArray(data.features)) return [];

  const records: PermitRecord[] = [];
  for (const feature of data.features) {
    const normalized = normalizeRecord(feature);
    if (normalized) {
      records.push(normalized);
    }
  }

  return records;
}

export async function loadPermitData(dataUrl?: string, geojsonUrl?: string): Promise<PermitRecord[]> {
  try {
    const ndjsonRecords = await fetchNdjson(dataUrl);
    if (ndjsonRecords.length) {
      return ndjsonRecords;
    }
  } catch (err) {
    // Fallback to GeoJSON if NDJSON fails
  }

  const fallback = await fetchGeojson(geojsonUrl);
  if (fallback.length) {
    return fallback;
  }

  throw new Error('Unable to load permit data from provided sources.');
}

export function parseUsDateToUtc(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const match = dateStr.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3].length === 2 ? Number(match[3]) + 2000 : match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function weekKeyForUtcDate(date: Date): WeekRange {
  const day = date.getUTCDay();
  const offsetToMonday = (day + 6) % 7;
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - offsetToMonday));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 6));
  const format = (value: Date) => `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
  return { key: `${format(start)}..${format(end)}`, start, end };
}

export function buildWeekOptions(records: PermitRecord[]): WeekOption[] {
  const map = new Map<string, WeekRange>();
  for (const record of records) {
    const parsed = parseUsDateToUtc(record.date);
    if (!parsed) continue;
    const wk = weekKeyForUtcDate(parsed);
    if (!map.has(wk.key)) {
      map.set(wk.key, wk);
    }
  }

  const weeks = Array.from(map.values()).sort((a, b) => b.start.getTime() - a.start.getTime());
  return weeks.map((week) => {
    const formatLabel = (value: Date) => `${String(value.getUTCMonth() + 1).padStart(2, '0')}/${String(value.getUTCDate()).padStart(2, '0')}/${value.getUTCFullYear()}`;
    return {
      value: `W:${week.key}`,
      label: `Week ${formatLabel(week.start)} – ${formatLabel(week.end)}`,
      week,
    };
  });
}

export function filterRecordsByRange(records: PermitRecord[], rangeValue: string, weekLookup: Map<string, WeekOption>): PermitRecord[] {
  if (!rangeValue || rangeValue === 'ALL') {
    return records;
  }
  const week = weekLookup.get(rangeValue);
  if (!week) return records;

  const startMs = week.week.start.getTime();
  const endMs = week.week.end.getTime() + (24 * 60 * 60 * 1000 - 1);

  return records.filter((record) => {
    const parsed = parseUsDateToUtc(record.date);
    if (!parsed) return false;
    const time = parsed.getTime();
    return time >= startMs && time <= endMs;
  });
}
