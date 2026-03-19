import { MedusaContainer } from "@medusajs/framework/types"
import { closeShift, getCurrentShift } from "../modules/checkbox/lib/checkbox-api"

/**
 * Closes the Checkbox fiscal shift every night at 23:00 Kyiv time.
 * Server TZ: Europe/Berlin (Kyiv = Berlin + 1h)
 */
export default async function checkboxCloseShiftJob(
  container: MedusaContainer
) {
  const logger = container.resolve("logger") as any

  if (!process.env.CHECKBOX_LICENSE_KEY || !process.env.CHECKBOX_PIN_CODE) {
    return
  }

  try {
    const shift = await getCurrentShift()

    if (!shift || shift.status !== "OPENED") {
      logger.debug("[Checkbox] No open shift to close")
      return
    }

    await closeShift()
    logger.info("[Checkbox] Night shift closed successfully")
  } catch (error) {
    logger.error(`[Checkbox] Failed to close night shift: ${error}`)
  }
}

export const config = {
  name: "checkbox-close-shift",
  // 23:00 Kyiv = 22:00 Berlin (server TZ)
  schedule: "0 22 * * *",
}
