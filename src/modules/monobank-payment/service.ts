import {
  AbstractPaymentProvider,
  PaymentActions,
  PaymentSessionStatus,
} from "@medusajs/framework/utils"
import type {
  InitiatePaymentInput,
  InitiatePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  RefundPaymentInput,
  RefundPaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  ProviderWebhookPayload,
  WebhookActionResult,
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

  constructor(container: any, options: any) {
    super(container, options)
  }

  async initiatePayment(
    input: InitiatePaymentInput
  ): Promise<InitiatePaymentOutput> {
    const { amount, currency_code, context, data } = input

    const storeUrl =
      process.env.STORE_URL ||
      process.env.STORE_CORS?.split(",")[0] ||
      "http://localhost:3104"
    const backendUrl =
      process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"

    const sessionId = (context as any)?.session_id || ""

    const invoice = await createInvoice({
      amount: Number(amount),
      orderId: sessionId,
      orderDescription: `Замовлення AL-KO — ${sessionId}`,
      redirectUrl: `${storeUrl}/checkout/success`,
      webHookUrl: `${backendUrl}/hooks/payment/monobank_monobank`,
    })

    return {
      id: invoice.invoiceId,
      status: PaymentSessionStatus.PENDING,
      data: {
        invoiceId: invoice.invoiceId,
        pageUrl: invoice.pageUrl,
        monoStatus: "created",
      },
    }
  }

  async authorizePayment(
    input: AuthorizePaymentInput
  ): Promise<AuthorizePaymentOutput> {
    const sessionData = input.data as unknown as MonoSessionData

    try {
      const statusResult = await getInvoiceStatus(sessionData.invoiceId)
      const newData = {
        ...sessionData,
        monoStatus: statusResult.status,
      }

      if (statusResult.status === "success") {
        return { status: PaymentSessionStatus.AUTHORIZED, data: newData as unknown as Record<string, unknown> }
      }
      if (
        statusResult.status === "failure" ||
        statusResult.status === "expired"
      ) {
        return { status: PaymentSessionStatus.ERROR, data: newData as unknown as Record<string, unknown> }
      }
      return { status: PaymentSessionStatus.PENDING, data: newData as unknown as Record<string, unknown> }
    } catch (error) {
      throw error
    }
  }

  async capturePayment(
    input: CapturePaymentInput
  ): Promise<CapturePaymentOutput> {
    return { data: input.data }
  }

  async refundPayment(
    input: RefundPaymentInput
  ): Promise<RefundPaymentOutput> {
    return { data: input.data }
  }

  async cancelPayment(
    input: CancelPaymentInput
  ): Promise<CancelPaymentOutput> {
    return { data: input.data }
  }

  async deletePayment(
    input: DeletePaymentInput
  ): Promise<DeletePaymentOutput> {
    return { data: input.data }
  }

  async getPaymentStatus(
    input: GetPaymentStatusInput
  ): Promise<GetPaymentStatusOutput> {
    const data = input.data as unknown as MonoSessionData

    switch (data?.monoStatus) {
      case "success":
        return { status: PaymentSessionStatus.AUTHORIZED }
      case "failure":
      case "expired":
        return { status: PaymentSessionStatus.ERROR }
      case "reversed":
        return { status: PaymentSessionStatus.CANCELED }
      case "processing":
      case "hold":
        return { status: PaymentSessionStatus.PENDING }
      default:
        return { status: PaymentSessionStatus.PENDING }
    }
  }

  async retrievePayment(
    input: RetrievePaymentInput
  ): Promise<RetrievePaymentOutput> {
    return { data: input.data }
  }

  async updatePayment(
    input: UpdatePaymentInput
  ): Promise<UpdatePaymentOutput> {
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
            session_id: webhookData.reference ?? "",
            amount: webhookData.finalAmount ?? 0,
          },
        }
      case "failure":
      case "expired":
        return {
          action: PaymentActions.FAILED,
          data: {
            session_id: webhookData.reference ?? "",
            amount: webhookData.finalAmount ?? 0,
          },
        }
      default:
        return { action: PaymentActions.NOT_SUPPORTED }
    }
  }
}

export default MonobankPaymentProviderService
