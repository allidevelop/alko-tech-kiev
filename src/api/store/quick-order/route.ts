import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createCartWorkflow,
  addToCartWorkflow,
  addShippingMethodToCartWorkflow,
  createPaymentCollectionForCartWorkflow,
  createPaymentSessionsWorkflow,
  completeCartWorkflow,
} from "@medusajs/core-flows"

interface QuickOrderBody {
  name: string
  phone: string
  city?: string
  warehouse?: string
  productId: string
  variantId: string
  productTitle: string
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = req.body as QuickOrderBody

  if (!body.name || !body.phone || !body.variantId) {
    return res.status(400).json({
      success: false,
      error: "name, phone and variantId are required",
    })
  }

  try {
    // 1. Get region and sales channel
    const regionService = req.scope.resolve(Modules.REGION)
    const salesChannelService = req.scope.resolve(Modules.SALES_CHANNEL)
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

    const regions = await regionService.listRegions({})
    const region = regions[0]
    if (!region) throw new Error("No region found")

    const salesChannels = await salesChannelService.listSalesChannels({})
    const salesChannel = salesChannels[0]
    if (!salesChannel) throw new Error("No sales channel found")

    // 2. Parse name
    const nameParts = body.name.trim().split(/\s+/)
    const firstName = nameParts[0] || body.name
    const lastName = nameParts.slice(1).join(" ") || "-"

    // 3. Create cart
    const { result: cart } = await createCartWorkflow(req.scope).run({
      input: {
        currency_code: region.currency_code || "uah",
        region_id: region.id,
        sales_channel_id: salesChannel.id,
        email: `quick-${Date.now()}@alko-store.ua`,
        shipping_address: {
          first_name: firstName,
          last_name: lastName,
          phone: body.phone,
          city: body.city || "",
          country_code: "ua",
          address_1: body.warehouse
            ? `НП: ${body.warehouse}`
            : "Швидке замовлення",
          postal_code: "00000",
        },
        billing_address: {
          first_name: firstName,
          last_name: lastName,
          phone: body.phone,
          city: body.city || "",
          country_code: "ua",
          address_1: body.warehouse
            ? `НП: ${body.warehouse}`
            : "Швидке замовлення",
          postal_code: "00000",
        },
        metadata: {
          source: "quick-order",
          phone: body.phone,
          customer_name: body.name,
          warehouse: body.warehouse || "",
          product_title: body.productTitle,
        },
      },
    })

    // 4. Add product to cart
    await addToCartWorkflow(req.scope).run({
      input: {
        cart_id: cart.id,
        items: [
          {
            variant_id: body.variantId,
            quantity: 1,
          },
        ],
      },
    })

    // 5. Add shipping method
    const fulfillmentService = req.scope.resolve(Modules.FULFILLMENT)
    const shippingOptions = await fulfillmentService.listShippingOptions({})
    const shippingOption = shippingOptions[0]
    if (!shippingOption) throw new Error("No shipping option available")

    await addShippingMethodToCartWorkflow(req.scope).run({
      input: {
        cart_id: cart.id,
        options: [
          {
            id: shippingOption.id,
            data: {
              city_ref: "quick-order",
              city_name: body.city || "Київ",
              warehouse_description: body.warehouse || "Швидке замовлення",
            },
          },
        ],
      },
    })

    // 6. Create payment collection
    await createPaymentCollectionForCartWorkflow(req.scope).run({
      input: { cart_id: cart.id },
    })

    // 6. Retrieve cart to get payment_collection id
    const { data: [updatedCart] } = await query.graph({
      entity: "cart",
      fields: ["id", "payment_collection.id"],
      filters: { id: cart.id },
    })

    const paymentCollectionId = (updatedCart as any)?.payment_collection?.id
    if (!paymentCollectionId) {
      throw new Error("Payment collection not found after creation")
    }

    // 7. Create payment session (system/manual — cash on delivery)
    await createPaymentSessionsWorkflow(req.scope).run({
      input: {
        payment_collection_id: paymentCollectionId,
        provider_id: "pp_system_default",
        data: {},
      },
    })

    // 8. Complete cart → creates an order
    const { result } = await completeCartWorkflow(req.scope).run({
      input: { id: cart.id },
    })

    console.log("[QuickOrder] Order created:", {
      orderId: result.id,
      customerName: body.name,
      phone: body.phone,
      city: body.city,
      warehouse: body.warehouse,
      product: body.productTitle,
      timestamp: new Date().toISOString(),
    })

    return res.json({
      success: true,
      message: "Замовлення створено",
      order_id: result.id,
    })
  } catch (error: any) {
    console.error("[QuickOrder] Error creating order:", error)
    return res.status(500).json({
      success: false,
      error: error?.message || "Помилка створення замовлення",
    })
  }
}
