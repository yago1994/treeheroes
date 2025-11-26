# Tree Heroes

Community-built map to surface Atlanta tree removal permits, increase transparency, and make it easier for neighbors to act before the next canopy falls.

## What this is

Tree Heroes pulls down public permit data, renders an interactive map of tree removals, and provides tools to:
- Explore recent permits (by week or full history)
- Filter by removal reason (with an “All reasons” option)
- Filter by permit status (with an “All statuses” option)
- Inspect details for each permit (species, DBH, location, owner, reason, etc.)
- Jump straight to Google Maps Street View for on-site context
- Open the official Accela portal for the permit

The site also includes a simple landing page describing the mission and linking to the map.

## Tech stack

- Frontend: React 18 + TypeScript + Vite
- UI: [HeroUI](https://www.heroui.com/) (Select, Button, Card, etc.)
- Maps:
  - OpenLayers implementation (default in app route): `src/components/MapAppOL.tsx`
  - Google Maps JavaScript API implementation (optional): `src/components/MapApp.tsx`
- Data: local GeoJSON/NDJSON under `docs/data/`

## Running locally

```bash
npm install
npm run dev
# open http://localhost:5173
```

The app routes:
- `/` – Landing page
- `/map` – Map page (uses the OpenLayers map by default)

### Environment variables (optional, only for Google Maps view)
If you want to try the Google Maps implementation (`MapApp.tsx`) you’ll need a Maps API key and a Map ID:

Create `.env.local` in the repo root:
```bash
VITE_GOOGLE_MAPS_API_KEY=YOUR_API_KEY
VITE_GOOGLE_MAPS_MAP_ID=YOUR_MAP_ID
```

> Without keys, the OpenLayers map still works. The Google Maps view will show a helpful warning instead of a map.

### Useful scripts

```bash
npm run dev       # start Vite dev server
npm run build     # production build
npm run preview   # preview the production build locally
```

Scraping / data collection helpers (optional, for maintainers):
```bash
npm run scrape    # runs scripts/scrape.mjs (Playwright / node-fetch based)
```

## Project structure

```
treeheroes/
├─ assets/                         # static images/assets (logos)
├─ data/
│  └─ geocode-cache.json           # cached geocode lookups (used by Google Maps flow)
├─ docs/
│  └─ data/
│     └─ atl_arborist_ddh.geojson  # primary dataset used by the OpenLayers map
├─ scripts/
│  ├─ scrape.mjs                   # data scraping pipeline (optional)
│  └─ smoke-map.mjs                # simple smoke test for map/data (optional)
├─ src/
│  ├─ App.tsx                      # app routes (/, /map), config resolution
│  ├─ pages/
│  │  └─ MapPage.tsx               # wraps the map app; currently uses MapAppOL
│  ├─ components/
│  │  ├─ MapAppOL.tsx              # OpenLayers map (default in /map)
│  │  ├─ MapApp.tsx                # Google Maps version (optional)
│  │  ├─ SharedHeader.tsx
│  │  ├─ SharedFooter.tsx
│  │  └─ map/
│  │     ├─ PermitDetailsPanel.tsx # right-side/mobile panel with details
│  │     ├─ data.ts                # data loading helpers (NDJSON/GeoJSON)
│  │     ├─ markers.ts             # marker style helpers (Google Maps impl)
│  │     └─ types.ts               # shared types (PermitRecord, WeekOption, etc.)
│  └─ main.tsx                     # React bootstrap
├─ index.html                      # Vite entry (SPA wrapper)
├─ package.json
└─ README.md
```

## Key components

### OpenLayers map (`MapAppOL.tsx`)
- Loads `docs/data/atl_arborist_ddh.geojson`
- Renders scalable markers sized by DBH (root: larger DBH ⇒ larger marker)
- Filters:
  - Week range (`All data` + per-week options)
  - Removal reasons (multi-select + “All reasons”)
  - Status (multi-select + “All statuses”)
- Hover card on desktop; click selects a record
- Street View (optional): if Google Maps API key is present, a Street View preview appears on the side (desktop) or in a mobile sheet; a full-width “Open in Google Maps Street View” button is placed above the viewer
- Permit Details panel shows metadata and an “Open Atlanta Permits (Accela)” button

### Google Maps map (`MapApp.tsx`)
- Alternative to OpenLayers, using Google Maps JS API with Advanced Markers
- The rest of the UX (filters, details, Street View button/link) mirrors the OL version

## Data & fields

Each permit record (`PermitRecord`) includes:
- `record`, `address`, `status`, `date`, `description`, `owner`
- `tree_dbh`, `tree_location`, `tree_description`, `tree_number`, `species`
- `reason_removal`
- precomputed coordinates (`latLng` and `coords`)

Reason keys and status values are normalized for filtering:
- Reasons use uppercased keys with a fallback `UNKNOWN`
- Status likewise (`UNKNOWN` fallback)

## Styling & UI

- Components: HeroUI (via `@heroui/react`)
- Layout: Tailwind utilities (via @tailwindcss/vite) and simple CSS-in-JS styles for map canvases
- Icons: `@heroui/shared-icons`

## Notes & tips

- The `/map` page currently uses the OpenLayers implementation. To switch to Google Maps, replace `MapAppOL` with `MapApp` in `src/pages/MapPage.tsx`.
- If hosting under a subpath (e.g., GitHub Pages), Vite’s `base` should be set accordingly; the code reads `import.meta.env.BASE_URL` to resolve local data URLs where needed.
- If Street View imagery isn’t available at a coordinate, the viewer will display a helpful message and the “Open in Google Maps Street View” button always works as a fallback.

## Contributing

PRs welcome. Keep changes focused and run:

```bash
npm run dev   # develop locally
npm run build # ensure production build succeeds
```

Please include a short note describing UI/UX changes, especially around filters, map behavior, or data loading. 


