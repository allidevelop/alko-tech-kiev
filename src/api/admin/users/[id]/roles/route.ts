import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { MedusaError } from "@medusajs/framework/utils"
import { ROLES, getUserRoles, type RoleName } from "../../../../../lib/rbac/permissions"

/**
 * GET /admin/users/:id/roles — get user roles
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const { id } = req.params
  const userModule = req.scope.resolve(Modules.USER)

  const user = await userModule.retrieveUser(id)
  const roles = getUserRoles(user.metadata)

  return res.json({
    roles,
    available_roles: ROLES,
  })
}

/**
 * POST /admin/users/:id/roles — set user roles
 * Body: { roles: ["content_manager", "order_manager"] }
 */
export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const { id } = req.params
  const { roles: newRoles } = req.body as { roles: string[] }

  // Only super_admin can manage roles
  const callerRoles = (req as any).user_roles as RoleName[] | undefined
  if (!callerRoles?.includes("super_admin")) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Тільки супер-адмін може керувати ролями"
    )
  }

  // Validate roles
  if (!Array.isArray(newRoles) || newRoles.length === 0) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Потрібно вказати хоча б одну роль"
    )
  }

  const validRoleNames = ROLES.map((r) => r.name)
  const invalidRoles = newRoles.filter((r) => !validRoleNames.includes(r as RoleName))
  if (invalidRoles.length > 0) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Невідомі ролі: ${invalidRoles.join(", ")}`
    )
  }

  const userModule = req.scope.resolve(Modules.USER)

  // Get existing user to preserve other metadata
  const user = await userModule.retrieveUser(id)
  const existingMetadata = user.metadata || {}

  await userModule.updateUsers({
    id,
    metadata: {
      ...existingMetadata,
      roles: newRoles,
    },
  })

  return res.json({
    roles: newRoles,
    message: "Ролі оновлено",
  })
}
