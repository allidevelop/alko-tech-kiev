import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { FeedItem } from "./get-product-feed-items"

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

export const buildProductFeedXmlStep = createStep(
  "build-product-feed-xml",
  async (items: FeedItem[]) => {
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>AL-KO Garden Store</title>
    <link>https://alko-technics.kiev.ua</link>
    <description>AL-KO garden equipment — Ukrainian online store</description>
`

    for (const item of items) {
      xml += `    <item>
      <g:id>${escapeXml(item.id)}</g:id>
      <title>${escapeXml(item.title)}</title>
      <description>${escapeXml(item.description)}</description>
      <link>${escapeXml(item.link)}</link>
      <g:image_link>${escapeXml(item.image_link)}</g:image_link>
`

      if (item.additional_image_link) {
        xml += `      <g:additional_image_link>${escapeXml(item.additional_image_link)}</g:additional_image_link>
`
      }

      xml += `      <g:availability>${item.availability}</g:availability>
      <g:price>${escapeXml(item.price)}</g:price>
      <g:condition>${item.condition}</g:condition>
      <g:brand>${escapeXml(item.brand)}</g:brand>
      <g:item_group_id>${escapeXml(item.item_group_id)}</g:item_group_id>
`

      if (item.gtin) {
        xml += `      <g:gtin>${escapeXml(item.gtin)}</g:gtin>
`
      }

      if (item.product_type) {
        xml += `      <g:product_type>${escapeXml(item.product_type)}</g:product_type>
`
      }

      xml += `    </item>
`
    }

    xml += `  </channel>
</rss>`

    return new StepResponse(xml)
  }
)
