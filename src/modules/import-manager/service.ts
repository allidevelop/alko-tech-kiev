import { MedusaService } from "@medusajs/framework/utils"
import ImportProfile from "./models/import-profile"
import ImportLog from "./models/import-log"

class ImportManagerService extends MedusaService({
  ImportProfile,
  ImportLog,
}) {}

export default ImportManagerService
