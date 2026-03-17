import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { getProductFeedItemsStep } from "./steps/get-product-feed-items"
import { buildProductFeedXmlStep } from "./steps/build-product-feed-xml"

type GenerateProductFeedInput = {
  currency_code: string
  country_code: string
}

const generateProductFeedWorkflow = createWorkflow(
  "generate-product-feed",
  (input: GenerateProductFeedInput) => {
    const feedItems = getProductFeedItemsStep(input)
    const xml = buildProductFeedXmlStep(feedItems)

    return new WorkflowResponse(xml)
  }
)

export default generateProductFeedWorkflow
