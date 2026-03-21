import { model } from "@medusajs/framework/utils"

const ImportLog = model.define("import_log", {
  id: model.id().primaryKey(),
  profile_id: model.text(),
  started_at: model.dateTime(),
  finished_at: model.dateTime().nullable(),
  status: model.text(), // "running", "completed", "failed", "cancelled"

  // Stats: total, created, updated, skipped, errors, duration_ms
  stats: model.json().default({}),
  // Errors: [{ product: "SKU123", error: "..." }]
  errors: model.json().nullable(),
  triggered_by: model.text(), // "manual", "schedule", "api"
})

export default ImportLog
