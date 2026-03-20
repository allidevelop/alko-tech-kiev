import { Module } from "@medusajs/framework/utils"
import ResendNotificationService from "./service"

export default Module("resend_notification", {
  service: ResendNotificationService,
})
