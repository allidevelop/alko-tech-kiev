import { defineMiddlewares, authenticate } from "@medusajs/framework/http"
import { rbacMiddleware } from "../lib/rbac/middleware"

export default defineMiddlewares({
  routes: [
    {
      matcher: "/store/auth-profile",
      middlewares: [
        authenticate("customer", ["session", "bearer"], {
          allowUnregistered: true,
        }),
      ],
    },
    // RBAC — check user roles on all admin routes
    {
      matcher: "/admin/*",
      middlewares: [rbacMiddleware],
    },
  ],
})
