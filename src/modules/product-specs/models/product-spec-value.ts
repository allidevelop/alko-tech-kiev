import { model } from "@medusajs/framework/utils"
import SpecAttribute from "./spec-attribute"

const ProductSpecValue = model.define("product_spec_value", {
  id: model.id().primaryKey(),
  product_id: model.text(),
  text_value: model.text().translatable().nullable(),
  numeric_value: model.float().nullable(),
  attribute: model.belongsTo(() => SpecAttribute, { mappedBy: "values" }),
})

export default ProductSpecValue
