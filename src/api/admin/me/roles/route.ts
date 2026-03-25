import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { getUserRoles, ROLES } from "../../../../lib/rbac/permissions"

/**
 * GET /admin/me/roles — get current user's roles and permissions info
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const userId = req.auth_context.actor_id
  const userModule = req.scope.resolve(Modules.USER)

  const user = await userModule.retrieveUser(userId)
  const roles = getUserRoles(user.metadata)

  return res.json({
    user_id: userId,
    roles,
    is_super_admin: roles.includes("super_admin"),
    available_roles: ROLES,
  })
}
