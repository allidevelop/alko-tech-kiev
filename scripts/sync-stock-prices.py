#!/usr/bin/env python3
"""Sync product stock and prices from AL-KO XML feed to Medusa DB."""
import urllib.request
from xml.etree import ElementTree as ET
import psycopg2
import subprocess
import sys
import json

XML_URL = "https://apipim.al-ko.ua/storage/xml_files/PriceList.xml"
DB_URL = "postgres://medusa_alko:medusa_alko_2026@localhost:5432/medusa_alko"

def main():
    # 1. Parse XML
    try:
        with urllib.request.urlopen(XML_URL, timeout=30) as resp:
            tree = ET.parse(resp)
    except Exception as e:
        print(f"ERROR: Failed to fetch XML: {e}")
        sys.exit(1)

    xml_by_article = {}
    xml_by_id = {}
    for offer in tree.iter("offer"):
        article = (offer.findtext("article", "") or "").strip()
        oid = (offer.get("id", "") or "").strip()
        stock = int(offer.findtext("stock_quantity", "0") or "0")
        price = int(float(offer.findtext("price", "0") or "0"))
        if article:
            xml_by_article[article] = {"stock": stock, "price": price}
        if oid:
            xml_by_id[oid] = {"stock": stock, "price": price}
    xml_data = xml_by_article  # backward compat

    print(f"XML: {len(xml_data)} products")

    # 2. Connect to DB
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    # 3. Update stock (both stocked_quantity AND raw_stocked_quantity — Medusa v2 uses raw_)
    cur.execute("""
        SELECT p.metadata->>'alko_article', p.metadata->>'alko_xml_id',
               il.id, il.stocked_quantity, il.raw_stocked_quantity
        FROM product p
        JOIN product_variant pv ON pv.product_id = p.id
        JOIN product_variant_inventory_item pvii ON pvii.variant_id = pv.id
        JOIN inventory_level il ON il.inventory_item_id = pvii.inventory_item_id
        WHERE p.deleted_at IS NULL
    """)
    stock_updated = 0
    for article, xml_id, level_id, db_stock, raw_stock in cur.fetchall():
        xml = xml_by_article.get(article) or xml_by_id.get(xml_id) or xml_by_id.get(article)
        if xml:
            raw_val = raw_stock.get("value", "") if raw_stock else ""
            if xml["stock"] != db_stock or str(xml["stock"]) != str(raw_val):
                raw_json = json.dumps({"value": str(xml["stock"]), "precision": 20})
                cur.execute(
                    "UPDATE inventory_level SET stocked_quantity = %s, raw_stocked_quantity = %s::jsonb WHERE id = %s",
                    (xml["stock"], raw_json, level_id),
                )
                stock_updated += 1

    # 4. Update prices
    cur.execute("""
        SELECT p.metadata->>'alko_article', p.metadata->>'alko_xml_id', pr.id, pr.amount
        FROM product p
        JOIN product_variant pv ON pv.product_id = p.id
        JOIN product_variant_price_set pvps ON pvps.variant_id = pv.id
        JOIN price pr ON pr.price_set_id = pvps.price_set_id
        WHERE p.deleted_at IS NULL AND pr.currency_code = 'uah'
    """)
    price_updated = 0
    for article, xml_id, price_id, db_amount in cur.fetchall():
        xml = xml_by_article.get(article) or xml_by_id.get(xml_id) or xml_by_id.get(article)
        if xml:
            new_amount = int(xml["price"])  # Medusa v2 stores prices in major units (UAH, not kopecks)
            if new_amount != db_amount:
                cur.execute(
                    "UPDATE price SET amount = %s, raw_amount = jsonb_build_object('value', %s::text, 'precision', 20) WHERE id = %s",
                    (new_amount, str(new_amount), price_id),
                )
                price_updated += 1

    conn.commit()
    conn.close()

    # 5. Flush Redis cache
    if stock_updated > 0 or price_updated > 0:
        try:
            subprocess.run(["redis-cli", "FLUSHALL"], capture_output=True, timeout=5)
        except Exception:
            pass

    print(f"Stock updated: {stock_updated}, Prices updated: {price_updated}")

    # 6. Telegram notification if significant changes
    if stock_updated > 10 or price_updated > 10:
        msg = f"🔄 *AL-KO Sync*\nЗалишки: {stock_updated} оновлено\nЦіни: {price_updated} оновлено"
        try:
            subprocess.run([
                "curl", "-s", "-X", "POST",
                "https://api.telegram.org/bot8080753063:AAF3JMs_4xzaJvkmy_1gtO16N8ElU_wgaSc/sendMessage",
                "-d", "chat_id=6552346228",
                "-d", "parse_mode=Markdown",
                "-d", f"text={msg}",
            ], capture_output=True, timeout=10)
        except Exception:
            pass

if __name__ == "__main__":
    main()
