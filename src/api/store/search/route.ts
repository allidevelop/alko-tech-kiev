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

    const productFields = [
      "id",
      "title",
      "handle",
      "thumbnail",
      "metadata",
      "variants.id",
      "variants.sku",
      "variants.prices.amount",
      "variants.prices.currency_code",
    ]

    // Run all searches in parallel
    const isNumeric = /^\d+/.test(q)

    const [titleResult, handleResult, skuResult] = await Promise.all([
      // 1. Standard title/description search
      query.graph({
        entity: "product",
        fields: productFields,
        filters: { q } as any,
        pagination: { take: limit, skip: 0 },
      }).catch(() => ({ data: [] })),

      // 2. Handle search (always, catches article numbers in handle like "alko-114058-...")
      isNumeric
        ? query.graph({
            entity: "product",
            fields: productFields,
            filters: {
              handle: { $like: `%${q.toLowerCase()}%` },
            } as any,
            pagination: { take: limit, skip: 0 },
          }).catch(() => ({ data: [] }))
        : Promise.resolve({ data: [] }),

      // 3. SKU search (for article number matches)
      isNumeric
        ? query.graph({
            entity: "product_variant",
            fields: [
              "id",
              "sku",
              "product.id",
              "product.title",
              "product.handle",
              "product.thumbnail",
              "product.metadata",
              "prices.amount",
              "prices.currency_code",
            ],
            filters: {
              sku: { $like: `%${q}%` },
            } as any,
            pagination: { take: limit, skip: 0 },
          }).catch(() => ({ data: [] }))
        : Promise.resolve({ data: [] }),
    ])

    // Merge results, prioritizing exact SKU/handle matches
    const seenIds = new Set<string>()
    const allProducts: any[] = []

    // SKU matches first (most precise for article search)
    for (const v of (skuResult.data || []) as any[]) {
      const p = v.product
      if (p && !seenIds.has(p.id)) {
        seenIds.add(p.id)
        allProducts.push({
          ...p,
          variants: [{ id: v.id, sku: v.sku, prices: v.prices }],
        })
      }
    }

    // Handle matches second
    for (const p of (handleResult.data || []) as any[]) {
      if (!seenIds.has(p.id)) {
        seenIds.add(p.id)
        allProducts.push(p)
      }
    }

    // Title/description matches last
    for (const p of (titleResult.data || []) as any[]) {
      if (!seenIds.has(p.id)) {
        seenIds.add(p.id)
        allProducts.push(p)
      }
    }

    // Search categories
    const { data: categories } = await query.graph({
      entity: "product_category",
      fields: ["id", "name", "handle", "parent_category_id"],
      filters: { q } as any,
      pagination: { take: 5, skip: 0 },
    })

    // Format results
    const formattedProducts = allProducts.slice(0, limit).map((p: any) => {
      const firstPrice = p.variants?.[0]?.prices?.[0]
      return {
        id: p.id,
        title: p.title,
        handle: p.handle,
        thumbnail: p.thumbnail,
        article: p.metadata?.article || p.metadata?.alko_article || p.variants?.[0]?.sku || null,
        price: firstPrice?.amount || null,
        currency_code: firstPrice?.currency_code || "uah",
      }
    })

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
