import { MedusaService } from "@medusajs/framework/utils"
import SpecAttribute from "./models/spec-attribute"
import ProductSpecValue from "./models/product-spec-value"
import CategorySpecAttribute from "./models/category-spec-attribute"

class ProductSpecsModuleService extends MedusaService({
  SpecAttribute,
  ProductSpecValue,
  CategorySpecAttribute,
}) {}

export default ProductSpecsModuleService
