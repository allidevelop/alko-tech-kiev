import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const status = (req.query.status as string) || "pending"
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100)
  const offset = parseInt(req.query.offset as string) || 0

  try {
    const pgConnection = req.scope.resolve(
      ContainerRegistrationKeys.PG_CONNECTION
    ) as any

    let query = `SELECT r.*, p.title as product_title
                 FROM product_reviews r
                 LEFT JOIN product p ON p.id = r.product_id`
    const params: any[] = []

    if (status !== "all") {
      query += ` WHERE r.status = ?`
      params.push(status)
    }

    query += ` ORDER BY r.created_at DESC LIMIT ? OFFSET ?`
    params.push(limit, offset)

    const result = await pgConnection.raw(query, params)

    // Count total
    let countQuery = `SELECT COUNT(*) as total FROM product_reviews`
    const countParams: any[] = []
    if (status !== "all") {
      countQuery += ` WHERE status = ?`
      countParams.push(status)
    }
    const countResult = await pgConnection.raw(countQuery, countParams)

    return res.json({
      reviews: result.rows || [],
      total: parseInt(countResult.rows?.[0]?.total || "0"),
    })
  } catch (error) {
    console.error("[Admin Reviews API] GET error:", error)
    return res.status(500).json({ error: "Failed to fetch reviews", reviews: [] })
  }
}
