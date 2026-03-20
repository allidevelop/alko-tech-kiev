/**
 * generate-descriptions-cli.mjs
 *
 * Generates SEO-optimized product descriptions using Claude CLI (subscription).
 * Only Ukrainian language. Uses `claude -p` for each product.
 *
 * Usage:
 *   node src/scripts/generate-descriptions-cli.mjs                          # all products without descriptions
 *   node src/scripts/generate-descriptions-cli.mjs --category "Газонокосарки" # specific category
 *   node src/scripts/generate-descriptions-cli.mjs --limit 5                # limit number of products
 *   node src/scripts/generate-descriptions-cli.mjs --preview 3              # preview prompts without calling Claude
 *   node src/scripts/generate-descriptions-cli.mjs --apply                  # apply results to DB
 *   node src/scripts/generate-descriptions-cli.mjs --model sonnet           # use sonnet instead of opus
 */

import pg from "pg";
import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";

const { Client } = pg;

const DB_CONFIG = {
  host: "localhost",
  port: 5432,
  database: "medusa_alko",
  user: "medusa_alko",
  password: "medusa_alko_2026",
};

const RESULTS_FILE = "data/generated-descriptions.json";

// ── CLI args ──

const args = process.argv.slice(2);
const categoryFilter = getArg("--category");
const limitNum = parseInt(getArg("--limit") || "0", 10);
const previewNum = parseInt(getArg("--preview") || "0", 10);
const applyMode = args.includes("--apply");
const modelArg = getArg("--model") || "opus";

// Map short model names to CLI model flags
const MODEL_MAP = {
  opus: "claude-opus-4-6",
  sonnet: "claude-sonnet-4-5-20250929",
  haiku: "claude-haiku-4-5-20251001",
};
const modelId = MODEL_MAP[modelArg] || modelArg;

function getArg(flag) {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx === args.length - 1) return null;
  return args[idx + 1];
}

function log(msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

// ── System prompt ──

const SYSTEM_PROMPT = `Ти — досвідчений SEO-копірайтер інтернет-магазину садової техніки Alko-Technics (alko-technics.kiev.ua).

Твоя задача — написати УНІКАЛЬНИЙ, SEO-оптимізований опис товару українською мовою.

ВИМОГИ ДО SEO:
1. Назва товару та ключові характеристики МАЮТЬ бути природно вписані в текст (не просто перераховані)
2. Перший абзац — найважливіший для SEO: назва товару + головна перевага + категорія
3. Використовуй синоніми та пов'язані ключові слова: газонокосарка/косарка/косилка, акумуляторна/бездротова, бензинова/паливна
4. Структурований текст з логічними абзацами
5. Корисна інформація для покупця: для кого підходить, які задачі вирішує, умови використання

ВИМОГИ ДО ТЕКСТУ:
1. ПОВНА УНІКАЛЬНІСТЬ — жодного копіювання
2. Стиль — професійний, зрозумілий пересічному покупцю
3. Без markdown-розмітки (без **, ##, - тощо)
4. Без емоджі
5. Короткий опис — 1-2 речення, суть товару та ключова перевага (100-200 символів)
6. Повний опис — 3-5 абзаців (400-800 символів), абзаци розділені через \\n\\n
7. НЕ вигадуй характеристики яких немає у вхідних даних
8. Магазин називається Alko-Technics (НЕ "AL-KO Garden Store", НЕ "alko-instrument")

Відповідай ТІЛЬКИ валідним JSON (без markdown code block, без пояснень):
{
  "short_description_uk": "Короткий опис (1-2 речення, 100-200 символів)",
  "description_uk": "Повний опис (3-5 абзаців, 400-800 символів, абзаци розділені \\n\\n)"
}`;

// ── Build user prompt per product ──

function buildUserPrompt(product) {
  const specs = product.specs || {};
  const specsFormatted = Object.entries(specs)
    .map(([k, v]) => `${k.replace("spec_", "").replace(/_/g, " ")}: ${v}`)
    .join("\n");

  return `Товар: ${product.title}
Категорія: ${product.category}
Артикул: ${product.article}

Поточний опис (короткий, потрібно розширити):
${product.description}

Характеристики:
${specsFormatted || "Немає додаткових характеристик"}

Напиши SEO-оптимізований опис для інтернет-магазину Alko-Technics.`;
}

// ── Call Claude CLI ──

function callClaude(prompt, retries = 2) {
  const fullPrompt = `${SYSTEM_PROMPT}\n\n---\n\n${prompt}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = execSync(
        `claude -p ${shellEscape(fullPrompt)} --model ${modelId} --output-format text --max-turns 1`,
        {
          encoding: "utf8",
          timeout: 120_000, // 2 min timeout
          maxBuffer: 1024 * 1024,
          stdio: ["pipe", "pipe", "pipe"],
        }
      );

      // Try to extract JSON from response
      const jsonMatch = result.match(/\{[\s\S]*"short_description_uk"[\s\S]*"description_uk"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.short_description_uk && parsed.description_uk) {
          return parsed;
        }
      }

      // Retry if JSON parsing failed
      if (attempt < retries) {
        log(`  JSON parse failed, retry ${attempt + 1}/${retries}...`);
        continue;
      }

      log(`  ERROR: Could not parse JSON from response: ${result.substring(0, 200)}`);
      return null;
    } catch (err) {
      if (attempt < retries) {
        log(`  Error: ${err.message.substring(0, 100)}, retry ${attempt + 1}/${retries}...`);
        // Wait before retry
        execSync("sleep 5");
        continue;
      }
      log(`  FAILED after ${retries + 1} attempts: ${err.message.substring(0, 100)}`);
      return null;
    }
  }
  return null;
}

function shellEscape(str) {
  // Write to temp file and read from it instead of escaping
  const tmpFile = "/tmp/claude-prompt-" + Date.now() + ".txt";
  writeFileSync(tmpFile, str, "utf8");
  return `"$(cat ${tmpFile})"`;
}

// ── Load existing results for resume ──

function loadExistingResults() {
  if (existsSync(RESULTS_FILE)) {
    try {
      const data = JSON.parse(readFileSync(RESULTS_FILE, "utf8"));
      return data;
    } catch {
      return { products: [], stats: {} };
    }
  }
  return { products: [], stats: {} };
}

function saveResults(results) {
  writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2), "utf8");
}

// ── Main ──

async function main() {
  const db = new Client(DB_CONFIG);
  await db.connect();

  log(`Mode: ${applyMode ? "APPLY to DB" : previewNum > 0 ? `PREVIEW ${previewNum}` : "GENERATE"}`);
  log(`Model: ${modelArg} (${modelId})`);
  if (categoryFilter) log(`Category filter: ${categoryFilter}`);

  // If --apply mode, read results and apply to DB
  if (applyMode) {
    await applyToDb(db);
    await db.end();
    return;
  }

  // Fetch products needing descriptions
  let query = `
    SELECT p.id, p.title, p.description, p.handle,
           p.metadata->>'alko_article' as article,
           pc.name as category,
           (SELECT jsonb_object_agg(key, value)
            FROM jsonb_each_text(p.metadata)
            WHERE key LIKE 'spec_%') as specs
    FROM product p
    JOIN product_category_product pcp ON pcp.product_id = p.id
    JOIN product_category pc ON pc.id = pcp.product_category_id
    WHERE p.deleted_at IS NULL
      AND p.metadata->>'short_description_uk' IS NULL
  `;

  const params = [];
  if (categoryFilter) {
    params.push(categoryFilter);
    query += ` AND pc.name = $${params.length}`;
  }

  query += ` ORDER BY p.title`;
  if (limitNum > 0) {
    query += ` LIMIT ${limitNum}`;
  }

  const { rows: products } = await db.query(query, params);
  log(`Found ${products.length} products needing descriptions`);

  if (products.length === 0) {
    log("Nothing to do!");
    await db.end();
    return;
  }

  // Preview mode
  if (previewNum > 0) {
    const sample = products.slice(0, previewNum);
    for (const p of sample) {
      console.log("\n" + "=".repeat(80));
      console.log(`PRODUCT: ${p.title} (${p.article})`);
      console.log(`CATEGORY: ${p.category}`);
      console.log(`CURRENT DESC: ${(p.description || "").substring(0, 200)}`);
      console.log("-".repeat(40));
      console.log("PROMPT:");
      console.log(buildUserPrompt(p));
      console.log("=".repeat(80));
    }
    await db.end();
    return;
  }

  // Load existing results for resume
  const existing = loadExistingResults();
  const processedIds = new Set(existing.products.map((p) => p.product_id));
  const results = existing;

  let successCount = processedIds.size;
  let failCount = 0;
  let skipCount = 0;

  for (let i = 0; i < products.length; i++) {
    const p = products[i];

    if (processedIds.has(p.id)) {
      skipCount++;
      continue;
    }

    log(`[${i + 1}/${products.length}] ${p.title} (${p.article})...`);

    const prompt = buildUserPrompt(p);
    const result = callClaude(prompt);

    if (result) {
      // Write to DB immediately
      try {
        await db.query(
          `UPDATE product SET description = $1 WHERE id = $2`,
          [result.description_uk, p.id]
        );
        await db.query(
          `UPDATE product SET metadata = metadata || $1::jsonb WHERE id = $2`,
          [JSON.stringify({ short_description_uk: result.short_description_uk }), p.id]
        );
        log(`  DB updated`);
      } catch (dbErr) {
        log(`  DB error: ${dbErr.message.substring(0, 80)}`);
      }

      results.products.push({
        product_id: p.id,
        handle: p.handle,
        article: p.article,
        title: p.title,
        category: p.category,
        short_description_uk: result.short_description_uk,
        description_uk: result.description_uk,
        generated_at: new Date().toISOString(),
      });
      successCount++;
      log(`  OK (short: ${result.short_description_uk.length} chars, full: ${result.description_uk.length} chars)`);
    } else {
      failCount++;
      log(`  FAILED`);
    }

    // Save after every 5 products
    if ((successCount + failCount) % 5 === 0) {
      results.stats = {
        total: products.length,
        successful: successCount,
        failed: failCount,
        skipped: skipCount,
        last_updated: new Date().toISOString(),
      };
      saveResults(results);
      log(`  Saved progress (${successCount} done)`);
    }

    // Small delay between calls to respect rate limits
    if (i < products.length - 1) {
      execSync("sleep 3");
    }
  }

  // Final save
  results.stats = {
    total: products.length,
    successful: successCount,
    failed: failCount,
    skipped: skipCount,
    model: modelArg,
    category: categoryFilter || "all",
    completed_at: new Date().toISOString(),
  };
  saveResults(results);

  log(`\nDONE! Success: ${successCount}, Failed: ${failCount}, Skipped: ${skipCount}`);
  log(`Results saved to ${RESULTS_FILE}`);
  log(`To apply: node src/scripts/generate-descriptions-cli.mjs --apply`);

  await db.end();
}

// ── Apply to DB ──

async function applyToDb(db) {
  if (!existsSync(RESULTS_FILE)) {
    log("ERROR: No results file found. Run generation first.");
    return;
  }

  const data = JSON.parse(readFileSync(RESULTS_FILE, "utf8"));
  const products = data.products || [];

  if (products.length === 0) {
    log("No products to apply.");
    return;
  }

  log(`Applying ${products.length} descriptions to DB...`);

  // Backup
  await db.query(`
    CREATE TABLE IF NOT EXISTS product_description_backup_v2 AS
    SELECT id, title, description, metadata FROM product WHERE deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'product_description_backup_v2')
  `).catch(() => {
    log("Backup table already exists, skipping.");
  });

  let updated = 0;
  for (const p of products) {
    try {
      // Update main description (Ukrainian)
      await db.query(
        `UPDATE product SET description = $1 WHERE id = $2`,
        [p.description_uk, p.product_id]
      );

      // Add short description to metadata
      await db.query(
        `UPDATE product SET metadata = metadata || $1::jsonb WHERE id = $2`,
        [JSON.stringify({ short_description_uk: p.short_description_uk }), p.product_id]
      );

      updated++;
    } catch (err) {
      log(`  Error updating ${p.title}: ${err.message}`);
    }
  }

  log(`Updated ${updated}/${products.length} products`);

  // Verify
  const { rows } = await db.query(`
    SELECT AVG(LENGTH(description))::int as avg_len
    FROM product WHERE deleted_at IS NULL
  `);
  log(`Average description length: ${rows[0].avg_len} chars`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
