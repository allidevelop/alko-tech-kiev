import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

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

  const providerMetadata = googleIdentity?.provider_metadata || {}

  res.json({
    email: (providerMetadata as any).email || "",
    name: (providerMetadata as any).name || "",
    picture: (providerMetadata as any).picture || "",
  })
}
