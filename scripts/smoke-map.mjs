import { chromium } from "playwright";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const errors = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console.${msg.type()}: ${msg.text()}`);
  });
  page.on("requestfailed", (req) => {
    errors.push(`requestfailed: ${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
  });

  await page.goto("http://localhost:8000", { waitUntil: "domcontentloaded", timeout: 30000 });

  // Wait for OpenLayers to be present
  await page.waitForFunction(() => typeof window.ol !== "undefined", { timeout: 10000 });
  // Wait for map instance
  await page.waitForFunction(() => !!window.map && !!window.map.getLayers, { timeout: 10000 });

  // Give the vector source time to load
  await page.waitForTimeout(3000);

  const result = await page.evaluate(() => {
    const map = window.map;
    const layers = map.getLayers().getArray();
    const vectorLayer = layers.find((l) => l instanceof ol.layer.Vector);
    const source = vectorLayer?.getSource();
    const featureCount = source ? source.getFeatures().length : 0;
    const center = map.getView().getCenter();
    return { hasMap: !!map, layers: layers.length, featureCount, center };
  });

  await browser.close();

  console.log(JSON.stringify({ errors, result }, null, 2));
  if (errors.length > 0) process.exitCode = 1;
})();
