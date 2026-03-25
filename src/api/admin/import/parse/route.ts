import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { parseImportData, type ImportFormat } from "../../../../modules/import-manager/parsers"

/**
 * POST /admin/import/parse — parse content and return fields/preview
 * Body: { content: string, format: "xml_yml" | "csv" | "json", url?: string }
 */
export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const { content, format, url } = req.body as {
    content?: string
    format: ImportFormat
    url?: string
  }

  let data: string

  if (url) {
    const response = await fetch(url)
    if (!response.ok) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Помилка завантаження: ${response.status}`
      )
    }
    data = await response.text()
  } else if (content) {
    data = content
  } else {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Потрібен content або url"
    )
  }

  try {
    const result = parseImportData(data, format)

    return res.json({
      total: result.products.length,
      categories_count: result.categories?.length || 0,
      fields: result.fields,
      sample_products: result.products.slice(0, 5),
      sample_categories: result.categories?.slice(0, 10),
    })
  } catch (e: any) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Помилка парсингу: ${e.message}`
    )
  }
}
