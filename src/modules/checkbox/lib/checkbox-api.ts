/**
 * Checkbox API client — fiscal receipt service (ПРРО)
 * https://wiki.checkbox.ua/uk/api
 */

const API_URL =
  process.env.CHECKBOX_API_URL || "https://api.checkbox.ua/api/v1"
const LICENSE_KEY = () => process.env.CHECKBOX_LICENSE_KEY || ""
const PIN_CODE = () => process.env.CHECKBOX_PIN_CODE || ""

// Token cache (Checkbox tokens live 24h, we refresh every 20h)
let cachedToken: string | null = null
let tokenExpiresAt = 0
const TOKEN_TTL_MS = 20 * 60 * 60 * 1000

// ─── HTTP helper ───────────────────────────────────────────────

async function checkboxFetch<T = any>(
  path: string,
  method: "GET" | "POST",
  body?: unknown,
  requireAuth = true
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-License-Key": LICENSE_KEY(),
  }

  if (requireAuth) {
    headers["Authorization"] = `Bearer ${await getAuthToken()}`
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  // On 401 — reset token and retry once
  if (res.status === 401 && requireAuth) {
    cachedToken = null
    tokenExpiresAt = 0
    headers["Authorization"] = `Bearer ${await getAuthToken()}`

    const retry = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!retry.ok) {
      const err = await retry.text()
      throw new Error(`Checkbox ${method} ${path} ${retry.status}: ${err}`)
    }
    return retry.json()
  }

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Checkbox ${method} ${path} ${res.status}: ${err}`)
  }

  // Some endpoints return empty body (e.g. 202)
  const text = await res.text()
  return text ? JSON.parse(text) : ({} as T)
}

// ─── Authentication ────────────────────────────────────────────

export async function getAuthToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken
  }

  const data = await checkboxFetch<{ access_token: string }>(
    "/cashier/signinPinCode",
    "POST",
    { pin_code: PIN_CODE() },
    false
  )

  cachedToken = data.access_token
  tokenExpiresAt = Date.now() + TOKEN_TTL_MS
  return cachedToken
}

// ─── Shifts ────────────────────────────────────────────────────

export async function getCurrentShift(): Promise<{
  id: string
  status: string
} | null> {
  try {
    const shift = await checkboxFetch<{ id: string; status: string }>(
      "/cashier/shift",
      "GET"
    )
    return shift?.id ? shift : null
  } catch {
    return null
  }
}

export async function openShift(): Promise<{ id: string; status: string }> {
  return checkboxFetch("/shifts", "POST", {})
}

export async function closeShift(): Promise<void> {
  await checkboxFetch("/shifts/close", "POST", {})
}

// ─── Receipts ──────────────────────────────────────────────────

export interface CheckboxGood {
  good: {
    code: string
    name: string
    price: number // kopecks (1 UAH = 100)
  }
  quantity: number // thousandths (1 unit = 1000)
}

export interface CheckboxPayment {
  type: "CARD" | "CASH"
  value: number // kopecks
}

export async function createReceipt(
  goods: CheckboxGood[],
  payments: CheckboxPayment[]
): Promise<{ id: string; serial: number; fiscal_code: string }> {
  return checkboxFetch("/receipts/sell", "POST", { goods, payments })
}

// ─── Email ─────────────────────────────────────────────────────

export async function sendReceiptEmail(
  receiptId: string,
  emails: string[]
): Promise<void> {
  await checkboxFetch(`/receipts/${receiptId}/email`, "POST", emails)
}
