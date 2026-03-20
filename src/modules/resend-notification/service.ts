import { Resend } from "resend"

class ResendNotificationService {
  protected resend_: Resend
  protected from_: string
  protected logger_: any

  constructor({ logger }: any) {
    this.logger_ = logger
    this.resend_ = new Resend(process.env.RESEND_API_KEY)
    this.from_ = process.env.RESEND_FROM || "AL-KO Technics <noreply@alko-technics.kiev.ua>"
  }

  async sendEmail({
    to,
    subject,
    html,
    text,
  }: {
    to: string
    subject: string
    html: string
    text?: string
  }) {
    if (!process.env.RESEND_API_KEY) {
      this.logger_.warn("[Resend] API key not configured, skipping email")
      return
    }

    try {
      const result = await this.resend_.emails.send({
        from: this.from_,
        to,
        subject,
        html,
        text,
      })
      this.logger_.info(`[Resend] Email sent to ${to}: ${subject}`)
      return result
    } catch (error) {
      this.logger_.error(`[Resend] Failed to send email to ${to}: ${error}`)
      throw error
    }
  }
}

export default ResendNotificationService
