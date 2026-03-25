import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { IMPORT_MANAGER_MODULE } from "../../../../../../modules/import-manager"
import { parseImportData, type ImportFormat } from "../../../../../../modules/import-manager/parsers"

/**
 * GET /admin/import/profiles/:id/preview — preview import (parse feed without importing)
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const { id } = req.params
  const importService = req.scope.resolve(IMPORT_MANAGER_MODULE)
  const profile = await importService.retrieveImportProfile(id)

  if (!profile.source_url) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Профіль не має URL-джерела"
    )
  }

  // Fetch the feed
  const response = await fetch(profile.source_url)
  if (!response.ok) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Помилка завантаження фіда: ${response.status} ${response.statusText}`
    )
  }

  const content = await response.text()
  const result = parseImportData(content, profile.format as ImportFormat)

  return res.json({
    total_in_feed: result.products.length,
    categories_count: result.categories?.length || 0,
    fields: result.fields,
    sample_products: result.products.slice(0, 5),
    sample_categories: result.categories?.slice(0, 10),
  })
}
