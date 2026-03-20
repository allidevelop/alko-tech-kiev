#!/usr/bin/env node
/**
 * Генерация SEO-описаний для категорий через Claude CLI
 * Запуск: node src/scripts/generate-category-seo.mjs
 */

import pg from "pg";
import { execSync } from "child_process";

const { Pool } = pg;

const pool = new Pool({
  host: "localhost",
  port: 5432,
  database: "medusa_alko",
  user: "medusa_alko",
  password: "medusa_alko_2026",
});

const SYSTEM_PROMPT = `Ти — SEO-копірайтер інтернет-магазину садової техніки Alko-Technics (alko-technics.kiev.ua).
Напиши SEO-оптимізований текст для категорії товарів УКРАЇНСЬКОЮ мовою.

Формат відповіді — ТІЛЬКИ валідний JSON (без markdown code block):
{
  "description": "Короткий опис категорії (1-2 речення, 120-160 символів, для meta description)",
  "seo_text": "HTML-текст з h2, h3, p, ul, li тегами (3-4 секції, 500-800 слів)"
}

Вимоги:
1. Природне використання ключових слів (назва категорії + бренд + синоніми)
2. H2 — головний заголовок з назвою категорії та брендом
3. H3 — підзаголовки секцій
4. Списки ul/li для переваг та критеріїв вибору
5. Фінальна секція "Чому варто купити у Alko-Technics"
6. Без markdown — тільки HTML теги
7. Без емоджі
8. Магазин називається Alko-Technics (НЕ "алко-інструмент")
9. seo_text повинен бути одним рядком HTML (без переносів рядків усередині значення JSON)`;

async function getCategories() {
  const result = await pool.query(`
    SELECT
      pc.id,
      pc.name,
      pc.parent_category_id,
      (SELECT count(*) FROM product_category_product pcp WHERE pcp.product_category_id = pc.id)::int as product_count,
      (SELECT string_agg(sub.title, ', ')
       FROM (
         SELECT p.title
         FROM product p
         JOIN product_category_product pcp ON pcp.product_id = p.id
         WHERE pcp.product_category_id = pc.id
         ORDER BY p.title
         LIMIT 5
       ) sub) as sample_products,
      (SELECT string_agg(child.name, ', ')
       FROM product_category child
       WHERE child.parent_category_id = pc.id AND child.deleted_at IS NULL) as children_names
    FROM product_category pc
    WHERE pc.deleted_at IS NULL
    ORDER BY pc.parent_category_id NULLS FIRST, pc.name
  `);
  return result.rows;
}

function generateUserPrompt(cat) {
  let prompt = `Категорія: ${cat.name}`;
  if (cat.product_count > 0) {
    prompt += `\nКількість товарів: ${cat.product_count}`;
  }
  if (cat.sample_products) {
    prompt += `\nПриклади товарів: ${cat.sample_products}`;
  }
  if (cat.children_names) {
    prompt += `\nПідкатегорії: ${cat.children_names}`;
    prompt += `\nЦе батьківська категорія-група. Опиши її як загальну групу, що об'єднує підкатегорії.`;
  }
  return prompt;
}

async function generateSeoForCategory(cat) {
  const userPrompt = generateUserPrompt(cat);
  console.log(`\n🔄 Генерація SEO для: ${cat.name}`);

  try {
    const escapedSystem = SYSTEM_PROMPT.replace(/'/g, "'\\''");
    const escapedUser = userPrompt.replace(/'/g, "'\\''");

    const result = execSync(
      `claude -p '${escapedUser}' --system-prompt '${escapedSystem}' --output-format text --max-turns 1`,
      {
        encoding: "utf-8",
        timeout: 120000,
        maxBuffer: 1024 * 1024,
      }
    );

    // Extract JSON from response (might have markdown wrapper)
    let jsonStr = result.trim();

    // Remove markdown code blocks if present
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const parsed = JSON.parse(jsonStr);

    if (!parsed.description || !parsed.seo_text) {
      throw new Error("Missing description or seo_text in response");
    }

    return parsed;
  } catch (err) {
    console.error(`  ❌ Ошибка для ${cat.name}: ${err.message}`);
    return null;
  }
}

async function saveSeo(catId, description, seoText) {
  await pool.query(
    `UPDATE product_category
     SET description = $1,
         metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('seo_text', $2::text),
         updated_at = NOW()
     WHERE id = $3`,
    [description, seoText, catId]
  );
}

async function main() {
  console.log("=== Генерація SEO-описів для категорій ===\n");

  const categories = await getCategories();
  console.log(`Знайдено ${categories.length} категорій\n`);

  let success = 0;
  let failed = 0;

  for (const cat of categories) {
    const result = await generateSeoForCategory(cat);
    if (result) {
      await saveSeo(cat.id, result.description, result.seo_text);
      console.log(`  ✅ ${cat.name}: description (${result.description.length} символів)`);
      success++;
    } else {
      failed++;
    }
  }

  console.log(`\n=== Готово: ${success} успішно, ${failed} помилок ===`);
  await pool.end();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
