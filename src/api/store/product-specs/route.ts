import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { VALUE_TRANSLATIONS_RU } from "./value-translations"

/**
 * GET /store/product-specs
 *
 * Query params (one of):
 *   ?product_id=<id>   — returns all spec values for a product
 *   ?category_id=<id>  — returns spec attribute definitions for a category
 *   (none)             — returns all spec attributes
 *
 * Supports locale via x-medusa-locale header (e.g. ru-RU):
 *  - attribute labels are fetched from the translation table
 *  - text_value is translated via VALUE_TRANSLATIONS_RU map
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { product_id, category_id } = req.query as Record<string, string>
  const locale = (req.headers["x-medusa-locale"] as string) || "uk-UA"
  const isRu = locale === "ru-RU"

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

      return res.json({ specs })
    }

    if (category_id) {
      // Return spec attribute definitions assigned to this category
      // with unique filterable values and their product counts
      const result = await pgConnection.raw(
        `SELECT
           sa.slug,
           COALESCE(t.translations->>'label', sa.label) AS label,
           sa.type,
           sa.unit,
           sa.is_filterable,
           sa.sort_order,
           psv.text_value,
           COUNT(*) AS count
         FROM category_spec_attribute csa
         JOIN spec_attribute sa ON sa.id = csa.attribute_id
         JOIN product_spec_value psv ON psv.attribute_id = sa.id
           AND psv.deleted_at IS NULL
           AND psv.text_value IS NOT NULL
         JOIN product_category_product pcp ON pcp.product_id = psv.product_id
           AND pcp.product_category_id = csa.category_id
         LEFT JOIN translation t
           ON t.reference_id = sa.id
           AND t.reference = 'spec_attribute'
           AND t.locale_code = ?
           AND t.deleted_at IS NULL
         WHERE csa.category_id = ?
           AND csa.deleted_at IS NULL
           AND sa.deleted_at IS NULL
           AND sa.is_filterable = true
         GROUP BY sa.slug, label, sa.type, sa.unit, sa.is_filterable, sa.sort_order, psv.text_value
         ORDER BY sa.sort_order, label, count DESC`,
        [locale, category_id]
      )

      // Group rows by attribute slug, collecting values with counts
      const attrMap = new Map<string, {
        slug: string
        label: string
        type: string
        unit: string | null
        is_filterable: boolean
        sort_order: number
        values: { value: string; count: number }[]
      }>()

      for (const row of result.rows) {
        if (!attrMap.has(row.slug)) {
          attrMap.set(row.slug, {
            slug: row.slug,
            label: row.label,
            type: row.type,
            unit: row.unit,
            is_filterable: row.is_filterable,
            sort_order: row.sort_order,
            values: [],
          })
        }

        let textValue: string = row.text_value
        if (isRu && textValue && VALUE_TRANSLATIONS_RU[textValue]) {
          textValue = VALUE_TRANSLATIONS_RU[textValue]
        }

        attrMap.get(row.slug)!.values.push({
          value: textValue,
          count: parseInt(row.count, 10),
        })
      }

      const attributes = Array.from(attrMap.values())

      return res.json({ attributes })
    }

    // No filters — return all spec attributes with translated labels
    const result = await pgConnection.raw(
      `SELECT
         sa.id,
         sa.slug,
         sa.type,
         sa.unit,
         sa.is_filterable,
         sa.sort_order,
         COALESCE(t.translations->>'label', sa.label) AS label
       FROM spec_attribute sa
       LEFT JOIN translation t
         ON t.reference_id = sa.id
         AND t.reference = 'spec_attribute'
         AND t.locale_code = ?
         AND t.deleted_at IS NULL
       WHERE sa.deleted_at IS NULL
       ORDER BY sa.sort_order, sa.slug`,
      [locale]
    )

    return res.json({ attributes: result.rows })
  } catch (error) {
    console.error("[ProductSpecs API] GET error:", error)
    return res.status(500).json({ error: "Failed to fetch product specs" })
  }
}
