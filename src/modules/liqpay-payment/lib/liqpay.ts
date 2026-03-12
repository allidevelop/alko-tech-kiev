import crypto from "crypto"

interface LiqPayConfig {
  publicKey: string
  privateKey: string
}

interface LiqPayPaymentParams {
  orderId: string
  amount: number // in UAH (not kopiyky!)
  currency?: string
  description: string
  serverUrl: string
  resultUrl: string
  language?: string
}

interface LiqPayFormData {
  data: string
  signature: string
  checkoutUrl: string
}

export interface LiqPayCallbackData {
  action: string
  status: string
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
    const sha3Sig = crypto
      .createHash("sha3-256")
      .update(privateKey + data + privateKey)
      .digest("base64")
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
