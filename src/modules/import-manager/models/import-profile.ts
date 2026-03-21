import { model } from "@medusajs/framework/utils"

const ImportProfile = model.define("import_profile", {
  id: model.id().primaryKey(),
  name: model.text(),
  slug: model.text(),
  format: model.text(), // "xml_yml", "csv", "xlsx", "json"
  source_type: model.text(), // "url" | "file_upload"
  source_url: model.text().nullable(),

  // Field mapping: supplier field → Medusa field
  field_mapping: model.json().default({}),
  // Category mapping: supplier category → our category handle
  category_mapping: model.json().default({}),
  // Import settings
  settings: model.json().default({}),

  is_active: model.boolean().default(true),
  last_sync_at: model.dateTime().nullable(),
})

export default ImportProfile
