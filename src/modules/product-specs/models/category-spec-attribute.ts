import { model } from "@medusajs/framework/utils"
import SpecAttribute from "./spec-attribute"

const CategorySpecAttribute = model.define("category_spec_attribute", {
  id: model.id().primaryKey(),
  category_id: model.text(),
  sort_order: model.number().default(0),
  attribute: model.belongsTo(() => SpecAttribute, { mappedBy: "category_assignments" }),
})

export default CategorySpecAttribute
