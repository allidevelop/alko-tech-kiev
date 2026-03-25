import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { IMPORT_MANAGER_MODULE } from "../../../../../../modules/import-manager"
import { parseImportData, type ImportFormat, type ParsedProduct } from "../../../../../../modules/import-manager/parsers"

interface ImportSettings {
  update_prices?: boolean
  update_stock?: boolean
  update_descriptions?: boolean
  create_new_products?: boolean
  delete_missing?: boolean
  default_currency?: string
}

interface ImportStats {
  total_in_feed: number
  created: number
  updated: number
  skipped: number
  errors: number
  duration_ms: number
}

/**
 * POST /admin/import/profiles/:id/run — run import
 */
export async function POST(
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

  const startTime = Date.now()
  const settings = (profile.settings || {}) as ImportSettings
  const fieldMapping = (profile.field_mapping || {}) as Record<string, string>
  const categoryMapping = (profile.category_mapping || {}) as Record<string, string>

  // Create import log
  const log = await importService.createImportLogs({
    profile_id: id,
    started_at: new Date(),
    status: "running",
    stats: {},
    triggered_by: "manual",
  })

  const stats: ImportStats = {
    total_in_feed: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    duration_ms: 0,
  }
  const errors: Array<{ product: string; error: string }> = []

  try {
    // 1. Fetch and parse
    const response = await fetch(profile.source_url)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    const content = await response.text()
    const parsed = parseImportData(content, profile.format as ImportFormat)

    stats.total_in_feed = parsed.products.length

    // 2. Get existing products by SKU
    const productModule = req.scope.resolve(Modules.PRODUCT)
    const existingProducts = await productModule.listProducts(
      {},
      { take: 10000, select: ["id", "title", "metadata"] }
    )

    // Build SKU → product map from metadata
    const skuToProduct = new Map<string, any>()
    for (const product of existingProducts) {
      const sku = (product as any).metadata?.import_sku
      if (sku) skuToProduct.set(String(sku), product)
    }

    // 3. Process each parsed product
    for (const parsedProduct of parsed.products) {
      try {
        const mappedSku = getMappedValue(parsedProduct, fieldMapping, "sku") ||
          parsedProduct.sku || parsedProduct.id
        const mappedTitle = getMappedValue(parsedProduct, fieldMapping, "title") ||
          parsedProduct.title

        if (!mappedTitle) {
          stats.skipped++
          continue
        }

        const existingProduct = skuToProduct.get(mappedSku)

        if (existingProduct) {
          // Update existing product
          const updateData: Record<string, any> = {}
          let needsUpdate = false

          if (settings.update_descriptions) {
            const desc = getMappedValue(parsedProduct, fieldMapping, "description") ||
              parsedProduct.description
            if (desc) {
              updateData.description = desc
              needsUpdate = true
            }
          }

          if (needsUpdate) {
            await productModule.updateProducts(existingProduct.id, updateData)
            stats.updated++
          } else {
            stats.skipped++
          }
        } else if (settings.create_new_products !== false) {
          // Create new product
          const description = getMappedValue(parsedProduct, fieldMapping, "description") ||
            parsedProduct.description || ""

          await productModule.createProducts({
            title: mappedTitle,
            description,
            status: "draft",
            metadata: {
              import_sku: mappedSku,
              import_profile: profile.slug,
              import_vendor: parsedProduct.vendor || "",
            },
          })
          stats.created++
        } else {
          stats.skipped++
        }
      } catch (e: any) {
        stats.errors++
        errors.push({
          product: parsedProduct.sku || parsedProduct.id,
          error: e.message,
        })
      }
    }

    stats.duration_ms = Date.now() - startTime

    // Update log
    await (importService.updateImportLogs as any)({
      id: log.id,
      finished_at: new Date(),
      status: stats.errors > 0 ? "completed" : "completed",
      stats,
      errors: errors.length > 0 ? errors : null,
    })

    // Update profile last_sync_at
    await (importService.updateImportProfiles as any)({
      id: profile.id,
      last_sync_at: new Date(),
    })

    return res.json({ log_id: log.id, stats, errors })
  } catch (e: any) {
    stats.duration_ms = Date.now() - startTime

    await (importService.updateImportLogs as any)({
      id: log.id,
      finished_at: new Date(),
      status: "failed",
      stats,
      errors: [{ product: "global", error: e.message }],
    })

    throw new MedusaError(MedusaError.Types.INVALID_DATA, `Імпорт не вдався: ${e.message}`)
  }
}

/**
 * Get mapped value from parsed product using field mapping
 */
function getMappedValue(
  product: ParsedProduct,
  mapping: Record<string, string>,
  targetField: string
): string | undefined {
  // Find source field name for this target field
  const sourceField = Object.entries(mapping).find(([, target]) => target === targetField)?.[0]

  if (!sourceField) return undefined

  // Check if it's a param reference
  if (sourceField.startsWith("param:")) {
    const paramName = sourceField.replace("param:", "")
    return product.params?.[paramName]
  }

  return product[sourceField] != null ? String(product[sourceField]) : undefined
}
