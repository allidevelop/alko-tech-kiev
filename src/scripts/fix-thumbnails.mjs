/**
 * fix-thumbnails.mjs
 *
 * Finds and fixes broken product thumbnail URLs in the AL-KO store database.
 *
 * Problems handled:
 *   1. Thumbnails pointing to alko-garden.de (which 404s)
 *   2. Thumbnails pointing to external domains (rozetka) that may 404
 *   3. Products with NULL or empty thumbnails
 *
 * Repair strategies (tried in order):
 *   A. Replace domain alko-garden.de → alko-garden.com.ua (same path)
 *   B. Try ddmedia pattern: https://alko-garden.com.ua/out/pictures/ddmedia/{article}-101.jpg
 *   C. Try master pattern: https://alko-garden.com.ua/out/pictures/master/product/1/{article}.jpg
 *   D. Use the first image from the product's image gallery
 *   E. Search for another product with a similar title that has a working thumbnail
 *
 * Usage:
 *   node src/scripts/fix-thumbnails.mjs          # dry-run (default)
 *   node src/scripts/fix-thumbnails.mjs --apply  # actually write to DB
 */

import pg from "pg";

const { Client } = pg;

const DRY_RUN = !process.argv.includes("--apply");

const DB_CONFIG = {
  host: "localhost",
  port: 5432,
  database: "medusa_alko",
  user: "medusa_alko",
  password: "medusa_alko_2026",
};

const UA_BASE = "https://alko-garden.com.ua";

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

async function urlReturnsOk(url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, {
        method: "HEAD",
        signal: controller.signal,
        redirect: "follow",
      });
      clearTimeout(timeout);
      return res.ok;
    } catch {
      if (attempt === retries) return false;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return false;
}

// Known manual fallback URLs for products that have NO image in source XML.
// Verified working as of 2026-03-16.
const MANUAL_FALLBACKS = {
  // "АКЦІЯ" (113540-21) — use parent article 113540's image from alko-garden.com.ua
  "113540-21": "https://alko-garden.com.ua/out/pictures/master/product/1/b079l9l8hz-main.jpg",
};

function candidateUrls(article, oldUrl) {
  const candidates = [];

  // Strategy 0: manual fallback for known hard cases
  if (article && MANUAL_FALLBACKS[article]) {
    candidates.push(MANUAL_FALLBACKS[article]);
  }

  // Strategy A: replace .de domain with .com.ua
  if (oldUrl && oldUrl.includes("alko-garden.de")) {
    candidates.push(oldUrl.replace("alko-garden.de", "alko-garden.com.ua"));
  }

  if (article) {
    const cleanArticle = article.replace(/[^a-zA-Z0-9_-]/g, "");
    // Strategy B: ddmedia pattern
    candidates.push(
      `${UA_BASE}/out/pictures/ddmedia/${cleanArticle}-101.jpg`
    );
    // Strategy C: master product pattern
    candidates.push(
      `${UA_BASE}/out/pictures/master/product/1/${cleanArticle}.jpg`
    );

    // Strategy C2: if article has a suffix like "-21", try base article
    const baseArticle = cleanArticle.replace(/-\d+$/, "");
    if (baseArticle !== cleanArticle) {
      candidates.push(
        `${UA_BASE}/out/pictures/ddmedia/${baseArticle}-101.jpg`
      );
      candidates.push(
        `${UA_BASE}/out/pictures/master/product/1/${baseArticle}.jpg`
      );
    }
  }

  return candidates;
}

function log(msg) {
  console.log(msg);
}

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────

async function main() {
  const client = new Client(DB_CONFIG);
  await client.connect();
  log(`\n${"=".repeat(70)}`);
  log(`  fix-thumbnails.mjs  |  ${DRY_RUN ? "DRY RUN (use --apply to write)" : "APPLYING CHANGES"}`);
  log(`${"=".repeat(70)}\n`);

  // ── Step 1: Find all problematic products ──────────────────────────
  const { rows: broken } = await client.query(`
    SELECT
      p.id,
      p.title,
      p.thumbnail,
      p.metadata->>'alko_article' AS article
    FROM product p
    WHERE p.deleted_at IS NULL
      AND (
        p.thumbnail IS NULL
        OR p.thumbnail = ''
        OR p.thumbnail LIKE '%alko-garden.de%'
        OR p.thumbnail NOT LIKE '%alko-garden.com.ua%'
      )
    ORDER BY p.title
  `);

  log(`Found ${broken.length} product(s) to check:\n`);

  // Also pre-fetch all alko-garden.com.ua thumbnails for "similar title" fallback
  const { rows: allGood } = await client.query(`
    SELECT p.id, p.title, p.thumbnail
    FROM product p
    WHERE p.deleted_at IS NULL
      AND p.thumbnail IS NOT NULL
      AND p.thumbnail <> ''
      AND p.thumbnail LIKE '%alko-garden.com.ua%'
  `);

  const stats = { checked: 0, alreadyOk: 0, fixed: 0, stillBroken: 0 };

  for (const row of broken) {
    stats.checked++;
    const { id, title, thumbnail, article } = row;
    const shortTitle = title.length > 50 ? title.slice(0, 50) + "..." : title;
    log(`── [${stats.checked}/${broken.length}] ${shortTitle}`);
    log(`   ID: ${id}`);
    log(`   Article: ${article || "(none)"}`);
    log(`   Current thumbnail: ${thumbnail || "(NULL/empty)"}`);

    // First check if current URL actually works (maybe it's fine)
    if (thumbnail && thumbnail.length > 0) {
      const currentOk = await urlReturnsOk(thumbnail);
      if (currentOk) {
        log(`   ✓ Current URL is OK — skipping\n`);
        stats.alreadyOk++;
        continue;
      }
      log(`   ✗ Current URL returns error`);
    }

    // Generate candidate URLs
    const candidates = candidateUrls(article, thumbnail);
    let newUrl = null;

    // Try each candidate
    for (const url of candidates) {
      log(`   Trying: ${url}`);
      if (await urlReturnsOk(url)) {
        log(`   ✓ Works!`);
        newUrl = url;
        break;
      }
    }

    // Strategy D: check product's image gallery
    if (!newUrl) {
      const { rows: images } = await client.query(
        `SELECT url FROM image WHERE product_id = $1 AND deleted_at IS NULL ORDER BY rank LIMIT 5`,
        [id]
      );
      for (const img of images) {
        if (img.url === thumbnail) continue; // skip same broken URL
        log(`   Trying gallery image: ${img.url}`);
        if (await urlReturnsOk(img.url)) {
          log(`   ✓ Works!`);
          newUrl = img.url;
          break;
        }
      }
    }

    // Strategy E: find similar product by title prefix (try multiple patterns)
    if (!newUrl) {
      const words = title.split(/\s+/).filter((w) => w.length > 2);
      // Try progressively shorter prefixes: first 3 words, then 2, then 1
      const attempts = [
        words.slice(0, 3).join(" "),
        words.slice(0, 2).join(" "),
        words.slice(0, 1).join(" "),
      ].filter((p) => p.length > 0);

      for (const pattern of attempts) {
        if (newUrl) break;
        const match = allGood.find(
          (g) =>
            g.id !== id &&
            g.title.toLowerCase().includes(pattern.toLowerCase())
        );
        if (match) {
          log(`   Trying similar product (pattern: "${pattern}") "${match.title.slice(0, 50)}": ${match.thumbnail}`);
          if (await urlReturnsOk(match.thumbnail)) {
            log(`   ✓ Works! (from similar product)`);
            newUrl = match.thumbnail;
          }
        }
      }
    }

    // Strategy F: look up parent article's image in DB (for variant articles like "113540-21")
    if (!newUrl && article) {
      const baseArticle = article.replace(/-\d+$/, "");
      if (baseArticle !== article) {
        const { rows: parentRows } = await client.query(
          `SELECT thumbnail FROM product
           WHERE metadata->>'alko_article' = $1
             AND thumbnail IS NOT NULL AND thumbnail <> ''
             AND deleted_at IS NULL LIMIT 1`,
          [baseArticle]
        );
        if (parentRows.length > 0) {
          log(`   Trying parent article ${baseArticle}: ${parentRows[0].thumbnail}`);
          if (await urlReturnsOk(parentRows[0].thumbnail)) {
            log(`   ✓ Works! (from parent article)`);
            newUrl = parentRows[0].thumbnail;
          }
        }
      }
    }

    // Apply fix
    if (newUrl) {
      if (!DRY_RUN) {
        await client.query(`UPDATE product SET thumbnail = $1, updated_at = NOW() WHERE id = $2`, [
          newUrl,
          id,
        ]);

        // Also update the image gallery if the old image entry points to the broken URL
        if (thumbnail && thumbnail.length > 0) {
          await client.query(
            `UPDATE image SET url = $1, updated_at = NOW() WHERE product_id = $2 AND url = $3 AND deleted_at IS NULL`,
            [newUrl, id, thumbnail]
          );
        } else {
          // If there was no thumbnail, ensure there's at least one image row
          const { rowCount } = await client.query(
            `SELECT 1 FROM image WHERE product_id = $1 AND url = $2 AND deleted_at IS NULL`,
            [id, newUrl]
          );
          if (rowCount === 0) {
            await client.query(
              `INSERT INTO image (id, url, product_id, rank, created_at, updated_at)
               VALUES ('img_fix_' || substr(md5(random()::text), 1, 24), $1, $2, 0, NOW(), NOW())`,
              [newUrl, id]
            );
          }
        }
        log(`   ★ UPDATED in database\n`);
      } else {
        log(`   → Would update to: ${newUrl}\n`);
      }
      stats.fixed++;
    } else {
      log(`   ✗ No working alternative found — STILL BROKEN\n`);
      stats.stillBroken++;
    }
  }

  // ── Summary ──────────────────────────────────────────────────────
  log(`\n${"=".repeat(70)}`);
  log(`  SUMMARY`);
  log(`${"=".repeat(70)}`);
  log(`  Products checked:    ${stats.checked}`);
  log(`  Already OK:          ${stats.alreadyOk}`);
  log(`  Fixed:               ${stats.fixed}`);
  log(`  Still broken:        ${stats.stillBroken}`);
  log(`  Mode:                ${DRY_RUN ? "DRY RUN" : "APPLIED"}`);
  log(`${"=".repeat(70)}\n`);

  // ── Verification (if applied) ────────────────────────────────────
  if (!DRY_RUN) {
    const { rows: remaining } = await client.query(`
      SELECT id, title, thumbnail
      FROM product
      WHERE deleted_at IS NULL
        AND (
          thumbnail IS NULL
          OR thumbnail = ''
          OR thumbnail LIKE '%alko-garden.de%'
        )
    `);
    if (remaining.length === 0) {
      log("  ✓ Verification passed: No more products with NULL/empty/alko-garden.de thumbnails\n");
    } else {
      log(`  ⚠ Verification: ${remaining.length} product(s) still have issues:`);
      for (const r of remaining) {
        log(`    - ${r.title}: ${r.thumbnail || "(NULL)"}`);
      }
      log("");
    }
  }

  await client.end();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
