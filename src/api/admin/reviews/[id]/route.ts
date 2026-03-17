import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const { status } = req.body as any

  if (!["pending", "approved", "rejected"].includes(status)) {
    return res.status(400).json({ error: "status must be pending, approved, or rejected" })
  }

  try {
    const pgConnection = req.scope.resolve(
      ContainerRegistrationKeys.PG_CONNECTION
    ) as any

    const result = await pgConnection.raw(
      `UPDATE product_reviews SET status = ?, updated_at = NOW() WHERE id = ? RETURNING *`,
      [status, parseInt(id)]
    )

    if (!result.rows?.length) {
      return res.status(404).json({ error: "Review not found" })
    }

    return res.json({ review: result.rows[0] })
  } catch (error) {
    console.error("[Admin Reviews API] PUT error:", error)
    return res.status(500).json({ error: "Failed to update review" })
  }
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params

  try {
    const pgConnection = req.scope.resolve(
      ContainerRegistrationKeys.PG_CONNECTION
    ) as any

    await pgConnection.raw(
      `DELETE FROM product_reviews WHERE id = ?`,
      [parseInt(id)]
    )

    return res.json({ success: true })
  } catch (error) {
    console.error("[Admin Reviews API] DELETE error:", error)
    return res.status(500).json({ error: "Failed to delete review" })
  }
}
