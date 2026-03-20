# Medusa v2 — Payment Module Provider Reference
Source: https://docs.medusajs.com/resources/references/payment/provider

## Overview
Custom Payment Provider extends `AbstractPaymentProvider` from `@medusajs/framework/utils`.
Provider handles third-party payment processing, Payment Module manages Medusa-specific concepts.

## Directory Structure
- **Medusa app**: `src/modules/my-payment/`
- **Plugin**: `src/providers/my-payment/`

## Service Implementation (`service.ts`)

```typescript
import { AbstractPaymentProvider } from "@medusajs/framework/utils"

type Options = {
  apiKey: string
}

class MyPaymentProviderService extends AbstractPaymentProvider<Options> {
  static identifier = "my-payment"
  protected options_: Options

  constructor(container, options: Options) {
    super(container, options)
    this.options_ = options
  }
}

export default MyPaymentProviderService
```

## Required Methods

### initiatePayment
```typescript
async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
  const { amount, currency_code, context } = input
  const response = await this.client.init(amount, currency_code, context)
  return { id: response.id, data: response }
}
```

### authorizePayment
```typescript
async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
  const externalId = input.data?.id
  const paymentData = await this.client.authorizePayment(externalId)
  return { data: paymentData, status: "authorized" }
}
```

### capturePayment
```typescript
async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> {
  const externalId = input.data?.id
  const newData = await this.client.capturePayment(externalId)
  return { data: { ...newData, id: externalId } }
}
```

### refundPayment
```typescript
async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
  const externalId = input.data?.id
  await this.client.refund(externalId, input.amount)
  return { data: input.data }
}
```

### cancelPayment
```typescript
async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
  const externalId = input.data?.id
  const paymentData = await this.client.cancelPayment(externalId)
  return { data: paymentData }
}
```

## Optional Methods

### deletePayment
```typescript
async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput>
```

### getPaymentStatus
```typescript
async getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput>
// Return status: "authorized" | "captured" | "canceled" | "pending"
```

### retrievePayment
```typescript
async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput>
```

### updatePayment
```typescript
async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput>
```

### getWebhookActionAndData (v2.5.0+)
```typescript
async getWebhookActionAndData(
  payload: ProviderWebhookPayload["payload"]
): Promise<WebhookActionResult> {
  const { data, rawData, headers } = payload
  // Return action: "authorized" | "captured" | "not_supported" | "failed"
  // + data: { session_id, amount: BigNumber }
}
```

## Module Provider Definition (`index.ts`)

```typescript
import MyPaymentProviderService from "./service"
import { ModuleProvider, Modules } from "@medusajs/framework/utils"

export default ModuleProvider(Modules.PAYMENT, {
  services: [MyPaymentProviderService],
})
```

## Registration in `medusa-config.ts`

```typescript
module.exports = defineConfig({
  modules: [
    {
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [
          {
            resolve: "./src/modules/my-payment",
            id: "my-payment",
            options: { apiKey: "your-api-key" }
          }
        ]
      }
    }
  ]
})
```

## Key Notes
- **data property**: Store provider-specific IDs, NOT sensitive data (it's publicly accessible)
- **Error handling**: Throw errors on failure, Medusa handles error management
- **Identifier**: `static identifier` → Payment IDs follow `pp_{identifier}_{id}` pattern
- **Webhook path**: Built-in at `/hooks/payment/{provider_id}_{identifier}`
