# Универсальный импорт товаров — План реализации

## Проблема

Сейчас импорт завязан на один скрипт `import-alko.ts` для одного поставщика (AL-KO XML). Менеджер без разработчика не может:
- Добавить нового поставщика
- Обновить товары из другого формата
- Настроить маппинг полей

## Целевое решение

Admin UI страница "Імпорт товарів" с поддержкой:
- Нескольких поставщиков с сохранёнными профилями маппинга
- Форматов: XML (YML/Yandex Market), CSV, Excel (XLSX), JSON
- Визуального маппинга полей (drag & drop или select)
- Предпросмотра перед импортом
- Автоматического обновления по расписанию (URL фида)

---

## Архитектура

### Модуль `import-manager`

```
src/modules/import-manager/
  index.ts
  service.ts               — ImportManagerService
  models/
    import-profile.ts      — профиль поставщика (маппинг, настройки)
    import-log.ts          — история импортов
  parsers/
    xml-parser.ts          — парсер XML (YML/Yandex Market формат)
    csv-parser.ts          — парсер CSV
    xlsx-parser.ts         — парсер Excel
    json-parser.ts         — парсер JSON
  lib/
    field-mapper.ts        — маппинг полей поставщика → Medusa + ProductSpecs
    product-sync.ts        — создание/обновление товаров
    category-matcher.ts    — маппинг категорій поставщика → наші категорії
    image-downloader.ts    — скачування та конвертація зображень
```

### Data Models

#### ImportProfile — профіль поставщика

```typescript
const ImportProfile = model.define("import_profile", {
  id: model.id().primaryKey(),
  name: model.text(),                    // "AL-KO Ukraine", "Husqvarna UA"
  slug: model.text().unique(),           // "alko-ua", "husqvarna-ua"
  format: model.text(),                  // "xml_yml", "csv", "xlsx", "json"
  source_type: model.text(),             // "url" | "file_upload"
  source_url: model.text().nullable(),   // URL фіда для автооновлення

  // Маппінг полів (JSON)
  field_mapping: model.json(),
  // Приклад:
  // {
  //   "title": "name_ua",              // поле поставщика → наше поле
  //   "description": "description_ua",
  //   "price": "price",
  //   "sku": "article",
  //   "stock": "stock_quantity",
  //   "images": "picture",             // або масив ["picture", "extra_photos"]
  //   "category": "categoryId",
  //   "specs": {                       // маппінг на ProductSpecs
  //     "Тип двигуна": "engine_type",
  //     "Ширина захвату": "cutting_width",
  //     "Engine Type": "engine_type",  // для іншого поставщика
  //   }
  // }

  // Маппінг категорій (JSON)
  category_mapping: model.json(),
  // Приклад:
  // {
  //   "9": "hazonokosarky",            // ID категорії поставщика → наш handle
  //   "Lawn Mowers": "hazonokosarky",  // або назва → наш handle
  // }

  // Налаштування
  settings: model.json(),
  // {
  //   "update_prices": true,
  //   "update_stock": true,
  //   "update_descriptions": false,
  //   "create_new_products": true,
  //   "delete_missing": false,
  //   "image_quality": 100,
  //   "image_format": "webp",
  //   "default_currency": "uah",
  //   "auto_sync_interval": "4h",      // null = тільки вручну
  // }

  is_active: model.boolean().default(true),
  last_sync_at: model.dateTime().nullable(),
})
```

#### ImportLog — журнал імпортів

```typescript
const ImportLog = model.define("import_log", {
  id: model.id().primaryKey(),
  profile_id: model.text(),              // FK → ImportProfile
  started_at: model.dateTime(),
  finished_at: model.dateTime().nullable(),
  status: model.text(),                  // "running", "completed", "failed", "cancelled"

  // Статистика
  stats: model.json(),
  // {
  //   "total_in_feed": 650,
  //   "created": 12,
  //   "updated": 580,
  //   "skipped": 58,
  //   "errors": 0,
  //   "images_downloaded": 15,
  //   "specs_synced": 8134,
  //   "duration_ms": 45000
  // }

  errors: model.json().nullable(),       // [{product: "SKU123", error: "..."}]
  triggered_by: model.text(),            // "manual", "schedule", "api"
})
```

---

## Admin UI

### Сторінка "Імпорт товарів" (Settings → Імпорт)

#### Вкладка 1: Профілі постачальників

```
┌─────────────────────────────────────────────────────┐
│  Профілі імпорту                      + Додати      │
├─────────────────────────────────────────────────────┤
│  🟢 AL-KO Ukraine                                   │
│     XML (YML) • auto кожні 4 год • 650 товарів     │
│     Останній: 20.03.2026 12:00 — 580 оновлено      │
│     [Імпортувати зараз] [Налаштування] [Історія]    │
├─────────────────────────────────────────────────────┤
│  ⚪ Husqvarna UA (неактивний)                        │
│     CSV • manual • 0 товарів                        │
│     [Активувати] [Налаштування] [Видалити]          │
└─────────────────────────────────────────────────────┘
```

#### Вкладка 2: Створення/редагування профілю

**Крок 1 — Джерело:**
- Назва постачальника
- Формат: XML / CSV / Excel / JSON
- Джерело: URL (для авто-оновлення) або Завантаження файлу
- Тестове завантаження → парсинг → показати структуру

**Крок 2 — Маппінг полів:**
```
Поле постачальника          →    Поле в магазині
─────────────────────────────────────────────────
name_ua                      →    [Назва товару     ▼]
description_ua               →    [Опис             ▼]
price                        →    [Ціна UAH         ▼]
article                      →    [SKU              ▼]
stock_quantity               →    [Залишок          ▼]
picture                      →    [Головне фото     ▼]
vendor                       →    [Бренд            ▼]
categoryId                   →    [Категорія        ▼]
```

Для `params` / характеристик — окремий маппінг:
```
Параметр постачальника       →    Атрибут в магазині
─────────────────────────────────────────────────
"Тип двигуна"                →    [engine_type      ▼]
"Ширина захвату"             →    [cutting_width    ▼]
"Engine Type"                →    [engine_type      ▼]  ← інший постачальник
"Cutting Width, cm"          →    [cutting_width    ▼]
                                  [+ Створити новий атрибут]
```

**Крок 3 — Маппінг категорій:**
```
Категорія постачальника      →    Категорія магазину
─────────────────────────────────────────────────
"Газонокосарки" (ID: 9)      →    [Газонокосарки акумуляторні ▼]
"Тримери" (ID: 15)           →    [Тримери акумуляторні       ▼]
"Lawn Mowers"                →    [Газонокосарки бензинові     ▼]
```

**Крок 4 — Налаштування:**
- ☑ Оновлювати ціни
- ☑ Оновлювати залишки
- ☐ Оновлювати описи (перезапише існуючі!)
- ☑ Створювати нові товари
- ☐ Видаляти відсутні у фіді
- Якість зображень: [100]
- Формат зображень: [WebP ▼]
- Авто-оновлення: [Кожні 4 години ▼] / Тільки вручну

**Крок 5 — Попередній перегляд:**
```
Знайдено 650 товарів у фіді

Буде створено:   12 нових товарів
Буде оновлено:   580 товарів (ціни, залишки)
Буде пропущено:  58 товарів (без змін)
Нові зображення: 15

[Почати імпорт]  [Скасувати]
```

#### Вкладка 3: Історія імпортів

```
┌──────────────────────────────────────────────────────┐
│  Дата           Профіль        Результат    Час      │
├──────────────────────────────────────────────────────┤
│  20.03 12:00    AL-KO UA       ✅ 580 онов.  45с    │
│  20.03 08:00    AL-KO UA       ✅ 3 онов.    12с    │
│  19.03 20:00    AL-KO UA       ⚠ 579 + 1 err 48с   │
│  19.03 16:00    AL-KO UA       ✅ 0 змін     8с     │
└──────────────────────────────────────────────────────┘
```

---

## Парсери

### XML (YML / Yandex Market)

Формат AL-KO, Rozetka, Prom.ua:
```xml
<yml_catalog>
  <shop>
    <offers>
      <offer id="123" available="yes">
        <name_ua>Газонокосарка</name_ua>
        <price>15899</price>
        <picture>https://...</picture>
        <param name="Тип двигуна">Безщітковий</param>
      </offer>
    </offers>
  </shop>
</yml_catalog>
```

### CSV

Стандартний формат Medusa + розширення:
```csv
title,description,price,sku,stock,spec_engine_type,spec_cutting_width
"Газонокосарка",""описание"",15899,ALKO-113278,50,Безщітковий,38
```

### Excel (XLSX)

Такий же як CSV, але в Excel. Використовуємо `xlsx` npm package.

### JSON

API-відповідь або файл:
```json
{
  "products": [
    {
      "name": "Газонокосарка",
      "price": 15899,
      "specs": { "engine_type": "Безщітковий" }
    }
  ]
}
```

---

## Автоматичне оновлення

### Scheduled Job

```
src/jobs/auto-import.ts
```

Кожні 4 години (або згідно налаштувань профілю):
1. Отримати всі активні профілі з `source_type = "url"`
2. Для кожного: завантажити фід → парсити → синхронізувати
3. Записати ImportLog

### Webhook для ручного запуску

```
POST /admin/import/profiles/:id/run
```

---

## Інтеграція з існуючими модулями

| Модуль | Взаємодія |
|--------|-----------|
| **Product** (Medusa) | Створення/оновлення товарів через Admin API |
| **ProductSpecs** (наш) | Синхронізація характеристик через field_mapping.specs |
| **Translation** (Medusa) | Автоматичний переклад нових товарів (опціонально) |
| **Inventory** (Medusa) | Оновлення залишків |
| **Pricing** (Medusa) | Оновлення цін |
| **Image** | Скачування, конвертація в WebP, оновлення thumbnail |

---

## Міграція існуючого імпорту

### Крок 1: Створити профіль "AL-KO Ukraine" автоматично

Скрипт міграції, який:
1. Створює ImportProfile зі slug "alko-ua"
2. Заповнює field_mapping з існуючого SPEC_KEY_MAP
3. Заповнює category_mapping з існуючого дерева категорій
4. Встановлює source_url = XML фід AL-KO

### Крок 2: Замінити cron job

Замінити `src/jobs/sync-prices-stock.ts` на універсальний `auto-import.ts`

### Крок 3: Деактивувати старий скрипт

Залишити `import-alko.ts` як референс, але не використовувати.

---

## Безпека

- Імпорт доступний тільки для `super_admin` та `content_manager`
- Rate limiting на завантаження файлів (макс 50 МБ)
- Валідація URL (тільки HTTPS, whitelist доменів)
- Sandbox для парсерів (timeout 60 сек на файл)
- Логування всіх дій

---

## Залежності (npm)

```
fast-xml-parser  — вже встановлений (XML парсер)
xlsx             — потрібно встановити (Excel парсер)
csv-parse        — потрібно встановити (CSV парсер)
```

---

## Timeline

| Фаза | Задачі | Час |
|------|--------|-----|
| 1. Data models + service | ImportProfile, ImportLog, міграції | 1-2 години |
| 2. Парсери | XML, CSV, XLSX, JSON | 1-2 години |
| 3. Product sync | Створення/оновлення товарів + specs | 2-3 години |
| 4. Admin UI — профілі | Список, створення, налаштування | 2-3 години |
| 5. Admin UI — маппінг | Візуальний маппінг полів + категорій | 2-3 години |
| 6. Admin UI — попередній перегляд | Preview + запуск | 1-2 години |
| 7. Автооновлення | Scheduled job + webhook | 1 година |
| 8. Міграція AL-KO профілю | Автостворення з існуючих даних | 1 година |
| **Разом** | | **~12-16 годин** |

---

## Пріоритет реалізації

1. **MVP**: Парсер XML + CSV, базовий маппінг, імпорт через Admin (без авто-оновлення)
2. **V2**: Авто-оновлення по URL, Excel парсер, попередній перегляд
3. **V3**: AI-assisted маппінг (автоматичне визначення відповідності полів), bulk translation
