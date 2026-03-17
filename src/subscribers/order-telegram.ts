import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

/**
 * Telegram notification subscriber for new orders.
 * Sends a formatted message to the store owner when an order is placed.
 */

const TELEGRAM_API = "https://api.telegram.org"

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
  // Medusa v2 query.graph returns BigNumber objects for monetary fields
  // They can be: number, string, { value: string }, or BigNumber with numeric property
  let num: number
  if (typeof amount === "number") {
    num = amount
  } else if (typeof amount === "string") {
    num = parseFloat(amount)
  } else if (typeof amount === "object" && amount !== null) {
    // BigNumber object — try .value, .numeric, or toString
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

export default async function orderTelegramHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve("logger")
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!botToken) {
    logger.warn(
      "TELEGRAM_BOT_TOKEN is not set — skipping Telegram notification"
    )
    return
  }

  if (!chatId) {
    logger.warn(
      "TELEGRAM_CHAT_ID is not set — skipping Telegram notification"
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

    // Build the message
    const lines: string[] = []

    lines.push(`<b>🛒 Нове замовлення #${order.display_id || order.id}</b>`)
    lines.push("")

    // Customer info
    lines.push("<b>👤 Клієнт:</b>")
    const customerName = order.customer
      ? escapeHtml(
          [order.customer.first_name, order.customer.last_name]
            .filter(Boolean)
            .join(" ")
        )
      : null
    const shippingName = order.shipping_address
      ? escapeHtml(
          [order.shipping_address.first_name, order.shipping_address.last_name]
            .filter(Boolean)
            .join(" ")
        )
      : null
    const displayName = customerName || shippingName || "—"
    lines.push(`Ім'я: ${displayName}`)
    if (order.email) {
      lines.push(`Email: ${escapeHtml(order.email)}`)
    }
    if (order.shipping_address?.phone) {
      lines.push(`Тел: ${escapeHtml(order.shipping_address.phone)}`)
    } else if (order.customer?.phone) {
      lines.push(`Тел: ${escapeHtml(order.customer.phone)}`)
    }
    lines.push("")

    // Order items
    lines.push("<b>📦 Товари:</b>")
    if (order.items && order.items.length > 0) {
      for (const item of order.items) {
        if (!item) continue
        const title = escapeHtml(item.title || item.product_title || "—")
        const variantTitle = item.variant_title
          ? ` (${escapeHtml(item.variant_title)})`
          : ""
        const qty = item.quantity || 1
        const price = formatMoney(item.unit_price)
        const curr = (
          order.currency_code || "UAH"
        ).toUpperCase()
        lines.push(
          `  • ${title}${variantTitle} × ${qty} — ${price} ${curr}`
        )
      }
    } else {
      lines.push("  (немає даних)")
    }
    lines.push("")

    // Totals — customer pays only for items; shipping is paid separately at Nova Poshta
    const currency = (order.currency_code || "UAH").toUpperCase()
    lines.push("<b>💰 Підсумок:</b>")
    lines.push(
      `<b>До сплати (товари): ${formatMoney(order.item_subtotal)} ${currency}</b>`
    )
    if (order.discount_total) {
      lines.push(`Знижка: -${formatMoney(order.discount_total)} ${currency}`)
    }
    if (order.shipping_subtotal || order.shipping_total) {
      lines.push(`Доставка (орієнтовна, оплачується окремо): ~${formatMoney(order.shipping_subtotal || order.shipping_total)} ${currency}`)
    }
    lines.push("")

    // Shipping address
    if (order.shipping_address) {
      const addr = order.shipping_address
      lines.push("<b>🚚 Адреса доставки:</b>")
      const addrParts = [
        addr.address_1,
        addr.address_2,
        addr.city,
        addr.province,
        addr.postal_code,
        addr.country_code?.toUpperCase(),
      ]
        .filter(Boolean)
        .map(escapeHtml)
      if (addrParts.length > 0) {
        lines.push(addrParts.join(", "))
      }
      if (addr.company) {
        lines.push(`Компанія: ${escapeHtml(addr.company)}`)
      }
      lines.push("")
    }

    // Payment method
    if (
      order.payment_collections &&
      order.payment_collections.length > 0
    ) {
      lines.push("<b>💳 Оплата:</b>")
      for (const pc of order.payment_collections) {
        if (!pc) continue
        if (pc.payments && pc.payments.length > 0) {
          for (const payment of pc.payments) {
            if (!payment) continue
            const provider = escapeHtml(
              payment.provider_id || "невідомий"
            )
            lines.push(`Провайдер: ${provider}`)
          }
        } else {
          const status = escapeHtml(pc.status || "невідомо")
          lines.push(`Статус: ${status}`)
        }
      }
      lines.push("")
    }

    // Shipping method
    if (order.shipping_methods && order.shipping_methods.length > 0) {
      lines.push("<b>📮 Спосіб доставки:</b>")
      for (const sm of order.shipping_methods) {
        if (!sm) continue
        lines.push(escapeHtml(sm.name || sm.shipping_option_id || "—"))
      }
      lines.push("")
    }

    const message = lines.join("\n")

    await sendTelegramMessage(botToken, chatId, message)

    logger.info(
      `Telegram notification sent for order ${order.display_id || order.id}`
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
