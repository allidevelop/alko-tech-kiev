import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { IMPORT_MANAGER_MODULE } from "../../../../../modules/import-manager"

/**
 * GET /admin/import/profiles/:id — get profile details
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const { id } = req.params
  const importService = req.scope.resolve(IMPORT_MANAGER_MODULE)
  const profile = await importService.retrieveImportProfile(id)

  // Get recent logs
  const [logs] = await importService.listAndCountImportLogs(
    { profile_id: id },
    { order: { started_at: "DESC" }, take: 10 }
  )

  return res.json({ profile, logs })
}

/**
 * POST /admin/import/profiles/:id — update profile
 */
export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const { id } = req.params
  const importService = req.scope.resolve(IMPORT_MANAGER_MODULE)
  const profile = await importService.updateImportProfiles({
    id,
    ...(req.body as any),
  })

  return res.json({ profile })
}

/**
 * DELETE /admin/import/profiles/:id — delete profile
 */
export async function DELETE(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const { id } = req.params
  const importService = req.scope.resolve(IMPORT_MANAGER_MODULE)
  await importService.deleteImportProfiles(id)

  return res.json({ deleted: true })
}
