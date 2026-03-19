import CheckboxModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const CHECKBOX_MODULE = "checkbox"

export default Module(CHECKBOX_MODULE, {
  service: CheckboxModuleService,
})
