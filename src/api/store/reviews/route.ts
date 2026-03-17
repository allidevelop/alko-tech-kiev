import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const productId = req.query.productId as string

  if (!productId) {
    return res.status(400).json({ error: "productId is required", reviews: [] })
  }

  try {
    const pgConnection = req.scope.resolve(
      ContainerRegistrationKeys.PG_CONNECTION
    ) as any

    const result = await pgConnection.raw(
      `SELECT id, product_id, name, rating, comment, created_at
       FROM product_reviews
       WHERE product_id = ? AND status = 'approved'
       ORDER BY created_at DESC
       LIMIT 50`,
      [productId]
    )

    return res.json({ reviews: result.rows || [] })
  } catch (error) {
    console.error("[Reviews API] GET error:", error)
    return res.status(500).json({ error: "Failed to fetch reviews", reviews: [] })
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { productId, name, rating, comment } = req.body as any

  if (!productId || !name || rating === undefined) {
    return res.status(400).json({
      error: "productId, name, and rating are required",
    })
  }

  const ratingNum = parseInt(rating)
  if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return res.status(400).json({ error: "rating must be 1-5" })
  }

  // Basic sanitization
  const safeName = String(name).trim().slice(0, 100)
  const safeComment = comment ? String(comment).trim().slice(0, 2000) : null

  if (!safeName) {
    return res.status(400).json({ error: "name is required" })
  }

  try {
    const pgConnection = req.scope.resolve(
      ContainerRegistrationKeys.PG_CONNECTION
    ) as any

    const result = await pgConnection.raw(
      `INSERT INTO product_reviews (product_id, name, rating, comment, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', NOW(), NOW())
       RETURNING id, product_id, name, rating, comment, status, created_at`,
      [productId, safeName, ratingNum, safeComment]
    )

    return res.status(201).json({
      success: true,
      review: result.rows?.[0] || null,
    })
  } catch (error) {
    console.error("[Reviews API] POST error:", error)
    return res.status(500).json({ error: "Failed to create review" })
  }
}
