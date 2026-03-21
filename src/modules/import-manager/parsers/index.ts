import { parseXmlYml, parseXmlGeneric, type ParsedProduct } from "./xml-parser"
import { parseCsv } from "./csv-parser"
import { parseJson } from "./json-parser"

export type { ParsedProduct } from "./xml-parser"

export type ImportFormat = "xml_yml" | "csv" | "json"

export interface ParseResult {
  products: ParsedProduct[]
  categories?: Array<{ id: string; name: string; parent_id?: string }>
  fields: string[]
}

/**
 * Parse import data based on format
 */
export function parseImportData(
  content: string,
  format: ImportFormat,
  options?: { delimiter?: string; rootPath?: string }
): ParseResult {
  switch (format) {
    case "xml_yml": {
      const result = parseXmlYml(content)
      const fields = extractFields(result.products)
      return { products: result.products, categories: result.categories, fields }
    }
    case "csv": {
      const products = parseCsv(content, options?.delimiter)
      const fields = extractFields(products)
      return { products, fields }
    }
    case "json": {
      const products = parseJson(content, options?.rootPath)
      const fields = extractFields(products)
      return { products, fields }
    }
    default:
      throw new Error(`Непідтримуваний формат: ${format}`)
  }
}

/**
 * Extract unique field names from parsed products
 */
function extractFields(products: ParsedProduct[]): string[] {
  const fieldSet = new Set<string>()
  for (const product of products.slice(0, 20)) {
    for (const key of Object.keys(product)) {
      if (key === "params" && product.params) {
        for (const paramKey of Object.keys(product.params)) {
          fieldSet.add(`param:${paramKey}`)
        }
      } else {
        fieldSet.add(key)
      }
    }
  }
  return Array.from(fieldSet).sort()
}
