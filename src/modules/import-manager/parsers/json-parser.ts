import type { ParsedProduct } from "./xml-parser"

/**
 * Parse JSON content into products
 * Supports root array or object with products key
 */
export function parseJson(jsonContent: string, rootPath?: string): ParsedProduct[] {
  const parsed = JSON.parse(jsonContent)

  let items: any[]
  if (rootPath) {
    const parts = rootPath.split(".")
    let current = parsed
    for (const part of parts) {
      current = current?.[part]
    }
    items = Array.isArray(current) ? current : current ? [current] : []
  } else if (Array.isArray(parsed)) {
    items = parsed
  } else {
    // Try common keys
    const possibleKeys = ["products", "items", "data", "offers", "records"]
    for (const key of possibleKeys) {
      if (Array.isArray(parsed[key])) {
        items = parsed[key]
        break
      }
    }
    items = items! || (typeof parsed === "object" ? [parsed] : [])
  }

  return items.map((item: any, index: number) => {
    const params: Record<string, string> = {}
    if (item.specs && typeof item.specs === "object") {
      for (const [k, v] of Object.entries(item.specs)) {
        params[k] = String(v)
      }
    }
    if (item.params && typeof item.params === "object") {
      for (const [k, v] of Object.entries(item.params)) {
        params[k] = String(v)
      }
    }

    const images: string[] = []
    if (item.image) images.push(String(item.image))
    if (item.thumbnail) images.push(String(item.thumbnail))
    if (Array.isArray(item.images)) images.push(...item.images.map(String))

    return {
      id: String(item.id || item.sku || index),
      title: item.title || item.name || "",
      description: item.description || "",
      price: item.price != null ? parseFloat(item.price) : undefined,
      sku: item.sku || item.article || item.vendorCode || "",
      stock: item.stock != null ? parseInt(item.stock) : undefined,
      images: images.length > 0 ? images : undefined,
      category_id: item.category_id || item.categoryId || undefined,
      category_name: item.category || item.category_name || undefined,
      vendor: item.vendor || item.brand || "",
      params: Object.keys(params).length > 0 ? params : undefined,
      available: item.available !== false,
    }
  })
}
