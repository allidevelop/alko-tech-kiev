export function passwordResetTemplate({
  customerName,
  resetUrl,
  storeName,
}: {
  customerName: string
  resetUrl: string
  storeName: string
}): { subject: string; html: string } {
  const subject = `Відновлення паролю — ${storeName}`

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
      <div style="text-align:center;margin-bottom:30px">
        <img src="https://alko-technics.kiev.ua/logo-alko.png" alt="AL-KO" style="height:50px">
      </div>

      <h1 style="color:#1a4a3a;font-size:24px;margin-bottom:10px">Відновлення паролю</h1>
      <p style="color:#666;font-size:16px">Шановний(а) ${customerName},</p>
      <p style="color:#666;font-size:16px">Ми отримали запит на відновлення паролю для вашого акаунту.</p>

      <div style="text-align:center;margin:30px 0">
        <a href="${resetUrl}"
           style="display:inline-block;padding:14px 32px;background:#1a4a3a;color:#fff;text-decoration:none;border-radius:6px;font-size:16px;font-weight:bold">
          Відновити пароль
        </a>
      </div>

      <div style="background:#fff3cd;border-radius:8px;padding:15px;margin:20px 0">
        <p style="margin:0;font-size:14px;color:#856404">
          <strong>Важливо:</strong> Посилання дійсне протягом 24 годин.
          Якщо ви не запитували відновлення паролю — просто проігноруйте цей лист.
        </p>
      </div>

      <p style="color:#999;font-size:13px">
        Якщо кнопка не працює, скопіюйте та вставте це посилання у браузер:<br>
        <a href="${resetUrl}" style="color:#1a4a3a;word-break:break-all">${resetUrl}</a>
      </p>

      <hr style="border:none;border-top:1px solid #eee;margin:30px 0">
      <p style="color:#999;font-size:12px;text-align:center">
        ${storeName} — офіційний дилер AL-KO в Україні<br>
        +38 099 401 95 21 | info@alko-technics.kiev.ua<br>
        <a href="https://alko-technics.kiev.ua" style="color:#1a4a3a">alko-technics.kiev.ua</a>
      </p>
    </body>
    </html>
  `

  return { subject, html }
}
