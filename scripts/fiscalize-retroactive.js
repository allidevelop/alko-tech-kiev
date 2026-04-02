#!/usr/bin/env node
/**
 * Retroactive fiscalization — create Checkbox receipts for all completed orders
 * that were not fiscalized (COD was previously skipped).
 *
 * Run once: node scripts/fiscalize-retroactive.js
 */
require("dotenv").config()
const Database = require("better-sqlite3")
const path = require("path")

const API_URL = process.env.CHECKBOX_API_URL || "https://api.checkbox.ua/api/v1"
const LICENSE_KEY = process.env.CHECKBOX_LICENSE_KEY
const PIN_CODE = process.env.CHECKBOX_PIN_CODE

const DB_PATH = path.join(__dirname, "../ops/order-automation/dashboard.db")

async function cbFetch(path, method, body, token) {
  const headers = {
    "Content-Type": "application/json",
    "X-License-Key": LICENSE_KEY,
  }
  if (token) headers["Authorization"] = `Bearer ${token}`

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Checkbox ${method} ${path} ${res.status}: ${err.substring(0, 200)}`)
  }
  const text = await res.text()
  return text ? JSON.parse(text) : {}
}

async function main() {
  if (!LICENSE_KEY || !PIN_CODE) {
    console.log("ERROR: CHECKBOX_LICENSE_KEY or CHECKBOX_PIN_CODE not set")
    return
  }

  // 1. Auth
  console.log("Authenticating...")
  const auth = await cbFetch("/cashier/signinPinCode", "POST", { pin_code: PIN_CODE })
  const token = auth.access_token
  console.log("Auth OK")

  // 2. Ensure shift open
  console.log("Checking shift...")
  try {
    const shift = await cbFetch("/cashier/shift", "GET", null, token)
    if (shift.status === "OPENED") {
      console.log("Shift already open:", shift.id)
    } else {
      const newShift = await cbFetch("/shifts", "POST", {}, token)
      console.log("Shift opened:", newShift.id)
    }
  } catch (e) {
    console.log("Opening shift...")
    const newShift = await cbFetch("/shifts", "POST", {}, token)
    console.log("Shift opened:", newShift.id)
  }

  // 3. Get all completed orders from dashboard.db
  const db = new Database(DB_PATH)
  const orders = db.prepare(`
    SELECT source, external_order_id, client_name, total_price, needs_cod, products_json, status
    FROM orders
    WHERE status IN ('completed', 'delivered', 'b2b_ordered', 'declaration_saved')
      AND total_price > 0
    ORDER BY date_created ASC
  `).all()

  console.log(`\nFound ${orders.length} completed orders to fiscalize\n`)

  let created = 0
  let failed = 0

  for (const order of orders) {
    const products = JSON.parse(order.products_json || "[]")
    const totalKopecks = Math.round(order.total_price * 100)

    // Build goods
    const goods = products.map((p) => ({
      good: {
        code: p.sku || "ITEM",
        name: (p.name || "Товар").slice(0, 256),
        price: Math.round((parseFloat(p.price?.replace(/[^\d.,]/g, "").replace(",", ".")) || order.total_price) * 100),
      },
      quantity: (p.quantity || 1) * 1000,
    }))

    // All these are COD (cash)
    const payments = [{
      type: order.needs_cod ? "CASH" : "CARD",
      value: totalKopecks,
    }]

    try {
      const receipt = await cbFetch("/receipts/sell", "POST", { goods, payments }, token)
      console.log(`✅ [${order.source}] #${order.external_order_id} ${order.client_name} — ${order.total_price} грн → fiscal: ${receipt.fiscal_code || receipt.id}`)
      created++

      // Small delay to not overwhelm API
      await new Promise((r) => setTimeout(r, 500))
    } catch (e) {
      console.log(`❌ [${order.source}] #${order.external_order_id} ${order.client_name} — ${e.message.substring(0, 100)}`)
      failed++
    }
  }

  db.close()
  console.log(`\n=== Done ===`)
  console.log(`Created: ${created}`)
  console.log(`Failed: ${failed}`)
  console.log(`Total: ${orders.length}`)
}

main().catch((e) => console.error("FATAL:", e.message))
