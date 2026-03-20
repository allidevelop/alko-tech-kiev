#!/usr/bin/env python3
"""
Fix product-to-category assignments.
Add products to the correct PARENT categories based on spec_type/spec_engine_type.
Does NOT remove existing assignments — only adds new ones.
"""

import psycopg2
import requests
import json
import time
import sys

DB_URL = "postgres://medusa_alko:medusa_alko_2026@localhost:5432/medusa_alko"
API_BASE = "http://localhost:9000"
AUTH_EMAIL = "allidevelop@gmail.com"
AUTH_PASS = "All4sale!"

PARENT_CATEGORIES = {
    "akumulyatorna": "pcat_parent_akum_tech",
    "benzotekhnika": "pcat_parent_benz_tech",
    "sadova":        "pcat_parent_sad_tech",
    "mangaly":       "pcat_parent_mangaly",
    "nasos":         "pcat_parent_nasos",
    "akses":         "pcat_parent_akses",
}

def get_token():
    r = requests.post(f"{API_BASE}/auth/user/emailpass",
        headers={"Content-Type": "application/json"},
        json={"email": AUTH_EMAIL, "password": AUTH_PASS},
        timeout=30)
    r.raise_for_status()
    token = r.json().get("token", "")
    if not token:
        raise RuntimeError(f"No token in response: {r.text}")
    return token

def add_products_to_category(category_id, product_ids, token):
    """Add products in batches of 50."""
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    total_added = 0
    batch_size = 50
    for i in range(0, len(product_ids), batch_size):
        batch = product_ids[i:i+batch_size]
        url = f"{API_BASE}/admin/product-categories/{category_id}/products"
        r = requests.post(url, headers=headers, json={"add": batch}, timeout=60)
        if r.status_code == 401:
            print("  Token expired, re-authenticating...")
            token = get_token()
            headers["Authorization"] = f"Bearer {token}"
            r = requests.post(url, headers=headers, json={"add": batch}, timeout=60)
        if r.status_code not in (200, 201):
            print(f"  ERROR batch {i//batch_size + 1}: HTTP {r.status_code}: {r.text[:200]}")
            continue
        total_added += len(batch)
        print(f"  Batch {i//batch_size + 1}: added {len(batch)} products (total so far: {total_added})")
    return total_added, token

def main():
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    print("=== Fixing product-to-parent-category assignments ===\n")

    token = get_token()
    print(f"Got auth token: {token[:40]}...\n")

    results = {}

    # =========================================================
    # 1. АКУМУЛЯТОРНА ТЕХНІКА
    # =========================================================
    print("--- 1. Акумуляторна техніка AL-KO ---")
    cur.execute("""
        SELECT DISTINCT p.id
        FROM product p
        WHERE
          lower(p.metadata->>'spec_type') LIKE '%акумулятор%'
          OR lower(p.metadata->>'spec_type') = 'зарядний пристрій'
          OR p.metadata->>'spec_engine_type' = 'Безщітковий'
          OR p.metadata->>'spec_engine_type' = 'аккумуляторный'
    """)
    akum_ids = [row[0] for row in cur.fetchall()]
    print(f"  Found {len(akum_ids)} products for Акумуляторна техніка")
    added, token = add_products_to_category(PARENT_CATEGORIES["akumulyatorna"], akum_ids, token)
    results["Акумуляторна техніка AL-KO"] = added
    print()

    # =========================================================
    # 2. БЕНЗОТЕХНІКА
    # =========================================================
    print("--- 2. Бензотехніка AL-KO ---")
    cur.execute("""
        SELECT DISTINCT p.id
        FROM product p
        WHERE
          lower(p.metadata->>'spec_type') LIKE '%бензин%'
          OR p.metadata->>'spec_engine_type' = 'Чотирьохтактний'
          OR p.metadata->>'spec_engine_type' = 'Двотактний'
          OR lower(p.metadata->>'spec_engine_type') LIKE '%бензиновий%'
          OR lower(p.metadata->>'spec_engine_type') LIKE '%бензиновый%'
          OR p.metadata->>'spec_type' = 'Бензопили'
          OR p.metadata->>'spec_type' = 'Культиватор'
          OR p.metadata->>'spec_type' = 'Мотоблок'
    """)
    benz_ids = [row[0] for row in cur.fetchall()]
    print(f"  Found {len(benz_ids)} products for Бензотехніка")
    added, token = add_products_to_category(PARENT_CATEGORIES["benzotekhnika"], benz_ids, token)
    results["Бензотехніка AL-KO"] = added
    print()

    # =========================================================
    # 3. САДОВА ТЕХНІКА
    # =========================================================
    print("--- 3. Садова техніка AL-KO ---")
    cur.execute("""
        SELECT DISTINCT p.id
        FROM product p
        WHERE
          lower(p.metadata->>'spec_type') LIKE '%електрич%'
          OR lower(p.metadata->>'spec_type') = 'електро'
          OR p.metadata->>'spec_engine_type' = 'Щітковий'
          OR lower(p.metadata->>'spec_engine_type') LIKE '%електрич%'
          OR lower(p.metadata->>'spec_engine_type') LIKE '%электрич%'
          OR p.metadata->>'spec_type' = 'Електропили'
          OR p.metadata->>'spec_type' = 'Універсальна мийка'
          OR p.metadata->>'spec_type' = 'Садові ставки'
    """)
    sad_ids = [row[0] for row in cur.fetchall()]
    print(f"  Found {len(sad_ids)} products for Садова техніка")
    added, token = add_products_to_category(PARENT_CATEGORIES["sadova"], sad_ids, token)
    results["Садова техніка AL-KO"] = added
    print()

    # =========================================================
    # 4. МАНГАЛИ ТА ГРИЛЬ — все товары из дочерних категорий
    # =========================================================
    print("--- 4. Мангали та гриль ---")
    cur.execute("""
        SELECT DISTINCT p.id
        FROM product p
        JOIN product_category_product pcp ON pcp.product_id = p.id
        JOIN product_category pc ON pc.id = pcp.product_category_id
        WHERE pc.parent_category_id = 'pcat_parent_mangaly'
    """)
    mangaly_ids = [row[0] for row in cur.fetchall()]
    print(f"  Found {len(mangaly_ids)} products for Мангали та гриль")
    added, token = add_products_to_category(PARENT_CATEGORIES["mangaly"], mangaly_ids, token)
    results["Мангали та гриль"] = added
    print()

    # =========================================================
    # 5. НАСОСНЕ ОБЛАДНАННЯ — все товары из дочерних категорий
    # =========================================================
    print("--- 5. Насосне обладнання AL-KO ---")
    cur.execute("""
        SELECT DISTINCT p.id
        FROM product p
        JOIN product_category_product pcp ON pcp.product_id = p.id
        JOIN product_category pc ON pc.id = pcp.product_category_id
        WHERE pc.parent_category_id = 'pcat_parent_nasos'
    """)
    nasos_ids = [row[0] for row in cur.fetchall()]
    print(f"  Found {len(nasos_ids)} products for Насосне обладнання")
    added, token = add_products_to_category(PARENT_CATEGORIES["nasos"], nasos_ids, token)
    results["Насосне обладнання AL-KO"] = added
    print()

    # =========================================================
    # 6. АКСЕСУАРИ — все товары из дочерних категорий
    # =========================================================
    print("--- 6. Аксесуари та витратні матеріали ---")
    cur.execute("""
        SELECT DISTINCT p.id
        FROM product p
        JOIN product_category_product pcp ON pcp.product_id = p.id
        JOIN product_category pc ON pc.id = pcp.product_category_id
        WHERE pc.parent_category_id = 'pcat_parent_akses'
    """)
    akses_ids = [row[0] for row in cur.fetchall()]
    print(f"  Found {len(akses_ids)} products for Аксесуари та витратні матеріали")
    added, token = add_products_to_category(PARENT_CATEGORIES["akses"], akses_ids, token)
    results["Аксесуари та витратні матеріали"] = added
    print()

    # =========================================================
    # 7. САДОВА ТЕХНІКА — також додаємо всі товари з дочірніх категорій
    # (podribnyuvachi, myyky, opryskuvachi, kompostery, sadovyy-dekor)
    # =========================================================
    print("--- 7. Садова техніка AL-KO (додатково — всі товари з дочірніх категорій) ---")
    cur.execute("""
        SELECT DISTINCT p.id
        FROM product p
        JOIN product_category_product pcp ON pcp.product_id = p.id
        JOIN product_category pc ON pc.id = pcp.product_category_id
        WHERE pc.parent_category_id = 'pcat_parent_sad_tech'
    """)
    sad_child_ids = [row[0] for row in cur.fetchall()]
    # merge with already-found electric products
    all_sad_ids = list(set(sad_ids) | set(sad_child_ids))
    new_ids = list(set(sad_child_ids) - set(sad_ids))
    print(f"  Found {len(new_ids)} additional products from child categories (total with electric: {len(all_sad_ids)})")
    if new_ids:
        added2, token = add_products_to_category(PARENT_CATEGORIES["sadova"], new_ids, token)
        results["Садова техніка AL-KO"] += added2
    print()

    # =========================================================
    # SUMMARY
    # =========================================================
    print("=" * 60)
    print("SUMMARY — products added to parent categories:")
    print("=" * 60)
    total = 0
    for cat, count in results.items():
        print(f"  {cat}: {count} products added")
        total += count
    print(f"\n  TOTAL: {total} products added across all parent categories")

    cur.close()
    conn.close()

if __name__ == "__main__":
    main()
