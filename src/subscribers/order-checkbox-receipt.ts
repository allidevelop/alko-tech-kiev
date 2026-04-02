import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

/**
 * Fiscal receipt subscriber — creates a Checkbox receipt after order is placed.
 * Skips COD (наложенний платіж) orders.
 */

function toNumber(amount: any): number {
  if (amount == null) return 0
  if (typeof amount === "number") return amount
  if (typeof amount === "string") return parseFloat(amount) || 0
  if (typeof amount === "object") {
    const raw = amount.value ?? amount.numeric ?? String(amount)
    return parseFloat(String(raw)) || 0
  }
  return 0
}

export default async function orderCheckboxReceiptHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve("logger")

  if (!process.env.CHECKBOX_LICENSE_KEY || !process.env.CHECKBOX_PIN_CODE) {
    return
  }

  try {
    const query = container.resolve("query")

    const {
      data: [order],
    } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "email",
        "total",
        "item_subtotal",
        "items.*",
        "items.variant.*",
        "payment_collections.*",
        "payment_collections.payments.*",
      ],
      filters: { id: data.id },
    })

    if (!order) {
      logger.warn(`[Checkbox] Order ${data.id} not found`)
      return
    }

    // Determine payment provider
    let paymentProviderId = ""
    for (const pc of order.payment_collections || []) {
      if (!pc) continue
      for (const p of pc.payments || []) {
        if (p?.provider_id) {
          paymentProviderId = p.provider_id
          break
        }
      }
      if (paymentProviderId) break
    }

    // Skip IBAN transfers only (per accountant: all payments except IBAN are fiscalized)
    if (paymentProviderId.includes("iban") || paymentProviderId.includes("bank_transfer")) {
      logger.info(
        `[Checkbox] Order #${order.display_id} is IBAN transfer — skipping fiscal receipt`
      )
      return
    }

    const checkboxService = container.resolve("checkbox") as any

    // Determine payment type for fiscal receipt
    const isCOD = paymentProviderId.includes("cod") || paymentProviderId.includes("system_default")
    const paymentType = isCOD ? "CASH" : "CARD"

    const result = await checkboxService.createOrderReceipt({
      items: (order.items || []).map((item: any) => ({
        title: item.title || item.product_title || "Товар",
        variant_sku: item.variant?.sku,
        product_id: item.product_id,
        quantity: item.quantity || 1,
        unit_price: toNumber(item.unit_price),
      })),
      payment_type: paymentType,
      payment_provider_id: paymentProviderId,
      total: toNumber(order.item_subtotal),
      email: order.email || "",
    })

    if (result) {
      logger.info(
        `[Checkbox] Fiscal receipt ${result.receiptId} created for order #${order.display_id}`
      )
    }
  } catch (error) {
    // Fiscal error must NOT block the order
    logger.error(
      `[Checkbox] Failed to create fiscal receipt for order ${data.id}: ${error}`
    )
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
