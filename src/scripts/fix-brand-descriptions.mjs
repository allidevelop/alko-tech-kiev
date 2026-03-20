/**
 * fix-brand-descriptions.mjs
 *
 * Finds products where the brand is NOT AL-KO but descriptions incorrectly mention "AL-KO".
 * Regenerates descriptions with the correct brand via Claude CLI.
 *
 * Usage:
 *   node src/scripts/fix-brand-descriptions.mjs --preview    # show what needs fixing
 *   node src/scripts/fix-brand-descriptions.mjs              # fix all
 */

import pg from "pg";
import { execSync } from "child_process";
import { writeFileSync } from "fs";

const { Client } = pg;

const DB_CONFIG = {
  host: "localhost",
  port: 5432,
  database: "medusa_alko",
  user: "medusa_alko",
  password: "medusa_alko_2026",
};

const args = process.argv.slice(2);
const previewMode = args.includes("--preview");
const modelId = "claude-opus-4-6";

function log(msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

function shellEscape(str) {
  const tmpFile = "/tmp/claude-prompt-" + Date.now() + ".txt";
  writeFileSync(tmpFile, str, "utf8");
  return `"$(cat ${tmpFile})"`;
}

const SYSTEM_PROMPT = `Ти — досвідчений SEO-копірайтер інтернет-магазину садової техніки Alko-Technics (alko-technics.kiev.ua).

Твоя задача — ПЕРЕПИСАТИ опис товару, замінивши неправильний бренд на правильний.

ВАЖЛИВО:
1. Заміни всі згадки "AL-KO" на правильний бренд товару (вказаний нижче)
2. Збережи стиль, структуру та обсяг оригінального опису
3. Не вигадуй нових характеристик
4. Магазин називається Alko-Technics (це назва магазину, НЕ бренд товару)
5. Без markdown-розмітки, без емоджі

Відповідай ТІЛЬКИ валідним JSON (без markdown code block, без пояснень):
{
  "short_description_uk": "Виправлений короткий опис",
  "description_uk": "Виправлений повний опис"
}`;

function buildPrompt(product) {
  return `Правильний бренд товару: ${product.brand}
Назва товару: ${product.title}
Категорія: ${product.category}

Поточний короткий опис (з помилковим брендом AL-KO):
${product.short_description_uk || ""}

Поточний повний опис (з помилковим брендом AL-KO):
${product.description || ""}

Перепиши обидва описи, замінивши "AL-KO" на "${product.brand}". Збережи весь інший зміст без змін.`;
}

function callClaude(prompt, retries = 2) {
  const fullPrompt = `${SYSTEM_PROMPT}\n\n---\n\n${prompt}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = execSync(
        `claude -p ${shellEscape(fullPrompt)} --model ${modelId} --output-format text --max-turns 1`,
        {
          encoding: "utf8",
          timeout: 120_000,
          maxBuffer: 1024 * 1024,
          stdio: ["pipe", "pipe", "pipe"],
        }
      );

      const jsonMatch = result.match(/\{[\s\S]*"short_description_uk"[\s\S]*"description_uk"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.short_description_uk && parsed.description_uk) {
          return parsed;
        }
      }

      if (attempt < retries) {
        log(`  JSON parse failed, retry ${attempt + 1}/${retries}...`);
        continue;
      }
      log(`  ERROR: Could not parse JSON`);
      return null;
    } catch (err) {
      if (attempt < retries) {
        log(`  Error: ${err.message.substring(0, 100)}, retry...`);
        execSync("sleep 5");
        continue;
      }
      log(`  FAILED: ${err.message.substring(0, 100)}`);
      return null;
    }
  }
  return null;
}

async function main() {
  const db = new Client(DB_CONFIG);
  await db.connect();

  const { rows: products } = await db.query(`
    SELECT p.id, p.title, p.description, p.handle,
           p.metadata->>'brand' as brand,
           p.metadata->>'short_description_uk' as short_description_uk,
           pc.name as category
    FROM product p
    JOIN product_category_product pcp ON pcp.product_id = p.id
    JOIN product_category pc ON pc.id = pcp.product_category_id
    WHERE p.deleted_at IS NULL
      AND p.metadata->>'brand' NOT IN ('AL-KO', 'solo by AL-KO')
      AND p.metadata->>'brand' IS NOT NULL
      AND (p.description ILIKE '%AL-KO%' OR p.metadata->>'short_description_uk' ILIKE '%AL-KO%')
    ORDER BY p.metadata->>'brand', p.title
  `);

  log(`Found ${products.length} products with wrong brand in descriptions`);

  if (products.length === 0) {
    log("Nothing to fix!");
    await db.end();
    return;
  }

  if (previewMode) {
    for (const p of products) {
      console.log(`\n[${p.brand}] ${p.title}`);
      console.log(`  Short: ${(p.short_description_uk || "").substring(0, 120)}`);
      console.log(`  Desc:  ${(p.description || "").substring(0, 120)}`);
    }
    log(`\nTotal: ${products.length} products to fix`);
    await db.end();
    return;
  }

  let fixed = 0;
  let failed = 0;

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    log(`[${i + 1}/${products.length}] [${p.brand}] ${p.title}...`);

    const prompt = buildPrompt(p);
    const result = callClaude(prompt);

    if (result) {
      // Verify the fix actually removed AL-KO
      const stillHasAlko = result.description_uk.includes("AL-KO") || result.short_description_uk.includes("AL-KO");
      if (stillHasAlko) {
        log(`  WARNING: AL-KO still present after fix, applying anyway`);
      }

      try {
        await db.query(
          `UPDATE product SET description = $1 WHERE id = $2`,
          [result.description_uk, p.id]
        );
        await db.query(
          `UPDATE product SET metadata = metadata || $1::jsonb WHERE id = $2`,
          [JSON.stringify({ short_description_uk: result.short_description_uk }), p.id]
        );
        log(`  DB updated (${p.brand})`);
        fixed++;
      } catch (dbErr) {
        log(`  DB error: ${dbErr.message.substring(0, 80)}`);
        failed++;
      }
    } else {
      failed++;
    }

    if (i < products.length - 1) {
      execSync("sleep 3");
    }
  }

  log(`\nDONE! Fixed: ${fixed}, Failed: ${failed}`);
  await db.end();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
