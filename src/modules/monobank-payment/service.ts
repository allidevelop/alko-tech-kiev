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

  async initiatePayment(
    input: CreatePaymentProviderSession
  ): Promise<PaymentProviderSessionResponse> {
    const { amount, currency_code, context } = input

    const storeUrl =
      process.env.STORE_URL ||
      process.env.STORE_CORS?.split(",")[0] ||
      "http://localhost:3104"
    const backendUrl =
      process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"

    const invoice = await createInvoice({
      amount,
      orderId: context.session_id as string,
      orderDescription: `Замовлення AL-KO — ${context.session_id}`,
      redirectUrl: `${storeUrl}/checkout/success`,
      webHookUrl: `${backendUrl}/hooks/payment/monobank_monobank`,
    })

    return {
      data: {
        invoiceId: invoice.invoiceId,
        pageUrl: invoice.pageUrl,
        monoStatus: "created",
      } as unknown as Record<string, unknown>,
    }
  }

  async authorizePayment(
    paymentSessionData: Record<string, unknown>
  ): Promise<
    | PaymentProviderError
    | { status: PaymentSessionStatus; data: Record<string, unknown> }
  > {
    const data = paymentSessionData as unknown as MonoSessionData

    try {
      const statusResult = await getInvoiceStatus(data.invoiceId)
      const newData = {
        ...data,
        monoStatus: statusResult.status,
      } as unknown as Record<string, unknown>

      if (statusResult.status === "success") {
        return { status: PaymentSessionStatus.AUTHORIZED, data: newData }
      }
      if (
        statusResult.status === "failure" ||
        statusResult.status === "expired"
      ) {
        return { status: PaymentSessionStatus.ERROR, data: newData }
      }
      return { status: PaymentSessionStatus.PENDING, data: newData }
    } catch (error) {
      return {
        error: (error as Error).message,
        code: "MONOBANK_STATUS_CHECK_FAILED",
        detail: "Failed to check payment status with Monobank",
      }
    }
  }

  async capturePayment(
    paymentSessionData: Record<string, unknown>
  ): Promise<PaymentProviderError | PaymentProviderSessionResponse["data"]> {
    return paymentSessionData
  }

  async refundPayment(
    paymentSessionData: Record<string, unknown>,
    refundAmount: number
  ): Promise<PaymentProviderError | PaymentProviderSessionResponse["data"]> {
    return paymentSessionData
  }

  async cancelPayment(
    paymentSessionData: Record<string, unknown>
  ): Promise<PaymentProviderError | PaymentProviderSessionResponse["data"]> {
    return paymentSessionData
  }

  async deletePayment(
    paymentSessionData: Record<string, unknown>
  ): Promise<PaymentProviderError | PaymentProviderSessionResponse["data"]> {
    return paymentSessionData
  }

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

  async retrievePayment(
    paymentSessionData: Record<string, unknown>
  ): Promise<PaymentProviderError | PaymentProviderSessionResponse["data"]> {
    return paymentSessionData
  }

  async updatePayment(
    input: UpdatePaymentProviderSession
  ): Promise<PaymentProviderError | PaymentProviderSessionResponse> {
    return { data: input.data }
  }

  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    const { data, rawData, headers } = payload

    const xSign = (headers["x-sign"] as string) ?? ""
    const bodyString =
      typeof rawData === "string" ? rawData : JSON.stringify(rawData)

    const isValid = await verifyWebhookSignature(bodyString, xSign)
    if (!isValid) {
      console.error("[Monobank] Invalid webhook signature")
      return { action: PaymentActions.NOT_SUPPORTED }
    }

    const webhookData = (
      typeof data === "string" ? JSON.parse(data) : data
    ) as {
      invoiceId: string
      status: MonoInvoiceStatus
      reference?: string
      finalAmount?: number
    }

    switch (webhookData.status) {
      case "success":
        return {
          action: PaymentActions.AUTHORIZED,
          data: {
            session_id: webhookData.reference,
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
        return { action: PaymentActions.NOT_SUPPORTED }
    }
  }
}

export default MonobankPaymentProviderService
