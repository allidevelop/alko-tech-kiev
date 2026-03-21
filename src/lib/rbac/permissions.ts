/**
 * RBAC — Role-Based Access Control
 * Roles are stored in user.metadata.roles as string[]
 * If no roles are set, user is treated as super_admin (backwards compatibility)
 */

export type RoleName = "super_admin" | "content_manager" | "order_manager" | "viewer"

export interface RoleDefinition {
  name: RoleName
  label: string
  description: string
}

export const ROLES: RoleDefinition[] = [
  {
    name: "super_admin",
    label: "Супер-адмін",
    description: "Повний доступ до всіх функцій",
  },
  {
    name: "content_manager",
    label: "Контент-менеджер",
    description: "Товари, категорії, характеристики, медіа, брендинг",
  },
  {
    name: "order_manager",
    label: "Менеджер замовлень",
    description: "Замовлення, клієнти, платежі, доставка",
  },
  {
    name: "viewer",
    label: "Тільки перегляд",
    description: "Перегляд даних без можливості редагування",
  },
]

interface RolePermissions {
  /** Regex patterns for routes with full access */
  allowed: RegExp[]
  /** Regex patterns for routes with read-only access (GET only) */
  readOnly: RegExp[]
  /** Regex patterns for explicitly denied routes */
  denied: RegExp[]
}

const ROLE_PERMISSIONS: Record<RoleName, RolePermissions> = {
  super_admin: {
    allowed: [/.*/],
    readOnly: [],
    denied: [],
  },
  content_manager: {
    allowed: [
      /^\/admin\/products/,
      /^\/admin\/product-categories/,
      /^\/admin\/product-specs/,
      /^\/admin\/collections/,
      /^\/admin\/uploads/,
      /^\/admin\/stores/,          // branding
      /^\/admin\/bulk-products/,
      /^\/admin\/bulk-categories/,
    ],
    readOnly: [
      /^\/admin\/orders/,
      /^\/admin\/customers/,
      /^\/admin\/pricing/,
      /^\/admin\/inventory/,
      /^\/admin\/stock-locations/,
      /^\/admin\/bulk-orders/,
    ],
    denied: [
      /^\/admin\/users/,
      /^\/admin\/api-keys/,
      /^\/admin\/payment/,
      /^\/admin\/settings\/roles/,
    ],
  },
  order_manager: {
    allowed: [
      /^\/admin\/orders/,
      /^\/admin\/customers/,
      /^\/admin\/payment/,
      /^\/admin\/fulfillments/,
      /^\/admin\/shipping/,
      /^\/admin\/bulk-orders/,
    ],
    readOnly: [
      /^\/admin\/products/,
      /^\/admin\/product-categories/,
      /^\/admin\/product-specs/,
      /^\/admin\/collections/,
      /^\/admin\/pricing/,
      /^\/admin\/inventory/,
      /^\/admin\/bulk-products/,
      /^\/admin\/bulk-categories/,
    ],
    denied: [
      /^\/admin\/users/,
      /^\/admin\/api-keys/,
      /^\/admin\/stores/,
      /^\/admin\/settings\/roles/,
    ],
  },
  viewer: {
    allowed: [],
    readOnly: [/.*/],
    denied: [
      /^\/admin\/users/,
      /^\/admin\/api-keys/,
      /^\/admin\/settings\/roles/,
    ],
  },
}

/** Routes that should bypass RBAC (always accessible to authenticated users) */
const BYPASS_ROUTES = [
  /^\/admin\/users\/me$/,          // user profile
  /^\/admin\/notifications/,       // notifications
]

/**
 * Check if a user with given roles has permission for a route+method
 * Returns { allowed: boolean, reason?: string }
 */
export function checkPermission(
  roles: RoleName[],
  path: string,
  method: string
): { allowed: boolean; reason?: string } {
  // Bypass routes are always accessible
  if (BYPASS_ROUTES.some((r) => r.test(path))) {
    return { allowed: true }
  }

  // If user has super_admin, always allowed
  if (roles.includes("super_admin")) {
    return { allowed: true }
  }

  // Check each role — user can have multiple roles, most permissive wins
  for (const role of roles) {
    const perms = ROLE_PERMISSIONS[role]
    if (!perms) continue

    // Check denied first — explicit denials override everything
    const isDenied = perms.denied.some((r) => r.test(path))
    if (isDenied) continue // try next role

    // Check full access
    const isAllowed = perms.allowed.some((r) => r.test(path))
    if (isAllowed) {
      return { allowed: true }
    }

    // Check read-only access
    const isReadOnly = perms.readOnly.some((r) => r.test(path))
    if (isReadOnly) {
      if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
        return { allowed: true }
      }
      // Read-only but trying to write — continue to check other roles
      continue
    }
  }

  return {
    allowed: false,
    reason: `Недостатньо прав для ${method} ${path}`,
  }
}

/**
 * Extract roles from user metadata
 * If no roles set — treat as super_admin for backwards compatibility
 */
export function getUserRoles(metadata: Record<string, unknown> | null | undefined): RoleName[] {
  if (!metadata?.roles) {
    return ["super_admin"]
  }
  const roles = metadata.roles
  if (Array.isArray(roles)) {
    return roles.filter((r): r is RoleName =>
      typeof r === "string" && ROLES.some((rd) => rd.name === r)
    )
  }
  return ["super_admin"]
}
