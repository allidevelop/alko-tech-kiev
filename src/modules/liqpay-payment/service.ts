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

  async initiatePayment(input: any) {
    const { amount, currency_code, context } = input

    // Medusa passes amount in smallest units (kopiyky for UAH)
    // LiqPay accepts in UAH — convert
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

  async authorizePayment(input: any) {
    return {
      data: input.data,
      status: "authorized" as PaymentSessionStatus,
    }
  }

  async capturePayment(input: any) {
    return { data: input.data }
  }

  async refundPayment(input: any) {
    this.logger_.warn("LiqPay refund not implemented yet")
    return { data: input.data }
  }

  async cancelPayment(input: any) {
    return { data: input.data }
  }

  async deletePayment(input: any) {
    return { data: input.data }
  }

  async retrievePayment(input: any) {
    return { data: input.data }
  }

  async updatePayment(input: any) {
    return { data: input.data }
  }

  async getPaymentStatus(input: any) {
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

  async getWebhookActionAndData(payload: any) {
    const { data: webhookData, rawData } = payload

    try {
      const liqpayData =
        (webhookData as any)?.data || (rawData as any)?.data
      const liqpaySignature =
        (webhookData as any)?.signature || (rawData as any)?.signature

      if (!liqpayData || !liqpaySignature) {
        this.logger_.error("LiqPay webhook: missing data or signature")
        return {
          action: PaymentActions.FAILED,
          data: { session_id: "", amount: new BigNumber(0) },
        }
      }

      if (!this.client.verifyCallback(liqpayData, liqpaySignature)) {
        this.logger_.error("LiqPay webhook: invalid signature")
        return {
          action: PaymentActions.FAILED,
          data: { session_id: "", amount: new BigNumber(0) },
        }
      }

      const decoded = this.client.decodeData(liqpayData)
      this.logger_.info(
        `LiqPay webhook: order=${decoded.order_id} status=${decoded.status} amount=${decoded.amount}`
      )

      if (
        decoded.status === "success" ||
        decoded.status === "sandbox" ||
        decoded.status === "wait_compensation"
      ) {
        return {
          action: PaymentActions.AUTHORIZED,
          data: {
            session_id: decoded.order_id,
            amount: new BigNumber(Math.round(decoded.amount * 100)),
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

      if (decoded.status === "failure" || decoded.status === "error") {
        return {
          action: PaymentActions.FAILED,
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
