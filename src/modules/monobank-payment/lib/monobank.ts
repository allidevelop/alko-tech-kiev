import crypto from "crypto"

const MONO_API_URL = "https://api.monobank.ua"

function getToken(): string {
  return process.env.MONOBANK_TOKEN ?? ""
}

export function isConfigured(): boolean {
  return !!getToken()
}

export type MonoInvoiceStatus =
  | "created"
  | "processing"
  | "hold"
  | "success"
  | "failure"
  | "reversed"
  | "expired"

export interface MonoBasketItem {
  name: string
  qty: number
  sum: number // kopiyky
  unit: string
}

export interface CreateInvoiceParams {
  amount: number // kopiyky
  orderId: string
  orderDescription?: string
  basketItems?: MonoBasketItem[]
  redirectUrl: string
  webHookUrl: string
}

export interface CreateInvoiceResult {
  invoiceId: string
  pageUrl: string
}

export interface WebhookBody {
  invoiceId: string
  status: MonoInvoiceStatus
  failureReason?: string
  amount: number
  ccy: number
  finalAmount: number
  createdDate: string
  modifiedDate: string
  reference?: string
}

export interface InvoiceStatusResult {
  status: MonoInvoiceStatus
  failureReason?: string
  amount: number
  ccy: number
  finalAmount?: number
}

export async function createInvoice(
  params: CreateInvoiceParams
): Promise<CreateInvoiceResult> {
  const token = getToken()
  if (!token) {
    throw new Error("MONOBANK_TOKEN is not configured")
  }

  const body: Record<string, unknown> = {
    amount: params.amount,
    ccy: 980,
    redirectUrl: params.redirectUrl,
    webHookUrl: params.webHookUrl,
    merchantPaymInfo: {
      reference: params.orderId,
      destination:
        params.orderDescription ??
        `Замовлення #${params.orderId.slice(0, 8).toUpperCase()}`,
      basketOrder: params.basketItems ?? [],
    },
    validity: 3600,
    paymentType: "debit",
  }

  const response = await fetch(`${MONO_API_URL}/api/merchant/invoice/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Token": token,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => "")
    console.error(
      `[Monobank] Invoice create failed: HTTP ${response.status}`,
      text
    )
    throw new Error(`Monobank API error: ${response.status}`)
  }

  const data = (await response.json()) as { invoiceId: string; pageUrl: string }
  return {
    invoiceId: data.invoiceId,
    pageUrl: data.pageUrl,
  }
}

export async function getInvoiceStatus(
  invoiceId: string
): Promise<InvoiceStatusResult> {
  const token = getToken()
  if (!token) throw new Error("MONOBANK_TOKEN is not configured")

  const response = await fetch(
    `${MONO_API_URL}/api/merchant/invoice/status?invoiceId=${encodeURIComponent(invoiceId)}`,
    {
      method: "GET",
      headers: { "X-Token": token },
    }
  )

  if (!response.ok)
    throw new Error(`Monobank status check failed: ${response.status}`)
  return (await response.json()) as InvoiceStatusResult
}

let cachedPubKey: string | null = null

async function getPublicKey(): Promise<string> {
  if (cachedPubKey) return cachedPubKey

  const token = getToken()
  if (!token) throw new Error("MONOBANK_TOKEN not configured")

  const response = await fetch(`${MONO_API_URL}/api/merchant/pubkey`, {
    method: "GET",
    headers: { "X-Token": token },
  })

  if (!response.ok)
    throw new Error(
      `Failed to fetch Monobank public key: ${response.status}`
    )

  const data = (await response.json()) as { key: string }
  cachedPubKey = data.key
  return cachedPubKey
}

export async function verifyWebhookSignature(
  bodyString: string,
  xSignBase64: string
): Promise<boolean> {
  try {
    const pubKeyBase64 = await getPublicKey()
    const publicKeyPem = Buffer.from(pubKeyBase64, "base64").toString("utf-8")
    const signatureBuf = Buffer.from(xSignBase64, "base64")

    const verify = crypto.createVerify("SHA256")
    verify.write(bodyString)
    verify.end()

    return verify.verify(publicKeyPem, signatureBuf)
  } catch (error) {
    console.error("[Monobank] Signature verification failed:", error)
    return false
  }
}
