import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import path from "path"

/**
 * Website order automation subscriber.
 * When an order is placed on alko-technics.kiev.ua (not marketplace),
 * saves it to the ops/order-automation dashboard.db for processing
 * by the existing automation pipeline (stock check → NP TTN → B2B order).
 *
 * Also auto-imports the customer into Medusa if not exists.
 */

function getMoneyNum(amount: any): number {
  if (amount == null) return 0
  if (typeof amount === "number") return amount
  if (typeof amount === "string") return parseFloat(amount) || 0
  if (typeof amount === "object" && amount !== null) {
    const raw = amount.value ?? amount.numeric ?? String(amount)
    return parseFloat(String(raw)) || 0
  }
  return 0
}

export default async function orderWebsiteAutomationHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve("logger")

  try {
    const query = container.resolve("query")

    const { data: [order] } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "email",
        "currency_code",
        "total",
        "item_subtotal",
        "items.*",
        "items.variant.*",
        "items.variant.product.*",
        "shipping_address.*",
        "shipping_methods.*",
        "customer.*",
        "payment_collections.*",
        "payment_collections.payments.*",
        "metadata",
      ],
      filters: { id: data.id },
    })

    if (!order) {
      logger.warn(`[WebsiteAutomation] Order ${data.id} not found`)
      return
    }

    // Skip quick-orders (they have their own flow) — only process checkout orders
    const metadata = order.metadata as Record<string, any> | null
    if (metadata?.source === "quick-order") {
      logger.info(`[WebsiteAutomation] Skipping quick-order ${order.display_id}`)
      return
    }

    // ── 1. Save customer to Medusa (if marketplace-style, without account) ──
    const addr = order.shipping_address
    const customerPhone = (addr?.phone || order.customer?.phone || "").replace(/[+\s()-]/g, "")
    const firstName = addr?.first_name || order.customer?.first_name || ""
    const lastName = addr?.last_name || order.customer?.last_name || ""

    // ── 2. Save order to dashboard.db ──
    const dbPath = path.resolve(__dirname, "../../ops/order-automation/dashboard.db")

    let Database: any
    try {
      Database = require("better-sqlite3")
    } catch {
      logger.warn("[WebsiteAutomation] better-sqlite3 not available, skipping dashboard.db save")
      return
    }

    const db = new Database(dbPath)
    db.pragma("journal_mode = WAL")

    // Check if order already exists
    const existing = db.prepare("SELECT id FROM orders WHERE source = ? AND external_order_id = ?").get("website", String(order.display_id))
    if (existing) {
      logger.info(`[WebsiteAutomation] Order #${order.display_id} already in dashboard.db`)
      db.close()
      return
    }

    // Extract products
    const items = order.items || []
    const products = items.map((item: any) => ({
      sku: item.variant?.sku || (item.variant?.product?.metadata as any)?.alko_article || "",
      name: item.title || item.product_title || "",
      quantity: item.quantity || 1,
      price: String(getMoneyNum(item.unit_price)),
      totalPrice: String(getMoneyNum(item.unit_price) * (item.quantity || 1)),
    }))

    const totalPrice = getMoneyNum(order.item_subtotal) || getMoneyNum(order.total)

    // Determine payment type
    const paymentProviderId = (order as any).payment_collections?.[0]?.payments?.[0]?.provider_id || ""
    const isCOD = paymentProviderId.includes("cod") || paymentProviderId.includes("system_default")

    // Build delivery address from shipping_address + shipping_methods
    const shippingMethod = order.shipping_methods?.[0]
    const shippingData = (shippingMethod as any)?.data || {}
    const deliveryAddress = [
      shippingData.city_name || addr?.city || "",
      shippingData.warehouse_description || addr?.address_1 || "",
    ].filter(Boolean).join(", ")

    // NP city ref from shipping method data
    const npCityRef = shippingData.city_ref || ""

    // Insert into dashboard.db
    const insertResult = db.prepare(`
      INSERT INTO orders (
        source, external_order_id, status, date_created,
        client_name, client_phone, delivery_address,
        total_price, payment_status, needs_cod, cod_amount,
        products_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "website",
      String(order.display_id),
      "new",
      new Date().toISOString(),
      `${firstName} ${lastName}`.trim(),
      customerPhone,
      deliveryAddress,
      totalPrice,
      isCOD ? "pending" : "paid",
      isCOD ? 1 : 0,
      isCOD ? totalPrice : 0,
      JSON.stringify(products)
    )

    const dbId = Number(insertResult.lastInsertRowid)

    // Save NP city ref in metadata for later processing
    if (npCityRef) {
      db.prepare("UPDATE orders SET delivery_address = ? WHERE id = ?").run(
        `${deliveryAddress}|np_city_ref:${npCityRef}`,
        dbId
      )
    }

    // Log event
    db.prepare("INSERT INTO order_events (order_id, step, status, message) VALUES (?, ?, ?, ?)").run(
      dbId, "import", "success",
      `Website order #${order.display_id} imported. Email: ${order.email || "—"}, Payment: ${paymentProviderId}`
    )

    db.close()

    logger.info(
      `[WebsiteAutomation] Order #${order.display_id} saved to dashboard.db (id=${dbId}, ` +
      `${products.length} items, ${totalPrice} UAH, ${isCOD ? "COD" : "prepaid"})`
    )
  } catch (error) {
    logger.error(`[WebsiteAutomation] Error processing order ${data.id}: ${error}`)
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
