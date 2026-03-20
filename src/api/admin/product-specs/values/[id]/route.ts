import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * PATCH /admin/product-specs/values/:id
 *
 * Updates text_value and/or numeric_value for a product spec value.
 * Used by the Admin widget on the product detail page.
 */
export const PATCH = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params as { id: string }

  if (!id) {
    return res.status(400).json({ error: "id is required" })
  }

  const body = req.body as {
    text_value?: string | null
    numeric_value?: number | null
  }

  const pgConnection = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  ) as any

  try {
    // Check that the record exists
    const existing = await pgConnection.raw(
      `SELECT id FROM product_spec_value WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [id]
    )

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Spec value not found" })
    }

    const updates: string[] = []
    const values: any[] = []

    if ("text_value" in body) {
      updates.push("text_value = ?")
      values.push(body.text_value ?? null)
    }

    if ("numeric_value" in body) {
      updates.push("numeric_value = ?")
      values.push(body.numeric_value ?? null)
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields to update" })
    }

    updates.push("updated_at = NOW()")
    values.push(id)

    await pgConnection.raw(
      `UPDATE product_spec_value SET ${updates.join(", ")} WHERE id = ?`,
      values
    )

    // Return the updated row with attribute info
    const result = await pgConnection.raw(
      `SELECT
         psv.id,
         psv.product_id,
         psv.text_value,
         psv.numeric_value,
         sa.id AS attribute_id,
         sa.slug,
         sa.label,
         sa.type,
         sa.unit,
         sa.is_filterable,
         sa.sort_order
       FROM product_spec_value psv
       JOIN spec_attribute sa ON sa.id = psv.attribute_id
       WHERE psv.id = ?`,
      [id]
    )

    const row = result.rows[0]
    return res.json({
      spec: {
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
      },
    })
  } catch (error) {
    console.error("[ProductSpecs Admin API] PATCH /values/:id error:", error)
    return res.status(500).json({ error: "Failed to update spec value" })
  }
}
