import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import pg from "pg"

const DB = {
  host: "localhost",
  port: 5432,
  database: "medusa_alko",
  user: "medusa_alko",
  password: "medusa_alko_2026",
}

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const productId = req.params.productId
  let pool: pg.Pool | null = null

  try {
    pool = new pg.Pool(DB)
    const { rows } = await pool.query(
      `SELECT psv.id, psv.product_id, psv.text_value, psv.numeric_value,
        sa.id as attr_id, sa.slug, sa.label, sa.type, sa.unit, sa.is_filterable, sa.sort_order
      FROM product_spec_value psv
      JOIN spec_attribute sa ON sa.id = psv.attribute_id
      WHERE psv.product_id = $1
      ORDER BY sa.sort_order, sa.label`,
      [productId]
    )

    const specs = rows.map((r: any) => ({
      id: r.id,
      product_id: r.product_id,
      text_value: r.text_value,
      numeric_value: r.numeric_value,
      attribute: {
        id: r.attr_id,
        slug: r.slug,
        label: r.label,
        type: r.type,
        unit: r.unit,
        is_filterable: r.is_filterable,
        sort_order: r.sort_order,
      },
    }))

    res.json({ specs })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  } finally {
    if (pool) await pool.end()
  }
}
