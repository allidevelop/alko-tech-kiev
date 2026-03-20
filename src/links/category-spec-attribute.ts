import { defineLink } from "@medusajs/framework/utils"
import ProductModule from "@medusajs/medusa/product"
import ProductSpecsModule from "../modules/product-specs"

export default defineLink(
  ProductModule.linkable.productCategory,
  {
    linkable: ProductSpecsModule.linkable.categorySpecAttribute,
    isList: true,
  }
)
