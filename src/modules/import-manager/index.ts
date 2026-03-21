import ImportManagerService from "./service"
import { Module } from "@medusajs/framework/utils"

export const IMPORT_MANAGER_MODULE = "importManager"

export default Module(IMPORT_MANAGER_MODULE, {
  service: ImportManagerService,
})
