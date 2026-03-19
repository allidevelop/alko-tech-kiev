#!/usr/bin/env node
/**
 * Updates product metadata (spec_ fields) from AL-KO XML feed
 * without full reimport. Matches products by alko_article.
 *
 * Usage: node src/scripts/update-metadata-from-xml.mjs
 */

import pg from "pg"
import { XMLParser } from "fast-xml-parser"

const DB_URL =
  process.env.DATABASE_URL ||
  "postgres://medusa_alko:medusa_alko_2026@localhost:5432/medusa_alko"
const XML_URL =
  process.env.ALKO_XML_URL ||
  "https://apipim.al-ko.ua/storage/xml_files/PriceList.xml"

// Same SPEC_KEY_MAP as import-alko.ts (extended)
const SPEC_KEY_MAP = {
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
  "Кількість в упаковці, шт": "spec_pack_qty",
  "Кількість вантажних місць": "spec_cargo_places",
  "Код УКТ ЗЕД": "spec_ukt_zed",
  "Ставка ПДВ": "spec_vat_rate",
  "Матеріал": "spec_material",
  "Матеріал корпусу": "spec_body_material",
  "Гарантія": "spec_warranty",
  "Колір": "spec_color",
  "Конструкція": "spec_construction",
  "Живлення": "spec_power_source",
  "Джерело живлення": "spec_power_source_type",
  "Тип переміщення": "spec_movement_type",
  "Продуктивність": "spec_productivity",
  "Робоча ширина": "spec_working_width",
  "Комплектація": "spec_equipment",
  "Потужність двигуна, Вт": "spec_power_watts",
  "Потужність двигуна, кВт": "spec_power_kw",
  "Тип акумулятора": "spec_battery_type",
  "Напруга акумулятора, В": "spec_battery_voltage",
  "Довжина шини, мм": "spec_bar_length",
  "Крок ланцюга, дюйм": "spec_chain_pitch",
  "Об'єм двигуна, см³": "spec_engine_displacement",
  "Сумісність": "spec_compatibility",
  "Застосування": "spec_application",
  "Глибина занурення": "spec_immersion_depth",
  "Висота подачі": "spec_delivery_height",
  "Діаметр колес": "spec_wheel_diameter",
  "Травозбірник": "spec_grass_collector",
  "Ріжуча система": "spec_cutting_system",
  // Newly added
  "Тип запуску": "spec_start_type",
  "Висота зрізу": "spec_cutting_height",
  "Кількість рівнів висоти зрізу": "spec_cutting_levels",
  "Потужність, к.с.": "spec_power_hp",
  "Потужність, кВт": "spec_power_kw",
  "Об'єм травозбірника, л": "spec_grass_catcher_volume",
  "Об'єм двигуна": "spec_engine_volume",
  "Об'єм баку": "spec_tank_volume",
  "Діаметр": "spec_diameter",
  "Діаметр вихідного отвору": "spec_outlet_diameter",
  "Діаметр вхідного отвору": "spec_inlet_diameter",
  "Сумісна модель": "spec_compatible_model",
  "Сумісний бренд": "spec_compatible_brand",
  "Тип установки": "spec_installation_type",
  "Довжина": "spec_length",
  "Розміщення двигуна в пилі": "spec_engine_position",
  "Об'єм циліндру": "spec_cylinder_volume",
  "Робочий тиск": "spec_working_pressure",
  "Потужність": "spec_power",
  "Максимальний розмір частинок": "spec_max_particle_size",
  "Довжина кабелю, м": "spec_cable_length",
  "Кількість ланок ланцюга, шт": "spec_chain_links",
  "Макс. число обертів, об/хв": "spec_max_rpm",
  "Тиск": "spec_pressure",
  "Розміри": "spec_dimensions",
}

const SKIP_PARAMS = new Set([
  "Ширина упаковки, см",
  "Довжина упаковки, см",
  "Висота упаковки, см",
  "Вага, кг",
  "Штрихкод",
  "Вага в упаковці",
  "Посилання на life style фото",
  "Посилання на відео",
  "Посилання на фото",
  "Посилання на  фото",
  "Посилання на додаткові фото",
])

async function main() {
  console.log("Fetching XML feed...")
  const res = await fetch(XML_URL)
  const xml = await res.text()

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "_",
    processEntities: true,
    htmlEntities: true,
  })
  const data = parser.parse(xml)
  const offers = data.yml_catalog.shop.offers.offer
  console.log(`Parsed ${offers.length} offers`)

  // Build map: article → spec metadata
  const xmlSpecs = new Map()
  for (const offer of offers) {
    const article = String(offer.article || offer._id || "").trim()
    if (!article) continue

    let params = offer.param || []
    if (!Array.isArray(params)) params = [params]

    const specs = {}
    for (const p of params) {
      const name = typeof p === "object" ? p._name || "" : ""
      const value = typeof p === "object" ? (p["#text"] != null ? String(p["#text"]) : "") : String(p)
      if (!name || !value || SKIP_PARAMS.has(name)) continue

      const specKey = SPEC_KEY_MAP[name]
      if (specKey) {
        specs[specKey] = value
      }
    }

    if (Object.keys(specs).length > 0) {
      xmlSpecs.set(article, specs)
    }
  }

  console.log(`${xmlSpecs.size} offers have spec data`)

  // Connect to DB
  const client = new pg.Client(DB_URL)
  await client.connect()

  // Get all products
  const { rows: products } = await client.query(
    "SELECT id, metadata FROM product WHERE metadata IS NOT NULL"
  )
  console.log(`${products.length} products in DB`)

  let updated = 0
  let alreadyOk = 0
  let noMatch = 0
  let newSpecs = 0

  for (const product of products) {
    const meta = product.metadata || {}
    const article = meta.alko_article || meta.alko_xml_id
    if (!article) continue

    const xmlData = xmlSpecs.get(String(article))
    if (!xmlData) {
      noMatch++
      continue
    }

    // Merge: add missing spec_ keys, don't overwrite existing ones
    let changed = false
    const newMeta = { ...meta }

    for (const [key, value] of Object.entries(xmlData)) {
      if (!newMeta[key] || newMeta[key] !== value) {
        if (!newMeta[key]) newSpecs++
        newMeta[key] = value
        changed = true
      }
    }

    if (changed) {
      await client.query("UPDATE product SET metadata = $1 WHERE id = $2", [
        JSON.stringify(newMeta),
        product.id,
      ])
      updated++
    } else {
      alreadyOk++
    }
  }

  await client.end()

  console.log(`\nResults:`)
  console.log(`  Updated: ${updated} products`)
  console.log(`  Already OK: ${alreadyOk}`)
  console.log(`  No XML match: ${noMatch}`)
  console.log(`  New spec fields added: ${newSpecs}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
