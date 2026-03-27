import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { orderConfirmationTemplate } from "../modules/resend-notification/templates/order-confirmation"

/**
 * Email notification subscriber for new orders.
 * Sends an order confirmation email to the customer via Resend.
 * Runs in parallel with Telegram notification — failure does NOT block the order.
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

function formatMoney(amount: any): string {
  if (amount == null) return "0"
  let num: number
  if (typeof amount === "number") {
    num = amount
  } else if (typeof amount === "string") {
    num = parseFloat(amount)
  } else if (typeof amount === "object" && amount !== null) {
    const raw = amount.value ?? amount.numeric ?? String(amount)
    num = parseFloat(String(raw))
  } else {
    num = 0
  }
  if (isNaN(num)) return "0"
  return num.toLocaleString("uk-UA")
}

export default async function orderConfirmationEmailHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve("logger")

  if (!process.env.RESEND_API_KEY) {
    logger.warn("[Email] RESEND_API_KEY not configured, skipping order confirmation email")
    return
  }

  try {
    const query = container.resolve("query")
    const resendService = container.resolve("resend_notification") as any

    const { data: [order] } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "email",
        "total",
        "item_subtotal",
        "currency_code",
        "items.*",
        "shipping_address.*",
        "shipping_methods.*",
        "customer.*",
        "payment_collections.*",
        "payment_collections.payments.*",
      ],
      filters: { id: data.id },
    })

    if (!order) {
      logger.warn(`[Email] Order ${data.id} not found, skipping`)
      return
    }

    if (!order.email) {
      logger.warn(`[Email] Order ${data.id} has no email, skipping`)
      return
    }

    const customerName = [
      order.shipping_address?.first_name,
      order.shipping_address?.last_name,
    ]
      .filter(Boolean)
      .join(" ") || order.customer?.first_name || "Клієнт"

    const items = (order.items || []).map((item: any) => ({
      title: item.title || item.product_title || "Товар",
      quantity: item.quantity || 1,
      price: `${formatMoney(item.unit_price)} ₴`,
    }))

    const itemTotal = getMoneyNum(order.item_subtotal)
    const total = `${formatMoney(order.item_subtotal)} ₴`
    const isFreeShipping = itemTotal >= 2000

    const shippingAddress = [
      order.shipping_address?.city,
      order.shipping_address?.address_1,
    ]
      .filter(Boolean)
      .join(", ") || "Уточнюється"

    const shippingMethod = (order as any).shipping_methods?.[0]?.name || undefined

    const paymentProviderMap: Record<string, string> = {
      pp_system_default: "За замовчуванням",
      pp_cod_cod: "Оплата при отриманні (накладений платіж)",
      pp_monobank_monobank: "Monobank (оплата картою)",
      pp_liqpay_liqpay: "LiqPay (Visa/Mastercard)",
    }
    const paymentProviderId = (order as any).payment_collections?.[0]?.payments?.[0]?.provider_id
    const paymentMethod = paymentProviderId ? (paymentProviderMap[paymentProviderId] || paymentProviderId) : undefined

    const { subject, html } = orderConfirmationTemplate({
      orderNumber: String(order.display_id || order.id),
      customerName,
      items,
      total,
      shippingAddress,
      shippingMethod,
      isFreeShipping,
      paymentMethod,
      storeName: "Alko-Technics",
    })

    await resendService.sendEmail({ to: order.email, subject, html })

    logger.info(
      `[Email] Order confirmation sent to ${order.email} for order #${order.display_id}`
    )
  } catch (error) {
    logger.error(`[Email] Failed to send order confirmation for order ${data.id}: ${error}`)
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
