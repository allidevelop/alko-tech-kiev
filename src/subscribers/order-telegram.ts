import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

/**
 * Telegram notification subscriber for new orders.
 * Sends a formatted message to the store owner when an order is placed.
 */

const TELEGRAM_API = "https://api.telegram.org"
const FREE_SHIPPING_THRESHOLD = 2000

async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string
): Promise<void> {
  const url = `${TELEGRAM_API}/bot${botToken}/sendMessage`

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(
      `Telegram API error ${response.status}: ${errorBody}`
    )
  }
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

function escapeHtml(text: string | null | undefined): string {
  if (!text) return ""
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function getPaymentLabel(providerId: string): string {
  const map: Record<string, string> = {
    pp_system_default: "Системний (за замовчуванням)",
    pp_cod_cod: "Накладений платіж (оплата при отриманні)",
    pp_monobank_monobank: "Monobank (оплата картою)",
    pp_liqpay_liqpay: "LiqPay (Visa/Mastercard)",
    "pp_monobank-installments_monobank-installments": "Monobank (оплата частинами)",
  }
  return map[providerId] || providerId
}

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

export default async function orderTelegramHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve("logger")
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!botToken || !chatId) {
    logger.warn(
      "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set — skipping notification"
    )
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
        "currency_code",
        "total",
        "subtotal",
        "item_subtotal",
        "shipping_subtotal",
        "shipping_total",
        "tax_total",
        "discount_total",
        "items.*",
        "items.variant.*",
        "items.variant.product.*",
        "shipping_address.*",
        "billing_address.*",
        "shipping_methods.*",
        "customer.*",
        "payment_collections.*",
        "payment_collections.payments.*",
      ],
      filters: { id: data.id },
    })

    if (!order) {
      logger.warn(`Order ${data.id} not found for Telegram notification`)
      return
    }

    const currency = (order.currency_code || "UAH").toUpperCase()
    const itemTotal = getMoneyNum(order.item_subtotal)
    const isFreeShipping = itemTotal >= FREE_SHIPPING_THRESHOLD

    // ── Build message ──
    const lines: string[] = []

    // Header
    lines.push(`🛒 <b>Замовлення #${order.display_id || order.id}</b>`)
    lines.push("")

    // Customer
    const customerName = order.customer
      ? [order.customer.first_name, order.customer.last_name].filter(Boolean).join(" ")
      : null
    const shippingName = order.shipping_address
      ? [order.shipping_address.first_name, order.shipping_address.last_name].filter(Boolean).join(" ")
      : null
    const displayName = escapeHtml(customerName || shippingName || "—")
    const phone = order.shipping_address?.phone || order.customer?.phone || ""

    lines.push(`👤 <b>${displayName}</b>`)
    if (phone) lines.push(`📱 ${escapeHtml(phone)}`)
    if (order.email) lines.push(`✉️ ${escapeHtml(order.email)}`)
    lines.push("")

    // Items
    lines.push("📦 <b>Товари:</b>")
    if (order.items && order.items.length > 0) {
      for (const item of order.items) {
        if (!item) continue
        const title = escapeHtml(item.title || item.product_title || "—")
        const variantTitle = item.variant_title
          ? ` (${escapeHtml(item.variant_title)})`
          : ""
        const qty = item.quantity || 1
        const lineTotal = getMoneyNum(item.unit_price) * qty
        lines.push(
          `  ${title}${variantTitle}`)
        lines.push(
          `  ${qty} шт × ${formatMoney(item.unit_price)} = <b>${formatMoney(lineTotal)} ${currency}</b>`
        )
      }
    }
    lines.push("")

    // Totals
    lines.push("💰 <b>Підсумок:</b>")
    lines.push(`Товари: ${formatMoney(order.item_subtotal)} ${currency}`)

    if (order.discount_total && getMoneyNum(order.discount_total) > 0) {
      lines.push(`Знижка: -${formatMoney(order.discount_total)} ${currency}`)
    }

    if (isFreeShipping) {
      lines.push(`🎁 Доставка: <b>БЕЗКОШТОВНО</b> (замовлення від ${formatMoney(FREE_SHIPPING_THRESHOLD)} ${currency})`)
    } else {
      lines.push(`Доставка: за тарифами НП (оплачується окремо)`)
    }

    const total = getMoneyNum(order.total) || itemTotal
    lines.push(`<b>💵 До сплати: ${formatMoney(total)} ${currency}</b>`)
    lines.push("")

    // Shipping
    if (order.shipping_address) {
      const addr = order.shipping_address
      lines.push("🚚 <b>Доставка:</b>")

      // Shipping method name
      if (order.shipping_methods && order.shipping_methods.length > 0) {
        for (const sm of order.shipping_methods) {
          if (sm?.name) lines.push(escapeHtml(sm.name))
        }
      }

      const addrParts = [addr.address_1, addr.address_2, addr.city, addr.province]
        .filter(Boolean)
        .map(escapeHtml)
      if (addrParts.length > 0) {
        lines.push(addrParts.join(", "))
      }
      lines.push("")
    }

    // Payment
    if (order.payment_collections && order.payment_collections.length > 0) {
      lines.push("💳 <b>Оплата:</b>")
      for (const pc of order.payment_collections) {
        if (!pc) continue
        if (pc.payments && pc.payments.length > 0) {
          for (const payment of pc.payments) {
            if (!payment) continue
            lines.push(getPaymentLabel(payment.provider_id || ""))
          }
        }
      }
      lines.push("")
    }

    // Metadata (quick order source, etc.)
    const metadata = order.metadata as Record<string, any> | null
    if (metadata?.source === "quick-order") {
      lines.push("⚡ <i>Швидке замовлення</i>")
    }

    const message = lines.join("\n")

    await sendTelegramMessage(botToken, chatId, message)

    logger.info(
      `Telegram notification sent for order #${order.display_id || order.id}`
    )
  } catch (error) {
    logger.error(
      `Failed to send Telegram notification for order ${data.id}: ${error}`
    )
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
