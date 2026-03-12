# Monobank Acquiring Payment Module — Full Implementation Guide

## Overview

This module integrates **Monobank Acquiring** (Ukrainian bank, one of the most popular payment processors) for online card payments. The flow is:

1. Customer places an order and selects "Card payment"
2. Backend creates a **payment invoice** via Monobank API
3. Customer is **redirected** to Monobank's hosted payment page
4. After payment, customer is redirected back to the success page
5. Monobank sends a **webhook** to our server with the payment result
6. Webhook handler updates the order status

This is a **redirect-based** payment flow (similar to Stripe Checkout Sessions). No card data touches our server.

---

## Architecture Diagram

```
Customer clicks "Place Order"
         │
         ▼
[POST /api/checkout]
   │
   ├── 1. Create order in DB (status: "pending_payment")
   │
   ├── 2. Call Monobank API: POST /api/merchant/invoice/create
   │      → receives { invoiceId, pageUrl }
   │
   ├── 3. Save invoiceId to order
   │
   └── 4. Return { paymentUrl: pageUrl } to frontend
              │
              ▼
[Frontend redirects: window.location.href = paymentUrl]
              │
              ▼
[Monobank hosted payment page]
   │
   ├── Customer pays with card
   │
   ├── Monobank redirects to: /checkout/success?orderId=xxx
   │
   └── Monobank sends webhook: POST /api/monobank/webhook
              │
              ▼
[POST /api/monobank/webhook]
   │
   ├── 1. Verify ECDSA signature (x-sign header)
   │
   ├── 2. Find order by monoInvoiceId
   │
   ├── 3. Update order status: "paid" / "payment_failed" / "refunded"
   │
   └── 4. Send notifications (Telegram, email)
```

---

## Environment Variables

```env
MONOBANK_TOKEN=your_merchant_token_here
NEXT_PUBLIC_SERVER_URL=https://your-domain.com
```

**How to get the token:**
1. Register at https://fop.monobank.ua/ (for individual entrepreneurs) or https://monobank.ua/acquiring (for businesses)
2. Go to Merchant settings
3. Copy the API token (X-Token)

**Important:** Monobank Acquiring is available only for Ukrainian businesses (FOP or legal entities). You need a registered business with Monobank.

---

## Layer 1: Server-Side API Client (`src/lib/monobank.ts`)

### Monobank API Basics

- **Base URL**: `https://api.monobank.ua`
- **Authentication**: `X-Token` header with merchant token
- **Currency**: Always in **kopiyky** (1 UAH = 100 kopiyky). So 150.50 UAH = 15050
- **Currency code**: 980 (ISO 4217 for UAH)

### Types

```typescript
import crypto from 'crypto'

const MONO_API_URL = 'https://api.monobank.ua'

function getToken(): string {
  return process.env.MONOBANK_TOKEN ?? ''
}

export type MonoInvoiceStatus =
  | 'created'     // Invoice created, not paid yet
  | 'processing'  // Payment is being processed
  | 'hold'        // Money is held (preauth)
  | 'success'     // Payment successful
  | 'failure'     // Payment failed
  | 'reversed'    // Payment reversed/refunded
  | 'expired'     // Invoice expired (not paid within validity period)

export interface MonoBasketItem {
  name: string   // Product name (max 100 chars)
  qty: number    // Quantity
  sum: number    // Line total in kopiyky (price * qty * 100)
  unit: string   // Unit of measure, e.g. "шт." (pieces)
}

export interface CreateInvoiceParams {
  amount: number              // Total in kopiyky (UAH * 100)
  orderId: string             // Your internal order ID
  orderDescription?: string   // Shown on payment page
  basketItems?: MonoBasketItem[]  // Line items (shown on payment page)
  redirectUrl: string         // Where to redirect after payment
  webHookUrl: string          // Where Monobank sends payment status
}

export interface CreateInvoiceResult {
  invoiceId: string   // Monobank's invoice ID
  pageUrl: string     // URL of the payment page — redirect customer here
}

export interface WebhookBody {
  invoiceId: string
  status: MonoInvoiceStatus
  failureReason?: string
  amount: number          // Original amount in kopiyky
  ccy: number             // Currency code (980 = UAH)
  finalAmount: number     // Final charged amount in kopiyky
  createdDate: string     // ISO datetime
  modifiedDate: string    // ISO datetime
  reference?: string      // Your orderId (from merchantPaymInfo.reference)
  cancelList?: Array<{    // Present if there were cancellations/refunds
    status: string
    amount: number
    ccy: number
    createdDate: string
    modifiedDate: string
    approvalCode?: string
    rrn?: string
    extRef?: string
  }>
}
```

### Creating an Invoice

This is the main payment initiation call. Creates a payment invoice and returns a URL to redirect the customer to.

```typescript
export async function createInvoice(params: CreateInvoiceParams): Promise<CreateInvoiceResult> {
  const token = getToken()
  if (!token) {
    throw new Error('MONOBANK_TOKEN is not configured')
  }

  const body: Record<string, unknown> = {
    amount: params.amount,     // KOPIYKY! 150.50 UAH = 15050
    ccy: 980,                  // UAH currency code
    redirectUrl: params.redirectUrl,
    webHookUrl: params.webHookUrl,
    merchantPaymInfo: {
      reference: params.orderId,       // Your order ID — returned in webhook
      destination: params.orderDescription ?? `Order #${params.orderId.slice(0, 8).toUpperCase()}`,
      basketOrder: params.basketItems ?? [],  // Line items displayed on payment page
    },
    validity: 3600,     // Invoice valid for 1 hour (seconds)
    paymentType: 'debit',  // Regular payment (not preauth/hold)
  }

  const response = await fetch(`${MONO_API_URL}/api/merchant/invoice/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Token': token,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    console.error(`[Monobank] Invoice create failed: HTTP ${response.status}`, text)
    throw new Error(`Monobank API error: ${response.status}`)
  }

  const data = (await response.json()) as { invoiceId: string; pageUrl: string }
  return {
    invoiceId: data.invoiceId,
    pageUrl: data.pageUrl,   // <-- Redirect customer to this URL
  }
}
```

**Monobank API endpoint:** `POST https://api.monobank.ua/api/merchant/invoice/create`

**Full request example:**
```json
{
  "amount": 1499900,
  "ccy": 980,
  "redirectUrl": "https://your-site.com/checkout/success?orderId=abc123",
  "webHookUrl": "https://your-site.com/api/monobank/webhook",
  "merchantPaymInfo": {
    "reference": "abc123-def456-...",
    "destination": "Order #ABC123DE — My Shop",
    "basketOrder": [
      { "name": "Lawn Mower AL-KO 42.1", "qty": 1, "sum": 1499900, "unit": "шт." }
    ]
  },
  "validity": 3600,
  "paymentType": "debit"
}
```

**Response:**
```json
{
  "invoiceId": "p2_9ZgpZVhj6i...",
  "pageUrl": "https://pay.mbnk.biz/p2_9ZgpZVhj6i..."
}
```

### Checking Invoice Status (optional)

```typescript
export async function getInvoiceStatus(invoiceId: string): Promise<InvoiceStatusResult> {
  const token = getToken()
  if (!token) throw new Error('MONOBANK_TOKEN is not configured')

  const response = await fetch(
    `${MONO_API_URL}/api/merchant/invoice/status?invoiceId=${encodeURIComponent(invoiceId)}`,
    {
      method: 'GET',
      headers: { 'X-Token': token },
    },
  )

  if (!response.ok) throw new Error(`Monobank status check failed: ${response.status}`)
  return (await response.json()) as InvoiceStatusResult
}
```

### Webhook Signature Verification

Monobank signs webhook requests with ECDSA (SHA256). The signature is in the `x-sign` header (base64-encoded). The public key is fetched from Monobank's API.

```typescript
let cachedPubKey: string | null = null

async function getPublicKey(): Promise<string> {
  if (cachedPubKey) return cachedPubKey

  const token = getToken()
  if (!token) throw new Error('MONOBANK_TOKEN not configured')

  const response = await fetch(`${MONO_API_URL}/api/merchant/pubkey`, {
    method: 'GET',
    headers: { 'X-Token': token },
  })

  if (!response.ok) throw new Error(`Failed to fetch Monobank public key: ${response.status}`)

  const data = (await response.json()) as { key: string }
  cachedPubKey = data.key  // Cache it — the key rarely changes
  return cachedPubKey
}

export async function verifyWebhookSignature(
  bodyString: string,
  xSignBase64: string,
): Promise<boolean> {
  try {
    const pubKeyBase64 = await getPublicKey()
    // The public key is base64-encoded PEM
    const publicKeyPem = Buffer.from(pubKeyBase64, 'base64').toString('utf-8')

    const signatureBuf = Buffer.from(xSignBase64, 'base64')

    const verify = crypto.createVerify('SHA256')
    verify.write(bodyString)
    verify.end()

    return verify.verify(publicKeyPem, signatureBuf)
  } catch (error) {
    console.error('[Monobank] Signature verification failed:', error)
    return false
  }
}
```

**CRITICAL**: You MUST verify the webhook signature. Without it, anyone could fake a "payment successful" webhook and get goods for free.

**How verification works:**
1. Read the raw request body as string (do NOT parse JSON first)
2. Get the `x-sign` header value (base64-encoded ECDSA signature)
3. Fetch Monobank's public key from `GET /api/merchant/pubkey` (cache it)
4. Decode the public key from base64 to PEM format
5. Use Node.js `crypto.createVerify('SHA256')` to verify

---

## Layer 2: Checkout Integration (`/api/checkout`)

The checkout API route handles the Monobank payment flow. Here's the relevant section:

```typescript
export async function POST(request: NextRequest): Promise<NextResponse> {
  // ... validate body, create order ...

  const isCardPayment = body.payment.method === 'card'
  const monoAvailable = isCardPayment && isMonobankConfigured()

  // ... create order in DB with status "pending_payment" ...

  const orderId = String(order.id)

  if (monoAvailable) {
    try {
      const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:4444'

      // Build basket items for the payment page display
      const basketItems: MonoBasketItem[] = body.items.map((item) => ({
        name: item.title.slice(0, 100),  // Max 100 chars
        qty: item.quantity,
        sum: Math.round(item.price * item.quantity * 100), // KOPIYKY per line
        unit: 'шт.',
      }))

      // Create Monobank invoice
      const invoice = await createInvoice({
        amount: Math.round(body.total * 100),  // Total in KOPIYKY
        orderId,
        orderDescription: `Order #${orderId.slice(0, 8).toUpperCase()} — My Shop`,
        basketItems,
        redirectUrl: `${serverUrl}/checkout/success?orderId=${orderId}`,
        webHookUrl: `${serverUrl}/api/monobank/webhook`,
      })

      // Save Monobank invoiceId to the order for webhook matching
      await db.updateOrder(orderId, {
        monoInvoiceId: invoice.invoiceId,
        monoStatus: 'created',
      })

      // Return payment URL to frontend
      return NextResponse.json({
        success: true,
        orderId,
        paymentUrl: invoice.pageUrl,  // <-- Frontend redirects here
      }, { status: 201 })

    } catch (monoError) {
      console.error('Monobank invoice creation failed:', monoError)

      // FALLBACK: Order exists but payment init failed
      // Update to "processing" (manual handling) instead of deleting
      await db.updateOrder(orderId, {
        status: 'processing',
        monoStatus: 'init_failed',
      })

      return NextResponse.json({
        success: true,
        orderId,
        message: 'Order created. Online payment temporarily unavailable.',
      }, { status: 201 })
    }
  }

  // ... COD payment handling ...
}
```

### Frontend redirect

When the checkout API returns `paymentUrl`, the frontend does:

```typescript
const result = await response.json()

if (result.paymentUrl) {
  // Monobank: redirect to hosted payment page
  window.location.href = result.paymentUrl
  return
}

// COD: go to success page
router.push(`/checkout/success?orderId=${result.orderId}`)
```

---

## Layer 3: Webhook Handler (`/api/monobank/webhook`)

This is called by Monobank's servers after payment processing. The webhook may fire:
- Immediately after successful payment
- After payment failure
- After timeout/expiry
- After refund

**IMPORTANT**: The webhook URL must be publicly accessible (not localhost). For development, use ngrok or similar.

```typescript
import { NextResponse, type NextRequest } from 'next/server'
import { verifyWebhookSignature, isConfigured, type WebhookBody, type MonoInvoiceStatus } from '@/lib/monobank'

// Map Monobank status to your order statuses
function mapStatus(monoStatus: MonoInvoiceStatus): string {
  switch (monoStatus) {
    case 'success':
      return 'paid'
    case 'failure':
    case 'expired':
      return 'payment_failed'
    case 'reversed':
      return 'refunded'
    case 'processing':
    case 'hold':
    case 'created':
    default:
      return 'processing'
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isConfigured()) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }

  // STEP 1: Read raw body and signature header
  const xSign = request.headers.get('x-sign') ?? ''
  const bodyString = await request.text()  // RAW string, not parsed JSON!

  // STEP 2: Verify ECDSA signature
  const isValid = await verifyWebhookSignature(bodyString, xSign)
  if (!isValid) {
    console.error('[Monobank Webhook] Invalid signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // STEP 3: Parse body (only after signature is verified)
  let body: WebhookBody
  try {
    body = JSON.parse(bodyString) as WebhookBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { invoiceId, status, reference } = body
  console.log(`[Monobank Webhook] invoiceId=${invoiceId} status=${status} ref=${reference}`)

  // STEP 4: Find and update order
  try {
    // Find order by the monoInvoiceId we saved earlier
    const order = await db.findOrder({ monoInvoiceId: invoiceId })

    if (!order) {
      console.error(`Order not found for invoiceId=${invoiceId}`)
      return NextResponse.json({ ok: true })  // Return 200 anyway!
    }

    const newStatus = mapStatus(status)

    // Update order status
    await db.updateOrder(order.id, {
      status: newStatus,
      monoStatus: status,
      ...(body.failureReason ? { monoFailureReason: body.failureReason } : {}),
    })

    // STEP 5: Post-payment actions
    if (status === 'success') {
      // Send notification (Telegram, email, etc.)
      await sendPaymentNotification(order.id, body.finalAmount / 100)

      // Send payment confirmation email to customer
      if (order.customerEmail) {
        await sendPaymentConfirmationEmail(order.id, order.customerEmail, body.finalAmount / 100)
      }
    }
  } catch (error) {
    console.error('[Monobank Webhook] Error:', error)
  }

  // ALWAYS return 200 so Monobank doesn't retry indefinitely
  return NextResponse.json({ ok: true })
}
```

**CRITICAL RULES:**
1. **Always return HTTP 200** — even if order not found or processing fails. Otherwise Monobank will retry the webhook.
2. **Verify signature BEFORE parsing body** — read body as raw string first.
3. **Find order by `monoInvoiceId`** — the `invoiceId` from the webhook matches what you saved during invoice creation.
4. **Handle all statuses** — not just success. Payment can fail, expire, or be reversed.
5. **Webhook may fire multiple times** — make your handler idempotent.

---

## Database Schema (Order fields for Monobank)

You need these additional fields on your order:

```
monoInvoiceId: string (nullable)     — Monobank invoice ID, used to match webhooks
monoStatus: string (nullable)         — Raw Monobank status (created/processing/success/failure/etc.)
monoFailureReason: string (nullable)  — Reason for failure (if any)
paymentMethod: string                 — "card" / "cod" / etc.
status: string                        — Your order status (pending_payment/paid/payment_failed/refunded/etc.)
```

---

## Complete Payment Flow Summary

### Happy Path (successful payment):

```
1. Customer fills checkout form, clicks "Place Order"
2. Frontend POST /api/checkout with items + delivery + payment: { method: "card" }
3. Backend creates order (status: "pending_payment")
4. Backend calls Monobank createInvoice → gets { invoiceId, pageUrl }
5. Backend saves monoInvoiceId to order
6. Backend returns { paymentUrl: pageUrl } to frontend
7. Frontend does: window.location.href = paymentUrl
8. Customer sees Monobank payment page, enters card details
9. Payment succeeds
10. Monobank redirects customer to: /checkout/success?orderId=xxx
11. Monobank sends webhook to: POST /api/monobank/webhook
12. Webhook handler verifies signature
13. Webhook handler finds order by monoInvoiceId
14. Webhook handler updates order status to "paid"
15. Webhook handler sends notifications
```

### Error handling:

```
- Monobank API unavailable → Order created as "processing", manual handling
- Payment fails → Webhook fires with status "failure", order → "payment_failed"
- Payment expires → Webhook fires with status "expired", order → "payment_failed"
- Customer cancels → Webhook fires with status "failure"
- Signature invalid → Return 400, don't update order
- Order not found → Log error, return 200 (don't cause retries)
```

---

## Testing

### Development testing
1. Monobank provides a **test token** in their merchant dashboard
2. With test token, all payments are simulated (no real money charged)
3. You still get real webhooks with test tokens
4. Use ngrok to expose your local webhook endpoint: `ngrok http 4444`
5. Set `NEXT_PUBLIC_SERVER_URL` to your ngrok URL for webhook URL

### Verifying the integration
1. Create a test order with card payment
2. Check that you're redirected to Monobank payment page
3. Complete the test payment
4. Verify redirect back to success page
5. Check your server logs for webhook receipt
6. Verify order status updated to "paid" in database

---

## Adaptation Notes for Medusa.js v2

> Based on official Medusa v2 documentation: https://docs.medusajs.com/

### What to reuse as-is
1. **`monobank.ts` library** — Pure TypeScript with only `crypto` dependency (Node.js built-in). Copy it into your Medusa project as-is.
2. **Signature verification logic** — ECDSA verification is the same everywhere.
3. **Types** (`MonoInvoiceStatus`, `WebhookBody`, `CreateInvoiceParams`, etc.) — all portable.

---

### Medusa v2 Payment Module Architecture

In Medusa v2, payment providers are implemented as **Payment Module Providers**. You extend `AbstractPaymentProvider` from `@medusajs/framework/utils`.

**File structure in your Medusa project:**
```
src/
  modules/
    monobank-payment/
      index.ts              ← Module registration
      service.ts            ← Provider class (extends AbstractPaymentProvider)
      lib/
        monobank.ts         ← Copy from our project (API client, signature verification)
```

---

### Step 1: Payment Provider Service (`service.ts`)

```typescript
import {
  AbstractPaymentProvider,
  PaymentActions,
  PaymentSessionStatus,
} from "@medusajs/framework/utils"
import type {
  CreatePaymentProviderSession,
  UpdatePaymentProviderSession,
  ProviderWebhookPayload,
  WebhookActionResult,
  PaymentProviderError,
  PaymentProviderSessionResponse,
} from "@medusajs/framework/types"
import {
  createInvoice,
  getInvoiceStatus,
  verifyWebhookSignature,
  type MonoInvoiceStatus,
} from "./lib/monobank"

type MonoSessionData = {
  invoiceId: string
  pageUrl: string
  monoStatus: string
}

class MonobankPaymentProviderService extends AbstractPaymentProvider<{}> {
  static identifier = "monobank"

  // ─── 1. Create payment session ───
  // Called when customer selects Monobank at checkout.
  // Creates a Monobank invoice and returns the redirect URL in session data.
  async initiatePayment(
    input: CreatePaymentProviderSession
  ): Promise<PaymentProviderSessionResponse> {
    const { amount, currency_code, context } = input

    // Monobank only supports UAH. amount is already in smallest unit (kopiyky) in Medusa.
    const invoice = await createInvoice({
      amount,   // Medusa already sends amount in smallest currency unit
      orderId: context.session_id as string,
      orderDescription: `Order — ${context.session_id}`,
      redirectUrl: `${process.env.STORE_URL}/checkout/success`,
      webHookUrl: `${process.env.MEDUSA_BACKEND_URL}/hooks/payment/monobank_monobank`,
      // Webhook URL format: /hooks/payment/{identifier}_{provider}
    })

    return {
      data: {
        invoiceId: invoice.invoiceId,
        pageUrl: invoice.pageUrl,   // Frontend reads this and redirects
        monoStatus: "created",
      } as MonoSessionData,
    }
  }

  // ─── 2. Authorize payment ───
  // Called after customer returns from Monobank payment page.
  // For redirect-based flows, check if Monobank has already confirmed.
  async authorizePayment(
    paymentSessionData: Record<string, unknown>
  ): Promise<
    PaymentProviderError | { status: PaymentSessionStatus; data: Record<string, unknown> }
  > {
    const data = paymentSessionData as unknown as MonoSessionData

    // Check current status with Monobank
    try {
      const statusResult = await getInvoiceStatus(data.invoiceId)
      const newData = { ...data, monoStatus: statusResult.status }

      if (statusResult.status === "success") {
        return { status: PaymentSessionStatus.AUTHORIZED, data: newData }
      }
      if (statusResult.status === "failure" || statusResult.status === "expired") {
        return { status: PaymentSessionStatus.ERROR, data: newData }
      }
      // Still processing
      return { status: PaymentSessionStatus.PENDING, data: newData }
    } catch (error) {
      return {
        error: (error as Error).message,
        code: "MONOBANK_STATUS_CHECK_FAILED",
        detail: "Failed to check payment status with Monobank",
      }
    }
  }

  // ─── 3. Capture payment ───
  // Monobank with paymentType="debit" captures automatically.
  // This is a no-op — just confirm it's captured.
  async capturePayment(
    paymentSessionData: Record<string, unknown>
  ): Promise<PaymentProviderError | PaymentProviderSessionResponse["data"]> {
    return paymentSessionData
  }

  // ─── 4. Refund payment ───
  // Monobank supports refunds via a separate API call.
  // You can implement this later if needed.
  async refundPayment(
    paymentSessionData: Record<string, unknown>,
    refundAmount: number
  ): Promise<PaymentProviderError | PaymentProviderSessionResponse["data"]> {
    // TODO: Implement Monobank refund API call
    // POST /api/merchant/invoice/cancel with { invoiceId, amount }
    return paymentSessionData
  }

  // ─── 5. Cancel payment ───
  async cancelPayment(
    paymentSessionData: Record<string, unknown>
  ): Promise<PaymentProviderError | PaymentProviderSessionResponse["data"]> {
    return paymentSessionData
  }

  // ─── 6. Delete payment ───
  async deletePayment(
    paymentSessionData: Record<string, unknown>
  ): Promise<PaymentProviderError | PaymentProviderSessionResponse["data"]> {
    return paymentSessionData
  }

  // ─── 7. Get payment status ───
  async getPaymentStatus(
    paymentSessionData: Record<string, unknown>
  ): Promise<PaymentSessionStatus> {
    const data = paymentSessionData as unknown as MonoSessionData

    switch (data.monoStatus) {
      case "success":
        return PaymentSessionStatus.AUTHORIZED
      case "failure":
      case "expired":
        return PaymentSessionStatus.ERROR
      case "reversed":
        return PaymentSessionStatus.CANCELED
      case "processing":
      case "hold":
        return PaymentSessionStatus.PENDING
      default:
        return PaymentSessionStatus.PENDING
    }
  }

  // ─── 8. Retrieve payment ───
  async retrievePayment(
    paymentSessionData: Record<string, unknown>
  ): Promise<PaymentProviderError | PaymentProviderSessionResponse["data"]> {
    return paymentSessionData
  }

  // ─── 9. Update payment ───
  async updatePayment(
    input: UpdatePaymentProviderSession
  ): Promise<PaymentProviderError | PaymentProviderSessionResponse> {
    // If amount changed, we'd need to create a new invoice.
    // For simplicity, return existing data.
    return { data: input.data }
  }

  // ─── 10. Webhook handler ───
  // Medusa has a BUILT-IN webhook route at:
  //   POST /hooks/payment/{identifier}_{provider}
  //   e.g. POST /hooks/payment/monobank_monobank
  //
  // Medusa calls this method to determine what action to take.
  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    const { data, rawData, headers } = payload

    // Verify ECDSA signature
    const xSign = headers["x-sign"] as string ?? ""
    const bodyString = typeof rawData === "string" ? rawData : JSON.stringify(rawData)

    const isValid = await verifyWebhookSignature(bodyString, xSign)
    if (!isValid) {
      return { action: PaymentActions.NOT_SUPPORTED }
    }

    const webhookData = (typeof data === "string" ? JSON.parse(data) : data) as {
      invoiceId: string
      status: MonoInvoiceStatus
      reference?: string
      finalAmount?: number
    }

    // Map Monobank status to Medusa webhook action
    switch (webhookData.status) {
      case "success":
        // PaymentActions.AUTHORIZED tells Medusa the payment is confirmed.
        // Medusa will then proceed with order completion.
        return {
          action: PaymentActions.AUTHORIZED,
          data: {
            session_id: webhookData.reference,  // Your orderId / session reference
            amount: webhookData.finalAmount,
          },
        }
      case "failure":
      case "expired":
        return {
          action: PaymentActions.FAILED,
          data: {
            session_id: webhookData.reference,
            amount: webhookData.finalAmount,
          },
        }
      default:
        // processing, hold, created — Medusa doesn't need to act yet
        return { action: PaymentActions.NOT_SUPPORTED }
    }
  }
}

export default MonobankPaymentProviderService
```

---

### Step 2: Module Registration (`index.ts`)

```typescript
import MonobankPaymentProviderService from "./service"
import { ModuleProvider, Modules } from "@medusajs/framework/utils"

export default ModuleProvider(Modules.PAYMENT, {
  services: [MonobankPaymentProviderService],
})
```

---

### Step 3: Register in `medusa-config.ts`

```typescript
// medusa-config.ts
module.exports = defineConfig({
  // ...
  modules: [
    {
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [
          {
            resolve: "./src/modules/monobank-payment",
            id: "monobank",
            options: {
              // Any config options you want to pass to the provider
            },
          },
        ],
      },
    },
  ],
})
```

---

### Step 4: Medusa Payment Flow (how it works end-to-end)

Medusa v2 has a 5-step payment flow:

```
1. Create Payment Collection (for the cart)
      POST /store/payment-collections
      { cart_id: "cart_xxx" }

2. List available providers
      The storefront shows Monobank as an option

3. Create Payment Session (calls your initiatePayment)
      POST /store/payment-collections/:id/payment-sessions
      { provider_id: "pp_monobank_monobank" }
      → returns session with data.pageUrl

4. Frontend redirects to data.pageUrl (Monobank payment page)

5. After payment:
   - Monobank redirects customer back to your storefront
   - Monobank sends webhook to /hooks/payment/monobank_monobank
   - Your getWebhookActionAndData returns PaymentActions.AUTHORIZED
   - Medusa automatically updates the payment session and order status
```

**Frontend redirect example (Next.js storefront):**
```typescript
// After creating payment session:
const session = paymentCollection.payment_sessions[0]
const monoData = session.data as { pageUrl: string }

if (monoData.pageUrl) {
  window.location.href = monoData.pageUrl
}
```

---

### Key Differences from Our Next.js Implementation

| Aspect | Our Next.js | Medusa v2 |
|--------|-------------|-----------|
| Invoice creation | Called in `/api/checkout` route | Called in `initiatePayment()` method |
| Webhook endpoint | Custom route `/api/monobank/webhook` | Built-in `/hooks/payment/monobank_monobank` |
| Webhook handling | Parse body, update order directly | Return `PaymentActions.AUTHORIZED` — Medusa handles the rest |
| Order status | Updated directly in DB | Medusa's state machine manages transitions |
| Invoice ID storage | Saved to order field `monoInvoiceId` | Stored in `payment_session.data.invoiceId` |
| Refunds | Not implemented | Implement `refundPayment()` method |

### Currency Notes
- Monobank works only with UAH (ISO 980)
- All amounts in **kopiyky** (multiply UAH by 100)
- Medusa v2 stores amounts in smallest currency unit by default — this maps naturally
- Make sure your Medusa store's currency is set to `uah`
