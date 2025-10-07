import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Key } from 'react';
import type { Selection } from '@react-types/shared';
import { Alert, Badge, Button, Card, CardBody, Select, SelectItem, Spinner } from '@heroui/react';
import PermitDetailsPanel from './map/PermitDetailsPanel';
import { buildWeekOptions, filterRecordsByRange, loadPermitData } from './map/data';
import type { PermitRecord, WeekOption } from './map/types';
import OLMap from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import OSM from 'ol/source/OSM';
import GeoJSON from 'ol/format/GeoJSON';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { fromLonLat, toLonLat } from 'ol/proj';
import { Style, Circle, Fill, Stroke, Icon } from 'ol/style';
import Overlay from 'ol/Overlay';
import type { FeatureLike } from 'ol/Feature';
import 'ol/ol.css';

const DEFAULT_CENTER: [number, number] = [-84.3903, 33.749];
const DEFAULT_ZOOM = 11;
const DEFAULT_STREET_VIEW_MSG = 'Select a permit marker to see Street View imagery here.';
const BASE_PATH = (import.meta as any).env?.BASE_URL || '/';
const DEFAULT_GEOJSON_URL = `${BASE_PATH}docs/data/atl_arborist_ddh.geojson`;

const DEFAULT_EXCLUDED_REASON_KEYS = new Set<string>();
const UNKNOWN_REASON_KEY = 'UNKNOWN';
const UNKNOWN_REASON_LABEL = 'Unknown reason';

function normalizeReasonKey(value: string | null): string {
  if (!value) return UNKNOWN_REASON_KEY;
  const trimmed = value.trim();
  return trimmed.length ? trimmed.toUpperCase() : UNKNOWN_REASON_KEY;
}

function reasonLabelFrom(value: string | null): string {
  if (!value) return UNKNOWN_REASON_LABEL;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : UNKNOWN_REASON_LABEL;
}

type ReasonOption = {
  key: string;
  label: string;
};

function extractDbhValue(value: string | null): number | null {
  if (!value) return null;
  const matches = value.match(/\d+(?:\.\d+)?/g);
  if (!matches || !matches.length) return null;
  const numericValues = matches
    .map((match) => Number(match))
    .filter((num) => Number.isFinite(num) && num > 0);
  if (!numericValues.length) return null;
  return Math.max(...numericValues);
}

// SVG marker cache so we don't regenerate per feature
const markerSvgCache = new Map<string, string>();

function buildMarkerSvg(radius: number, selected: boolean): string {
  const key = `${radius}|${selected ? '1' : '0'}`;
  const cached = markerSvgCache.get(key);
  if (cached) return cached;

  const size = Math.ceil(radius * 2);

  // Outer wood-grain like circle and inner core highlight
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs>
      <radialGradient id="g1" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#fff" stop-opacity="0.35"/>
        <stop offset="55%" stop-color="#000" stop-opacity="0.08"/>
        <stop offset="100%" stop-color="#000" stop-opacity="0.18"/>
      </radialGradient>
      <radialGradient id="core" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#fde8c5"/>
        <stop offset="35%" stop-color="#f1c98c"/>
        <stop offset="70%" stop-color="#d68f4d"/>
        <stop offset="100%" stop-color="rgba(130,73,30,0.85)"/>
      </radialGradient>
    </defs>
    <g>
      <circle cx="${radius}" cy="${radius}" r="${radius - 1}" fill="#b8804b"/>
      <circle cx="${radius}" cy="${radius}" r="${radius - 1}" fill="url(#g1)"/>
      <circle cx="${radius}" cy="${radius}" r="${Math.max(2, Math.round(radius * 0.5))}" fill="url(#core)" stroke="rgba(133,79,43,0.6)" stroke-width="1"/>
    </g>
  </svg>`;

  const dataUrl = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  markerSvgCache.set(key, dataUrl);
  return dataUrl;
}

function buildTreeSvg(size: number): string {
  const key = `tree|${size}`;
  const cached = markerSvgCache.get(key);
  if (cached) return cached;

  const w = Math.ceil(size * 1.6);
  const h = Math.ceil(size * 1.8);
  const cx = Math.round(w / 2);
  const trunkW = Math.max(4, Math.round(size * 0.3));
  const trunkH = Math.max(6, Math.round(size * 0.6));

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      <linearGradient id="leaf" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="#5bb85b"/>
        <stop offset="100%" stop-color="#2d7d2d"/>
      </linearGradient>
    </defs>
    <!-- canopy -->
    <circle cx="${cx}" cy="${Math.round(h * 0.55)}" r="${Math.round(size * 0.9)}" fill="url(#leaf)" stroke="#1e5a2e" stroke-width="2"/>
    <!-- trunk -->
    <rect x="${cx - Math.round(trunkW/2)}" y="${h - trunkH - 2}" width="${trunkW}" height="${trunkH}" rx="2" fill="#8b5a2b" stroke="#5a381a" stroke-width="1"/>
  </svg>`;

  const dataUrl = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  markerSvgCache.set(key, dataUrl);
  return dataUrl;
}

function buildEmojiSvg(size: number, emoji: string): string {
  const key = `emoji|${emoji}|${size}`;
  const cached = markerSvgCache.get(key);
  if (cached) return cached;

  const w = Math.ceil(size);
  const h = Math.ceil(size);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-size="${Math.round(
      size * 0.9
    )}" font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif">${emoji}</text>
  </svg>`;

  const dataUrl = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  markerSvgCache.set(key, dataUrl);
  return dataUrl;
}

type MapAppOLProps = {
  apiKey: string;
  mapId: string;
  dataUrl?: string;
  geojsonUrl?: string;
};

function useMediaQuery(query: string): boolean {
  const getMatches = useCallback(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.matchMedia(query).matches;
  }, [query]);

  const [matches, setMatches] = useState<boolean>(() => getMatches());

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const mediaQueryList = window.matchMedia(query);
    const listener = (event: MediaQueryListEvent) => setMatches(event.matches);
    mediaQueryList.addEventListener('change', listener);

    setMatches(mediaQueryList.matches);

    return () => {
      mediaQueryList.removeEventListener('change', listener);
    };
  }, [getMatches, query]);

  return matches;
}

export default function MapAppOL({
  apiKey,
  geojsonUrl = DEFAULT_GEOJSON_URL,
}: MapAppOLProps): JSX.Element {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const streetViewRef = useRef<HTMLDivElement | null>(null);
  const olMapRef = useRef<OLMap | null>(null);
  const vectorLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const recordByIdRef = useRef<Map<string, PermitRecord>>(new Map());
  const recordsRef = useRef<PermitRecord[]>([]);

  const [dataError, setDataError] = useState<string | null>(null);
  const [records, setRecords] = useState<PermitRecord[]>([]);
  const [weekOptions, setWeekOptions] = useState<WeekOption[]>([]);
  const [reasonOptions, setReasonOptions] = useState<ReasonOption[]>([]);
  const [selectedReasons, setSelectedReasons] = useState<Set<string>>(() => new Set());
  const [selectedRange, setSelectedRange] = useState<string>('ALL');
  const [selectedRecord, setSelectedRecord] = useState<PermitRecord | null>(null);

  const [mapReady, setMapReady] = useState(false);
  const [loadingRecords, setLoadingRecords] = useState(false);

  const [streetViewReady, setStreetViewReady] = useState(false);
  const [streetViewVisible, setStreetViewVisible] = useState(false);
  const [streetViewMessage, setStreetViewMessage] = useState(DEFAULT_STREET_VIEW_MSG);

  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const showMobileDetails = !isDesktop && Boolean(selectedRecord);

  const weekLookup = useMemo(
    () => new Map(weekOptions.map((option) => [option.value, option])),
    [weekOptions],
  );

  const rangeFilteredRecords = useMemo(
    () => filterRecordsByRange(records, selectedRange, weekLookup),
    [records, selectedRange, weekLookup],
  );

  const filteredRecords = useMemo(() => {
    if (!rangeFilteredRecords.length) return rangeFilteredRecords;
    if (!selectedReasons.size) return rangeFilteredRecords;
    return rangeFilteredRecords.filter((record) => selectedReasons.has(normalizeReasonKey(record.reason_removal)));
  }, [rangeFilteredRecords, selectedReasons]);

  const reasonSelectedKeys = useMemo(() => new Set(selectedReasons), [selectedReasons]);

  const selectValue = selectedRange || 'ALL';
  const selectedKeys = useMemo(() => new Set([selectValue]), [selectValue]);

  const handleRangeChange = useCallback((value: string | null) => {
    setSelectedRange(value ?? 'ALL');
  }, []);

  const handleSelectChange = useCallback(
    (keys: Selection) => {
      if (keys === 'all') {
        handleRangeChange('ALL');
        return;
      }
      const [first] = Array.from(keys as Iterable<Key>);
      handleRangeChange(typeof first === 'string' ? first : null);
    },
    [handleRangeChange],
  );

  const handleReasonSelectionChange = useCallback(
    (keys: Selection) => {
      if (keys === 'all') {
        setSelectedReasons(new Set(reasonOptions.map((option) => option.key)));
        return;
      }
      const next = new Set<string>();
      for (const key of keys as Iterable<Key>) {
        if (typeof key === 'string') {
          next.add(key);
        }
      }
      setSelectedReasons(next);
    },
    [reasonOptions],
  );

  const toggleStreetView = useCallback(() => {
    setStreetViewVisible((prev) => {
      if (!streetViewReady && !prev) {
        return prev;
      }
      return !prev;
    });
  }, [streetViewReady]);

  const clearSelection = useCallback(() => {
    setSelectedRecord(null);
    setStreetViewVisible(false);
    setStreetViewReady(false);
    setStreetViewMessage(DEFAULT_STREET_VIEW_MSG);
  }, []);

  // Initialize OpenLayers map
  useEffect(() => {
    if (!mapRef.current) return;

    const vectorSource = new VectorSource();

    const vectorLayer = new VectorLayer({
      source: vectorSource,
      style: (feature: FeatureLike) => {
        const props = feature.getProperties();
        const dbhRaw = props.tree_dbh || props.DBH || props.dbh;
        const dbh = extractDbhValue(dbhRaw) || 0;
        const radius = Math.max(4, Math.min(20, 4 + dbh * 0.25));
        const svgUrl = buildMarkerSvg(radius, false);
        return new Style({
          image: new Icon({
            src: svgUrl,
            anchor: [radius, radius],
            anchorXUnits: 'pixels',
            anchorYUnits: 'pixels',
          }),
        });
      },
    });

    const map = new OLMap({
      target: mapRef.current,
      layers: [
        new TileLayer({
          source: new OSM(),
        }),
        vectorLayer,
      ],
      view: new View({
        center: fromLonLat(DEFAULT_CENTER),
        zoom: DEFAULT_ZOOM,
      }),
    });

    olMapRef.current = map;
    vectorLayerRef.current = vectorLayer;

    // Google-style hover popup overlay (light card, subtle shadow)
    const popupEl = document.createElement('div');
    popupEl.style.position = 'absolute';
    popupEl.style.transform = 'translate(-50%, -110%)';
    popupEl.style.background = '#ffffff';
    popupEl.style.color = '#1a1a1a';
    popupEl.style.padding = '8px 10px';
    popupEl.style.borderRadius = '10px';
    popupEl.style.fontSize = '12px';
    popupEl.style.lineHeight = '1.35';
    popupEl.style.pointerEvents = 'none';
    popupEl.style.boxShadow = '0 2px 6px rgba(0,0,0,0.30), 0 1px 2px rgba(0,0,0,0.15)';
    popupEl.style.border = '1px solid rgba(0,0,0,0.08)';
    popupEl.style.maxWidth = '520px';
    popupEl.style.minWidth = '320px';
    popupEl.style.display = 'none';

    // dynamic import without await to avoid async function; module is small
    const popupOverlay = new Overlay({
      element: popupEl,
      positioning: 'bottom-center',
      offset: [0, -8],
      stopEvent: false,
    });
    map.addOverlay(popupOverlay);

    const showHover = (feature: FeatureLike, coordinate: number[]) => {
      const p: any = feature.getProperties();
      const title = (p.address && String(p.address).trim().length)
        ? String(p.address)
        : (p.record || 'Permit details');
      const reason = p.reason_removal ? String(p.reason_removal) : 'Unknown';
      const dbhStr = p.tree_dbh ? String(p.tree_dbh) : '';

      popupEl.innerHTML = `
        <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;">
          <h3 style="margin: 0 0 6px 0; font-size: 14px; font-weight: 700; color: #1a1a1a;">
            ${title}
          </h3>
          <p style="margin: 0 0 4px 0; font-size: 12px; color: #444;">
            Removal reason: ${reason}
          </p>
          ${dbhStr ? `<p style="margin: 0; font-size: 12px; color: #444;">Reported DBH: ${dbhStr}</p>` : ''}
        </div>
      `;
      popupEl.style.display = 'block';
      popupOverlay.setPosition(coordinate);
    };

    const hideHover = () => {
      popupEl.style.display = 'none';
      popupOverlay.setPosition(undefined as unknown as number[]);
    };

    map.on('pointermove', (evt) => {
      if (evt.dragging) return;
      let handled = false;
      map.forEachFeatureAtPixel(evt.pixel, (feat, layer) => {
        if (layer !== vectorLayer) return undefined;
        showHover(feat as FeatureLike, evt.coordinate);
        handled = true;
        return true;
      }, { hitTolerance: 5 });
      if (!handled) hideHover();
    });

    // Handle marker clicks
    map.on('singleclick', (evt) => {
      let handled = false;
      map.forEachFeatureAtPixel(evt.pixel, (feature) => {
        const props = feature.getProperties() as any;
        const lookupKey: string | undefined = props.id || props.record;
        let matchingRecord: PermitRecord | undefined = lookupKey
          ? recordByIdRef.current.get(String(lookupKey))
          : undefined;

        if (!matchingRecord) {
          // Fallback: nearest by coordinate
          try {
            const geometry: any = (feature as any).getGeometry?.();
            const coord = geometry?.getCoordinates?.();
            if (Array.isArray(coord)) {
              const [lon, lat] = toLonLat(coord);
              let best: { d: number; rec: PermitRecord } | null = null;
              for (const rec of recordsRef.current) {
                if (!rec.coords) continue;
                const dx = Number(rec.coords[0]) - lon;
                const dy = Number(rec.coords[1]) - lat;
                const d = dx * dx + dy * dy;
                if (!best || d < best.d) best = { d, rec };
              }
              if (best) matchingRecord = best.rec;
            }
          } catch {}
        }

        if (matchingRecord) {
          setSelectedRecord(matchingRecord);
          
          // Load Street View if API key is available
          if (apiKey && streetViewRef.current) {
            loadStreetView(matchingRecord);
          }
          
          handled = true;
          return true;
        }
      });

      if (!handled) {
        clearSelection();
      }
    });

    vectorSource.on('change', () => {
      if (vectorSource.getState() === 'ready') {
        setMapReady(true);
      }
    });

    vectorSource.on('error', () => {
      setDataError('Failed to load map data');
    });

    return () => {
      map.setTarget(undefined);
    };
  }, [apiKey, clearSelection]);

  // Keep lookup maps in sync with current records
  useEffect(() => {
    recordsRef.current = records;
    const next = new Map<string, PermitRecord>();
    for (const r of records) {
      if (r.id) next.set(r.id, r);
      if (r.record) next.set(r.record, r);
    }
    recordByIdRef.current = next;
  }, [records]);

  const loadStreetView = useCallback((record: PermitRecord) => {
    if (!streetViewRef.current) return;

    if (!apiKey || !apiKey.trim()) {
      setStreetViewReady(false);
      setStreetViewVisible(false);
      setStreetViewMessage('Street View requires an API key.');
      return;
    }

    setStreetViewMessage('Loading Street View imagery...');

    // Load Google Maps API if not already loaded
    if (!window.google?.maps) {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
      script.async = true;
      script.onload = () => {
        initStreetView(record);
      };
      script.onerror = () => {
        setStreetViewReady(false);
        setStreetViewVisible(false);
        setStreetViewMessage('Failed to load Google Maps. Check API key/referrer.');
      };
      document.head.appendChild(script);
    } else {
      initStreetView(record);
    }
  }, [apiKey]);

  const initStreetView = useCallback((record: PermitRecord) => {
    if (!window.google?.maps || !streetViewRef.current) return;

    const defaultPosition = record.latLng;
    const panorama = new window.google.maps.StreetViewPanorama(
      streetViewRef.current,
      {
        position: defaultPosition,
        pov: { heading: 0, pitch: 0 },
        visible: false,
        // iOS Safari compatibility options
        disableDefaultUI: false,
        panControl: true,
        zoomControl: true,
        fullscreenControl: true,
        motionTracking: false, // Disable motion tracking on iOS
        clickToGo: true,
        scrollwheel: false, // Disable scrollwheel on mobile
        keyboardShortcuts: false, // Disable keyboard shortcuts on mobile
      }
    );

    const streetViewService = new window.google.maps.StreetViewService();

    const trySV = (pos: google.maps.LatLng | google.maps.LatLngLiteral, onDone?: (ok: boolean) => void) => {
      streetViewService.getPanorama({ location: pos, radius: 75 }, (data, status) => {
        const ok = status === window.google.maps.StreetViewStatus.OK && !!data?.location?.latLng;
        if (ok && data?.location?.latLng) {
          panorama.setPosition(data.location.latLng);
          // Small delay for iOS Safari compatibility
          setTimeout(() => {
            panorama.setVisible(true);
            setStreetViewReady(true);
            setStreetViewVisible(true);
            setStreetViewMessage('');
          }, 100);
        } else {
          panorama.setVisible(false);
          setStreetViewReady(false);
          setStreetViewVisible(false);
          setStreetViewMessage('Street View imagery is not available at this location.');
        }
        if (onDone) onDone(ok);
      });
    };

    // Always geocode the address first for most accurate coordinates, then try Street View
    const address = record.address?.trim();
    if (address) {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ address }, (results, status) => {
        if (status === 'OK' && results && results[0]?.geometry?.location) {
          // Use geocoded coordinates (more accurate)
          trySV(results[0].geometry.location);
        } else {
          // Fallback to original coordinates if geocoding fails
          trySV(defaultPosition);
        }
      });
    } else {
      // No address available, use original coordinates
      trySV(defaultPosition);
    }
  }, []);

  // Load permit data
  useEffect(() => {
    let cancelled = false;
    setLoadingRecords(true);
    setDataError(null);

    loadPermitData(`${BASE_PATH}docs/data/all.ndjson`, geojsonUrl)
      .then((loaded) => {
        if (cancelled) return;
        setRecords(loaded);
        setWeekOptions(buildWeekOptions(loaded));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setDataError(err instanceof Error ? err.message : 'Failed to load permit dataset.');
        setRecords([]);
        setWeekOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingRecords(false);
      });

    return () => {
      cancelled = true;
    };
  }, [geojsonUrl]);

  // Push records into OL vector layer so all data renders
  useEffect(() => {
    const layer = vectorLayerRef.current;
    if (!layer) return;
    const source = layer.getSource() as VectorSource | null;
    if (!source) return;
    source.clear();

    const newFeatures: Feature[] = [];
    for (const r of records) {
      const lon = r.coords ? Number(r.coords[0]) : Number(r.latLng?.lng);
      const lat = r.coords ? Number(r.coords[1]) : Number(r.latLng?.lat);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      const f = new Feature({
        geometry: new Point(fromLonLat([lon, lat])),
        id: r.id,
        record: r.record,
        address: r.address,
        reason_removal: r.reason_removal,
        tree_dbh: r.tree_dbh,
        DBH: r.tree_dbh,
      });
      newFeatures.push(f);
    }
    source.addFeatures(newFeatures);
  }, [records]);

  // Build reason options
  useEffect(() => {
    if (!records.length) {
      setReasonOptions([]);
      setSelectedReasons(new Set<string>());
      return;
    }

    const optionMap: Record<string, ReasonOption> = {};
    let nonExcludedRecordCount = 0;
    for (const record of records) {
      const key = normalizeReasonKey(record.reason_removal);
      if (!optionMap[key]) {
        optionMap[key] = { key, label: reasonLabelFrom(record.reason_removal) };
      }
      if (!DEFAULT_EXCLUDED_REASON_KEYS.has(key)) {
        nonExcludedRecordCount += 1;
      }
    }

    const options = Object.values(optionMap).sort((a, b) => a.label.localeCompare(b.label));
    const defaultSelection = new Set<string>();
    const shouldFallbackToAll = nonExcludedRecordCount === 0;
    if (shouldFallbackToAll) {
      options.forEach((option) => defaultSelection.add(option.key));
    } else {
      for (const option of options) {
        if (!DEFAULT_EXCLUDED_REASON_KEYS.has(option.key)) {
          defaultSelection.add(option.key);
        }
      }
    }

    const matchesWithDefault = records.some((record) =>
      defaultSelection.has(normalizeReasonKey(record.reason_removal)),
    );
    if (!matchesWithDefault) {
      defaultSelection.clear();
      options.forEach((option) => defaultSelection.add(option.key));
    }

    setReasonOptions(options);
    
    // Check if any previous selections are still valid
    const validKeys = new Set(options.map(o => o.key));
    setSelectedReasons((prev) => {
      if (prev.size) {
        const next = new Set<string>();
        prev.forEach((value) => {
          if (validKeys.has(value)) {
            next.add(value);
          }
        });
        if (next.size) {
          return next;
        }
      }
      return defaultSelection;
    });
  }, [records]);

  // Filter features on the map based on selected filters
  useEffect(() => {
    if (!vectorLayerRef.current) return;

    const filteredIds = new Set(filteredRecords.map(r => r.id));
    const filteringActive = selectedRange !== 'ALL' || selectedReasons.size > 0;
    
    vectorLayerRef.current.setStyle((feature: FeatureLike) => {
      const props = feature.getProperties();
      const matchingRecord = records.find(r => r.record === props.record);
      if (filteringActive && matchingRecord && !filteredIds.has(matchingRecord.id)) {
        return new Style({}); // hide
      }

      const dbhRaw = props.tree_dbh || props.DBH || props.dbh;
      const dbh = extractDbhValue(dbhRaw) || 0;
      const baseRadius = Math.max(4, Math.min(20, 4 + dbh * 0.25));
      const isSelected = matchingRecord && selectedRecord && matchingRecord.id === selectedRecord.id;
      const iconRadius = isSelected ? baseRadius + 1 : baseRadius;
      const svgUrl = isSelected
        ? buildEmojiSvg(iconRadius * 1.8, '🌳')
        : buildMarkerSvg(iconRadius, false);
      return new Style({
        zIndex: isSelected ? 1000 : 0,
        image: new Icon({
          src: svgUrl,
          anchor: [iconRadius, iconRadius],
          anchorXUnits: 'pixels',
          anchorYUnits: 'pixels',
        }),
      });
    });
  }, [filteredRecords, records, selectedRecord, selectedRange, selectedReasons.size]);

  const statsText = loadingRecords
    ? 'Loading permit data...'
    : `Showing ${filteredRecords.length.toLocaleString()} of ${records.length.toLocaleString()} permits`;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div className="max-w-xl space-y-2">
          <p className="text-sm text-foreground-600">
            Click on any marker to view permit details, including tree species, size, location, and reason for removal.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge color="primary" variant="flat">
            {statsText}
          </Badge>
        </div>
        {dataError && (
          <Alert color="danger" title="Data load failed" className="max-w-2xl">
            {dataError}
          </Alert>
        )}
      </div>

      <div className="flex w-full flex-col gap-3 sm:flex-row sm:gap-4">
        <Select
          label="View all data"
          labelPlacement="outside"
          placeholder="Select a range"
          selectedKeys={selectedKeys}
          onSelectionChange={handleSelectChange}
          isDisabled={loadingRecords || (!!dataError && records.length === 0)}
          className="w-full sm:max-w-xs"
          disallowEmptySelection
        >
          <SelectItem key="ALL" textValue="All data">
            All data (entire history)
          </SelectItem>
          <>
            {weekOptions.map((option) => (
              <SelectItem key={option.value} textValue={option.label}>
                {option.label}
              </SelectItem>
            ))}
          </>
        </Select>
        <Select
          label="Removal reasons"
          labelPlacement="outside"
          placeholder="Filter removal reasons"
          selectionMode="multiple"
          selectedKeys={reasonSelectedKeys}
          onSelectionChange={handleReasonSelectionChange}
          isDisabled={!reasonOptions.length}
          className="w-full sm:max-w-xs"
        >
          {reasonOptions.map((option) => (
            <SelectItem key={option.key} textValue={option.label}>
              {option.label}
            </SelectItem>
          ))}
        </Select>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card radius="lg" shadow="sm" className="relative">
          <CardBody className="p-0">
            <div 
              ref={mapRef} 
              className="relative h-[720px] w-full rounded-2xl overflow-hidden"
              style={{ background: '#eaf3ea' }}
            >
              {!mapReady && loadingRecords && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/5">
                  <Spinner color="primary" size="lg" />
                  <p className="font-medium text-foreground">
                    {loadingRecords ? 'Loading map data...' : 'Preparing map...'}
                  </p>
                </div>
              )}
            </div>
          </CardBody>
        </Card>

        {isDesktop && (
          <div className="hidden lg:flex lg:flex-col lg:gap-4">
            <Card radius="lg" shadow="sm" className="min-h-[340px]">
              <CardBody className="flex flex-col gap-4">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold text-foreground">Street View</p>
                      <p className="text-sm text-foreground-600">Select a marker to preview the location.</p>
                    </div>
                    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
                      <Button
                        variant="flat"
                        color="primary"
                        size="sm"
                        onPress={toggleStreetView}
                        isDisabled={!streetViewReady}
                        className="w-full sm:w-auto"
                      >
                        {streetViewVisible ? 'Hide Street View' : 'Show Street View'}
                      </Button>
                      {selectedRecord && (
                        <Button variant="light" size="sm" onPress={clearSelection} className="w-full sm:w-auto">
                          Clear
                        </Button>
                      )}
                    </div>
                  </div>
                  {!streetViewVisible && (
                    <div className="min-h-[200px] flex items-center justify-center rounded-lg border border-dashed border-foreground-300 bg-foreground-50/50 p-6 text-center">
                      <p className="text-sm text-foreground-600">{streetViewMessage}</p>
                    </div>
                  )}
                  <div 
                    ref={streetViewRef} 
                    className="w-full h-[320px] rounded-lg overflow-hidden bg-gray-200"
                    style={{ 
                      display: streetViewVisible ? 'block' : 'none',
                      // iOS Safari fixes for Google Street View
                      WebkitTransform: 'translateZ(0)',
                      transform: 'translateZ(0)',
                      WebkitBackfaceVisibility: 'hidden',
                      backfaceVisibility: 'hidden',
                      position: 'relative',
                      zIndex: 1
                    }}
                  />
                </div>
              </CardBody>
            </Card>

            <PermitDetailsPanel record={selectedRecord} onClear={clearSelection} />
          </div>
        )}
      </div>

      {!isDesktop && showMobileDetails && (
        <div className="fixed inset-0 z-40 lg:hidden pointer-events-auto">
          <div className="absolute inset-0 bg-black/40" onClick={clearSelection} />
          <div className="absolute inset-x-0 bottom-0 flex justify-center px-4 pb-4">
            <div
              className="transform rounded-t-3xl bg-background shadow-2xl w-full max-w-xl max-h-[88vh] overflow-y-auto px-5 pb-6 pt-5"
              role="dialog"
              aria-modal="true"
              aria-label="Permit details"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex flex-col">
                  <p className="text-base font-semibold text-foreground">
                    {selectedRecord?.address || selectedRecord?.record || 'Permit details'}
                  </p>
                </div>
                <Button size="sm" variant="light" onPress={clearSelection} className="w-auto">
                  Close
                </Button>
              </div>

              <div className="flex flex-col gap-4 mb-6">
                <Button
                  variant="flat"
                  color="primary"
                  size="sm"
                  onPress={toggleStreetView}
                  isDisabled={!streetViewReady}
                  className="w-full"
                >
                  {streetViewVisible ? 'Hide Street View' : 'Show Street View'}
                </Button>
                {!streetViewVisible && (
                  <div className="min-h-[180px] flex items-center justify-center rounded-lg border border-dashed border-foreground-300 bg-foreground-50/50 p-4 text-center">
                    <p className="text-sm text-foreground-600">{streetViewMessage}</p>
                  </div>
                )}
                <div 
                  ref={streetViewRef} 
                  className="w-full h-[260px] rounded-lg overflow-hidden bg-gray-200"
                  style={{ 
                    display: streetViewVisible ? 'block' : 'none',
                    // iOS Safari fixes for Google Street View
                    WebkitTransform: 'translateZ(0)',
                    transform: 'translateZ(0)',
                    WebkitBackfaceVisibility: 'hidden',
                    backfaceVisibility: 'hidden',
                    position: 'relative',
                    zIndex: 1
                  }}
                />
              </div>

              {selectedRecord && (
                <div className="mt-6">
                  <PermitDetailsPanel record={selectedRecord} onClear={clearSelection} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

