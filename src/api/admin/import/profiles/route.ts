import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { IMPORT_MANAGER_MODULE } from "../../../../modules/import-manager"

/**
 * GET /admin/import/profiles — list all import profiles
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const importService = req.scope.resolve(IMPORT_MANAGER_MODULE)
  const [profiles, count] = await importService.listAndCountImportProfiles(
    {},
    { order: { created_at: "DESC" } }
  )

  return res.json({ profiles, count })
}

/**
 * POST /admin/import/profiles — create a new import profile
 */
export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const importService = req.scope.resolve(IMPORT_MANAGER_MODULE)
  const profile = await importService.createImportProfiles(req.body as any)

  return res.json({ profile })
}
