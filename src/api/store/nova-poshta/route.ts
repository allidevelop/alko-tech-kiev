import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  searchCities,
  getWarehouses,
  isConfigured,
} from "../../../modules/nova-poshta-fulfillment/lib/nova-poshta"

interface NpRequestBody {
  action: "searchCities" | "getWarehouses"
  query?: string
  cityRef?: string
  page?: number
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
        50,
        body.page ?? 1
      )
      return res.json({ success: true, data: warehouses })
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
