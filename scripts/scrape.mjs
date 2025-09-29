// scripts/scrape.mjs
import { chromium } from "playwright";
import fs from "fs/promises";
import fetch from "node-fetch";

const OUT_GEOJSON = "docs/data/atl_arborist_ddh.geojson"; // latest (map loads this)
const SNAPSHOT_DIR = "docs/data/snapshots"; // daily immutable snapshots
const CHANGES_DIR = "docs/data/changes"; // daily delta reports
const ALL_NDJSON = "docs/data/all.ndjson"; // append/merge store
const GEOCODE_CACHE = "data/geocode-cache.json";
const CITY_SUFFIX = ", Atlanta, GA";
const CENSUS_URL = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";
const MAP_DAYS = Number(process.env.MAP_DAYS || 7); // window for latest map
const SCRAPE_RUN_DAY_UTC = process.env.SCRAPE_RUN_DAY_UTC || null; // YYYY-MM-DD, simulate run "today" in UTC
const DEBUG_LOG_RECORDS = process.env.DEBUG_LOG_RECORDS === '1';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function loadCache() {
  try { return JSON.parse(await fs.readFile(GEOCODE_CACHE, "utf8")); }
  catch { return {}; }
}
async function saveCache(cache) {
  await fs.mkdir("data", { recursive: true });
  await fs.writeFile(GEOCODE_CACHE, JSON.stringify(cache, null, 2));
}

function formatMMDDYYYY(d) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function toUtcMidnight(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function parseUsDateToUtc(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const m = dateStr.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  if (!m) return null;
  const mm = Number(m[1]);
  const dd = Number(m[2]);
  const yyyy = Number(m[3].length === 2 ? (Number(m[3]) + 2000) : m[3]);
  if (!yyyy || !mm || !dd) return null;
  const d = new Date(Date.UTC(yyyy, mm - 1, dd, 0, 0, 0));
  return isNaN(d.getTime()) ? null : d;
}

function sameUtcDay(a, b) {
  if (!a || !b) return false;
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
}

function withinLastNDaysUtc(dateUtc, days) {
  if (!dateUtc) return false;
  const now = new Date();
  const nowMid = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const cutoff = new Date(nowMid.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  return dateUtc.getTime() >= cutoff.getTime();
}

function parseRunDayUtcOrNowMinus(daysFromNow) {
  if (SCRAPE_RUN_DAY_UTC) {
    const m = SCRAPE_RUN_DAY_UTC.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const yyyy = Number(m[1]);
      const mm = Number(m[2]);
      const dd = Number(m[3]);
      const d = new Date(Date.UTC(yyyy, mm - 1, dd));
      if (!isNaN(d.getTime())) return d;
    }
  }
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + (daysFromNow || 0)));
}

async function geocodeOneLine(addr, cache) {
  if (!addr) return null;
  if (cache[addr]) return cache[addr];

  // basic sanity check: require at least a letter and a space
  if (!/[A-Za-z]/.test(addr) || addr.trim().length < 5) { cache[addr] = null; await saveCache(cache); return null; }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 10000);
  try {
    const url = `${CENSUS_URL}?address=${encodeURIComponent(addr + CITY_SUFFIX)}&benchmark=Public_AR_Census2020&format=json`;
    const res = await fetch(url, { headers: { "User-Agent": "atl-arborist-ddh/1.0 (GitHub Actions)" }, signal: controller.signal });
    const json = await res.json();
    const match = json?.result?.addressMatches?.[0];
    if (!match) { cache[addr] = null; await saveCache(cache); await sleep(150); return null; }

    const coords = [Number(match.coordinates.x), Number(match.coordinates.y)]; // [lon, lat]
    cache[addr] = coords;
    await saveCache(cache);
    await sleep(150); // be polite
    return coords;
  } catch (e) {
    cache[addr] = null; await saveCache(cache); return null;
  } finally {
    clearTimeout(t);
  }
}

async function scrapeRecords() {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage();
  // Determine target scrape date (yesterday relative to run-day)
  const runDayUtc = parseRunDayUtcOrNowMinus(0);
  const targetDateUtc = new Date(Date.UTC(runDayUtc.getUTCFullYear(), runDayUtc.getUTCMonth(), runDayUtc.getUTCDate() - 1));

  // 1) Open portal home and go to "Search Submitted Applications and Permits" → Building
  await page.goto("https://aca-prod.accela.com/atlanta_ga/Default.aspx", { waitUntil: "domcontentloaded", timeout: 180000 });
  
  // Try multiple approaches to find and click the search link
  try {
    await page.getByRole("link", { name: /Search Submitted Applications and Permits/i }).click({ timeout: 10000 });
  } catch {
    try {
      await page.locator("a").filter({ hasText: "Search Submitted Applications and Permits" }).click({ timeout: 10000 });
    } catch {
      try {
        await page.locator("a").filter({ hasText: /Search.*Applications.*Permits/i }).click({ timeout: 10000 });
      } catch {
        console.log("Could not find search link, trying direct navigation...");
        // Navigate directly to the search page
        await page.goto("https://aca-prod.accela.com/atlanta_ga/Cap/CapHome.aspx?module=Building&TabName=Building", { waitUntil: "domcontentloaded" });
      }
    }
  }
  
  await page.waitForLoadState("domcontentloaded");
  // Ensure Building tab active (navigate directly as fallback)
  await page.goto("https://aca-prod.accela.com/atlanta_ga/Cap/CapHome.aspx?module=Building&TabName=Building", { waitUntil: "domcontentloaded" });

  // 2) Fill out the search form
  console.log("Filling out search form...");
  
  // Wait for page to fully load
  await page.waitForTimeout(3000);
  
  // First, select "General Search" from the search type dropdown
  try {
    const searchTypeSelect = page.locator("select#ctl00_PlaceHolderMain_ddlSearchType");
    await searchTypeSelect.selectOption("General Search");
    console.log("Selected General Search");
    await page.waitForTimeout(2000); // Wait for form to update
  } catch (error) {
    console.log("Could not select General Search:", error.message);
  }
  
  // Then select Permit Type: Arborist Dead Dying Hazardous Tree
  try {
    const permitTypeSelect = page.locator("select#ctl00_PlaceHolderMain_generalSearchForm_ddlGSPermitType");
    await permitTypeSelect.selectOption("Arborist Dead Dying Hazardous Tree");
    console.log("Selected Arborist Dead Dying Hazardous Tree");
  } catch (error) {
    console.log("Could not select Permit Type:", error.message);
  }
  
  // Apply date range filter: yesterday only
  try {
    // Convert target UTC date to a local Date instance with same Y/M/D to fill form
    const yLocal = new Date(targetDateUtc.getUTCFullYear(), targetDateUtc.getUTCMonth(), targetDateUtc.getUTCDate());
    const fromStr = formatMMDDYYYY(yLocal);
    const toStr = fromStr;

    // Try to choose a date type if present (prefer Applied/Application)
    const dateTypeCandidates = [
      "select#ctl00_PlaceHolderMain_generalSearchForm_ddlGSDateType",
      'select[id*="ddlGSDateType"]',
      'select[name*="ddlGSDateType"]'
    ];
    for (const sel of dateTypeCandidates) {
      try {
        const dd = page.locator(sel).first();
        if (await dd.count() > 0) {
          await dd.selectOption({ label: /Applied|Application|Submitted|Record|Created/i });
          console.log("Selected date type on", sel);
          break;
        }
      } catch {}
    }

    // Fill From / To date fields using several likely selectors
    const fromSelectors = [
      "input#ctl00_PlaceHolderMain_generalSearchForm_txtGSFromDate",
      "input#ctl00_PlaceHolderMain_generalSearchForm_txtGSStartDate",
      'input[id*="FromDate"]',
      'input[id*="StartDate"]',
      'input[name*="FromDate"]',
      'input[name*="StartDate"]'
    ];
    const toSelectors = [
      "input#ctl00_PlaceHolderMain_generalSearchForm_txtGSToDate",
      "input#ctl00_PlaceHolderMain_generalSearchForm_txtGSEndDate",
      'input[id*="ToDate"]',
      'input[id*="EndDate"]',
      'input[name*="ToDate"]',
      'input[name*="EndDate"]'
    ];

    let filled = false;
    for (const fsSel of fromSelectors) {
      try {
        const inp = page.locator(fsSel).first();
        if (await inp.count() > 0) {
          await inp.fill("");
          await inp.type(fromStr, { delay: 10 });
          filled = true;
          console.log("Filled From date on", fsSel, fromStr);
          break;
        }
      } catch {}
    }
    for (const tsSel of toSelectors) {
      try {
        const inp = page.locator(tsSel).first();
        if (await inp.count() > 0) {
          await inp.fill("");
          await inp.type(toStr, { delay: 10 });
          console.log("Filled To date on", tsSel, toStr);
          break;
        }
      } catch {}
    }
    if (!filled) console.log("Date fields not found; continuing without form date filter");
  } catch (error) {
    console.log("Could not set date range:", error?.message);
  }
  
  // Fill city only (no date filter to see what records exist)
  try {
    // Fill city
    const cityInput = page.locator("input#ctl00_PlaceHolderMain_generalSearchForm_txtGSCity");
    await cityInput.fill("Atlanta");
    
    console.log("Filled form fields - No date filter, City: Atlanta (to see what records exist)");
    
    // Trigger search by pressing Enter
    await cityInput.press("Enter");
    console.log("Triggered search with Enter key");
  } catch (error) {
    console.log("Could not fill some form fields:", error.message);
  }
  
  // Wait for search results
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(3000); // allow table rendering

  // 4) Parse the results - look through all tables for permit data and handle pagination
  let results = [];
  let pageNum = 1;
  let stopAfterThisPage = false;
  
  while (true) {
    console.log(`\n--- Processing page ${pageNum} ---`);
    
    const tables = await page.locator("table").all();
    console.log(`Checking ${tables.length} tables for permit data...`);
    
    let foundRecordsOnThisPage = 0; // total rows encountered that look like data rows
    let addedTargetRowsOnThisPage = 0; // rows actually collected for the target date
    let pageMaxDateUtc = null;
    let pageMinDateUtc = null;
    
    for (let i = 0; i < tables.length; i++) {
      const table = tables[i];
      const tableText = await table.textContent();
      
      // Look for tables that contain actual permit data (not just UI elements)
      if ((tableText.includes("BLD-") || tableText.includes("Record")) && 
          !tableText.includes("Login") && !tableText.includes("Register") &&
          !tableText.includes("Create a New Collection")) {
        
        console.log(`Table ${i} contains permit data`);
        
        const rows = await table.locator("tr").all();
        console.log(`Table ${i} has ${rows.length} rows`);
        
        // Look for the header row (it should contain "Date", "Record Number", etc.)
        let headerRowIndex = -1;
        let headers = [];
        
        for (let r = 0; r < Math.min(10, rows.length); r++) {
          const row = rows[r];
          const rowText = await row.textContent();
          
          if (rowText.includes("Date") && rowText.includes("Record Number") && 
              rowText.includes("Address") && rowText.includes("Status")) {
            headerRowIndex = r;
            headers = await row.locator("th, td").allTextContents();
            console.log("Found header row at index", r);
            break;
          }
        }
        
        if (headerRowIndex >= 0) {
          const headerIndex = (re) => headers.findIndex(h => re.test(h?.trim() ?? ""));
          const idxRecord = headerIndex(/Record/i);
          const idxAddress = headerIndex(/Address/i);
          const idxDate = headerIndex(/Date/i);
          const idxStatus = headerIndex(/Status/i);
          const idxPermitType = headerIndex(/Type|Record Type/i);
          const idxDescription = headerIndex(/Description/i);
          
          console.log(`Column indices - Record: ${idxRecord}, Address: ${idxAddress}, Date: ${idxDate}, Status: ${idxStatus}, Type: ${idxPermitType}, Description: ${idxDescription}`);
          
          // Process data rows (skip header row)
          for (let r = headerRowIndex + 1; r < rows.length; r++) {
            const row = rows[r];
            const cells = await row.locator("td").allTextContents();
            
            if (cells.length > 0) {
              // Skip pager rows like "< Prev 1 2 3 >"
              const joined = cells.join(' ').trim();
              if (/^<\s*Prev/i.test(joined) || /Next\s*>$/i.test(joined) || /^\d+(\s+\d+)*$/.test(joined)) {
                continue;
              }

              // Try to capture a detail URL from the Record Number cell
              let detailUrl = null;
              try {
                if (idxRecord >= 0) {
                  const linkHandle = row.locator('td').nth(idxRecord).locator('a').first();
                  const href = await linkHandle.getAttribute('href');
                  if (href) {
                    // Handle javascript:… wrappers
                    let candidate = href;
                    const m = href.match(/'(https?:[^']+)'/i) || href.match(/\(([^)]+)\)/);
                    if (m) candidate = m[1];
                    if (!/^https?:/i.test(candidate)) {
                      candidate = new URL(candidate, page.url()).toString();
                    }
                    detailUrl = candidate;
                  }
                }
              } catch {}

              const rec = {
                record: cells[idxRecord]?.trim(),
                address: cells[idxAddress]?.trim(),
                date: cells[idxDate]?.trim(),
                status: cells[idxStatus]?.trim(),
                permitType: cells[idxPermitType]?.trim(),
                description: cells[idxDescription]?.trim(),
                detailUrl
              };
              // Track date stats for early-exit and only keep target-day rows
              try {
                const parsed = parseUsDateToUtc(rec.date);
                if (parsed && (!pageMaxDateUtc || parsed.getTime() > pageMaxDateUtc.getTime())) {
                  pageMaxDateUtc = parsed;
                }
                if (parsed && (!pageMinDateUtc || parsed.getTime() < pageMinDateUtc.getTime())) {
                  pageMinDateUtc = parsed;
                }
                // Only keep rows from the target date
                if (!parsed || !sameUtcDay(parsed, targetDateUtc)) {
                  continue;
                }
              } catch {}
              
              // If we found a target-date record with an address or record number, add it
              if ((rec.address && rec.address.length > 5) || (rec.record && rec.record.length > 3)) {
                if (DEBUG_LOG_RECORDS) console.log("Found record:", rec);
                results.push(rec);
                addedTargetRowsOnThisPage++;
                foundRecordsOnThisPage++;
              }
            }
          }
        }
      }
    }
    
    console.log(`Found ${addedTargetRowsOnThisPage} target-day rows on page ${pageNum}. Total collected: ${results.length}`);
    // If the newest date found on this page is already older than the target (yesterday),
    // subsequent pages will only be older. Stop paginating to keep the crawl tight.
    if (pageMaxDateUtc && pageMaxDateUtc.getTime() < targetDateUtc.getTime()) {
      console.log("Newest date on this page is older than yesterday; stopping pagination.");
      break;
    }
    
    // Check if there's a "Next" link to continue pagination
    try {
      const nextLink = page.locator('a').filter({ hasText: /Next\s*>/i }).first();
      if (await nextLink.isVisible()) {
        console.log("Found Next link, clicking to go to next page...");
        await nextLink.click();
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);
        pageNum++;
      } else {
        console.log("No Next link found, pagination complete.");
        break;
      }
    } catch (error) {
      console.log("No more pages found or error with pagination:", error.message);
      break;
    }
  }
  
  console.log(`Found ${results.length} total records`);

  // Enrich with details (owner, tree specs) from record detail pages
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!r?.record) continue;
    try {
      // Navigate to detail via captured URL when available; fallback to clicking by link text
      if (r.detailUrl) {
        await page.goto(r.detailUrl, { waitUntil: 'domcontentloaded' });
      } else {
        const link = page.getByRole('link', { name: new RegExp(`^${r.record.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, 'i') });
        await link.first().click({ timeout: 10000 });
      }
      // Wait for details to load
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1000);

      const detail = await page.evaluate(() => {
        const out = { 
          owner: null, 
          treeDbh: null, 
          treeLocation: null, 
          reasonRemoval: null, 
          treeDescription: null,
          treeNumber: null,
          species: null
        };

        // Try to extract owner from any labeled fields
        const labelNodes = Array.from(document.querySelectorAll('.ACA_SmLabelBolder, .font11px, .ACA_Label'));
        for (const node of labelNodes) {
          const t = (node.textContent || '').trim();
          if (/^Owner\b/i.test(t)) {
            // value likely in next sibling or same row second col
            let val = '';
            const parent = node.closest('.MoreDetail_ItemCol') || node.parentElement;
            if (parent && parent.nextElementSibling) {
              val = (parent.nextElementSibling.textContent || '').trim();
            } else if (node.parentElement && node.parentElement.nextElementSibling) {
              val = (node.parentElement.nextElementSibling.textContent || '').trim();
            }
            if (val) { out.owner = val; break; }
          }
        }

        // Also try to extract owner from the specific HTML structure you provided
        if (!out.owner) {
          // Look for span with id containing "owner"
          const ownerLabel = document.querySelector('span[id*="owner"]');
          if (ownerLabel && ownerLabel.textContent && /Owner/i.test(ownerLabel.textContent)) {
            // Look for the owner name in the next sibling or parent container
            let ownerName = '';
            const parent = ownerLabel.parentElement;
            if (parent) {
              // Look for text content in table cells that might contain the name
              const tableCells = parent.querySelectorAll('td');
              for (const cell of tableCells) {
                const text = cell.textContent?.trim();
                if (text && text.length > 2 && !/Owner/i.test(text) && !/^\s*$/.test(text)) {
                  // Clean up the text (remove asterisks and extra spaces)
                  ownerName = text.replace(/\s*\*\s*$/, '').trim();
                  if (ownerName) break;
                }
              }
            }
            if (ownerName) out.owner = ownerName;
          }
          
          // Alternative approach: look for any text that looks like a name after "Owner:"
          if (!out.owner) {
            const allText = document.body.textContent || '';
            const ownerMatch = allText.match(/Owner:\s*([A-Za-z\s]+?)(?:\s*\*|$)/);
            if (ownerMatch && ownerMatch[1]) {
              const name = ownerMatch[1].trim();
              if (name.length > 1 && name.length < 50) {
                out.owner = name;
              }
            }
          }
        }

        // Extract TREE SPECS inside #trASITList if present
        const root = document.getElementById('trASITList');
        if (root) {
          const pairs = Array.from(root.querySelectorAll('.MoreDetail_Item .MoreDetail_ItemCol1'));
          for (const labelCol of pairs) {
            const label = (labelCol.textContent || '').trim();
            const valueCol = labelCol.nextElementSibling;
            const value = valueCol ? (valueCol.textContent || '').trim() : '';
            if (/Tree Size \(DBH\)/i.test(label)) out.treeDbh = value;
            if (/Tree location/i.test(label)) out.treeLocation = value;
            if (/Reason for Removal/i.test(label)) out.reasonRemoval = value;
            if (/Description of Tree/i.test(label)) out.treeDescription = value;
            if (/Tree number/i.test(label)) out.treeNumber = value;
            if (/Species/i.test(label)) out.species = value;
          }
        }

        // Also look for tree details in other parts of the page using a more comprehensive approach
        const allText = document.body.textContent || '';
        
        // Extract tree details using regex patterns
        const treeNumberMatch = allText.match(/Tree number:\s*(\d+)/i);
        if (treeNumberMatch) out.treeNumber = treeNumberMatch[1];
        
        const speciesMatch = allText.match(/Species:\s*([^T]+?)(?=Tree Size|$)/i);
        if (speciesMatch) out.species = speciesMatch[1].trim();
        
        const dbhMatch = allText.match(/Tree Size \(DBH\):\s*(\d+)/i);
        if (dbhMatch) out.treeDbh = dbhMatch[1];
        
        const locationMatch = allText.match(/Tree location:\s*([^D]+?)(?=Description|$)/i);
        if (locationMatch) out.treeLocation = locationMatch[1].trim();
        
        const descMatch = allText.match(/Description of Tree:\s*(.+?)(?:\n\n|\n[A-Z]|$)/s);
        if (descMatch) out.treeDescription = descMatch[1].trim();
        
        // Also look for "Description of Tree" in other parts of the page
        if (!out.treeDescription) {
          const descLabels = Array.from(document.querySelectorAll('.ACA_SmLabelBolder, .font11px'));
          for (const label of descLabels) {
            const text = (label.textContent || '').trim();
            if (/Description of Tree/i.test(text)) {
              // Look for the description text in the next sibling or parent container
              let descText = '';
              const parent = label.parentElement;
              if (parent) {
                // Get all text content from the parent and extract the description part
                const fullText = parent.textContent || '';
                const match = fullText.match(/Description of Tree:\s*(.+?)(?:\n|$)/i);
                if (match && match[1]) {
                  descText = match[1].trim();
                }
              }
              if (descText) {
                out.treeDescription = descText;
                break;
              }
            }
          }
        }

        return out;
      });

      r.owner = detail.owner || null;
      r.tree_dbh = detail.treeDbh ? String(detail.treeDbh) : null;
      r.tree_location = detail.treeLocation || null;
      r.reason_removal = detail.reasonRemoval || null;
      r.tree_description = detail.treeDescription || null;
      r.tree_number = detail.treeNumber || null;
      r.species = detail.species || null;

      // Go back to results
      try {
        await page.goBack({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1000);
      } catch {}
    } catch (e) {
      // If anything fails, continue without enrichment
      // console.log('Detail extraction failed for', r.record, e?.message);
    }
  }

  await browser.close();
  return results;
}

function toGeoJSON(items, coordsByAddr) {
  return {
    type: "FeatureCollection",
    features: items
      .filter(r => coordsByAddr[r.address])
      .map(r => ({
        type: "Feature",
        properties: {
          record: r.record,
          address: r.address,
          status: r.status,
          date: r.date,
          description: r.description || null,
          owner: r.owner || null,
          tree_dbh: r.tree_dbh || null,
          tree_location: r.tree_location || null,
          reason_removal: r.reason_removal || null,
          tree_description: r.tree_description || null,
          tree_number: r.tree_number || null,
          species: r.species || null
        },
        geometry: {
          type: "Point",
          coordinates: coordsByAddr[r.address]
        }
      }))
  };
}

(async () => {
  const rows = await scrapeRecords();
  // Deduplicate on record id
  const unique = Array.from(new Map(rows.map(r => [r.record ?? r.address, r])).values());

  // Determine run-day and target scrape date again (for filter and filenames)
  const runDayUtc = parseRunDayUtcOrNowMinus(0);
  const targetDateUtc = new Date(Date.UTC(runDayUtc.getUTCFullYear(), runDayUtc.getUTCMonth(), runDayUtc.getUTCDate() - 1));
  const filtered = unique.filter((r) => sameUtcDay(parseUsDateToUtc(r.date), targetDateUtc));

  const cache = await loadCache();
  const coordsByAddr = {};
  for (const r of filtered) {
    const coords = await geocodeOneLine(r.address, cache);
    if (coords) coordsByAddr[r.address] = coords;
  }

  await fs.mkdir("docs/data", { recursive: true });

  // Derive target date string and paths
  await fs.mkdir(SNAPSHOT_DIR, { recursive: true });
  const yStr = `${String(targetDateUtc.getUTCFullYear())}-${String(targetDateUtc.getUTCMonth() + 1).padStart(2, "0")}-${String(targetDateUtc.getUTCDate()).padStart(2, "0")}`;
  const snapshotPath = `${SNAPSHOT_DIR}/${yStr}.geojson`;

  // Read prior snapshot (if any) BEFORE writing, to compute deltas
  let priorKeys = new Set();
  try {
    const existing = JSON.parse(await fs.readFile(snapshotPath, "utf8"));
    priorKeys = new Set(
      (existing.features || []).map((f) => f.properties?.record || `${f.properties?.address || ""}|${f.properties?.date || ""}`)
    );
  } catch {}

  // 1) Write snapshot for yesterday
  await fs.writeFile(snapshotPath, JSON.stringify(toGeoJSON(filtered, coordsByAddr), null, 2));

  // 2) Merge into all.ndjson (append/replace by key)
  const keyOf = (r) => r.record || `${r.address || ""}|${r.date || ""}`;
  const readAllStore = async () => {
    try {
      const raw = await fs.readFile(ALL_NDJSON, "utf8");
      const lines = raw.split(/\r?\n/).filter(Boolean);
      return lines.map((ln) => JSON.parse(ln));
    } catch { return []; }
  };
  const writeAllStore = async (rows) => {
    const text = rows.map((o) => JSON.stringify(o)).join("\n") + "\n";
    await fs.writeFile(ALL_NDJSON, text);
  };

  const prevAll = await readAllStore();
  const byKey = new Map(prevAll.map((o) => [o.key || keyOf(o), o]));

  const newRows = [];
  const updatedRows = [];

  for (const r of filtered) {
    const coords = coordsByAddr[r.address] || null;
    const obj = {
      key: keyOf(r),
      date: r.date || null,
      record: r.record || null,
      address: r.address || null,
      status: r.status || null,
      description: r.description || null,
      owner: r.owner || null,
      tree_dbh: r.tree_dbh || null,
      tree_location: r.tree_location || null,
      reason_removal: r.reason_removal || null,
      tree_description: r.tree_description || null,
      tree_number: r.tree_number || null,
      species: r.species || null,
      coords
    };
    const k = obj.key;
    const prev = byKey.get(k);
    if (!prev) {
      byKey.set(k, obj);
      newRows.push(obj);
    } else {
      const prevComparable = { ...prev }; delete prevComparable.key;
      const nextComparable = { ...obj }; delete nextComparable.key;
      if (JSON.stringify(prevComparable) !== JSON.stringify(nextComparable)) {
        byKey.set(k, obj);
        updatedRows.push({ before: prev, after: obj });
      }
    }
  }

  await writeAllStore(Array.from(byKey.values()));

  // 3) Delta report compared to prior snapshot of same date (if existed)
  await fs.mkdir(CHANGES_DIR, { recursive: true });
  const changesPath = `${CHANGES_DIR}/${yStr}.json`;
  const currentKeys = new Set(filtered.map((r) => keyOf(r)));
  const newly = Array.from(currentKeys).filter((k) => !priorKeys.has(k));
  const missing = Array.from(priorKeys).filter((k) => !currentKeys.has(k));

  const delta = {
    date: yStr,
    new: newly,
    updated: updatedRows.map((u) => u.after.key),
    missing: missing
  };
  await fs.writeFile(changesPath, JSON.stringify(delta, null, 2));

  // 4) Rebuild latest map file from ALL_NDJSON for last MAP_DAYS
  const allNow = Array.from(byKey.values());
  const windowRows = allNow.filter((o) => withinLastNDaysUtc(parseUsDateToUtc(o.date), MAP_DAYS));

  // Ensure we have coords for window rows
  for (const o of windowRows) {
    if (!o.coords && o.address) {
      const c = await geocodeOneLine(o.address, cache);
      if (c) o.coords = c;
    }
  }

  // Persist any newly added coords back to store
  await writeAllStore(Array.from(new Map(allNow.map((o) => [o.key, o])).values()));

  const coordsDict = {};
  for (const o of windowRows) {
    if (o.coords && o.address) coordsDict[o.address] = o.coords;
  }
  await fs.writeFile(OUT_GEOJSON, JSON.stringify(toGeoJSON(windowRows, coordsDict), null, 2));
  console.log(`Wrote ${OUT_GEOJSON} with ${windowRows.length} features (last ${MAP_DAYS} days).`);

  // Also write date-range for UI
  const times = windowRows.map((o) => parseUsDateToUtc(o.date)).filter(Boolean).map((d) => d.getTime());
  if (times.length > 0) {
    const min = new Date(Math.min(...times));
    const max = new Date(Math.max(...times));
    const fmtUtc = (d) => `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/${d.getUTCFullYear()}`;
    await fs.writeFile("docs/data/date-range.json", JSON.stringify({ start: fmtUtc(min), end: fmtUtc(max) }, null, 2));
  }
})();
