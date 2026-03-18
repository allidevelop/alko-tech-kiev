/**
 * rewrite-descriptions.mjs
 *
 * Reads scraped competitor product data from data/scraped-competitor.json and
 * generates unique AI-rewritten descriptions via OpenAI GPT-4o Mini API.
 *
 * Features:
 *   - Native fetch (no SDK), GPT-4o Mini with JSON response format
 *   - Rate limiting: 1 request per second
 *   - Retry with exponential backoff on 429 / JSON parse errors
 *   - Resume support: skips already-processed articles on restart
 *   - Periodic saves every 5 successful rewrites
 *   - Bilingual output: Ukrainian + Russian descriptions
 *
 * Usage:
 *   cd /home/developer/projects/alko-store
 *   node src/scripts/rewrite-descriptions.mjs
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

// ──────────────────────────────────────────────
// .env loader (no dependencies)
// ──────────────────────────────────────────────

function loadEnv() {
  try {
    const envPath = resolve(process.cwd(), ".env");
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch (e) {
    // .env not found — rely on environment
  }
}
loadEnv();

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const INPUT_PATH = resolve(process.cwd(), "data/scraped-competitor.json");
const OUTPUT_PATH = resolve(process.cwd(), "data/rewritten-descriptions.json");

const MODEL = "gpt-4o-mini";
const MIN_DESCRIPTION_LENGTH = 50;
const SAVE_EVERY = 5;
const MAX_RETRIES = 3;
const RATE_LIMIT_MS = 1000;

const SYSTEM_PROMPT = `Ти — досвідчений копірайтер інтернет-магазину садової техніки Alko-Technics для українського ринку.

Твоя задача — переписати опис товару СВОЇМИ СЛОВАМИ, зробивши його повністю УНІКАЛЬНИМ.

Вимоги:
1. ПОВНА УНІКАЛЬНІСТЬ — не копіювати жодного речення дослівно, повністю перефразувати кожну думку
2. SEO-оптимізація — природно включити назву товару та ключові технічні характеристики в текст
3. Інформативність — зберегти ВСІ технічні деталі, переваги та особливості товару
4. Структура — розділити на логічні абзаци для зручного читання
5. Стиль — професійний, але зрозумілий пересічному покупцю
6. Без markdown-розмітки (без **, ##, - тощо)
7. Без емоджі
8. Короткий опис — 1-2 речення, що передають суть товару та його ключову перевагу
9. Повний опис — 3-5 абзаців з детальним описом можливостей, переваг та сфери застосування
10. НЕ згадувати назву магазину "alko-instrument" чи будь-які інші конкурентні магазини

Відповідь — ТІЛЬКИ валідний JSON (без markdown code block):
{
  "short_description_uk": "Короткий опис українською (1-2 речення, 100-200 символів)",
  "short_description_ru": "Краткое описание на русском (1-2 предложения, 100-200 символов)",
  "description_uk": "Повний опис українською (3-5 абзаців, 400-800 символів, абзаци розділені \\n\\n)",
  "description_ru": "Полное описание на русском (3-5 абзацев, 400-800 символов, абзацы разделены \\n\\n)"
}`;

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function log(msg) {
  console.log(msg);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function formatCharacteristics(characteristics) {
  if (!characteristics || typeof characteristics !== "object") return "";
  if (Array.isArray(characteristics)) {
    return characteristics
      .map((c) => `${c.name || c.key}: ${c.value}`)
      .join("\n");
  }
  return Object.entries(characteristics)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

// ──────────────────────────────────────────────
// OpenAI API (native fetch, no SDK)
// ──────────────────────────────────────────────

async function callOpenAI(systemPrompt, userPrompt) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  // Handle rate limiting with exponential backoff
  if (response.status === 429) {
    const err = new Error("Rate limited (429)");
    err.status = 429;
    throw err;
  }

  const data = await response.json();
  if (!data.choices?.[0]?.message?.content) {
    throw new Error(`OpenAI error: ${JSON.stringify(data)}`);
  }
  return JSON.parse(data.choices[0].message.content);
}

async function callOpenAIWithRetry(systemPrompt, userPrompt) {
  let lastError;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await callOpenAI(systemPrompt, userPrompt);
    } catch (err) {
      lastError = err;

      if (err.status === 429) {
        // Exponential backoff for rate limiting: 2s, 4s, 8s, 16s
        const backoff = Math.pow(2, attempt + 1) * 1000;
        log(`   Rate limited (429). Retrying in ${backoff / 1000}s... (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(backoff);
        continue;
      }

      if (err instanceof SyntaxError || err.message.includes("JSON")) {
        // JSON parse error — retry up to 2 times
        if (attempt < 2) {
          log(`   JSON parse error. Retrying... (attempt ${attempt + 1}/${MAX_RETRIES})`);
          await sleep(1000);
          continue;
        }
      }

      // Other errors — stop retrying
      break;
    }
  }

  throw lastError;
}

// ──────────────────────────────────────────────
// I/O
// ──────────────────────────────────────────────

function loadInput() {
  if (!existsSync(INPUT_PATH)) {
    throw new Error(`Input file not found: ${INPUT_PATH}`);
  }
  const raw = readFileSync(INPUT_PATH, "utf-8");
  return JSON.parse(raw);
}

function loadExistingOutput() {
  if (!existsSync(OUTPUT_PATH)) {
    return {
      rewritten_at: new Date().toISOString(),
      model: MODEL,
      stats: { total_processed: 0, successful: 0, failed: 0 },
      products: [],
    };
  }
  try {
    const raw = readFileSync(OUTPUT_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {
      rewritten_at: new Date().toISOString(),
      model: MODEL,
      stats: { total_processed: 0, successful: 0, failed: 0 },
      products: [],
    };
  }
}

function saveOutput(output) {
  output.rewritten_at = new Date().toISOString();
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf-8");
}

// ──────────────────────────────────────────────
// User prompt builder
// ──────────────────────────────────────────────

function buildUserPrompt(product) {
  const parts = [];

  parts.push(`Товар: ${product.our_title || product.title || ""}`);
  parts.push(`Артикул: ${product.article || ""}`);

  parts.push("");
  parts.push("Опис конкурента (для натхнення, НЕ копіювати):");
  parts.push(product.competitor_full_description || product.full_description || product.description || "");

  parts.push("");
  parts.push("Короткий опис конкурента:");
  parts.push(product.short_description || product.competitor_short_description || "");

  parts.push("");
  parts.push("Характеристики:");
  parts.push(formatCharacteristics(product.characteristics));

  parts.push("");
  parts.push("Наш поточний опис (короткий, потрібно покращити):");
  parts.push(product.our_current_description || product.our_description || "");

  parts.push("");
  parts.push("Перепиши опис для нашого магазину Alko-Technics.");

  return parts.join("\n");
}

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set. Add it to .env or export it.");
  }

  log(`\n${"=".repeat(70)}`);
  log(`  rewrite-descriptions.mjs  |  GPT-4o Mini`);
  log(`${"=".repeat(70)}\n`);

  // ── Step 1: Load data ────────────────────────────────────────────
  const inputData = loadInput();
  const products = Array.isArray(inputData) ? inputData : inputData.products || [];
  log(`Loaded ${products.length} product(s) from scraped-competitor.json`);

  // ── Step 2: Filter — only matched products with long descriptions ─
  const eligible = products.filter((p) => {
    if (!p.our_product_id) return false;
    const desc = p.competitor_full_description || p.full_description || p.description || "";
    return desc.length > MIN_DESCRIPTION_LENGTH;
  });
  log(`Eligible for rewriting: ${eligible.length} (matched + description > ${MIN_DESCRIPTION_LENGTH} chars)\n`);

  // ── Step 3: Load existing output for resume support ──────────────
  const output = loadExistingOutput();
  const processedArticles = new Set(output.products.map((p) => p.article));
  const alreadyDone = eligible.filter((p) => processedArticles.has(p.article)).length;

  if (alreadyDone > 0) {
    log(`Resume mode: ${alreadyDone} product(s) already processed, skipping.\n`);
  }

  // ── Step 4: Process each product ─────────────────────────────────
  let successCount = 0;
  let failCount = 0;
  let sinceLastSave = 0;
  const errors = [];

  for (let i = 0; i < eligible.length; i++) {
    const product = eligible[i];
    const article = product.article || "";

    // Skip already processed
    if (processedArticles.has(article)) {
      continue;
    }

    const idx = output.stats.total_processed + 1;
    const shortTitle =
      (product.our_title || product.title || "").length > 50
        ? (product.our_title || product.title || "").slice(0, 50) + "..."
        : product.our_title || product.title || "";

    log(`── [${idx}] ${shortTitle} (${article})`);

    try {
      const userPrompt = buildUserPrompt(product);
      const result = await callOpenAIWithRetry(SYSTEM_PROMPT, userPrompt);

      // Validate response structure
      if (
        !result.short_description_uk ||
        !result.description_uk ||
        !result.short_description_ru ||
        !result.description_ru
      ) {
        throw new Error("Incomplete response — missing required fields");
      }

      output.products.push({
        article,
        product_id: product.our_product_id,
        title: product.our_title || product.title || "",
        short_description_uk: result.short_description_uk,
        short_description_ru: result.short_description_ru,
        description_uk: result.description_uk,
        description_ru: result.description_ru,
        original_description: product.our_current_description || product.our_description || "",
        competitor_description: (product.competitor_full_description || product.description || "").slice(0, 500),
      });

      processedArticles.add(article);
      successCount++;
      sinceLastSave++;
      output.stats.total_processed++;
      output.stats.successful++;

      log(`   OK (uk: ${result.short_description_uk.length} chars, full: ${result.description_uk.length} chars)`);

      // Save periodically
      if (sinceLastSave >= SAVE_EVERY) {
        saveOutput(output);
        log(`   [Saved progress: ${output.products.length} products]\n`);
        sinceLastSave = 0;
      }
    } catch (err) {
      failCount++;
      output.stats.total_processed++;
      output.stats.failed++;
      errors.push({ article, title: shortTitle, error: err.message });
      log(`   FAILED: ${err.message}`);
    }

    // Rate limiting: 1 request per second
    await sleep(RATE_LIMIT_MS);
  }

  // ── Step 5: Final save ───────────────────────────────────────────
  saveOutput(output);

  // ── Summary ──────────────────────────────────────────────────────
  log(`\n${"=".repeat(70)}`);
  log(`  SUMMARY`);
  log(`${"=".repeat(70)}`);
  log(`  Total eligible:       ${eligible.length}`);
  log(`  Already processed:    ${alreadyDone}`);
  log(`  Processed this run:   ${successCount + failCount}`);
  log(`  Successful:           ${successCount}`);
  log(`  Failed:               ${failCount}`);
  log(`  Total in output:      ${output.products.length}`);
  log(`  Output saved to:      ${OUTPUT_PATH}`);
  log(`${"=".repeat(70)}`);

  if (errors.length > 0) {
    log(`\n  ERRORS:`);
    for (const e of errors) {
      log(`    - [${e.article}] ${e.title}: ${e.error}`);
    }
  }

  log("");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
