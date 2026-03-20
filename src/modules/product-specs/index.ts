import ProductSpecsModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const PRODUCT_SPECS_MODULE = "productSpecs"

export default Module(PRODUCT_SPECS_MODULE, {
  service: ProductSpecsModuleService,
})
