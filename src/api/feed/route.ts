import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import generateProductFeedWorkflow from "../../workflows/generate-product-feed"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const currency_code = ((req.query.currency as string) || "uah").toLowerCase()
  const country_code = ((req.query.country as string) || "ua").toLowerCase()

  try {
    const { result: xml } = await generateProductFeedWorkflow(req.scope).run({
      input: {
        currency_code,
        country_code,
      },
    })

    res.setHeader("Content-Type", "application/xml")
    res.send(xml)
  } catch (error) {
    console.error("[Product Feed]", error)
    res.status(500).json({ error: "Failed to generate product feed" })
  }
}
