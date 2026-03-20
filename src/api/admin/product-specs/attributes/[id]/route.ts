import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * PATCH /admin/product-specs/attributes/:id
 *
 * Updates an existing spec attribute.
 */
export const PATCH = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params as { id: string }

  if (!id) {
    return res.status(400).json({ error: "id is required" })
  }

  const body = req.body as {
    label?: string
    type?: string
    unit?: string | null
    is_filterable?: boolean
    sort_order?: number
  }

  const pgConnection = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  ) as any

  try {
    const existing = await pgConnection.raw(
      `SELECT id FROM spec_attribute WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [id]
    )

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Attribute not found" })
    }

    const updates: string[] = []
    const values: any[] = []

    if (body.label !== undefined) {
      updates.push("label = ?")
      values.push(body.label)
    }
    if (body.type !== undefined) {
      updates.push("type = ?")
      values.push(body.type)
    }
    if ("unit" in body) {
      updates.push("unit = ?")
      values.push(body.unit ?? null)
    }
    if (body.is_filterable !== undefined) {
      updates.push("is_filterable = ?")
      values.push(body.is_filterable)
    }
    if (body.sort_order !== undefined) {
      updates.push("sort_order = ?")
      values.push(body.sort_order)
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields to update" })
    }

    updates.push("updated_at = NOW()")
    values.push(id)

    await pgConnection.raw(
      `UPDATE spec_attribute SET ${updates.join(", ")} WHERE id = ?`,
      values
    )

    const result = await pgConnection.raw(
      `SELECT id, slug, label, type, unit, is_filterable, sort_order FROM spec_attribute WHERE id = ?`,
      [id]
    )

    return res.json({ attribute: result.rows[0] })
  } catch (error) {
    console.error("[ProductSpecs Admin API] PATCH /attributes/:id error:", error)
    return res.status(500).json({ error: "Failed to update attribute" })
  }
}

/**
 * DELETE /admin/product-specs/attributes/:id
 *
 * Soft-deletes a spec attribute (sets deleted_at).
 */
export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params as { id: string }

  if (!id) {
    return res.status(400).json({ error: "id is required" })
  }

  const pgConnection = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  ) as any

  try {
    const existing = await pgConnection.raw(
      `SELECT id, slug FROM spec_attribute WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [id]
    )

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Attribute not found" })
    }

    await pgConnection.raw(
      `UPDATE spec_attribute SET deleted_at = NOW() WHERE id = ?`,
      [id]
    )

    return res.json({ id, deleted: true })
  } catch (error) {
    console.error("[ProductSpecs Admin API] DELETE /attributes/:id error:", error)
    return res.status(500).json({ error: "Failed to delete attribute" })
  }
}
