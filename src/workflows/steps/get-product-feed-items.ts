import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export type FeedItem = {
  id: string
  title: string
  description: string
  link: string
  image_link: string
  additional_image_link?: string
  price: string
  availability: "in_stock" | "out_of_stock"
  condition: "new"
  brand: string
  item_group_id: string
  gtin?: string
  product_type?: string
}

type GetProductFeedItemsInput = {
  currency_code: string
  country_code: string
}

export const getProductFeedItemsStep = createStep(
  "get-product-feed-items",
  async (input: GetProductFeedItemsInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)

    const { data: products } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "title",
        "description",
        "handle",
        "thumbnail",
        "images.url",
        "variants.id",
        "variants.sku",
        "variants.barcode",
        "variants.manage_inventory",
        "variants.allow_backorder",
        "variants.inventory_quantity",
        "variants.prices.amount",
        "variants.prices.currency_code",
        "categories.name",
        "metadata",
      ],
      pagination: {
        take: null,
      },
    } as any)

    const feedItems: FeedItem[] = []

    for (const product of products as any[]) {
      if (!product.variants || product.variants.length === 0) {
        continue
      }

      const metadata = (product.metadata || {}) as Record<string, any>
      const brand = metadata.brand || "AL-KO"
      const categoryName = product.categories?.[0]?.name || undefined

      for (const variant of product.variants) {
        // Find price in the requested currency
        const priceObj = variant.prices?.find(
          (p: any) => p.currency_code === input.currency_code
        ) || variant.prices?.[0]
        const amount = priceObj?.amount
        if (!amount && amount !== 0) {
          continue
        }

        // Format price as "15899 UAH"
        const priceFormatted = `${amount} ${input.currency_code.toUpperCase()}`

        // Determine availability
        let availability: "in_stock" | "out_of_stock" = "in_stock"
        if (variant.manage_inventory) {
          const qty = variant.inventory_quantity || 0
          if (qty <= 0 && !variant.allow_backorder) {
            availability = "out_of_stock"
          }
        }

        const description = product.description
          ? product.description.substring(0, 5000)
          : product.title || ""

        const item: FeedItem = {
          id: variant.id,
          title: product.title || "",
          description,
          link: `https://alko-technics.kiev.ua/ua/products/${product.handle}`,
          image_link: product.thumbnail || "",
          price: priceFormatted,
          availability,
          condition: "new",
          brand,
          item_group_id: product.id,
        }

        // Additional image
        if (product.images && product.images.length > 1) {
          item.additional_image_link = product.images[1].url
        }

        // GTIN from barcode
        if (variant.barcode) {
          item.gtin = variant.barcode
        }

        // Product type from category
        if (categoryName) {
          item.product_type = categoryName
        }

        feedItems.push(item)
      }
    }

    return new StepResponse(feedItems)
  }
)
