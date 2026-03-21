import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { checkPermission, getUserRoles } from "./permissions"

/**
 * RBAC middleware — checks user roles against route permissions.
 * Must be placed AFTER authenticate middleware.
 */
export async function rbacMiddleware(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  try {
    const actorId = (req as any).auth_context?.actor_id
    const actorType = (req as any).auth_context?.actor_type

    // Only apply to admin users
    if (actorType !== "user" || !actorId) {
      return next()
    }

    // Fetch user to get metadata
    const userModule = req.scope.resolve(Modules.USER)
    const user = await userModule.retrieveUser(actorId)

    const roles = getUserRoles(user.metadata)
    const { allowed, reason } = checkPermission(roles, req.path, req.method)

    if (!allowed) {
      return res.status(403).json({
        type: "forbidden",
        message: reason || "Недостатньо прав доступу",
      })
    }

    // Attach roles to request for use in routes
    ;(req as any).user_roles = roles

    return next()
  } catch (error) {
    // If RBAC check fails, don't block — log and proceed
    const logger = req.scope.resolve("logger")
    logger.warn(`RBAC check failed: ${error.message}`)
    return next()
  }
}
