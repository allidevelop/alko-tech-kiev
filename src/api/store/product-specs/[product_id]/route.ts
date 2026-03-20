import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { VALUE_TRANSLATIONS_RU } from "../value-translations"

/**
 * GET /store/product-specs/:product_id
 *
 * Returns all spec values for a single product, with attribute metadata included.
 * Specs are ordered by attribute sort_order.
 *
 * Supports locale via x-medusa-locale header (e.g. ru-RU):
 *  - attribute labels are fetched from the translation table
 *  - text_value is translated via VALUE_TRANSLATIONS_RU map
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { product_id } = req.params as { product_id: string }

  if (!product_id) {
    return res.status(400).json({ error: "product_id is required" })
  }

  const locale = (req.headers["x-medusa-locale"] as string) || "uk-UA"

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
         sa.type,
         sa.unit,
         sa.is_filterable,
         sa.sort_order,
         COALESCE(t.translations->>'label', sa.label) AS label
       FROM product_spec_value psv
       JOIN spec_attribute sa ON sa.id = psv.attribute_id
       LEFT JOIN translation t
         ON t.reference_id = sa.id
         AND t.reference = 'spec_attribute'
         AND t.locale_code = ?
         AND t.deleted_at IS NULL
       WHERE psv.product_id = ?
         AND psv.deleted_at IS NULL
         AND sa.deleted_at IS NULL
       ORDER BY sa.sort_order, sa.slug`,
      [locale, product_id]
    )

    if (result.rows.length === 0) {
      return res.json({ product_id, specs: [] })
    }

    const isRu = locale === "ru-RU"

    const specs = result.rows.map((row: any) => {
      let textValue: string | null = row.text_value
      if (isRu && textValue && VALUE_TRANSLATIONS_RU[textValue]) {
        textValue = VALUE_TRANSLATIONS_RU[textValue]
      }

      return {
        id: row.id,
        product_id: row.product_id,
        text_value: textValue,
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
      }
    })

    return res.json({ product_id, specs })
  } catch (error) {
    console.error("[ProductSpecs API] GET /:product_id error:", error)
    return res.status(500).json({ error: "Failed to fetch product specs" })
  }
}
