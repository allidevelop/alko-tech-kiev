import crypto from "crypto"

function getApiUrl(): string {
  const isSandbox = process.env.MONOBANK_CHAST_SANDBOX === "true"
  return isSandbox
    ? "https://u2-demo-ext.mono.st4g3.com"
    : "https://u2.monobank.com.ua"
}

function getStoreId(): string {
  return process.env.MONOBANK_CHAST_STORE_ID ?? ""
}

function getStoreSecret(): string {
  return process.env.MONOBANK_CHAST_STORE_SECRET ?? ""
}

export function isConfigured(): boolean {
  return !!getStoreId() && !!getStoreSecret()
}

function signBody(body: string): string {
  const secret = getStoreSecret()
  const hmac = crypto.createHmac("sha256", secret)
  hmac.update(body)
  return hmac.digest("base64")
}

export type InstallmentOrderState =
  | "created"
  | "approved"
  | "confirmed"
  | "rejected"
  | "expired"

export interface InstallmentProduct {
  name: string
  count: number
  sum: number // kopiyky
}

export interface CreateInstallmentOrderParams {
  store_order_id: string
  client_phone?: string
  products: InstallmentProduct[]
  amount: number // kopiyky
}

export interface CreateInstallmentOrderResult {
  order_id: string
  state: InstallmentOrderState
}

export interface OrderStateResult {
  order_id: string
  state: InstallmentOrderState
  store_order_id?: string
  amount?: number
  message?: string
}

async function apiRequest<T>(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const storeId = getStoreId()
  if (!storeId) {
    throw new Error("MONOBANK_CHAST_STORE_ID is not configured")
  }

  const url = `${getApiUrl()}${path}`
  const headers: Record<string, string> = {
    "store-id": storeId,
    "Content-Type": "application/json",
  }

  let bodyString: string | undefined
  if (body) {
    bodyString = JSON.stringify(body)
    headers["signature"] = signBody(bodyString)
  }

  const response = await fetch(url, {
    method,
    headers,
    body: bodyString,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => "")
    console.error(
      `[MonobankInstallments] API ${method} ${path} failed: HTTP ${response.status}`,
      text
    )
    throw new Error(`Monobank Installments API error: ${response.status}`)
  }

  return (await response.json()) as T
}

/**
 * Create an installment order via monobank "Покупка частинами" API.
 *
 * API docs: https://u2.monobank.com.ua/v3/api-docs
 * Required fields: store_order_id, client_phone, total_sum,
 *   invoice { number, date, source }, available_programs, products
 */
export async function createOrder(
  params: CreateInstallmentOrderParams
): Promise<CreateInstallmentOrderResult> {
  const today = new Date().toISOString().split("T")[0]

  // Ensure phone starts with +380
  let phone = params.client_phone || ""
  if (phone && !phone.startsWith("+")) {
    phone = "+" + phone
  }

  const body: Record<string, unknown> = {
    store_order_id: params.store_order_id || `ALKO-${Date.now()}`,
    total_sum: params.amount,
    products: params.products,
    available_programs: [
      { type: "payment_count", available_parts_count: [3, 6, 9, 12] },
    ],
    invoice: {
      number: params.store_order_id || `ALKO-${Date.now()}`,
      date: today,
      source: "INTERNET",
    },
    result_callback:
      process.env.MONOBANK_CHAST_WEBHOOK_URL ||
      `${process.env.BACKEND_URL || "https://alko-technics.kiev.ua"}/hooks/payment/monobank-installments_monobank-installments`,
  }

  if (phone) {
    body.client_phone = phone
  }

  return apiRequest<CreateInstallmentOrderResult>(
    "POST",
    "/api/order/create",
    body
  )
}

export async function getOrderState(
  orderId: string
): Promise<OrderStateResult> {
  return apiRequest<OrderStateResult>("POST", "/api/order/state", {
    order_id: orderId,
  })
}

export async function confirmOrder(orderId: string): Promise<void> {
  await apiRequest("POST", "/api/order/confirm", { order_id: orderId })
}

export async function rejectOrder(orderId: string): Promise<void> {
  await apiRequest("POST", "/api/order/reject", { order_id: orderId })
}

export function verifyWebhookSignature(
  body: string,
  signature: string
): boolean {
  try {
    const expected = signBody(body)
    return crypto.timingSafeEqual(
      Buffer.from(expected, "base64"),
      Buffer.from(signature, "base64")
    )
  } catch (error) {
    console.error(
      "[MonobankInstallments] Signature verification failed:",
      error
    )
    return false
  }
}
