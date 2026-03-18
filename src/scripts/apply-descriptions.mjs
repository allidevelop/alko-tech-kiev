/**
 * apply-descriptions.mjs
 *
 * Applies AI-rewritten product descriptions to the AL-KO store PostgreSQL database.
 *
 * Data sources:
 *   - data/rewritten-descriptions.json  — AI-rewritten descriptions (uk + ru)
 *   - data/scraped-competitor.json      — competitor characteristics for spec enrichment
 *
 * Modes:
 *   (default)      — dry-run: show what would be updated, no DB changes
 *   --preview N    — show N examples with current vs new description side by side
 *   --apply        — actually apply changes to the database (creates backup first)
 *
 * Usage:
 *   node src/scripts/apply-descriptions.mjs              # dry-run
 *   node src/scripts/apply-descriptions.mjs --preview 5  # show 5 examples
 *   node src/scripts/apply-descriptions.mjs --apply      # apply to DB
 */

import pg from "pg";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "../..");

// ──────────────────────────────────────────────
// CLI args
// ──────────────────────────────────────────────

const args = process.argv.slice(2);
const MODE_APPLY = args.includes("--apply");
const MODE_PREVIEW = args.includes("--preview");
const PREVIEW_COUNT = MODE_PREVIEW
  ? parseInt(args[args.indexOf("--preview") + 1], 10) || 3
  : 0;

// ──────────────────────────────────────────────
// DB Config
// ──────────────────────────────────────────────

const DB_CONFIG = {
  host: "localhost",
  port: 5432,
  database: "medusa_alko",
  user: "medusa_alko",
  password: "medusa_alko_2026",
};

// ──────────────────────────────────────────────
// Spec key maps (characteristic name → metadata key)
// ──────────────────────────────────────────────

const SPEC_KEY_MAP_UK = {
  "Виробник": "spec_brand",
  "Серія": "spec_series",
  "Тип": "spec_type",
  "Вид": "spec_kind",
  "Тип двигуна": "spec_engine_type",
  "Двигун": "spec_engine",
  "Потужність двигуна, к.с.": "spec_power_hp",
  "Напруга, В": "spec_voltage",
  "Ширина захвату": "spec_cutting_width",
  "Рекомендована площа": "spec_recommended_area",
  "Рівень шуму, дБ": "spec_noise_db",
  "Призначення": "spec_purpose",
  "Модель": "spec_model",
  "Особливості": "spec_features",
  "Гарантійні умови": "spec_warranty_terms",
  "Країна реєстрації бренду": "spec_brand_country",
  "Країна-виробник товару": "spec_made_in",
  "Матеріал": "spec_material",
  "Об'єм двигуна, куб. см": "spec_engine_cc",
  "Об'єм бака, л": "spec_tank_volume",
  "Висота скошування": "spec_cutting_height",
  "Травозбірник": "spec_grass_catcher",
  "Діаметр різання": "spec_cut_diameter",
  "Тип акумулятора": "spec_battery_type",
  "Ємність акумулятора, Аг": "spec_battery_ah",
  "Максимальний тиск, бар": "spec_max_pressure",
  "Гарантія": "spec_warranty",
  "Клас": "spec_class",
  "Колір": "spec_color",
  "Живлення": "spec_power_source",
  "Система запуску": "spec_start_system",
  "Тип палива": "spec_fuel_type",
  "Комплектація": "spec_equipment",
  "Комплект поставки": "spec_delivery_set",
  "Потужність двигуна, Вт": "spec_power_watts",
  "Потужність двигуна, кВт": "spec_power_kw",
  "Напруга акумулятора, В": "spec_battery_voltage",
  "Акумулятор в комплекті": "spec_battery_included",
  "Довжина шини, мм": "spec_bar_length",
  "Крок ланцюга, дюйм": "spec_chain_pitch",
  "Сумісність": "spec_compatibility",
  "Застосування": "spec_application",
  "Ріжуча система": "spec_cutting_system",
};

const SPEC_KEY_MAP_RU = {
  "Производитель": "spec_brand",
  "Серия": "spec_series",
  "Тип": "spec_type",
  "Вид": "spec_kind",
  "Тип двигателя": "spec_engine_type",
  "Двигатель": "spec_engine",
  "Мощность двигателя, л.с.": "spec_power_hp",
  "Напряжение, В": "spec_voltage",
  "Ширина захвата": "spec_cutting_width",
  "Рекомендуемая площадь": "spec_recommended_area",
  "Уровень шума, дБ": "spec_noise_db",
  "Назначение": "spec_purpose",
  "Модель": "spec_model",
  "Особенности": "spec_features",
  "Гарантийные условия": "spec_warranty_terms",
  "Страна регистрации бренда": "spec_brand_country",
  "Страна-производитель": "spec_made_in",
  "Материал": "spec_material",
  "Объем двигателя, куб. см": "spec_engine_cc",
  "Объем бака, л": "spec_tank_volume",
  "Высота скашивания": "spec_cutting_height",
  "Травосборник": "spec_grass_catcher",
  "Диаметр среза": "spec_cut_diameter",
  "Тип аккумулятора": "spec_battery_type",
  "Емкость аккумулятора, Ач": "spec_battery_ah",
  "Максимальное давление, бар": "spec_max_pressure",
  "Гарантия": "spec_warranty",
  "Класс": "spec_class",
  "Цвет": "spec_color",
  "Питание": "spec_power_source",
  "Система запуска": "spec_start_system",
  "Тип топлива": "spec_fuel_type",
  "Комплектация": "spec_equipment",
  "Комплект поставки": "spec_delivery_set",
  "Мощность двигателя, Вт": "spec_power_watts",
  "Мощность двигателя, кВт": "spec_power_kw",
  "Напряжение аккумулятора, В": "spec_battery_voltage",
  "Аккумулятор в комплекте": "spec_battery_included",
  "Длина шины, мм": "spec_bar_length",
  "Шаг цепи, дюйм": "spec_chain_pitch",
  "Совместимость": "spec_compatibility",
  "Применение": "spec_application",
  "Режущая система": "spec_cutting_system",
  "Корпус": "spec_body_material",
  "Мощность, кВт / л.с.": "spec_power_kw",
  "Регулировка высоты": "spec_cutting_height",
  "Режимы работы": "spec_features",
  "Тип рукоятки": "spec_construction",
  "Ширина колеи, см": "spec_working_width",
  "Контейнер для сбора, л": "spec_grass_catcher",
};

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function log(msg) {
  console.log(msg);
}

function loadJSON(relativePath) {
  const fullPath = resolve(PROJECT_ROOT, relativePath);
  try {
    const raw = readFileSync(fullPath, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") {
      log(`  [WARN] File not found: ${fullPath}`);
      return null;
    }
    throw err;
  }
}

function truncate(str, maxLen = 120) {
  if (!str) return "(empty)";
  const oneLine = str.replace(/\n/g, " ").trim();
  return oneLine.length > maxLen ? oneLine.slice(0, maxLen) + "..." : oneLine;
}

/**
 * Extract spec keys from a competitor product's characteristics.
 * Returns an object like { spec_brand: "AL-KO", spec_power_hp: "5.1", ... }
 */
function extractSpecs(characteristics) {
  if (!characteristics || typeof characteristics !== "object") return {};

  const specs = {};

  for (const [name, value] of Object.entries(characteristics)) {
    const strValue = String(value).trim();
    if (!strValue) continue;

    // Try Ukrainian map first, then Russian
    const key = SPEC_KEY_MAP_UK[name] || SPEC_KEY_MAP_RU[name];
    if (key && !specs[key]) {
      specs[key] = strValue;
    }
  }

  return specs;
}

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────

async function main() {
  const modeLabel = MODE_APPLY
    ? "APPLYING CHANGES"
    : MODE_PREVIEW
      ? `PREVIEW (${PREVIEW_COUNT} examples)`
      : "DRY RUN (use --apply to write)";

  log(`\n${"=".repeat(70)}`);
  log(`  apply-descriptions.mjs  |  ${modeLabel}`);
  log(`${"=".repeat(70)}\n`);

  // ── Step 1: Load data files ────────────────────────────────────────

  const rewritten = loadJSON("data/rewritten-descriptions.json");
  if (!rewritten) {
    log("  [ERROR] Cannot proceed without data/rewritten-descriptions.json");
    process.exit(1);
  }

  const competitorData = loadJSON("data/scraped-competitor.json");

  // Build competitor lookup by product ID or handle for spec enrichment
  const competitorMap = new Map();
  const competitorItems = competitorData
    ? (Array.isArray(competitorData) ? competitorData : competitorData.products || [])
    : [];
  for (const item of competitorItems) {
    const key = item.our_product_id || item.product_id || item.id || item.handle;
    if (key && item.characteristics) {
      competitorMap.set(key, item.characteristics);
    }
  }

  // Build rewritten lookup — support both array and {products:[...]} formats
  const rewrittenMap = new Map();
  const rewrittenItems = Array.isArray(rewritten)
    ? rewritten
    : Array.isArray(rewritten.products)
      ? rewritten.products
      : [];
  for (const item of rewrittenItems) {
    const key = item.product_id || item.id;
    if (key) rewrittenMap.set(key, item);
  }

  log(`  Loaded ${rewrittenMap.size} rewritten description(s)`);
  log(`  Loaded ${competitorMap.size} competitor product(s) with characteristics\n`);

  // ── Step 2: Connect to DB and fetch current products ───────────────

  const client = new Client(DB_CONFIG);
  await client.connect();

  const { rows: products } = await client.query(`
    SELECT id, title, handle, description, metadata
    FROM product
    WHERE deleted_at IS NULL
    ORDER BY title
  `);

  log(`  Products in database: ${products.length}\n`);

  // ── Step 3: Match products with rewritten data ─────────────────────

  const updates = [];

  for (const product of products) {
    const rewrittenEntry =
      rewrittenMap.get(product.id) ||
      rewrittenMap.get(product.handle);

    if (!rewrittenEntry) continue;

    const descriptionUk = rewrittenEntry.description_uk || rewrittenEntry.description || null;
    const descriptionRu = rewrittenEntry.description_ru || null;
    const shortDescriptionUk = rewrittenEntry.short_description_uk || null;
    const shortDescriptionRu = rewrittenEntry.short_description_ru || null;

    if (!descriptionUk) continue;

    // Build metadata additions for descriptions
    const metaDescriptions = {};
    if (descriptionRu) metaDescriptions.description_ru = descriptionRu;
    if (shortDescriptionUk) metaDescriptions.short_description_uk = shortDescriptionUk;
    if (shortDescriptionRu) metaDescriptions.short_description_ru = shortDescriptionRu;

    // Build spec enrichment from competitor data
    const characteristics =
      competitorMap.get(product.id) ||
      competitorMap.get(product.handle) ||
      null;
    const newSpecs = extractSpecs(characteristics);

    updates.push({
      product,
      descriptionUk,
      metaDescriptions,
      newSpecs,
    });
  }

  log(`  Products with rewritten descriptions: ${updates.length}`);

  // Count how many specs will be added (only truly new ones)
  let totalNewSpecs = 0;
  for (const u of updates) {
    const existingMeta = u.product.metadata || {};
    for (const key of Object.keys(u.newSpecs)) {
      if (!(key in existingMeta)) {
        totalNewSpecs++;
      }
    }
  }
  log(`  New spec values to add: ${totalNewSpecs}\n`);

  // ── Step 4: Preview mode ───────────────────────────────────────────

  if (MODE_PREVIEW) {
    const count = Math.min(PREVIEW_COUNT, updates.length);
    log(`${"─".repeat(70)}`);
    log(`  Showing ${count} of ${updates.length} examples`);
    log(`${"─".repeat(70)}\n`);

    for (let i = 0; i < count; i++) {
      const { product, descriptionUk, metaDescriptions, newSpecs } = updates[i];
      const shortTitle = product.title.length > 60
        ? product.title.slice(0, 60) + "..."
        : product.title;

      log(`  [${i + 1}] ${shortTitle}`);
      log(`      ID: ${product.id}`);
      log("");
      log(`      CURRENT description:`);
      log(`        ${truncate(product.description, 200)}`);
      log("");
      log(`      NEW description (UK):`);
      log(`        ${truncate(descriptionUk, 200)}`);

      if (metaDescriptions.description_ru) {
        log("");
        log(`      NEW description (RU):`);
        log(`        ${truncate(metaDescriptions.description_ru, 200)}`);
      }

      if (metaDescriptions.short_description_uk) {
        log("");
        log(`      Short (UK): ${truncate(metaDescriptions.short_description_uk, 150)}`);
      }
      if (metaDescriptions.short_description_ru) {
        log(`      Short (RU): ${truncate(metaDescriptions.short_description_ru, 150)}`);
      }

      const existingMeta = product.metadata || {};
      const actualNewSpecs = Object.entries(newSpecs).filter(
        ([key]) => !(key in existingMeta)
      );
      if (actualNewSpecs.length > 0) {
        log("");
        log(`      NEW specs (${actualNewSpecs.length}):`);
        for (const [key, val] of actualNewSpecs) {
          log(`        ${key}: ${val}`);
        }
      }

      log(`\n${"─".repeat(70)}\n`);
    }

    await client.end();
    return;
  }

  // ── Step 5: Dry-run listing ────────────────────────────────────────

  if (!MODE_APPLY) {
    log(`${"─".repeat(70)}`);
    log(`  Products that would be updated:`);
    log(`${"─".repeat(70)}\n`);

    for (let i = 0; i < updates.length; i++) {
      const { product, newSpecs } = updates[i];
      const existingMeta = product.metadata || {};
      const actualNewSpecs = Object.keys(newSpecs).filter(
        (key) => !(key in existingMeta)
      );
      const shortTitle = product.title.length > 55
        ? product.title.slice(0, 55) + "..."
        : product.title;

      log(
        `  [${String(i + 1).padStart(3)}] ${shortTitle.padEnd(58)} ` +
        `+${actualNewSpecs.length} specs`
      );
    }

    log(`\n  Total: ${updates.length} product(s) to update`);
    log(`  Run with --apply to execute changes.\n`);

    await client.end();
    return;
  }

  // ── Step 6: Apply changes ──────────────────────────────────────────

  log(`  Creating backup table...\n`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS product_description_backup AS
    SELECT id, title, description, metadata FROM product WHERE deleted_at IS NULL;
  `);

  log(`  Backup table "product_description_backup" ready.\n`);

  let updatedCount = 0;
  let specsAddedCount = 0;

  for (const { product, descriptionUk, metaDescriptions, newSpecs } of updates) {
    const shortTitle = product.title.length > 50
      ? product.title.slice(0, 50) + "..."
      : product.title;

    log(`  Updating: ${shortTitle}`);

    // 1. Update main description (Ukrainian)
    await client.query(
      `UPDATE product SET description = $1, updated_at = NOW() WHERE id = $2`,
      [descriptionUk, product.id]
    );

    // 2. Add description_ru + short descriptions to metadata
    if (Object.keys(metaDescriptions).length > 0) {
      await client.query(
        `UPDATE product
         SET metadata = metadata || $1::jsonb, updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify(metaDescriptions), product.id]
      );
    }

    // 3. Enrich specs (only new ones — existing metadata takes precedence)
    const existingMeta = product.metadata || {};
    const actualNewSpecs = {};
    for (const [key, val] of Object.entries(newSpecs)) {
      if (!(key in existingMeta)) {
        actualNewSpecs[key] = val;
      }
    }

    if (Object.keys(actualNewSpecs).length > 0) {
      // Put new specs on the LEFT so existing metadata on the RIGHT wins conflicts
      await client.query(
        `UPDATE product
         SET metadata = $1::jsonb || metadata, updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify(actualNewSpecs), product.id]
      );
      specsAddedCount += Object.keys(actualNewSpecs).length;
      log(`    + ${Object.keys(actualNewSpecs).length} new spec(s)`);
    }

    updatedCount++;
  }

  // ── Summary ──────────────────────────────────────────────────────

  log(`\n${"=".repeat(70)}`);
  log(`  SUMMARY`);
  log(`${"=".repeat(70)}`);
  log(`  Products in database:        ${products.length}`);
  log(`  Rewritten descriptions:      ${rewrittenMap.size}`);
  log(`  Products updated:            ${updatedCount}`);
  log(`  New spec values added:       ${specsAddedCount}`);
  log(`  Backup table:                product_description_backup`);
  log(`  Mode:                        APPLIED`);
  log(`${"=".repeat(70)}\n`);

  // ── Verification ───────────────────────────────────────────────────

  const { rows: verifyRows } = await client.query(`
    SELECT COUNT(*) AS total
    FROM product
    WHERE deleted_at IS NULL
      AND description IS NOT NULL
      AND description <> ''
  `);

  log(`  Verification: ${verifyRows[0].total} product(s) now have non-empty descriptions.\n`);

  await client.end();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
