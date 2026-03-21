import type { ParsedProduct } from "./xml-parser"

/**
 * Parse CSV content into products
 * Supports quoted fields with commas and newlines
 */
export function parseCsv(csvContent: string, delimiter = ","): ParsedProduct[] {
  const lines = splitCsvLines(csvContent)
  if (lines.length < 2) return []

  const headers = parseCsvLine(lines[0], delimiter)
  const products: ParsedProduct[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i], delimiter)
    if (values.length === 0 || (values.length === 1 && !values[0])) continue

    const item: Record<string, any> = {}
    headers.forEach((header, index) => {
      item[header.trim()] = values[index]?.trim() || ""
    })

    // Collect spec_ prefixed fields into params
    const params: Record<string, string> = {}
    for (const [key, value] of Object.entries(item)) {
      if (key.startsWith("spec_") && value) {
        params[key.replace("spec_", "")] = String(value)
      }
    }

    // Collect images
    const images: string[] = []
    if (item.image || item.thumbnail) images.push(String(item.image || item.thumbnail))
    if (item.images) {
      images.push(...String(item.images).split("|").filter(Boolean))
    }

    products.push({
      id: String(item.id || item.sku || i),
      title: item.title || item.name || "",
      description: item.description || "",
      price: item.price ? parseFloat(item.price) : undefined,
      sku: item.sku || item.article || "",
      stock: item.stock != null ? parseInt(item.stock) : undefined,
      images: images.length > 0 ? images : undefined,
      category_id: item.category_id || item.categoryId || undefined,
      category_name: item.category || item.category_name || undefined,
      vendor: item.vendor || item.brand || "",
      params: Object.keys(params).length > 0 ? params : undefined,
      available: item.available !== "false" && item.available !== "0",
    })
  }

  return products
}

function splitCsvLines(content: string): string[] {
  const lines: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < content.length; i++) {
    const char = content[i]
    if (char === '"') {
      inQuotes = !inQuotes
      current += char
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (current.trim()) lines.push(current)
      current = ""
      if (char === "\r" && content[i + 1] === "\n") i++
    } else {
      current += char
    }
  }
  if (current.trim()) lines.push(current)
  return lines
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const values: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === delimiter && !inQuotes) {
      values.push(current)
      current = ""
    } else {
      current += char
    }
  }
  values.push(current)
  return values
}
