import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * GET /store/product-specs/:product_id
 *
 * Returns all spec values for a single product, with attribute metadata included.
 * Specs are ordered by attribute sort_order.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { product_id } = req.params as { product_id: string }

  if (!product_id) {
    return res.status(400).json({ error: "product_id is required" })
  }

  const pgConnection = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  ) as any

  try {
    const result = await pgConnection.raw(
      `SELECT
         psv.id,
         psv.product_id,
         psv.text_value,
         psv.numeric_value,
         sa.id          AS attribute_id,
         sa.slug,
         sa.label,
         sa.type,
         sa.unit,
         sa.is_filterable,
         sa.sort_order
       FROM product_spec_value psv
       JOIN spec_attribute sa ON sa.id = psv.attribute_id
       WHERE psv.product_id = ?
         AND psv.deleted_at IS NULL
         AND sa.deleted_at IS NULL
       ORDER BY sa.sort_order, sa.slug`,
      [product_id]
    )

    if (result.rows.length === 0) {
      return res.json({ product_id, specs: [] })
    }

    const specs = result.rows.map((row: any) => ({
      id: row.id,
      product_id: row.product_id,
      text_value: row.text_value,
      numeric_value: row.numeric_value,
      attribute: {
        id: row.attribute_id,
        slug: row.slug,
        label: row.label,
        type: row.type,
        unit: row.unit,
        is_filterable: row.is_filterable,
        sort_order: row.sort_order,
      },
    }))

    return res.json({ product_id, specs })
  } catch (error) {
    console.error("[ProductSpecs API] GET /:product_id error:", error)
    return res.status(500).json({ error: "Failed to fetch product specs" })
  }
}
