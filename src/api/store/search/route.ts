import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const q = (req.query.q as string)?.trim()
  const limit = Math.min(parseInt(req.query.limit as string) || 15, 30)

  if (!q || q.length < 2) {
    return res.json({ products: [], categories: [] })
  }

  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

    // Search products
    const { data: products } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "title",
        "handle",
        "thumbnail",
        "metadata",
        "variants.id",
        "variants.prices.amount",
        "variants.prices.currency_code",
      ],
      filters: {
        q,
      } as any,
      pagination: {
        take: Math.min(limit, 12),
        skip: 0,
      },
    })

    // Search categories
    const { data: categories } = await query.graph({
      entity: "product_category",
      fields: ["id", "name", "handle", "parent_category_id"],
      filters: {
        q,
      } as any,
      pagination: {
        take: 5,
        skip: 0,
      },
    })

    // Format product results
    const formattedProducts = (products || []).map((p: any) => {
      const firstPrice = p.variants?.[0]?.prices?.[0]
      return {
        id: p.id,
        title: p.title,
        handle: p.handle,
        thumbnail: p.thumbnail,
        article: p.metadata?.article || null,
        price: firstPrice?.amount || null,
        currency_code: firstPrice?.currency_code || "uah",
      }
    })

    // Format category results
    const formattedCategories = (categories || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      handle: c.handle,
      parent_category_id: c.parent_category_id,
    }))

    return res.json({
      products: formattedProducts,
      categories: formattedCategories,
    })
  } catch (error) {
    console.error("[Search API]", error)
    return res.status(500).json({
      products: [],
      categories: [],
      error: "Search failed",
    })
  }
}
