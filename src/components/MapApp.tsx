import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import type { Key } from 'react';
import type { Selection } from '@react-types/shared';
import { Alert, Badge, Button, Card, CardBody, Select, SelectItem, Spinner } from '@heroui/react';
import PermitDetailsPanel, { PermitDetailsContent } from './map/PermitDetailsPanel';
import { buildWeekOptions, filterRecordsByRange, loadPermitData } from './map/data';
import { buildMarkerStyles } from './map/markers';
import type { PermitRecord, WeekOption } from './map/types';

const DEFAULT_CENTER: google.maps.LatLngLiteral = { lat: 33.749, lng: -84.3903 };
const DEFAULT_ZOOM = 11;
const DEFAULT_STREET_VIEW_MSG = 'Select a permit marker to see Street View imagery here.';
const DEFAULT_DATA_URL = '/docs/data/all.ndjson';
const DEFAULT_GEOJSON_URL = '/docs/data/atl_arborist_ddh.geojson';

const GOOGLE_SCRIPT_ATTR = 'data-treeheroes-google-maps';
const GOOGLE_SCRIPT_KEY_ATTR = 'data-treeheroes-google-maps-key';

let googleMapsLoadingPromise: Promise<typeof google.maps> | null = null;
let googleMapsLoaderKey: string | null = null;

const mapLayoutStyles: {
  shell: CSSProperties;
  canvas: CSSProperties;
  overlay: CSSProperties;
} = {
  shell: {
    position: 'relative',
    minHeight: '720px',
    borderRadius: '1.25rem',
    overflow: 'hidden',
    background: '#eaf3ea',
    boxShadow: 'inset 0 0 50px rgba(45, 80, 22, 0.08)',
  },
  canvas: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(135deg, rgba(45, 80, 22, 0.08), rgba(107, 124, 50, 0.08))',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    alignItems: 'center',
    justifyContent: 'center',
  },
};

const streetViewStyles: {
  placeholder: CSSProperties;
  placeholderHidden: CSSProperties;
  canvas: CSSProperties;
  canvasVisible: CSSProperties;
} = {
  placeholder: {
    minHeight: '200px',
    borderRadius: '1rem',
    border: '1px dashed rgba(45, 80, 22, 0.3)',
    background: 'rgba(240, 248, 240, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1.5rem',
    textAlign: 'center',
    overflow: 'hidden',
    transition: 'opacity 0.3s ease, visibility 0.3s ease',
  },
  placeholderHidden: {
    opacity: 0,
    visibility: 'hidden',
    height: 0,
    minHeight: 0,
    padding: 0,
    border: '0',
    margin: 0,
  },
  canvas: {
    display: 'none',
    height: '320px',
    borderRadius: '1rem',
    overflow: 'hidden',
    background: '#e9ecef',
  },
  canvasVisible: {
    display: 'block',
  },
};

type ReasonOption = {
  key: string;
  label: string;
};

const DEFAULT_EXCLUDED_REASON_KEYS = new Set(['DYING TREE', 'DECEASED']);
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

type MapContext = {
  apiKey: string;
  mapId: string;
  maps: typeof google.maps;
  map: google.maps.Map;
  panorama: google.maps.StreetViewPanorama | null;
  streetViewService: google.maps.StreetViewService | null;
  markers: google.maps.marker.AdvancedMarkerElement[];
  infoWindow: google.maps.InfoWindow | null;
  mapReady: boolean;
};

type MapAppProps = {
  apiKey: string;
  mapId: string;
  dataUrl?: string;
  geojsonUrl?: string;
};

// Native Google Maps implementation - no need for GoogleApiLoaded type

type SimpleBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

function areRecordArraysEqual(left: PermitRecord[], right: PermitRecord[]): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) {
      return false;
    }
  }
  return true;
}

function toSimpleBoundsFromGoogle(bounds: google.maps.LatLngBounds): SimpleBounds {
  const northEast = bounds.getNorthEast();
  const southWest = bounds.getSouthWest();
  return {
    north: northEast.lat(),
    east: northEast.lng(),
    south: southWest.lat(),
    west: southWest.lng(),
  };
}

// Removed toSimpleBoundsFromChange - using native bounds directly

function isWithinBounds(position: google.maps.LatLngLiteral, bounds: SimpleBounds): boolean {
  const { lat, lng } = position;
  if (lat < bounds.south || lat > bounds.north) {
    return false;
  }

  if (bounds.west <= bounds.east) {
    return lng >= bounds.west && lng <= bounds.east;
  }

  // Handle bounds that cross the anti-meridian.
  return lng >= bounds.west || lng <= bounds.east;
}

function ensureGoogleMaps(apiKey: string): Promise<typeof google.maps> {
  const trimmedKey = apiKey.trim();
  if (!trimmedKey) {
    return Promise.reject(new Error('A Google Maps JavaScript API key is required.'));
  }

  if (window.google?.maps) {
    return Promise.resolve(window.google.maps);
  }

  if (googleMapsLoadingPromise && googleMapsLoaderKey === trimmedKey) {
    return googleMapsLoadingPromise;
  }

  if (typeof document === 'undefined') {
    return Promise.reject(new Error('Google Maps cannot load outside the browser environment.'));
  }

  googleMapsLoaderKey = trimmedKey;

  const existingScript = document.querySelector<HTMLScriptElement>(`script[${GOOGLE_SCRIPT_ATTR}]`);
  if (existingScript) {
    const existingKey = existingScript.getAttribute(GOOGLE_SCRIPT_KEY_ATTR);
    if (existingKey && existingKey !== trimmedKey) {
      existingScript.remove();
      googleMapsLoadingPromise = null;
    } else {
      googleMapsLoadingPromise = new Promise((resolve, reject) => {
        const handleLoad = () => {
          if (window.google?.maps) {
            resolve(window.google.maps);
          } else {
            reject(new Error('Google Maps script loaded but window.google.maps is unavailable.'));
          }
        };
        const handleError = () => {
          existingScript.remove();
          googleMapsLoadingPromise = null;
          googleMapsLoaderKey = null;
          reject(new Error('Failed to load Google Maps script.'));
        };

        existingScript.addEventListener('load', handleLoad, { once: true });
        existingScript.addEventListener('error', handleError, { once: true });
      });
      return googleMapsLoadingPromise;
    }
  }

  googleMapsLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(trimmedKey)}&libraries=geometry,marker`;
    script.async = true;
    script.defer = true;
    script.setAttribute(GOOGLE_SCRIPT_ATTR, 'loading');
    script.setAttribute(GOOGLE_SCRIPT_KEY_ATTR, trimmedKey);

    script.onload = () => {
      script.setAttribute(GOOGLE_SCRIPT_ATTR, 'ready');
      if (window.google?.maps) {
        resolve(window.google.maps);
      } else {
        script.remove();
        googleMapsLoadingPromise = null;
        googleMapsLoaderKey = null;
        reject(new Error('Google Maps script loaded but window.google.maps is unavailable.'));
      }
    };

    script.onerror = () => {
      script.remove();
      googleMapsLoadingPromise = null;
      googleMapsLoaderKey = null;
      reject(new Error('Failed to load Google Maps script.'));
    };

    document.head.appendChild(script);
  });

  return googleMapsLoadingPromise;
}

function applyStyles(element: HTMLElement, styles: CSSProperties): void {
  Object.entries(styles).forEach(([property, value]) => {
    if (value == null) return;
    try {
      // Type coercion is safe here because we control the styles object.
      (element.style as unknown as Record<string, unknown>)[property] = value as unknown;
    } catch (error) {
      // Ignore invalid assignments to keep rendering resilient.
    }
  });
}

function setMarkerSelectionState(element: HTMLElement, isSelected: boolean): void {
  const baseShadow = '0 2px 6px rgba(0, 0, 0, 0.35)';
  element.style.boxShadow = isSelected
    ? `${baseShadow}, 0 0 0 3px rgba(58, 157, 58, 0.45)`
    : baseShadow;
  element.dataset.selected = isSelected ? 'true' : 'false';
  element.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
}

function buildMarkerContent(record: PermitRecord, isSelected: boolean): HTMLElement {
  const { container, highlight, core, dbh } = buildMarkerStyles(record);

  const root = document.createElement('div');
  root.className = 'treeheroes-marker';
  root.style.transform = 'translate(-50%, -50%)';
  root.style.cursor = 'pointer';
  root.style.pointerEvents = 'auto';
  applyStyles(root, container);

  const highlightElement = document.createElement('span');
  applyStyles(highlightElement, highlight);
  root.appendChild(highlightElement);

  const coreElement = document.createElement('span');
  applyStyles(coreElement, core);
  root.appendChild(coreElement);

  if (dbh) {
    root.dataset.dbh = String(dbh);
  } else {
    delete root.dataset.dbh;
  }

  setMarkerSelectionState(root, isSelected);
  return root;
}

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

export default function MapApp({
  apiKey,
  mapId,
  dataUrl = DEFAULT_DATA_URL,
  geojsonUrl = DEFAULT_GEOJSON_URL,
}: MapAppProps): JSX.Element {
  const contextRef = useRef<MapContext | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const streetViewRef = useRef<HTMLDivElement | null>(null);

  const [mapsError, setMapsError] = useState<string | null>(null);
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
  const [visibleRecords, setVisibleRecords] = useState<PermitRecord[]>([]);

  const mapBoundsRef = useRef<SimpleBounds | null>(null);

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

  const sanitizedApiKey = useMemo(() => apiKey?.trim() ?? '', [apiKey]);
  const sanitizedMapId = useMemo(() => mapId?.trim() ?? '', [mapId]);

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

  const recomputeVisibleRecords = useCallback(
    (recordsToFilter: PermitRecord[], bounds: SimpleBounds | null, focusedRecord: PermitRecord | null) => {
      if (!recordsToFilter.length) {
        setVisibleRecords((prev) => (prev.length ? [] : prev));
        return;
      }

      if (!bounds) {
        setVisibleRecords((prev) => (areRecordArraysEqual(prev, recordsToFilter) ? prev : recordsToFilter));
        return;
      }

      const withinBounds = recordsToFilter.filter((record) => isWithinBounds(record.latLng, bounds));
      let nextRecords = withinBounds;

      if (focusedRecord && !withinBounds.some((record) => record.id === focusedRecord.id)) {
        nextRecords = [...withinBounds, focusedRecord];
      }

      setVisibleRecords((prev) => (areRecordArraysEqual(prev, nextRecords) ? prev : nextRecords));
    },
    [],
  );

  const initializeMap = useCallback(() => {
    const mapElement = mapRef.current;
    const streetViewElement = streetViewRef.current;
    
    if (!mapElement || !window.google?.maps) {
      setMapsError('Google Maps API not loaded');
      return;
    }

    const maps = window.google.maps;

    if (!maps.marker?.AdvancedMarkerElement) {
      setMapsError('Advanced markers are unavailable. Ensure the marker library is enabled for your API key.');
      return;
    }
    const streetViewService = new maps.StreetViewService();
    let panorama: google.maps.StreetViewPanorama | null = null;

    // Initialize Street View
    if (streetViewElement) {
      panorama = new maps.StreetViewPanorama(streetViewElement, {
        position: DEFAULT_CENTER,
        visible: false,
        pov: { heading: 0, pitch: 0 },
        motionTracking: false,
        addressControl: false,
      });
    }

    // Initialize map with Advanced Vector UI
    const map = new maps.Map(mapElement, {
      mapId: sanitizedMapId,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      controlSize: 24,
      clickableIcons: false,
      zoomControl: true,
      zoomControlOptions: {
        position: maps.ControlPosition.RIGHT_BOTTOM,
      },
      gestureHandling: 'greedy',
      // Add error handling for WebGL issues
      mapTypeId: maps.MapTypeId.ROADMAP,
    });

    // Initialize context with mapReady: false
    contextRef.current = {
      apiKey: sanitizedApiKey,
      mapId: sanitizedMapId,
      maps,
      map,
      panorama,
      streetViewService,
      markers: [],
      infoWindow: null,
      mapReady: false,
    };

    // Wait for map to be ready before proceeding
    // Use tilesloaded event which fires after the map tiles are fully rendered
    maps.event.addListenerOnce(map, 'tilesloaded', () => {
      // Add a delay to ensure WebGL context is fully initialized
      // Increased delay to handle complex WebGL initialization
      setTimeout(() => {
        if (contextRef.current) {
          contextRef.current.mapReady = true;
          setMapReady(true);
          console.log('Map is fully ready for interactions');
        }
      }, 1000);
    });

    // Set Street View on map
    if (panorama) {
      map.setStreetView(panorama);
    }

    setSelectedRecord(null);
    setStreetViewReady(false);
    setStreetViewVisible(false);
    setStreetViewMessage(DEFAULT_STREET_VIEW_MSG);
    setMapsError(null);

    // Set up map bounds listener
    const boundsListener = maps.event.addListener(map, 'bounds_changed', () => {
      const bounds = map.getBounds();
      if (bounds) {
        mapBoundsRef.current = toSimpleBoundsFromGoogle(bounds);
        recomputeVisibleRecords(filteredRecords, mapBoundsRef.current, selectedRecord);
      }
    });

    // Store listener for cleanup
    (contextRef.current as any).boundsListener = boundsListener;

    const initialBounds = map.getBounds();
    if (initialBounds) {
      mapBoundsRef.current = toSimpleBoundsFromGoogle(initialBounds);
      recomputeVisibleRecords(filteredRecords, mapBoundsRef.current, null);
    } else {
      recomputeVisibleRecords(filteredRecords, null, null);
    }
  }, [filteredRecords, recomputeVisibleRecords, sanitizedApiKey, sanitizedMapId]);

  const handleMarkerClick = useCallback((record: PermitRecord) => {
    const ctx = contextRef.current;
    if (!ctx || !ctx.mapReady) {
      return;
    }

    const position = record.latLng;
    if (!position) return;

    setSelectedRecord(record);
    setStreetViewMessage('Loading Street View imagery...');

    // Note: Removed panTo operation as it causes WebGL "Not initialized" errors
    // The marker is already visible on the map, so panning is not essential

    if (ctx.streetViewService && ctx.panorama) {
      ctx.streetViewService.getPanorama({ location: position, radius: 75 }, (data, status) => {
        if (!contextRef.current || contextRef.current !== ctx) return;

        if (status === ctx.maps.StreetViewStatus.OK && data?.location?.latLng && ctx.panorama) {
          const panoPos = data.location.latLng;
          ctx.panorama.setPosition(panoPos);
          const heading = 0; // Default heading since tiles.heading doesn't exist on StreetViewTileData
          ctx.panorama.setPov({ heading, pitch: 0 });
          ctx.panorama.setVisible(true);
          setStreetViewReady(true);
          setStreetViewVisible(true);
          setStreetViewMessage('');
        } else {
          if (ctx.panorama) {
            ctx.panorama.setVisible(false);
          }
          setStreetViewReady(false);
          setStreetViewVisible(false);
          setStreetViewMessage('Street View imagery is not available at this location.');
        }
      });
    } else if (ctx.panorama) {
      ctx.panorama.setPosition(position);
      ctx.panorama.setVisible(true);
      setStreetViewReady(true);
      setStreetViewVisible(true);
      setStreetViewMessage('');
    }
  }, []);

  // Create tooltip content HTML
  const createTooltipContent = useCallback((record: PermitRecord) => {
    return `
      <div style="padding: 8px; max-width: 300px; font-family: system-ui, -apple-system, sans-serif;">
        <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: bold; color: #1a1a1a;">
          ${record.address || record.record || 'Permit details'}
        </h3>
        <p style="margin: 0 0 4px 0; font-size: 14px; color: #666;">
          Removal reason: ${record.reason_removal || 'Unknown'}
        </p>
        ${record.tree_dbh ? `
          <p style="margin: 0; font-size: 14px; color: #666;">
            Reported DBH: ${record.tree_dbh}
          </p>
        ` : ''}
      </div>
    `;
  }, []);

  // Native marker management functions
  const createNativeMarker = useCallback(
    (record: PermitRecord): google.maps.marker.AdvancedMarkerElement | null => {
      const ctx = contextRef.current;
      if (!ctx) return null;

      const AdvancedMarkerElement = ctx.maps.marker?.AdvancedMarkerElement;
      if (!AdvancedMarkerElement) {
        return null;
      }

      // Always create markers as unselected - selection state will be updated separately
      const content = buildMarkerContent(record, false);

      let marker: google.maps.marker.AdvancedMarkerElement;
      try {
        marker = new AdvancedMarkerElement({
          map: ctx.map,
          position: record.latLng,
          title: record.address || record.record || 'Permit',
          content,
        });
      } catch (error) {
        console.warn('Failed to create AdvancedMarkerElement:', error);
        return null;
      }

      const tooltipInfoWindow = new ctx.maps.InfoWindow({
        content: createTooltipContent(record),
        disableAutoPan: true,
      });

      let tooltipOpen = false;

      const openTooltip = () => {
        if (tooltipOpen) return;
        tooltipInfoWindow.open({ anchor: marker, map: ctx.map, shouldFocus: false });
        tooltipOpen = true;
      };

      const closeTooltip = () => {
        if (!tooltipOpen) return;
        tooltipInfoWindow.close();
        tooltipOpen = false;
      };

      const activateMarker = () => {
        closeTooltip();
        handleMarkerClick(record);
      };

      const handlePointerEnter = () => {
        openTooltip();
      };

      const handlePointerLeave = () => {
        closeTooltip();
      };

      const handleClick = (event: any) => {
        // Google Maps event object may not have preventDefault/stopPropagation
        if (event && typeof event.preventDefault === 'function') {
          event.preventDefault();
        }
        if (event && typeof event.stopPropagation === 'function') {
          event.stopPropagation();
        }
        activateMarker();
      };

      // Use addListener on the AdvancedMarkerElement instead of content element
      const clickListener = marker.addListener('click', handleClick);
      
      content.addEventListener('pointerenter', handlePointerEnter);
      content.addEventListener('pointerleave', handlePointerLeave);

      // Store references on the marker for future updates and cleanup.
      (marker as any).record = record;
      (marker as any).contentElement = content;
      (marker as any).tooltipInfoWindow = tooltipInfoWindow;
      (marker as any).clickListener = clickListener;
      (marker as any).cleanup = () => {
        closeTooltip();
        // Store the listener reference for cleanup
        const clickListener = (marker as any).clickListener;
        if (clickListener) {
          google.maps.event.removeListener(clickListener);
        }
        content.removeEventListener('pointerenter', handlePointerEnter);
        content.removeEventListener('pointerleave', handlePointerLeave);
      };

      return marker;
    },
    [createTooltipContent, handleMarkerClick],
  );

  const updateMarkers = useCallback((records: PermitRecord[]) => {
    const ctx = contextRef.current;
    if (!ctx || !ctx.mapReady) return;

    // Clear existing markers and their tooltips
    ctx.markers.forEach((marker) => {
      const tooltipInfoWindow = (marker as any).tooltipInfoWindow;
      if (tooltipInfoWindow) {
        tooltipInfoWindow.close();
      }
      const cleanup = (marker as any).cleanup as (() => void) | undefined;
      if (cleanup) {
        cleanup();
      }
      marker.map = null;
    });
    ctx.markers.length = 0;

    // Create new markers
    records.forEach(record => {
      const marker = createNativeMarker(record);
      if (marker) {
        ctx.markers.push(marker);
      }
    });
  }, [createNativeMarker]);

  // Update marker appearance when selection changes
  const updateMarkerSelection = useCallback(() => {
    const ctx = contextRef.current;
    if (!ctx) return;

    ctx.markers.forEach((marker) => {
      const record = (marker as any).record as PermitRecord | undefined;
      const contentElement = (marker as any).contentElement as HTMLElement | undefined;
      if (record && contentElement) {
        const isSelected = selectedRecord?.id === record.id;
        setMarkerSelectionState(contentElement, Boolean(isSelected));
      }
    });
  }, [selectedRecord?.id]);

  // Load Google Maps API script
  const loadGoogleMapsScript = useCallback((): Promise<typeof google.maps> => {
    if (!sanitizedApiKey) {
      return Promise.reject(new Error('A Google Maps JavaScript API key is required.'));
    }

    return ensureGoogleMaps(sanitizedApiKey);
  }, [sanitizedApiKey]);

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
    const ctx = contextRef.current;
    ctx?.panorama?.setVisible(false);
  }, []);


  useEffect(() => {
    setMapReady(false);
    setStreetViewReady(false);
    setStreetViewVisible(false);
    setStreetViewMessage(DEFAULT_STREET_VIEW_MSG);

    let cancelled = false;

    if (!sanitizedApiKey) {
      setMapsError('A Google Maps JavaScript API key is required.');
      contextRef.current = null;
      return () => {
        cancelled = true;
        contextRef.current = null;
      };
    }

    if (!sanitizedMapId) {
      setMapsError('A Google Maps Map ID is required to render the styled map.');
      contextRef.current = null;
      return () => {
        cancelled = true;
        contextRef.current = null;
      };
    }

    setMapsError(null);

    loadGoogleMapsScript()
      .then(() => {
        if (cancelled) return;
        initializeMap();
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Failed to load Google Maps API';
        setMapsError(message);
      });

    return () => {
      cancelled = true;
      const ctx = contextRef.current;
      if (ctx?.panorama) {
        ctx.panorama.setVisible(false);
      }
      // Clean up markers and their tooltips
      if (ctx?.markers) {
        ctx.markers.forEach((marker) => {
          const tooltipInfoWindow = (marker as any).tooltipInfoWindow;
          if (tooltipInfoWindow) {
            tooltipInfoWindow.close();
          }
          const cleanup = (marker as any).cleanup as (() => void) | undefined;
          if (cleanup) {
            cleanup();
          }
          marker.map = null;
        });
      }
      if ((ctx as any)?.boundsListener) {
        window.google?.maps?.event?.removeListener((ctx as any).boundsListener);
      }
      contextRef.current = null;
    };
  }, [initializeMap, loadGoogleMapsScript, sanitizedApiKey, sanitizedMapId]);

  // Update markers when visible records change
  useEffect(() => {
    const ctx = contextRef.current;
    if (!mapReady || !ctx || !ctx.mapReady) {
      return;
    }

    if (!visibleRecords.length) {
      ctx.markers.forEach((marker) => {
        const tooltipInfoWindow = (marker as any).tooltipInfoWindow;
        if (tooltipInfoWindow) {
          tooltipInfoWindow.close();
        }
        const cleanup = (marker as any).cleanup as (() => void) | undefined;
        if (cleanup) {
          cleanup();
        }
        marker.map = null;
      });
      ctx.markers.length = 0;
      return;
    }

    updateMarkers(visibleRecords);
  }, [mapReady, updateMarkers, visibleRecords]);

  // Update marker icons when selection changes
  useEffect(() => {
    if (mapReady) {
      updateMarkerSelection();
    }
  }, [mapReady, updateMarkerSelection]);

  const shouldRenderMap = useMemo(
    () => Boolean(sanitizedApiKey && sanitizedMapId && !mapsError),
    [mapsError, sanitizedApiKey, sanitizedMapId],
  );

  // Native markers are managed by updateMarkers effect

  useEffect(() => {
    if (!mapReady) return;
    const ctx = contextRef.current;
    if (!ctx) return;
    const bounds = ctx.map.getBounds();
    if (bounds) {
      mapBoundsRef.current = toSimpleBoundsFromGoogle(bounds);
      recomputeVisibleRecords(filteredRecords, mapBoundsRef.current, selectedRecord);
    }
  }, [filteredRecords, mapReady, recomputeVisibleRecords, selectedRecord]);

  useEffect(() => {
    let cancelled = false;
    setLoadingRecords(true);
    setDataError(null);

    loadPermitData(dataUrl, geojsonUrl)
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
        if (!cancelled) {
          setLoadingRecords(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [dataUrl, geojsonUrl]);

  useEffect(() => {
    if (!records.length) {
      setReasonOptions([]);
      setSelectedReasons(new Set<string>());
      return;
    }

    const optionMap = new Map<string, ReasonOption>();
    let nonExcludedRecordCount = 0;
    for (const record of records) {
      const key = normalizeReasonKey(record.reason_removal);
      if (!optionMap.has(key)) {
        optionMap.set(key, { key, label: reasonLabelFrom(record.reason_removal) });
      }
      if (!DEFAULT_EXCLUDED_REASON_KEYS.has(key)) {
        nonExcludedRecordCount += 1;
      }
    }

    const options = Array.from(optionMap.values()).sort((a, b) => a.label.localeCompare(b.label));
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
    setSelectedReasons((prev) => {
      if (prev.size) {
        const next = new Set<string>();
        prev.forEach((value) => {
          if (optionMap.has(value)) {
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

  useEffect(() => {
    const ctx = contextRef.current;
    if (!ctx || mapsError || !mapReady) return;

    if (!filteredRecords.length) {
      ctx.panorama?.setVisible(false);
      return;
    }

    const bounds = new ctx.maps.LatLngBounds();
    for (const record of filteredRecords) {
      bounds.extend(record.latLng);
    }

    if (filteredRecords.length === 1) {
      ctx.map.setCenter(filteredRecords[0].latLng);
      ctx.map.setZoom(15);
    } else if (!bounds.isEmpty()) {
      ctx.map.fitBounds(bounds, { top: 60, bottom: 40, left: 40, right: 40 });
    }
  }, [filteredRecords, mapReady, mapsError]);

  useEffect(() => {
    const ctx = contextRef.current;
    if (!ctx?.panorama) return;

    const shouldShow = streetViewVisible && streetViewReady && (isDesktop || showMobileDetails);
    ctx.panorama.setVisible(shouldShow);

    if (!shouldShow) {
      return;
    }

    const triggerResize = () => {
      try {
        ctx.maps.event.trigger(ctx.panorama as google.maps.StreetViewPanorama, 'resize');
      } catch (error) {
        // Swallow resize errors to avoid interrupting the UI when Maps is mid-transition.
      }
    };

    triggerResize();
    const rafId = window.requestAnimationFrame(triggerResize);
    const timeoutId = window.setTimeout(triggerResize, 360);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
    };
  }, [streetViewVisible, streetViewReady, isDesktop, showMobileDetails]);

  useEffect(() => {
    if (!selectedRecord) {
      setStreetViewVisible(false);
      setStreetViewReady(false);
      setStreetViewMessage(DEFAULT_STREET_VIEW_MSG);
      const ctx = contextRef.current;
      ctx?.panorama?.setVisible(false);
    }
  }, [selectedRecord]);

  useEffect(() => {
    if (!selectedRecord) return;
    const stillVisible = filteredRecords.some((record) => record.id === selectedRecord.id);
    if (!stillVisible) {
      clearSelection();
    }
  }, [filteredRecords, selectedRecord, clearSelection]);

  const statsText = loadingRecords
    ? 'Loading permit data...'
    : `Showing ${filteredRecords.length.toLocaleString()} of ${records.length.toLocaleString()} permits`;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div className="max-w-xl space-y-2">
          <h2 className="text-2xl font-bold text-foreground">Atlanta Tree Removal Permits Map</h2>
          <p className="text-sm text-foreground-600">
            Click on any marker to view permit details, including tree species, size, location, and reason for removal.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge color="primary" variant="flat">
            {statsText}
          </Badge>
        </div>
        {mapsError && (
          <Alert color="warning" title="Google Maps not configured" className="max-w-2xl">
            {mapsError}
          </Alert>
        )}
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
            <div style={mapLayoutStyles.shell}>
              {shouldRenderMap ? (
                <div style={mapLayoutStyles.canvas}>
                  <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
                </div>
              ) : (
                <div style={mapLayoutStyles.canvas} />
              )}
              {(!mapReady || loadingRecords) && (
                <div style={mapLayoutStyles.overlay}>
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
                <StreetViewSection
                  variant="desktop"
                  streetViewRef={streetViewRef}
                  streetViewVisible={streetViewVisible}
                  streetViewReady={streetViewReady}
                  streetViewMessage={streetViewMessage}
                  toggleStreetView={toggleStreetView}
                  clearSelection={clearSelection}
                  selectedRecord={selectedRecord}
                  showClearButton
                />
              </CardBody>
            </Card>

            <PermitDetailsPanel record={selectedRecord} onClear={clearSelection} />
          </div>
        )}
      </div>

      {!isDesktop && (
        <MobileDetailsDrawer
          isOpen={showMobileDetails}
          streetViewRef={streetViewRef}
          streetViewVisible={streetViewVisible}
          streetViewReady={streetViewReady}
          streetViewMessage={streetViewMessage}
          toggleStreetView={toggleStreetView}
          clearSelection={clearSelection}
          selectedRecord={selectedRecord}
        />
      )}
    </div>
  );
}

type StreetViewSectionProps = {
  variant: 'desktop' | 'mobile';
  streetViewRef: RefObject<HTMLDivElement | null>;
  streetViewVisible: boolean;
  streetViewReady: boolean;
  streetViewMessage: string;
  toggleStreetView: () => void;
  clearSelection: () => void;
  selectedRecord: PermitRecord | null;
  showClearButton: boolean;
};

function StreetViewSection({
  variant,
  streetViewRef,
  streetViewVisible,
  streetViewReady,
  streetViewMessage,
  toggleStreetView,
  clearSelection,
  selectedRecord,
  showClearButton,
}: StreetViewSectionProps): JSX.Element {
  const placeholderStyle = useMemo(() => {
    const base = { ...streetViewStyles.placeholder };
    if (variant === 'mobile') {
      base.minHeight = '220px';
    }
    if (streetViewVisible) {
      Object.assign(base, streetViewStyles.placeholderHidden);
    }
    return base;
  }, [streetViewVisible, variant]);

  const canvasStyle = useMemo(() => {
    const base = { ...streetViewStyles.canvas };
    if (variant === 'mobile') {
      base.height = '260px';
    }
    if (streetViewVisible) {
      Object.assign(base, streetViewStyles.canvasVisible);
    }
    return base;
  }, [streetViewVisible, variant]);

  return (
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
          {showClearButton && selectedRecord && (
            <Button variant="light" size="sm" onPress={clearSelection} className="w-full sm:w-auto">
              Clear
            </Button>
          )}
        </div>
      </div>
      <div style={placeholderStyle}>
        <p className="text-sm text-foreground-600">{streetViewMessage}</p>
      </div>
      <div ref={streetViewRef as React.RefObject<HTMLDivElement>} className="w-full" style={canvasStyle} />
    </div>
  );
}

type MobileDetailsDrawerProps = {
  isOpen: boolean;
  streetViewRef: RefObject<HTMLDivElement | null>;
  streetViewVisible: boolean;
  streetViewReady: boolean;
  streetViewMessage: string;
  toggleStreetView: () => void;
  clearSelection: () => void;
  selectedRecord: PermitRecord | null;
};

function MobileDetailsDrawer({
  isOpen,
  streetViewRef,
  streetViewVisible,
  streetViewReady,
  streetViewMessage,
  toggleStreetView,
  clearSelection,
  selectedRecord,
}: MobileDetailsDrawerProps): JSX.Element {
  const panelClasses = useMemo(
    () =>
      `transform rounded-t-3xl bg-background shadow-2xl transition-transform duration-300 ease-out ${
        isOpen ? 'translate-y-0' : 'translate-y-full'
      }`,
    [isOpen],
  );

  const backdropClasses = useMemo(
    () =>
      `absolute inset-0 bg-black/40 transition-opacity duration-300 ease-out ${
        isOpen ? 'opacity-100' : 'opacity-0'
      }`,
    [isOpen],
  );

  const containerClasses = useMemo(
    () =>
      `fixed inset-0 z-40 lg:hidden ${isOpen ? 'pointer-events-auto' : 'pointer-events-none'}`,
    [isOpen],
  );

  const recordLabel = selectedRecord?.address || selectedRecord?.record || 'Permit details';

  return (
    <div className={containerClasses} aria-hidden={!isOpen}>
      <div className={backdropClasses} onClick={clearSelection} />
      <div className="absolute inset-x-0 bottom-0 flex justify-center px-4 pb-4">
        <div
          className={`${panelClasses} w-full max-w-xl max-h-[88vh] overflow-y-auto px-5 pb-6 pt-5`}
          role="dialog"
          aria-modal="true"
          aria-label="Permit details"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex flex-col">
              <p className="text-base font-semibold text-foreground">{recordLabel}</p>
              {!selectedRecord && (
                <span className="text-xs text-foreground-500">Select a marker to open permit details.</span>
              )}
            </div>
            <Button size="sm" variant="light" onPress={clearSelection} className="w-auto">
              Close
            </Button>
          </div>

          <StreetViewSection
            variant="mobile"
            streetViewRef={streetViewRef}
            streetViewVisible={streetViewVisible}
            streetViewReady={streetViewReady}
            streetViewMessage={streetViewMessage}
            toggleStreetView={toggleStreetView}
            clearSelection={clearSelection}
            selectedRecord={selectedRecord}
            showClearButton={false}
          />

          <div className="mt-6">
            {selectedRecord ? (
              <PermitDetailsContent record={selectedRecord} />
            ) : (
              <p className="text-sm text-foreground-500">
                Tap any marker on the map to view permit metadata and Street View imagery here.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
