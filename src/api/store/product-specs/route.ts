import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * GET /store/product-specs
 *
 * Query params (one of):
 *   ?product_id=<id>   — returns all spec values for a product
 *   ?category_id=<id>  — returns spec attribute definitions for a category
 *   (none)             — returns all spec attributes
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { product_id, category_id } = req.query as Record<string, string>

  const pgConnection = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  ) as any

  try {
    if (product_id) {
      // Return all spec values for this product, including attribute metadata
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

      return res.json({ specs })
    }

    if (category_id) {
      // Return spec attribute definitions assigned to this category
      const result = await pgConnection.raw(
        `SELECT
           csa.id,
           csa.category_id,
           csa.sort_order,
           sa.id          AS attribute_id,
           sa.slug,
           sa.label,
           sa.type,
           sa.unit,
           sa.is_filterable
         FROM category_spec_attribute csa
         JOIN spec_attribute sa ON sa.id = csa.attribute_id
         WHERE csa.category_id = ?
           AND csa.deleted_at IS NULL
           AND sa.deleted_at IS NULL
         ORDER BY csa.sort_order`,
        [category_id]
      )

      const attributes = result.rows.map((row: any) => ({
        id: row.id,
        category_id: row.category_id,
        sort_order: row.sort_order,
        attribute: {
          id: row.attribute_id,
          slug: row.slug,
          label: row.label,
          type: row.type,
          unit: row.unit,
          is_filterable: row.is_filterable,
        },
      }))

      return res.json({ attributes })
    }

    // No filters — return all spec attributes
    const result = await pgConnection.raw(
      `SELECT id, slug, label, type, unit, is_filterable, sort_order
       FROM spec_attribute
       WHERE deleted_at IS NULL
       ORDER BY sort_order, slug`
    )

    return res.json({ attributes: result.rows })
  } catch (error) {
    console.error("[ProductSpecs API] GET error:", error)
    return res.status(500).json({ error: "Failed to fetch product specs" })
  }
}
