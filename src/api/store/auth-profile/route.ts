import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

// Disable default store auth (requires entity_id) so our custom middleware
// with allowUnregistered: true can handle tokens from new Google sign-ups
export const AUTHENTICATE = false

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const authIdentityId = req.auth_context?.auth_identity_id

  if (!authIdentityId) {
    return res.status(401).json({ message: "Not authenticated" })
  }

  const authModule = req.scope.resolve(Modules.AUTH)

  const authIdentity = await authModule.retrieveAuthIdentity(authIdentityId, {
    relations: ["provider_identities"],
  })

  // Find Google provider identity
  const googleIdentity = authIdentity.provider_identities?.find(
    (pi: any) => pi.provider === "google"
  )

  // Google provider stores profile in user_metadata, not provider_metadata
  const metadata = googleIdentity?.user_metadata || googleIdentity?.provider_metadata || {}

  res.json({
    email: (metadata as any).email || "",
    name: (metadata as any).name || "",
    picture: (metadata as any).picture || "",
  })
}
