/**
 * scrape-competitor.mjs
 *
 * Scrapes product descriptions from the competitor site alko-instrument.kiev.ua
 * via the Wayback Machine (web.archive.org), since the site blocks direct requests.
 *
 * Algorithm:
 *   1. Fetch all archived URLs via CDX API
 *   2. Filter to product pages only
 *   3. Load our product articles from PostgreSQL
 *   4. For each URL, fetch via Wayback Machine, parse HTML, extract data
 *   5. Match extracted articles to our products
 *   6. Save results to data/scraped-competitor.json
 *
 * Resume support:
 *   On start, loads existing data/scraped-competitor.json and skips
 *   already-processed articles. Saves after every 10 successful scrapes.
 *
 * Usage:
 *   cd /home/developer/projects/alko-store
 *   node src/scripts/scrape-competitor.mjs
 */

import pg from "pg";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

const { Client } = pg;

const DB_CONFIG = {
  host: "localhost",
  port: 5432,
  database: "medusa_alko",
  user: "medusa_alko",
  password: "medusa_alko_2026",
};

const CDX_URL =
  "https://web.archive.org/cdx/search/cdx?url=alko-instrument.kiev.ua/*&output=text&fl=original&collapse=urlkey&limit=2000";

const WAYBACK_PREFIX = "https://web.archive.org/web/2026/";

const OUTPUT_FILE = resolve("data/scraped-competitor.json");

const RATE_LIMIT_MS = 2000;
const REQUEST_TIMEOUT_MS = 15000;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [3000, 6000, 12000];
const SAVE_EVERY = 10;

// Non-product URL patterns to exclude
const EXCLUDE_PATTERNS = [
  /\/cart/i,
  /\/checkout/i,
  /\/login/i,
  /\/register/i,
  /\/search/i,
  /\/wishlist/i,
  /\/compare/i,
  /\/ua-dostavka/i,
  /\/dostavka/i,
  /\/o-nas/i,
  /\/ua-o-nas/i,
  /\/kontakty/i,
  /\/vozvrat/i,
  /\/ua-vozvrat/i,
  /\/news/i,
  /\/blog/i,
  /\/sitemap/i,
  /\/robots/i,
  /\/favicon/i,
  /\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|pdf)$/i,
  /\/category\//i,
  /\/catalog\/?$/i,
  /\/ua-catalog\/?$/i,
  /\/ajax/i,
  /\/wp-/i,
  /\/admin/i,
  /\/account/i,
  /\/ua-account/i,
  /\/garantiya/i,
  /\/ua-garantiya/i,
  /\/oplata/i,
  /\/ua-oplata/i,
];

// Brand keywords that indicate a product page
const BRAND_KEYWORDS = [
  "al-ko",
  "alko",
  "solo",
  "husqvarna",
  "solo-by-al-ko",
  "brill",
];

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function log(msg) {
  console.log(msg);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetch a URL with timeout, retries and exponential backoff.
 */
async function fetchWithRetry(url, retries = MAX_RETRIES) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; ALKOStoreBot/1.0; +https://alko-garden.com.ua)",
        },
      });
      clearTimeout(timeout);

      if (res.status === 429) {
        // Rate limited — wait longer and retry
        const delay = RETRY_DELAYS[attempt] || 12000;
        log(`   [429] Rate limited, waiting ${delay / 1000}s...`);
        await sleep(delay);
        continue;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      return await res.text();
    } catch (err) {
      if (attempt < retries - 1) {
        const delay = RETRY_DELAYS[attempt] || 3000;
        log(`   Attempt ${attempt + 1} failed: ${err.message}. Retrying in ${delay / 1000}s...`);
        await sleep(delay);
      } else {
        throw err;
      }
    }
  }
  throw new Error("All retries exhausted");
}

/**
 * Determine if a URL looks like a product page.
 */
function isProductUrl(url) {
  // Exclude known non-product patterns
  for (const pattern of EXCLUDE_PATTERNS) {
    if (pattern.test(url)) return false;
  }

  const path = url.replace(/^https?:\/\/[^/]+/, "");

  // Must have a meaningful path (not just /)
  if (!path || path === "/" || path === "/ua" || path === "/ua/") return false;

  // Check for brand keywords in URL
  const lowerPath = path.toLowerCase();
  for (const brand of BRAND_KEYWORDS) {
    if (lowerPath.includes(brand)) return true;
  }

  // Check if URL ends with a number (likely article number)
  if (/\d{4,}$/.test(path)) return true;

  // Check if URL has a slug-like structure with a numeric suffix (e.g., /product-name-123456)
  if (/\/[a-z0-9-]+-\d{3,}$/i.test(path)) return true;

  return false;
}

/**
 * Determine language from URL: "ua-" prefix means Ukrainian.
 */
function detectLanguage(url) {
  const path = url.replace(/^https?:\/\/[^/]+\/?/, "");
  return path.startsWith("ua-") || path.startsWith("ua/") ? "uk" : "ru";
}

/**
 * Remove HTML tags from a string.
 */
function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();
}

/**
 * Decode common HTML entities.
 */
function decodeEntities(text) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&mdash;/gi, "\u2014")
    .replace(/&ndash;/gi, "\u2013")
    .replace(/&laquo;/gi, "\u00AB")
    .replace(/&raquo;/gi, "\u00BB")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

/**
 * Clean extracted text: strip HTML, decode entities, normalize whitespace.
 */
function cleanText(raw) {
  if (!raw) return "";
  let text = stripHtml(raw);
  text = decodeEntities(text);
  // Remove "Read more" links in UA/RU
  text = text.replace(/\s*Читати далі\.{0,3}\s*/gi, "");
  text = text.replace(/\s*Читать далее\.{0,3}\s*/gi, "");
  // Normalize whitespace
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

/**
 * Extract product title from HTML.
 */
function extractTitle(html) {
  const m = html.match(/<h1[^>]*itemprop=["']name["'][^>]*>([\s\S]*?)<\/h1>/i) ||
            html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return m ? cleanText(m[1]) : "";
}

/**
 * Extract SKU/article from HTML.
 */
function extractArticle(html) {
  const m = html.match(/<span[^>]*itemprop=["']sku["'][^>]*>([^<]+)<\/span>/i);
  return m ? m[1].trim() : "";
}

/**
 * Extract short description from HTML.
 */
function extractShortDescription(html) {
  const m = html.match(/class=["']short_description["'][^>]*>([\s\S]*?)<\/div>/i);
  return m ? cleanText(m[1]) : "";
}

/**
 * Extract full description from HTML.
 */
function extractFullDescription(html) {
  const m = html.match(
    /id=["']tab-description["'][^>]*>([\s\S]*?)(?:<div[^>]*id=["']tab-|<\/div>\s*<\/div>\s*<\/div>)/i
  );
  return m ? cleanText(m[1]) : "";
}

/**
 * Extract characteristics (key-value pairs) from HTML.
 */
function extractCharacteristics(html) {
  const chars = {};
  const nameRegex = /class=["']attr-name-line["'][^>]*>([\s\S]*?)<\/span>/gi;
  const valueRegex = /class=["']attr-text-line["'][^>]*>([\s\S]*?)<\/span>/gi;

  const names = [];
  const values = [];
  let m;

  while ((m = nameRegex.exec(html)) !== null) {
    names.push(cleanText(m[1]));
  }
  while ((m = valueRegex.exec(html)) !== null) {
    values.push(cleanText(m[1]));
  }

  const count = Math.min(names.length, values.length);
  for (let i = 0; i < count; i++) {
    if (names[i] && values[i]) {
      chars[names[i]] = values[i];
    }
  }

  return chars;
}

/**
 * Parse a single product page HTML and return extracted data.
 */
function parsePage(html, sourceUrl) {
  const article = extractArticle(html);
  const title = extractTitle(html);
  const shortDescription = extractShortDescription(html);
  const fullDescription = extractFullDescription(html);
  const characteristics = extractCharacteristics(html);
  const language = detectLanguage(sourceUrl);

  return {
    article,
    competitor_title: title,
    short_description: shortDescription,
    full_description: fullDescription,
    characteristics,
    language,
    source_url: sourceUrl,
    scraped_at: new Date().toISOString(),
  };
}

/**
 * Load existing results from output file for resume support.
 */
function loadExistingResults() {
  if (!existsSync(OUTPUT_FILE)) {
    return { products: [], processedArticles: new Set(), processedUrls: new Set() };
  }

  try {
    const data = JSON.parse(readFileSync(OUTPUT_FILE, "utf-8"));
    const products = data.products || [];
    const processedArticles = new Set(products.map((p) => p.article).filter(Boolean));
    const processedUrls = new Set(products.map((p) => p.source_url).filter(Boolean));
    log(`Loaded ${products.length} existing results from ${OUTPUT_FILE}`);
    return { products, processedArticles, processedUrls };
  } catch (err) {
    log(`Warning: Could not parse existing results file: ${err.message}`);
    return { products: [], processedArticles: new Set(), processedUrls: new Set() };
  }
}

/**
 * Save results to output file.
 */
function saveResults(products, stats) {
  const dir = dirname(OUTPUT_FILE);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const output = {
    scraped_at: new Date().toISOString(),
    stats,
    products,
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf-8");
}

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────

async function main() {
  log(`\n${"=".repeat(70)}`);
  log(`  scrape-competitor.mjs  |  Scraping alko-instrument.kiev.ua via Wayback Machine`);
  log(`${"=".repeat(70)}\n`);

  // ── Step 1: Fetch all archived URLs via CDX API ────────────────────

  log("Step 1: Fetching URL list from CDX API...");
  let cdxText;
  try {
    cdxText = await fetchWithRetry(CDX_URL);
  } catch (err) {
    log(`Fatal: Could not fetch CDX index: ${err.message}`);
    process.exit(1);
  }

  const allUrls = cdxText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  log(`  Total URLs from CDX: ${allUrls.length}`);

  // Deduplicate
  const uniqueUrls = [...new Set(allUrls)];
  log(`  After deduplication: ${uniqueUrls.length}`);

  // Filter to product pages
  const productUrls = uniqueUrls.filter(isProductUrl);
  log(`  Product page URLs: ${productUrls.length}\n`);

  if (productUrls.length === 0) {
    log("No product URLs found. Exiting.");
    process.exit(0);
  }

  // ── Step 2: Load our product articles from PostgreSQL ──────────────

  log("Step 2: Loading our product articles from database...");
  const client = new Client(DB_CONFIG);
  await client.connect();

  const { rows: ourProducts } = await client.query(`
    SELECT
      id,
      title,
      metadata->>'alko_article' AS article,
      LEFT(description, 200) AS current_desc
    FROM product
    WHERE deleted_at IS NULL
      AND metadata->>'alko_article' IS NOT NULL
  `);

  await client.end();

  /** @type {Map<string, {id: string, title: string, current_desc: string}>} */
  const articleMap = new Map();
  for (const row of ourProducts) {
    if (row.article) {
      articleMap.set(row.article, {
        id: row.id,
        title: row.title,
        current_desc: row.current_desc,
      });
    }
  }

  log(`  Our products with articles: ${articleMap.size}\n`);

  // ── Step 3: Load existing results (resume support) ─────────────────

  log("Step 3: Checking for existing results (resume support)...");
  const { products: existingProducts, processedArticles, processedUrls } = loadExistingResults();

  // ── Step 4: Scrape each product page ───────────────────────────────

  log(`\nStep 4: Scraping product pages...\n`);

  const products = [...existingProducts];
  let successCount = existingProducts.length;
  let matchedCount = existingProducts.filter((p) => p.our_product_id).length;
  let errorCount = 0;
  let skippedCount = 0;
  let newSuccessCount = 0;

  const totalUrls = productUrls.length;

  for (let i = 0; i < productUrls.length; i++) {
    const originalUrl = productUrls[i];

    // Skip already processed URLs
    if (processedUrls.has(originalUrl)) {
      skippedCount++;
      continue;
    }

    const progress = `[${i + 1}/${totalUrls}]`;
    const shortUrl = originalUrl.length > 80 ? originalUrl.slice(0, 80) + "..." : originalUrl;
    log(`${progress} ${shortUrl}`);

    // Rate limit
    if (i > 0) {
      await sleep(RATE_LIMIT_MS);
    }

    // Fetch via Wayback Machine
    const waybackUrl = `${WAYBACK_PREFIX}${originalUrl}`;
    let html;
    try {
      html = await fetchWithRetry(waybackUrl);
    } catch (err) {
      log(`   Error fetching: ${err.message}`);
      errorCount++;
      continue;
    }

    // Parse page
    const parsed = parsePage(html, originalUrl);

    if (!parsed.article) {
      log(`   No article/SKU found on page, skipping`);
      errorCount++;
      continue;
    }

    // Skip if we already processed this article
    if (processedArticles.has(parsed.article)) {
      log(`   Article ${parsed.article} already processed, skipping`);
      skippedCount++;
      continue;
    }

    // Match to our product
    const ourProduct = articleMap.get(parsed.article);
    if (ourProduct) {
      parsed.our_product_id = ourProduct.id;
      parsed.our_title = ourProduct.title;
      matchedCount++;
      log(`   Matched: article ${parsed.article} -> "${ourProduct.title}"`);
    } else {
      parsed.our_product_id = null;
      parsed.our_title = null;
      log(`   Article ${parsed.article} - no match in our catalog`);
    }

    const descPreview = parsed.short_description
      ? parsed.short_description.slice(0, 80) + "..."
      : "(no short desc)";
    const charsCount = Object.keys(parsed.characteristics).length;
    log(`   Title: ${parsed.competitor_title || "(none)"}`);
    log(`   Short desc: ${descPreview}`);
    log(`   Full desc: ${parsed.full_description ? parsed.full_description.length + " chars" : "(none)"}`);
    log(`   Characteristics: ${charsCount} items`);
    log(`   Language: ${parsed.language}`);

    products.push(parsed);
    processedArticles.add(parsed.article);
    processedUrls.add(originalUrl);
    successCount++;
    newSuccessCount++;

    // Save periodically
    if (newSuccessCount % SAVE_EVERY === 0) {
      const interimStats = {
        total_urls: totalUrls,
        successfully_scraped: successCount,
        matched_to_our_products: matchedCount,
        unmatched: successCount - matchedCount,
        failed: errorCount,
      };
      saveResults(products, interimStats);
      log(`   [Saved ${products.length} results to disk]\n`);
    } else {
      log("");
    }
  }

  // ── Step 5: Final save and statistics ──────────────────────────────

  const finalStats = {
    total_urls: totalUrls,
    successfully_scraped: successCount,
    matched_to_our_products: matchedCount,
    unmatched: successCount - matchedCount,
    failed: errorCount,
  };

  saveResults(products, finalStats);

  log(`\n${"=".repeat(70)}`);
  log(`  SUMMARY`);
  log(`${"=".repeat(70)}`);
  log(`  Total product URLs:          ${totalUrls}`);
  log(`  Skipped (already processed): ${skippedCount}`);
  log(`  Successfully scraped:        ${successCount}`);
  log(`  Matched to our products:     ${matchedCount}`);
  log(`  Unmatched:                   ${successCount - matchedCount}`);
  log(`  Failed/errors:               ${errorCount}`);
  log(`  Output file:                 ${OUTPUT_FILE}`);
  log(`${"=".repeat(70)}\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
