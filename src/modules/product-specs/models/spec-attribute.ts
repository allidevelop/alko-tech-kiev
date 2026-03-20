import { model } from "@medusajs/framework/utils"

const SpecAttribute = model.define("spec_attribute", {
  id: model.id().primaryKey(),
  slug: model.text().unique(),
  label: model.text().translatable(),
  type: model.text().default("text"),
  unit: model.text().nullable(),
  is_filterable: model.boolean().default(true),
  sort_order: model.number().default(0),
  values: model.hasMany(() => ProductSpecValue, { mappedBy: "attribute" }),
  category_assignments: model.hasMany(() => CategorySpecAttribute, { mappedBy: "attribute" }),
})

export default SpecAttribute

import ProductSpecValue from "./product-spec-value"
import CategorySpecAttribute from "./category-spec-attribute"
