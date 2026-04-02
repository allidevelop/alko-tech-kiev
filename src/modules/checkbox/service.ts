import {
  getAuthToken,
  getCurrentShift,
  openShift,
  createReceipt,
  sendReceiptEmail,
  type CheckboxGood,
  type CheckboxPayment,
} from "./lib/checkbox-api"

type InjectedDependencies = {
  logger: any
}

class CheckboxModuleService {
  protected logger_: any

  constructor({ logger }: InjectedDependencies) {
    this.logger_ = logger
  }

  /**
   * Ensure a shift is open. If not — open one.
   */
  async ensureShiftOpen(): Promise<void> {
    const shift = await getCurrentShift()

    if (shift && shift.status === "OPENED") {
      this.logger_.debug("[Checkbox] Shift already open: " + shift.id)
      return
    }

    try {
      const newShift = await openShift()
      this.logger_.info("[Checkbox] Shift opened: " + newShift.id)
    } catch (error: any) {
      // "shift already opened" is not a real error
      if (
        error?.message?.includes("already") ||
        error?.message?.includes("OPENED")
      ) {
        this.logger_.debug("[Checkbox] Shift was already open")
        return
      }
      throw error
    }
  }

  /**
   * Create a fiscal receipt for an order and send it to the customer's email.
   */
  async createOrderReceipt(order: {
    items: Array<{
      title: string
      variant_sku?: string
      product_id?: string
      quantity: number
      unit_price: number // UAH
    }>
    payment_type?: "CASH" | "CARD"
    payment_provider_id: string
    total: number // UAH
    email: string
  }): Promise<{ receiptId: string } | null> {
    // Skip IBAN transfers only (per accountant: all payments except IBAN are fiscalized)
    if (order.payment_provider_id.includes("iban") || order.payment_provider_id.includes("bank_transfer")) {
      this.logger_.info("[Checkbox] IBAN transfer — skipping fiscal receipt")
      return null
    }

    // Ensure shift is open
    await this.ensureShiftOpen()

    // Convert items → Checkbox goods
    const goods: CheckboxGood[] = order.items.map((item) => ({
      good: {
        code: item.variant_sku || item.product_id || "ITEM",
        name: (item.title || "Товар").slice(0, 256),
        price: Math.round(item.unit_price * 100), // UAH → kopecks
      },
      quantity: Math.round(item.quantity * 1000), // units → thousandths
    }))

    // All payments are CARD (bezgotivkoviy) — COD money comes through NP, not cash register
    const payType: "CASH" | "CARD" = "CARD"
    const payments: CheckboxPayment[] = [
      {
        type: payType,
        value: Math.round(order.total * 100), // UAH → kopecks
      },
    ]

    const result = await createReceipt(goods, payments)

    this.logger_.info(
      `[Checkbox] Receipt created: ${result.id} (fiscal: ${result.fiscal_code})`
    )

    // Send to customer email
    if (order.email) {
      try {
        await sendReceiptEmail(result.id, [order.email])
        this.logger_.info(
          `[Checkbox] Receipt ${result.id} sent to ${order.email}`
        )
      } catch (emailErr) {
        this.logger_.warn(
          `[Checkbox] Failed to email receipt: ${emailErr}`
        )
      }
    }

    return { receiptId: result.id }
  }
}

export default CheckboxModuleService
