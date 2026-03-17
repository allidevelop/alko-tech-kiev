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
  createOrder,
  getOrderState,
  confirmOrder,
  rejectOrder,
  verifyWebhookSignature,
  type InstallmentOrderState,
} from "./lib/monobank-installments"

type InstallmentSessionData = {
  orderId: string
  monoState: InstallmentOrderState
}

class MonobankInstallmentsProviderService extends AbstractPaymentProvider<{}> {
  static identifier = "monobank-installments"

  constructor(container: any, options: any) {
    super(container, options)
  }

  async initiatePayment(
    input: InitiatePaymentInput
  ): Promise<InitiatePaymentOutput> {
    const { amount, context, data } = input

    const sessionId = (context as any)?.session_id || ""
    const customerPhone = (context as any)?.customer?.phone || undefined

    // Customer pays only for items; shipping is paid separately at Nova Poshta.
    // item_subtotal is passed from storefront via data; fallback to full amount.
    const itemSubtotal = (data as any)?.item_subtotal
    const chargeAmount = itemSubtotal != null && Number(itemSubtotal) > 0
      ? Number(itemSubtotal)
      : Number(amount)

    // Build a single product line from item total
    const products = [
      {
        name: `Замовлення AL-KO - ${sessionId.slice(0, 8).toUpperCase()}`,
        count: 1,
        sum: Math.round(chargeAmount * 100), // UAH → kopiyky
      },
    ]

    const result = await createOrder({
      store_order_id: sessionId,
      client_phone: customerPhone,
      products,
      amount: Math.round(chargeAmount * 100), // UAH → kopiyky
    })

    return {
      id: result.order_id,
      status: PaymentSessionStatus.PENDING,
      data: {
        orderId: result.order_id,
        monoState: result.state,
      },
    }
  }

  async authorizePayment(
    input: AuthorizePaymentInput
  ): Promise<AuthorizePaymentOutput> {
    return {
      status: PaymentSessionStatus.AUTHORIZED,
      data: input.data as unknown as Record<string, unknown>,
    }
  }

  async capturePayment(
    input: CapturePaymentInput
  ): Promise<CapturePaymentOutput> {
    const data = input.data as unknown as InstallmentSessionData
    if (data?.orderId) {
      try {
        await confirmOrder(data.orderId)
      } catch (error) {
        console.error("[MonobankInstallments] confirmOrder failed:", error)
        throw error
      }
    }
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
    const data = input.data as unknown as InstallmentSessionData
    if (data?.orderId) {
      try {
        await rejectOrder(data.orderId)
      } catch (error) {
        console.error("[MonobankInstallments] rejectOrder failed:", error)
      }
    }
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
    const data = input.data as unknown as InstallmentSessionData

    switch (data?.monoState) {
      case "approved":
      case "confirmed":
        return { status: PaymentSessionStatus.AUTHORIZED }
      case "rejected":
      case "expired":
        return { status: PaymentSessionStatus.ERROR }
      case "created":
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

    const signature = (headers["signature"] as string) ?? ""
    const bodyString =
      typeof rawData === "string" ? rawData : JSON.stringify(rawData)

    const isValid = verifyWebhookSignature(bodyString, signature)
    if (!isValid) {
      console.error("[MonobankInstallments] Invalid webhook signature")
      return { action: PaymentActions.NOT_SUPPORTED }
    }

    const webhookData = (
      typeof data === "string" ? JSON.parse(data) : data
    ) as {
      order_id: string
      store_order_id: string
      state: InstallmentOrderState
      amount?: number
    }

    switch (webhookData.state) {
      case "approved":
        return {
          action: PaymentActions.AUTHORIZED,
          data: {
            session_id: webhookData.store_order_id ?? "",
            amount: webhookData.amount ?? 0,
          },
        }
      case "rejected":
      case "expired":
        return {
          action: PaymentActions.FAILED,
          data: {
            session_id: webhookData.store_order_id ?? "",
            amount: webhookData.amount ?? 0,
          },
        }
      default:
        return { action: PaymentActions.NOT_SUPPORTED }
    }
  }
}

export default MonobankInstallmentsProviderService
