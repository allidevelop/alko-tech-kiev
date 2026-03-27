export function orderConfirmationTemplate({
  orderNumber,
  customerName,
  items,
  total,
  shippingAddress,
  shippingMethod,
  isFreeShipping,
  paymentMethod,
  storeName,
}: {
  orderNumber: string
  customerName: string
  items: Array<{ title: string; quantity: number; price: string }>
  total: string
  shippingAddress: string
  shippingMethod?: string
  isFreeShipping?: boolean
  paymentMethod?: string
  storeName: string
}): { subject: string; html: string } {
  const subject = `Замовлення #${orderNumber} підтверджено — ${storeName}`

  const itemsHtml = items
    .map(
      (item) =>
        `<tr>
          <td style="padding:8px;border-bottom:1px solid #eee">${item.title}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${item.quantity}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${item.price}</td>
        </tr>`
    )
    .join("")

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
      <div style="text-align:center;margin-bottom:30px">
        <img src="https://alko-technics.kiev.ua/logo-alko.png" alt="AL-KO" style="height:50px">
      </div>

      <h1 style="color:#1a4a3a;font-size:24px;margin-bottom:10px">Дякуємо за замовлення!</h1>
      <p style="color:#666;font-size:16px">Шановний(а) ${customerName}, ваше замовлення #${orderNumber} прийнято.</p>

      <div style="background:#f8f9fa;border-radius:8px;padding:20px;margin:20px 0">
        <h2 style="font-size:18px;margin-top:0">Деталі замовлення</h2>
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:#e9ecef">
              <th style="padding:8px;text-align:left">Товар</th>
              <th style="padding:8px;text-align:center">Кіл-ть</th>
              <th style="padding:8px;text-align:right">Ціна</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
          <tfoot>
            <tr>
              <td colspan="2" style="padding:12px 8px;font-weight:bold;font-size:16px">Всього:</td>
              <td style="padding:12px 8px;font-weight:bold;font-size:16px;text-align:right;color:#1a4a3a">${total}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div style="background:#f0fdf4;border-radius:8px;padding:15px;margin:20px 0">
        <h3 style="margin-top:0;font-size:14px;color:#1a4a3a">🚚 Доставка</h3>
        ${shippingMethod ? `<p style="margin:0 0 5px;font-weight:bold;color:#333">${shippingMethod}</p>` : ""}
        <p style="margin:0;color:#666">${shippingAddress}</p>
        ${isFreeShipping ? `<p style="margin:8px 0 0;color:#16a34a;font-weight:bold;font-size:14px">🎁 Безкоштовна доставка!</p>` : `<p style="margin:8px 0 0;color:#666;font-size:13px">Вартість доставки — за тарифами перевізника</p>`}
      </div>

      ${paymentMethod ? `<div style="background:#f8f9fa;border-radius:8px;padding:15px;margin:20px 0">
        <h3 style="margin-top:0;font-size:14px;color:#1a4a3a">💳 Оплата</h3>
        <p style="margin:0;color:#666">${paymentMethod}</p>
      </div>` : ""}

      <div style="background:#fff3cd;border-radius:8px;padding:15px;margin:20px 0">
        <p style="margin:0;font-size:14px"><strong>Що далі?</strong></p>
        <p style="margin:5px 0 0;color:#666;font-size:14px">Наш менеджер зв'яжеться з вами для підтвердження замовлення. Відправка протягом 1-2 робочих днів.</p>
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
