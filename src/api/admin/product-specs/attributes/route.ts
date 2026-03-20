import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * GET /admin/product-specs/attributes
 *
 * Returns all spec attributes ordered by sort_order.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const pgConnection = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  ) as any

  try {
    const result = await pgConnection.raw(
      `SELECT id, slug, label, type, unit, is_filterable, sort_order
       FROM spec_attribute
       WHERE deleted_at IS NULL
       ORDER BY sort_order, slug`
    )

    return res.json({ attributes: result.rows })
  } catch (error) {
    console.error("[ProductSpecs Admin API] GET /attributes error:", error)
    return res.status(500).json({ error: "Failed to fetch attributes" })
  }
}

/**
 * POST /admin/product-specs/attributes
 *
 * Creates a new spec attribute.
 * Body: { slug, label, type?, unit?, is_filterable?, sort_order? }
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const body = req.body as {
    slug: string
    label: string
    type?: string
    unit?: string | null
    is_filterable?: boolean
    sort_order?: number
  }

  if (!body.slug || !body.label) {
    return res.status(400).json({ error: "slug and label are required" })
  }

  const pgConnection = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  ) as any

  try {
    // Check uniqueness
    const existing = await pgConnection.raw(
      `SELECT id FROM spec_attribute WHERE slug = ? AND deleted_at IS NULL LIMIT 1`,
      [body.slug]
    )

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: `Attribute with slug '${body.slug}' already exists` })
    }

    const id = `spattr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const now = new Date().toISOString()

    await pgConnection.raw(
      `INSERT INTO spec_attribute (id, slug, label, type, unit, is_filterable, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        body.slug,
        body.label,
        body.type || "text",
        body.unit || null,
        body.is_filterable !== false,
        body.sort_order ?? 0,
        now,
        now,
      ]
    )

    const result = await pgConnection.raw(
      `SELECT id, slug, label, type, unit, is_filterable, sort_order FROM spec_attribute WHERE id = ?`,
      [id]
    )

    return res.status(201).json({ attribute: result.rows[0] })
  } catch (error) {
    console.error("[ProductSpecs Admin API] POST /attributes error:", error)
    return res.status(500).json({ error: "Failed to create attribute" })
  }
}
