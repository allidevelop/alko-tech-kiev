import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

/**
 * GET /store/reviews/summary?productIds=id1,id2,id3
 * Returns { [productId]: { count, avg } } for batch loading ratings.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const productIds = (req.query.productIds as string || "").split(",").filter(Boolean)

  if (!productIds.length) {
    return res.json({ data: {} })
  }

  try {
    const { Pool } = require("pg")
    const pool = new Pool({ connectionString: process.env.DATABASE_URL })
    const placeholders = productIds.map((_, i) => `$${i + 1}`).join(",")
    const { rows } = await pool.query(
      `SELECT product_id, COUNT(*)::int as count, ROUND(AVG(rating)::numeric, 1) as avg
       FROM product_reviews
       WHERE status = 'approved' AND product_id IN (${placeholders})
       GROUP BY product_id`,
      productIds
    )
    await pool.end()

    const data: Record<string, { count: number; avg: number }> = {}
    for (const row of rows) {
      data[row.product_id] = { count: row.count, avg: parseFloat(row.avg) }
    }
    return res.json({ data })
  } catch (error: any) {
    return res.json({ data: {}, error: error.message })
  }
}
