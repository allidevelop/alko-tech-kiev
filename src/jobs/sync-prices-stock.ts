import { MedusaContainer } from "@medusajs/framework/types"

const XML_URL =
  process.env.ALKO_XML_URL ||
  "https://apipim.al-ko.ua/storage/xml_files/PriceList.xml"

/**
 * Syncs product prices and stock from AL-KO XML feed every 4 hours.
 */
export default async function syncPricesStockJob(
  container: MedusaContainer
) {
  const logger = container.resolve("logger") as any
  const query = container.resolve("query") as any
  const productService = container.resolve("product") as any
  const inventoryService = container.resolve("inventory") as any
  const pricingService = container.resolve("pricing") as any

  logger.info("[Sync] Starting price/stock sync from XML feed...")

  try {
    // 1. Fetch and parse XML
    const { XMLParser } = require("fast-xml-parser")
    const res = await fetch(XML_URL)
    if (!res.ok) throw new Error(`XML fetch failed: ${res.status}`)
    const xml = await res.text()

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "_",
      processEntities: true,
      htmlEntities: true,
    })
    const data = parser.parse(xml)
    const offers = data.yml_catalog?.shop?.offers?.offer || []
    logger.info(`[Sync] Parsed ${offers.length} offers from XML`)

    // 2. Build a map: article → { price, stock, available }
    const xmlMap = new Map<
      string,
      { price: number; stock: number; available: boolean }
    >()
    for (const offer of offers) {
      const article = String(offer.article || offer._id || "").trim()
      if (!article) continue
      xmlMap.set(article, {
        price: parseFloat(String(offer.price || 0)),
        stock: parseInt(String(offer.stock_quantity || 0), 10),
        available: offer._available === "yes",
      })
    }

    // 3. Get all products with their variants, prices, and inventory
    const { data: products } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "metadata",
        "variants.id",
        "variants.sku",
        "variants.manage_inventory",
        "variants.prices.id",
        "variants.prices.amount",
        "variants.prices.currency_code",
        "variants.inventory_items.inventory_item_id",
        "variants.inventory_items.inventory.location_levels.id",
        "variants.inventory_items.inventory.location_levels.stocked_quantity",
      ],
      pagination: { take: 1000 },
    })

    let priceUpdated = 0
    let stockUpdated = 0
    let notFound = 0

    for (const product of products) {
      const article =
        (product.metadata as any)?.alko_article ||
        (product.metadata as any)?.alko_xml_id
      if (!article) continue

      const xmlData = xmlMap.get(String(article))
      if (!xmlData) {
        notFound++
        continue
      }

      const variant = product.variants?.[0]
      if (!variant) continue

      // 4. Update price if changed
      const currentPrice = variant.prices?.find(
        (p: any) => p.currency_code === "uah"
      )
      const newPriceAmount = Math.round(xmlData.price * 100) // UAH → cents

      if (currentPrice && currentPrice.amount !== newPriceAmount) {
        try {
          await pricingService.updatePriceSets(currentPrice.id, {
            amount: newPriceAmount,
          })
          priceUpdated++
        } catch {
          // Fallback: try direct price update
          try {
            await productService.updateVariants(variant.id, {
              prices: [
                {
                  id: currentPrice.id,
                  amount: newPriceAmount,
                  currency_code: "uah",
                },
              ],
            })
            priceUpdated++
          } catch (e: any) {
            logger.warn(
              `[Sync] Price update failed for ${article}: ${e.message}`
            )
          }
        }
      }

      // 5. Update stock if changed
      if (variant.manage_inventory) {
        const invItem = variant.inventory_items?.[0]
        const locationLevel =
          invItem?.inventory?.location_levels?.[0]
        if (locationLevel && locationLevel.stocked_quantity !== xmlData.stock) {
          try {
            await inventoryService.updateInventoryLevels(locationLevel.id, {
              stocked_quantity: xmlData.stock,
            })
            stockUpdated++
          } catch (e: any) {
            logger.warn(
              `[Sync] Stock update failed for ${article}: ${e.message}`
            )
          }
        }
      }
    }

    // Flush Redis cache if anything changed
    if (priceUpdated > 0 || stockUpdated > 0) {
      try {
        const { createClient } = require("redis")
        const redis = createClient({ url: process.env.REDIS_URL || "redis://localhost:6379" })
        await redis.connect()
        await redis.flushAll()
        await redis.quit()
        logger.info("[Sync] Redis cache flushed after updates")
      } catch (e: any) {
        logger.warn(`[Sync] Redis flush failed: ${e.message}`)
      }
    }

    logger.info(
      `[Sync] Done. Prices updated: ${priceUpdated}, Stock updated: ${stockUpdated}, Not in XML: ${notFound}`
    )
  } catch (error) {
    logger.error(`[Sync] Failed: ${error}`)
  }
}

export const config = {
  name: "sync-prices-stock",
  // Every 4 hours
  schedule: "0 */4 * * *",
}
