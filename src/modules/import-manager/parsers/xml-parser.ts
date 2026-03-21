import { XMLParser } from "fast-xml-parser"

export interface ParsedProduct {
  id: string
  title: string
  description?: string
  price?: number
  sku?: string
  stock?: number
  images?: string[]
  category_id?: string
  category_name?: string
  vendor?: string
  params?: Record<string, string>
  available?: boolean
  [key: string]: any
}

/**
 * Parse YML/Yandex Market XML format (used by AL-KO, Rozetka, Prom.ua)
 */
export function parseXmlYml(xmlContent: string): {
  products: ParsedProduct[]
  categories: Array<{ id: string; name: string; parent_id?: string }>
} {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    isArray: (name) => name === "offer" || name === "picture" || name === "param" || name === "category",
  })

  const parsed = parser.parse(xmlContent)
  const shop = parsed?.yml_catalog?.shop || parsed?.shop || {}

  // Parse categories
  const rawCategories = shop?.categories?.category || []
  const categories = rawCategories.map((cat: any) => ({
    id: String(cat["@_id"] || cat.id || ""),
    name: String(cat["#text"] || cat.name || cat),
    parent_id: cat["@_parentId"] ? String(cat["@_parentId"]) : undefined,
  }))

  // Parse offers/products
  const rawOffers = shop?.offers?.offer || []
  const products: ParsedProduct[] = rawOffers.map((offer: any) => {
    // Collect params
    const params: Record<string, string> = {}
    const rawParams = offer.param || []
    for (const p of rawParams) {
      const name = p["@_name"] || ""
      const value = p["#text"] || p.value || String(p)
      if (name) params[name] = String(value)
    }

    // Collect images
    const pictures = offer.picture || []
    const images = (Array.isArray(pictures) ? pictures : [pictures])
      .map((p: any) => String(p))
      .filter(Boolean)

    return {
      id: String(offer["@_id"] || offer.id || ""),
      title: offer.name || offer.name_ua || offer.title || "",
      description: offer.description || offer.description_ua || "",
      price: parseFloat(offer.price) || undefined,
      sku: offer.vendorCode || offer.article || offer.sku || "",
      stock: offer.stock_quantity != null ? parseInt(offer.stock_quantity) : undefined,
      images,
      category_id: offer.categoryId ? String(offer.categoryId) : undefined,
      vendor: offer.vendor || "",
      params,
      available: offer["@_available"] !== "false",
    }
  })

  return { products, categories }
}

/**
 * Parse generic XML (not YML format)
 */
export function parseXmlGeneric(xmlContent: string, rootPath?: string): ParsedProduct[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  })

  const parsed = parser.parse(xmlContent)

  // Try to find the products array
  let items: any[] = []
  if (rootPath) {
    const parts = rootPath.split(".")
    let current = parsed
    for (const part of parts) {
      current = current?.[part]
    }
    items = Array.isArray(current) ? current : current ? [current] : []
  } else {
    // Auto-detect: find first array in the document
    const findArray = (obj: any): any[] => {
      if (Array.isArray(obj)) return obj
      if (typeof obj === "object" && obj !== null) {
        for (const val of Object.values(obj)) {
          const result = findArray(val)
          if (result.length > 0) return result
        }
      }
      return []
    }
    items = findArray(parsed)
  }

  return items.map((item: any, index: number) => ({
    id: String(item.id || item["@_id"] || index),
    title: item.name || item.title || "",
    description: item.description || "",
    price: parseFloat(item.price) || undefined,
    sku: item.sku || item.article || "",
    ...item,
  }))
}
