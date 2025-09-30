# Google Maps + Street View Setup

The interactive permit map now uses the Google Maps JavaScript API with optional Street View imagery. To run the map locally or in production you need to provide an API key that has the **Maps JavaScript API** and **Street View Static/Embed** APIs enabled.

## 1. Create or reuse a Google Cloud project

1. Visit <https://console.cloud.google.com/projectcreate>.
2. Select your billing account or create a new one (Google requires a billing account even when you only use the free tier; see below).
3. Give the project an intuitive name such as `treeheroes-map` and click **Create**.

## 2. Enable the APIs

Inside the project:

1. Go to **APIs & Services → Library**.
2. Enable **Maps JavaScript API**.
3. Enable **Street View Static API** (used when requesting panorama data) and **Street View Embed API** if you plan to embed panoramas elsewhere.

## 3. Create credentials

1. Go to **APIs & Services → Credentials**.
2. Click **Create credentials → API key**.
3. Copy the generated key.
4. Restrict the key to your domains (HTTP referrer restriction) and limit it to the APIs above to prevent misuse.

## 4. Provide the key and Map ID to the app

Create a `.env` file in the project root with:

```bash
VITE_GOOGLE_MAPS_API_KEY=your-key-here
VITE_GOOGLE_MAPS_MAP_ID=your-vector-map-id
```

When you run `npm run dev` or build the site, Vite will expose this value to the React application. Avoid committing the `.env` file.

### Where do I get a Map ID?

1. Visit the [Google Cloud Console Map Styles page](https://console.cloud.google.com/google/maps-apis/studio).
2. Create a new **Vector** map style (Advanced Markers only work on vector map IDs).
3. Customize it if desired, then click **Publish** to generate a **Map ID**.
4. Enable the **Use advanced markers** toggle inside the style editor.

Copy the resulting ID into `VITE_GOOGLE_MAPS_MAP_ID` (or one of the runtime options below). Without this value the app refuses to initialize the map because Advanced Markers would not function.

The map component still supports runtime injection if you prefer to avoid `.env` files. It resolves each value independently in this order (first match wins):

**API key**
1. `import.meta.env.VITE_GOOGLE_MAPS_API_KEY`
2. `window.TREEHEROES_CONFIG.googleMapsApiKey`
3. `window.TREEHEROES_GOOGLE_MAPS_API_KEY`

**Map ID**
1. `import.meta.env.VITE_GOOGLE_MAPS_MAP_ID`
2. `window.TREEHEROES_CONFIG.googleMapsMapId`
3. `window.TREEHEROES_GOOGLE_MAPS_MAP_ID`

For static hosting you can emit a small inline script in `index.html` that sets one of the global values just before the bundled script runs.

## 5. Do I have to pay?

Google's platform **requires** a billing account on file, but every account receives **$200 of recurring free credit each month**. The pricing (as of 2024-10) works out roughly to:

- Maps JavaScript: $7 per 1000 map loads after the free credit.
- Street View panorama requests: counted as part of Maps JavaScript sessions (no extra fee for the panoramas fetched through the JS API).

For a low-traffic open-source project the free credit usually covers thousands of sessions per month, so you likely will not see charges until the site has significant traffic. If the project scales up, you can set usage quotas and alerts in the Cloud Console to avoid surprises.

### Alternatives

If you prefer not to maintain a billing-enabled key, consider staying on OpenLayers + OpenStreetMap (already free) or switching to providers such as MapLibre + MapTiler, Mapbox, or ArcGIS which offer generous free tiers but still require tokens.
