#!/usr/bin/env python3
"""
Auto-add reviews every 2 days.
Picks 2-4 products (priority: bestsellers, ads, fewest reviews) and adds 1-2 reviews each.
Cron: 0 14 */2 * *
"""
import random
import psycopg2
from datetime import datetime, timedelta

DB_URL = "host=localhost dbname=medusa_alko user=medusa_alko password=medusa_alko_2026"
MAX_REVIEWS_PER_PRODUCT = 7

# Import from seed script
import importlib.util, os
spec = importlib.util.spec_from_file_location("seed", os.path.join(os.path.dirname(__file__), "seed-reviews.py"))
seed = importlib.util.module_from_spec(spec)
spec.loader.exec_module(seed)


def main():
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    # Get products with review counts, prioritize those with fewer reviews
    cur.execute("""
        SELECT p.id, p.title, p.metadata->>'alko_article' as sku,
               COALESCE(rc.cnt, 0) as review_count
        FROM product p
        LEFT JOIN (
            SELECT product_id, COUNT(*) as cnt FROM product_reviews WHERE status='approved' GROUP BY product_id
        ) rc ON rc.product_id = p.id
        WHERE p.deleted_at IS NULL
          AND COALESCE(rc.cnt, 0) < %s
        ORDER BY
            CASE WHEN p.metadata->>'alko_article' IN ('112924','113871','112800','113872','114040','112387') THEN 0 ELSE 1 END,
            COALESCE(rc.cnt, 0),
            RANDOM()
        LIMIT 10
    """, (MAX_REVIEWS_PER_PRODUCT,))

    candidates = cur.fetchall()
    if not candidates:
        print("All products have enough reviews")
        conn.close()
        return

    # Pick 2-4 random from top candidates
    pick_count = min(random.randint(2, 4), len(candidates))
    selected = random.sample(candidates, pick_count)

    added = 0
    for prod_id, title, sku, current_count in selected:
        reviews_to_add = random.randint(1, 2)

        for _ in range(reviews_to_add):
            rating = seed.get_rating()
            if rating == 0:
                continue

            lang = "uk" if random.random() < 0.65 else "ru"
            name = seed.get_name(lang)
            comment = seed.humanize(seed.get_template(title, lang, rating))

            # Random time within last 48 hours
            hours_ago = random.randint(1, 48)
            created = datetime.now() - timedelta(hours=hours_ago, minutes=random.randint(0, 59))

            cur.execute(
                """INSERT INTO product_reviews (product_id, name, rating, comment, status, created_at, updated_at)
                   VALUES (%s, %s, %s, %s, 'approved', %s, %s)""",
                (prod_id, name, rating, comment, created, created),
            )
            added += 1

    conn.commit()
    print(f"✅ Auto-review: added {added} reviews to {pick_count} products")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
