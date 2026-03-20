#!/usr/bin/env python3
"""
Загружает русские переводы описаний товаров из metadata в Translation Module Medusa.
Берёт metadata->>'description_ru' и metadata->>'short_description_ru'
и сохраняет как поля description/subtitle в translations.
"""

import json
import sys
import time
import subprocess
import psycopg2
import urllib.request
import urllib.error

# ───────── конфигурация ─────────
DB_DSN = "host=localhost dbname=medusa_alko user=medusa_alko password=medusa_alko_2026"
MEDUSA_URL = "http://localhost:9000"
EMAIL = "allidevelop@gmail.com"
PASSWORD = "All4sale!"
BATCH_SIZE = 10
LOCALE = "ru-RU"
# ────────────────────────────────

def get_token():
    payload = json.dumps({"email": EMAIL, "password": PASSWORD}).encode()
    req = urllib.request.Request(
        f"{MEDUSA_URL}/auth/user/emailpass",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())
    token = data.get("token", "")
    if not token:
        raise RuntimeError(f"Не удалось получить токен: {data}")
    print(f"[auth] Токен получен: {token[:40]}...")
    return token


def api_request(method, path, body, token, retry=3):
    url = f"{MEDUSA_URL}{path}"
    payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        method=method
    )
    for attempt in range(1, retry + 1):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            body_err = e.read().decode("utf-8", errors="replace")
            if e.code == 401:
                raise RuntimeError("401 Unauthorized — нужна повторная авторизация")
            if attempt == retry:
                raise RuntimeError(f"HTTP {e.code} на {url}: {body_err[:300]}")
            print(f"  [warn] Попытка {attempt} — HTTP {e.code}, повтор...")
            time.sleep(2)
        except Exception as ex:
            if attempt == retry:
                raise
            print(f"  [warn] Попытка {attempt} — {ex}, повтор...")
            time.sleep(2)


def get_all_existing_translations(token):
    """Получает все существующие переводы product/ru-RU с их ID."""
    existing = {}  # reference_id -> {id, translations}
    offset = 0
    limit = 100
    while True:
        resp = api_request(
            "GET", f"/admin/translations?locale_code={LOCALE}&reference=product&limit={limit}&offset={offset}",
            None, token
        )
        # GET не требует body, но наша функция всегда POST — используем urllib напрямую
        break  # исправим ниже
    return existing


def get_all_existing_translations_v2(token):
    """Получает все существующие переводы product/ru-RU с их ID через GET."""
    existing = {}
    offset = 0
    limit = 100
    total = None
    while True:
        url = f"{MEDUSA_URL}/admin/translations?locale_code={LOCALE}&reference=product&limit={limit}&offset={offset}"
        req = urllib.request.Request(
            url,
            headers={"Authorization": f"Bearer {token}"},
            method="GET"
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read())
        if total is None:
            total = data["count"]
            print(f"[translations] Всего существующих переводов: {total}")
        for t in data["translations"]:
            existing[t["reference_id"]] = {
                "id": t["id"],
                "translations": t["translations"]
            }
        offset += limit
        if offset >= total:
            break
    return existing


def get_products_with_ru_desc(conn):
    """Получает товары с русскими описаниями из metadata."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT
                id,
                metadata->>'description_ru' as description_ru,
                metadata->>'short_description_ru' as short_description_ru
            FROM product
            WHERE metadata->>'description_ru' IS NOT NULL
            AND metadata->>'description_ru' != ''
            ORDER BY id
        """)
        rows = cur.fetchall()
    return rows


def push_batch(batch_create, batch_update, token):
    """Отправляет batch create/update в API."""
    body = {}
    if batch_create:
        body["create"] = batch_create
    if batch_update:
        body["update"] = batch_update
    if not body:
        return {"created": [], "updated": []}
    return api_request("POST", "/admin/translations/batch", body, token)


def main():
    print("=" * 60)
    print("Загрузка русских переводов описаний товаров")
    print("=" * 60)

    # Авторизация
    token = get_token()

    # Подключение к БД
    conn = psycopg2.connect(DB_DSN)
    print("[db] Подключение к БД установлено")

    # Получаем товары с русскими описаниями
    products = get_products_with_ru_desc(conn)
    conn.close()
    print(f"[db] Найдено товаров с description_ru: {len(products)}")

    # Получаем существующие переводы
    print("[api] Загрузка существующих переводов...")
    existing = get_all_existing_translations_v2(token)
    print(f"[api] Загружено существующих переводов: {len(existing)}")

    # Статистика
    stats = {
        "total": len(products),
        "create": 0,
        "update": 0,
        "skip": 0,
        "errors": 0,
        "processed": 0,
    }

    batch_create = []
    batch_update = []
    token_refresh_counter = 0  # обновляем токен каждые 200 продуктов

    print(f"\nНачинаю обработку {len(products)} товаров (batch={BATCH_SIZE})...")
    print("-" * 60)

    def flush_batch():
        nonlocal token, token_refresh_counter
        if not batch_create and not batch_update:
            return
        try:
            resp = push_batch(batch_create[:], batch_update[:], token)
            created_count = len(resp.get("created", []))
            updated_count = len(resp.get("updated", []))
            stats["create"] += created_count
            stats["update"] += updated_count
        except RuntimeError as e:
            if "401" in str(e):
                print("[auth] Обновление токена...")
                token = get_token()
                resp = push_batch(batch_create[:], batch_update[:], token)
                stats["create"] += len(resp.get("created", []))
                stats["update"] += len(resp.get("updated", []))
            else:
                print(f"[error] Ошибка batch: {e}")
                stats["errors"] += len(batch_create) + len(batch_update)
        batch_create.clear()
        batch_update.clear()

    for i, (prod_id, desc_ru, short_ru) in enumerate(products, 1):
        # Пропускаем если описание пустое (доп проверка)
        if not desc_ru or not desc_ru.strip():
            stats["skip"] += 1
            continue

        # Определяем новые translations fields
        new_fields = {"description": desc_ru.strip()}
        if short_ru and short_ru.strip():
            new_fields["subtitle"] = short_ru.strip()

        if prod_id in existing:
            # UPDATE — добавляем к существующим полям (title сохраняем)
            existing_trans = existing[prod_id]
            merged = dict(existing_trans["translations"])  # копия (содержит title)
            merged.update(new_fields)  # добавляем/перезаписываем description/subtitle

            # Проверяем, нужно ли обновление (уже есть такое же description?)
            if merged.get("description") == existing_trans["translations"].get("description"):
                stats["skip"] += 1
                stats["processed"] += 1
                if i % 50 == 0:
                    print(f"  [{i}/{stats['total']}] Обработано: create={stats['create']}, update={stats['update']}, skip={stats['skip']}")
                continue

            batch_update.append({
                "id": existing_trans["id"],
                "reference": "product",
                "reference_id": prod_id,
                "locale_code": LOCALE,
                "translations": merged
            })
        else:
            # CREATE
            batch_create.append({
                "reference": "product",
                "reference_id": prod_id,
                "locale_code": LOCALE,
                "translations": new_fields
            })

        stats["processed"] += 1

        # Отправляем batch
        if len(batch_create) + len(batch_update) >= BATCH_SIZE:
            flush_batch()

        # Прогресс каждые 50
        if i % 50 == 0:
            print(f"  [{i}/{stats['total']}] create={stats['create']}, update={stats['update']}, skip={stats['skip']}, errors={stats['errors']}")

        # Обновляем токен каждые 200 продуктов
        token_refresh_counter += 1
        if token_refresh_counter >= 200:
            token = get_token()
            token_refresh_counter = 0

    # Финальный flush
    flush_batch()

    print("\n" + "=" * 60)
    print("ИТОГ:")
    print(f"  Всего товаров с description_ru: {stats['total']}")
    print(f"  Обработано:                     {stats['processed']}")
    print(f"  Создано новых переводов:         {stats['create']}")
    print(f"  Обновлено существующих:          {stats['update']}")
    print(f"  Пропущено (уже актуально):       {stats['skip']}")
    print(f"  Ошибки:                          {stats['errors']}")
    print("=" * 60)


if __name__ == "__main__":
    main()
