# LiqPay Payment Module — Полная документация для Medusa v2

Source: https://www.liqpay.ua/uk/doc + Official Node.js SDK (github.com/liqpay/sdk-nodejs)

## Обзор

LiqPay — платіжна система ПриватБанку. Redirect-based flow: генеруємо data+signature → redirect на LiqPay checkout → callback/webhook.

## API Ключі (в .env)
```
LIQPAY_PUBLIC_KEY=i50678962979
LIQPAY_PRIVATE_KEY=koz93bYZhMqTvy3ZFJt7vavYqgS095cdBoWiWtsi
```

## Структура файлів

```
src/modules/liqpay-payment/
├── index.ts          — ModuleProvider registration
├── service.ts        — AbstractPaymentProvider, identifier="liqpay"
└── lib/
    └── liqpay.ts     — API клієнт (data, signature, verify)
```

---

## Layer 1: API Client (`lib/liqpay.ts`)

### Алгоритм підпису (КРИТИЧНО!)

```
signature = base64( sha1( private_key + data + private_key ) )
```

де `data` = `base64( JSON.stringify(params) )`

**УВАГА**: sha1.update() приймає string (не binary buffer). Це офіційна реалізація LiqPay.

### Повний код API клієнта

```typescript
import crypto from "crypto"

interface LiqPayConfig {
  publicKey: string
  privateKey: string
}

interface LiqPayPaymentParams {
  orderId: string
  amount: number          // в UAH (не в копійках! LiqPay приймає гривні)
  currency?: string       // default "UAH"
  description: string
  serverUrl: string       // webhook URL
  resultUrl: string       // redirect after payment
  language?: string       // "uk" | "ru" | "en"
}

interface LiqPayFormData {
  data: string            // base64 encoded JSON
  signature: string       // base64(sha1(private + data + private))
  checkoutUrl: string     // "https://www.liqpay.ua/api/3/checkout"
}

interface LiqPayCallbackData {
  action: string
  status: string          // "success" | "sandbox" | "error" | "failure" | "reversed" | ...
  order_id: string
  amount: number
  currency: string
  description: string
  payment_id: number
  public_key: string
  version: number
  [key: string]: unknown
}

export function createLiqPayClient(config: LiqPayConfig) {
  const { publicKey, privateKey } = config

  function strToSign(str: string): string {
    return crypto.createHash("sha1").update(str).digest("base64")
  }

  function createPayment(params: LiqPayPaymentParams): LiqPayFormData {
    const paymentData = {
      public_key: publicKey,
      version: 3,
      action: "pay",
      amount: params.amount,
      currency: params.currency || "UAH",
      description: params.description,
      order_id: params.orderId,
      server_url: params.serverUrl,
      result_url: params.resultUrl,
      language: params.language || "uk",
    }

    const data = Buffer.from(JSON.stringify(paymentData)).toString("base64")
    const signature = strToSign(privateKey + data + privateKey)

    return {
      data,
      signature,
      checkoutUrl: "https://www.liqpay.ua/api/3/checkout",
    }
  }

  function verifyCallback(data: string, signature: string): boolean {
    // Try SHA1 first (checkout uses SHA1)
    const sha1Sig = strToSign(privateKey + data + privateKey)
    if (sha1Sig === signature) return true

    // Also try SHA3-256 (callback docs mention it)
    const sha3Sig = crypto.createHash("sha3-256").update(privateKey + data + privateKey).digest("base64")
    return sha3Sig === signature
  }

  function decodeData(data: string): LiqPayCallbackData {
    const decoded = Buffer.from(data, "base64").toString("utf-8")
    return JSON.parse(decoded)
  }

  return {
    createPayment,
    verifyCallback,
    decodeData,
    strToSign,
  }
}
```

### Важливі деталі API

- **amount** — в гривнях (100.50), НЕ в копійках (на відміну від Monobank!)
- **version** — завжди 3
- **action** — "pay" для оплати
- **currency** — "UAH", "USD", "EUR"
- **server_url** — URL для webhook (POST з data + signature)
- **result_url** — URL куди перенаправити клієнта після оплати
- **language** — "uk" (default), "ru", "en"
- **order_id** — унікальний ідентифікатор замовлення

### Статуси платежів LiqPay

| Статус | Опис |
|--------|------|
| `success` | Успішний платіж |
| `sandbox` | Тестовий успішний платіж |
| `error` | Помилка платежу |
| `failure` | Неуспішний платіж |
| `reversed` | Повернення коштів |
| `processing` | В обробці |
| `wait_accept` | Очікує підтвердження |
| `wait_card` | Очікує введення картки |
| `3ds_verify` | 3D Secure верифікація |

---

## Layer 2: Payment Provider (`service.ts`)

```typescript
import {
  AbstractPaymentProvider,
  PaymentActions,
  PaymentSessionStatus,
} from "@medusajs/framework/utils"
import { BigNumber } from "@medusajs/framework/utils"
import { createLiqPayClient } from "./lib/liqpay"
import type { Logger } from "@medusajs/framework/types"

type Options = {
  publicKey: string
  privateKey: string
}

type InjectedDependencies = {
  logger: Logger
}

class LiqPayPaymentProviderService extends AbstractPaymentProvider<Options> {
  static identifier = "liqpay"
  protected logger_: Logger
  protected options_: Options
  protected client: ReturnType<typeof createLiqPayClient>

  constructor(container: InjectedDependencies, options: Options) {
    super(container, options)
    this.logger_ = container.logger
    this.options_ = options
    this.client = createLiqPayClient({
      publicKey: options.publicKey,
      privateKey: options.privateKey,
    })
  }

  static validateOptions(options: Record<any, any>) {
    if (!options.publicKey) {
      throw new Error("LiqPay publicKey is required")
    }
    if (!options.privateKey) {
      throw new Error("LiqPay privateKey is required")
    }
  }

  async initiatePayment(input) {
    const { amount, currency_code, context } = input

    // Medusa передає amount в мінімальних одиницях (копійки для UAH)
    // LiqPay приймає в гривнях — конвертуємо
    const amountInUAH = Number(amount) / 100

    const sessionId = context?.session_id || `liqpay_${Date.now()}`

    const formData = this.client.createPayment({
      orderId: sessionId,
      amount: amountInUAH,
      currency: currency_code?.toUpperCase() || "UAH",
      description: `Замовлення AL-KO Garden Store #${sessionId}`,
      serverUrl: `${process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"}/hooks/payment/liqpay-payment_liqpay`,
      resultUrl: `${process.env.STORE_URL || "http://localhost:3104"}/order/confirmed`,
      language: "uk",
    })

    return {
      id: sessionId,
      data: {
        id: sessionId,
        liqpay_data: formData.data,
        liqpay_signature: formData.signature,
        liqpay_checkout_url: formData.checkoutUrl,
      },
    }
  }

  async authorizePayment(input) {
    return {
      data: input.data,
      status: "authorized" as PaymentSessionStatus,
    }
  }

  async capturePayment(input) {
    // LiqPay auto-captures, nothing to do
    return { data: input.data }
  }

  async refundPayment(input) {
    // TODO: implement via LiqPay API POST /api/3/request action=refund
    this.logger_.warn("LiqPay refund not implemented yet")
    return { data: input.data }
  }

  async cancelPayment(input) {
    return { data: input.data }
  }

  async deletePayment(input) {
    return { data: input.data }
  }

  async getPaymentStatus(input) {
    const status = input.data?.status as string
    switch (status) {
      case "success":
      case "sandbox":
        return { status: "authorized" as PaymentSessionStatus }
      case "reversed":
        return { status: "canceled" as PaymentSessionStatus }
      case "error":
      case "failure":
        return { status: "error" as PaymentSessionStatus }
      default:
        return { status: "pending" as PaymentSessionStatus }
    }
  }

  async getWebhookActionAndData(payload) {
    const { data: webhookData, rawData, headers } = payload

    try {
      // LiqPay sends data + signature as POST form fields
      const liqpayData = (webhookData as any)?.data || (rawData as any)?.data
      const liqpaySignature = (webhookData as any)?.signature || (rawData as any)?.signature

      if (!liqpayData || !liqpaySignature) {
        this.logger_.error("LiqPay webhook: missing data or signature")
        return {
          action: PaymentActions.FAILED,
          data: { session_id: "", amount: new BigNumber(0) },
        }
      }

      // Verify signature
      if (!this.client.verifyCallback(liqpayData, liqpaySignature)) {
        this.logger_.error("LiqPay webhook: invalid signature")
        return {
          action: PaymentActions.FAILED,
          data: { session_id: "", amount: new BigNumber(0) },
        }
      }

      // Decode payment data
      const decoded = this.client.decodeData(liqpayData)
      this.logger_.info(`LiqPay webhook: order=${decoded.order_id} status=${decoded.status} amount=${decoded.amount}`)

      if (decoded.status === "success" || decoded.status === "sandbox") {
        return {
          action: PaymentActions.AUTHORIZED,
          data: {
            session_id: decoded.order_id,
            amount: new BigNumber(Math.round(decoded.amount * 100)), // back to kopiyky
          },
        }
      }

      if (decoded.status === "reversed") {
        return {
          action: PaymentActions.CANCELED,
          data: {
            session_id: decoded.order_id,
            amount: new BigNumber(Math.round(decoded.amount * 100)),
          },
        }
      }

      return {
        action: PaymentActions.NOT_SUPPORTED,
        data: {
          session_id: decoded.order_id,
          amount: new BigNumber(Math.round(decoded.amount * 100)),
        },
      }
    } catch (e) {
      this.logger_.error(`LiqPay webhook error: ${e}`)
      return {
        action: PaymentActions.FAILED,
        data: { session_id: "", amount: new BigNumber(0) },
      }
    }
  }
}

export default LiqPayPaymentProviderService
```

---

## Layer 3: Module Registration (`index.ts`)

```typescript
import LiqPayPaymentProviderService from "./service"
import { ModuleProvider, Modules } from "@medusajs/framework/utils"

export default ModuleProvider(Modules.PAYMENT, {
  services: [LiqPayPaymentProviderService],
})
```

---

## Layer 4: Реєстрація в `medusa-config.ts`

Додати до масиву providers поруч з Monobank:

```typescript
{
  resolve: "./src/modules/liqpay-payment",
  id: "liqpay-payment",
  options: {
    publicKey: process.env.LIQPAY_PUBLIC_KEY,
    privateKey: process.env.LIQPAY_PRIVATE_KEY,
  },
}
```

---

## Layer 5: Checkout інтеграція (Storefront)

На фронтенді при виборі LiqPay, дані для redirect доступні в payment session `data`:
- `liqpay_data` — base64 закодований JSON
- `liqpay_signature` — підпис
- `liqpay_checkout_url` — "https://www.liqpay.ua/api/3/checkout"

Redirect форма:
```html
<form method="POST" action={checkoutUrl} accept-charset="utf-8">
  <input type="hidden" name="data" value={liqpayData} />
  <input type="hidden" name="signature" value={liqpaySignature} />
  <button type="submit">Сплатити через LiqPay</button>
</form>
```

---

## Webhook URL
Вбудований шлях Medusa: `/hooks/payment/liqpay-payment_liqpay`

LiqPay надсилає POST з `Content-Type: application/x-www-form-urlencoded`:
- `data` — base64 JSON з інформацією про платіж
- `signature` — підпис для верифікації

---

## Повний список параметрів Callback (офіційна документація)

Source: https://www.liqpay.ua/en/doc/api/callback

### ВАЖЛИВО: Алгоритм підпису для callback

Callback використовує **SHA3-256** (не SHA1!):
```
signature = base64_encode(sha3-256(private_key + data + private_key))
```

**УВАГА**: Checkout використовує SHA1, але callback верифікація вимагає SHA3-256 згідно офіційної документації. На практиці LiqPay може використовувати SHA1 для обох — перевір обидва варіанти при верифікації!

### Параметри POST callback (data + signature)

LiqPay надсилає POST з `Content-Type: application/x-www-form-urlencoded`:
- `data` — base64 encoded JSON
- `signature` — `base64(sha3-256(private_key + data + private_key))`

### Поля відповіді callback (decoded data)

| Параметр | Тип | Опис |
|----------|-----|------|
| acq_id | Number | ID еквайера |
| action | String | Тип операції: pay, hold, subscribe, regular |
| agent_commission | Number | Комісія агента |
| amount | Number | Сума платежу |
| amount_bonus | Number | Бонус відправника |
| amount_credit | Number | Сума кредитної транзакції |
| amount_debit | Number | Сума дебетової транзакції |
| card_token | String | Токен картки відправника |
| commission_credit | Number | Комісія отримувача |
| commission_debit | Number | Комісія відправника |
| completion_date | String | Дата списання коштів |
| create_date | String | Дата створення платежу |
| currency | String | Валюта платежу |
| customer | String | Унікальний ID клієнта (до 100 символів) |
| description | String | Коментар платежу |
| end_date | String | Дата завершення |
| err_code | String | Код помилки |
| err_description | String | Опис помилки |
| ip | String | IP відправника |
| is_3ds | Boolean | Статус 3DS верифікації |
| liqpay_order_id | String | ID замовлення в системі LiqPay |
| order_id | String | ID замовлення магазину |
| payment_id | Number | ID платежу в LiqPay |
| paytype | String | Метод оплати: card, privat24, masterpass, moment_part, cash, invoice, qr |
| public_key | String | Публічний ключ магазину |
| receiver_commission | Number | Комісія отримувача |
| sender_card_bank | String | Банк відправника |
| sender_card_country | String | Країна картки (ISO 3166-1) |
| sender_card_mask2 | String | Маска картки відправника |
| sender_card_type | String | Тип картки: MC/Visa |
| sender_commission | Number | Комісія відправника |
| sender_first_name | String | Ім'я відправника |
| sender_last_name | String | Прізвище відправника |
| sender_phone | String | Телефон відправника |
| status | String | Статус платежу (див. нижче) |
| version | Number | Версія API |

### Всі статуси платежів LiqPay

**Фінальні (потребують дії):**
| Статус | Опис |
|--------|------|
| success | Успішний платіж |
| failure | Неуспішний платіж |
| error | Помилка, некоректні дані |
| reversed | Кошти повернуто |
| subscribed | Підписку створено |
| unsubscribed | Підписку деактивовано |

**Очікують верифікації:**
| Статус | Опис |
|--------|------|
| 3ds_verify | Потрібна 3DS верифікація |
| otp_verify | Потрібне OTP підтвердження |
| cvv_verify | Потрібне введення CVV |
| sender_verify | Потрібні дані відправника |
| receiver_verify | Потрібні дані отримувача |
| senderapp_verify | Підтвердження в Приват24 |
| pin_verify | Потрібен PIN |
| captcha_verify | Потрібна CAPTCHA |
| password_verify | Потрібен пароль Приват24 |
| phone_verify | Потрібен номер телефону |
| ivr_verify | Очікує дзвінок IVR |

**Інші:**
| Статус | Опис |
|--------|------|
| processing | В обробці |
| prepared | Створено, очікує завершення |
| hold_wait | Кошти заблоковано (двоетапний платіж) |
| cash_wait | Очікує готівкової оплати |
| invoice_wait | Рахунок створено, очікує оплати |
| wait_accept | Кошти списано, очікує верифікації магазину (ліміт 60 днів) |
| wait_card | Метод повернення не визначено |
| wait_compensation | Успішно, зарахування в щоденному розрахунку |
| wait_lc | Акредитив, очікує підтвердження товару |
| wait_reserve | Зарезервовано для повернення |
| wait_secure | На перевірці |

### Обробка статусів в Medusa Payment Provider

```typescript
// В getWebhookActionAndData:
if (decoded.status === "success" || decoded.status === "sandbox") {
  return { action: PaymentActions.AUTHORIZED, ... }
}
if (decoded.status === "wait_compensation") {
  return { action: PaymentActions.AUTHORIZED, ... }  // теж успішний
}
if (decoded.status === "reversed") {
  return { action: PaymentActions.CANCELED, ... }
}
if (decoded.status === "failure" || decoded.status === "error") {
  return { action: PaymentActions.FAILED, ... }
}
// Все інше — NOT_SUPPORTED (проміжні статуси)
```

---

## Тестування (Sandbox)

LiqPay має sandbox режим. Тестові картки:
- **Успішна**: 4242 4242 4242 4242, exp: будь-яка майбутня, CVV: будь-який
- Для sandbox потрібно додати `sandbox: 1` в params (або включити в особистому кабінеті LiqPay)

---

## Два endpoint'и LiqPay

1. **Client → LiqPay** (Checkout): `POST https://www.liqpay.ua/api/3/checkout` — redirect клієнта
2. **Server → LiqPay** (API): `POST https://www.liqpay.ua/api/request` — server-to-server запити (status, refund тощо)

### Server-to-Server API (для refund, status)

```typescript
// Запит статусу платежу
const params = {
  action: "status",
  version: 3,
  order_id: "order123"
}
// POST https://www.liqpay.ua/api/request з data + signature

// Повернення коштів
const params = {
  action: "refund",
  version: 3,
  order_id: "order123",
  amount: 100.50
}
```
