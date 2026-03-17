import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  searchCities,
  getWarehouses,
  calculateDeliveryPrice,
  isConfigured,
} from "../../../modules/nova-poshta-fulfillment/lib/nova-poshta"

interface NpRequestBody {
  action: "searchCities" | "getWarehouses" | "calculatePrice"
  query?: string
  cityRef?: string
  page?: number
  // calculatePrice params
  recipientCityRef?: string
  weight?: number
  length?: number
  width?: number
  height?: number
  assessedValue?: number
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!isConfigured()) {
    return res.json({
      success: false,
      data: [],
      error: "Nova Poshta API not configured",
    })
  }

  const body = req.body as NpRequestBody

  try {
    if (body.action === "searchCities") {
      const cities = await searchCities(body.query ?? "", 20)
      return res.json({ success: true, data: cities })
    }

    if (body.action === "getWarehouses") {
      if (!body.cityRef) {
        return res
          .status(400)
          .json({ success: false, data: [], error: "cityRef is required" })
      }
      const warehouses = await getWarehouses(
        body.cityRef,
        body.query,
        body.query ? 50 : 500,
        body.page ?? 1
      )
      return res.json({ success: true, data: warehouses })
    }

    if (body.action === "calculatePrice") {
      if (!body.recipientCityRef) {
        return res
          .status(400)
          .json({ success: false, data: null, error: "recipientCityRef is required" })
      }
      const result = await calculateDeliveryPrice({
        recipientCityRef: body.recipientCityRef,
        weight: body.weight ?? 1,
        length: body.length ?? 30,
        width: body.width ?? 20,
        height: body.height ?? 20,
        assessedValue: body.assessedValue ?? 1000,
      })
      return res.json({ success: true, data: result })
    }

    return res
      .status(400)
      .json({ success: false, data: [], error: "Unknown action" })
  } catch (error) {
    console.error("[NovaPoshta API]", error)
    return res
      .status(500)
      .json({ success: false, data: [], error: "Internal error" })
  }
}
