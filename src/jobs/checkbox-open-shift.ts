import { MedusaContainer } from "@medusajs/framework/types"

/**
 * Opens a Checkbox fiscal shift every morning at 8:00 AM Kyiv time.
 * Server TZ: Europe/Berlin (Kyiv = Berlin + 1h)
 */
export default async function checkboxOpenShiftJob(
  container: MedusaContainer
) {
  const logger = container.resolve("logger") as any

  if (!process.env.CHECKBOX_LICENSE_KEY || !process.env.CHECKBOX_PIN_CODE) {
    return
  }

  try {
    const checkboxService = container.resolve("checkbox") as any
    await checkboxService.ensureShiftOpen()
    logger.info("[Checkbox] Morning shift opened successfully")
  } catch (error) {
    logger.error(`[Checkbox] Failed to open morning shift: ${error}`)
  }
}

export const config = {
  name: "checkbox-open-shift",
  // 8:00 Kyiv = 7:00 Berlin (server TZ)
  schedule: "0 7 * * *",
}
