export function orderShippedTemplate({
  orderNumber,
  customerName,
  trackingNumber,
  trackingUrl,
  shippingAddress,
  storeName,
}: {
  orderNumber: string
  customerName: string
  trackingNumber?: string
  trackingUrl?: string
  shippingAddress: string
  storeName: string
}): { subject: string; html: string } {
  const subject = `Замовлення #${orderNumber} відправлено — ${storeName}`

  const trackingHtml = trackingNumber
    ? `<div style="background:#e8f4fd;border-radius:8px;padding:15px;margin:20px 0;text-align:center">
        <p style="margin:0 0 8px;font-size:14px;color:#666">Номер відстеження (ТТН):</p>
        <p style="margin:0;font-size:22px;font-weight:bold;color:#1a4a3a;letter-spacing:2px">${trackingNumber}</p>
        ${
          trackingUrl
            ? `<a href="${trackingUrl}" style="display:inline-block;margin-top:12px;padding:8px 20px;background:#1a4a3a;color:#fff;text-decoration:none;border-radius:4px;font-size:14px">
                Відстежити посилку
              </a>`
            : `<a href="https://novaposhta.ua/tracking/?cargo_number=${trackingNumber}" style="display:inline-block;margin-top:12px;padding:8px 20px;background:#1a4a3a;color:#fff;text-decoration:none;border-radius:4px;font-size:14px">
                Відстежити на Nova Poshta
              </a>`
        }
      </div>`
    : `<div style="background:#f8f9fa;border-radius:8px;padding:15px;margin:20px 0">
        <p style="margin:0;color:#666">Номер ТТН буде надіслано додатково.</p>
      </div>`

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
      <div style="text-align:center;margin-bottom:30px">
        <img src="https://alko-technics.kiev.ua/logo-alko.png" alt="AL-KO" style="height:50px">
      </div>

      <h1 style="color:#1a4a3a;font-size:24px;margin-bottom:10px">Ваше замовлення відправлено!</h1>
      <p style="color:#666;font-size:16px">Шановний(а) ${customerName}, замовлення #${orderNumber} вже в дорозі до вас.</p>

      ${trackingHtml}

      <div style="background:#f0fdf4;border-radius:8px;padding:15px;margin:20px 0">
        <h3 style="margin-top:0;font-size:14px;color:#1a4a3a">Адреса доставки</h3>
        <p style="margin:0;color:#666">${shippingAddress}</p>
      </div>

      <div style="background:#f8f9fa;border-radius:8px;padding:15px;margin:20px 0">
        <p style="margin:0;font-size:14px"><strong>Терміни доставки</strong></p>
        <p style="margin:5px 0 0;color:#666;font-size:14px">Зазвичай Nova Poshta доставляє протягом 1-3 робочих днів. Оплата при отриманні.</p>
      </div>

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
