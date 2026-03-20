# Скрейпинг описаний конкурента + AI-рерайт + обновление каталога AL-KO Store

## Задача

Интернет-магазин AL-KO Garden Store (Medusa.js v2.13) имеет 642 товара с короткими описаниями из XML-каталога (среднее 176 символов). Нужно:

1. **Спарсить** описания и характеристики с сайта конкурента `alko-instrument.kiev.ua` (тот же каталог AL-KO)
2. **Переписать** каждое описание своими словами (AI-рерайт через GPT-4o Mini)
3. **Сгенерировать** краткие и полные описания на **украинском и русском** языках
4. **Обновить** базу данных и **storefront** для двуязычного отображения

Сопоставление товаров — по артикулу (одинаковые в обоих каталогах).

---

## Техническая среда

- **Backend (Medusa):** `/home/developer/projects/alko-store/` — порт 9000
- **Storefront (Next.js):** `/home/developer/projects/alko-store-storefront/` — порт 8000 (или 3104)
- **БД:** PostgreSQL `postgres://medusa_alko:medusa_alko_2026@localhost:5432/medusa_alko`
- **Admin:** http://localhost:9000/app — `admin@alko-store.ua` / `Admin123!`

### Ключи API

В файле `.env` (корень alko-store) должен быть:
```
OPENAI_API_KEY=REDACTED_OPENAI_KEY
```

---

## Доступ к конкуренту

**ВАЖНО:** Сайт `alko-instrument.kiev.ua` блокирует все автоматизированные запросы (возвращает 403 от nginx). Доступ работает **только через Wayback Machine**.

### Получение списка URL товаров

```
GET https://web.archive.org/cdx/search/cdx?url=alko-instrument.kiev.ua/*&output=text&fl=original&collapse=urlkey&limit=2000
```

Фильтровать: только URL заканчивающиеся на `-detail` — это товарные страницы (~398 шт).

### Скачивание страницы товара

```
GET https://web.archive.org/web/2026/{original_url}
```

Пример:
```
https://web.archive.org/web/2026/https://alko-instrument.kiev.ua/ua-benzopila-al-ko-6646-premium-pro-127523
```

Rate limiting: **1 запрос / 2 секунды** (уважаем Wayback Machine).

### Язык страницы

- URL с префиксом `ua-` → **украинский** (напр. `/ua-benzopila-al-ko-...`)
- URL без префикса `ua-` → **русский** (напр. `/benzopila-al-ko-...`)

---

## Парсинг HTML конкурента (структура проверена)

### Артикул (SKU)

```html
<div class="info-product p-model"><b>Артикул:</b> <span itemprop="sku">127523</span></div>
```

Regex: `/<span itemprop=["']sku["'][^>]*>([^<]+)<\/span>/i`

### Краткое описание

```html
<div class="short_description">
  Бензопила&nbsp;Solo by Al-Ko 6646 Premium PRO потужністю 2 кВт, вагою 5,6 кг...
  <a href="javascript:void(0);" class="red-link">Читати далі...</a>
</div>
```

Regex: `/class=["']short_description["'][^>]*>([\s\S]*?)<\/div>/i`

Очистить: убрать HTML-теги, `&nbsp;` → пробел, `&quot;` → `"`, убрать "Читати далі..." / "Читать далее...", trim.

### Полное описание

```html
<div id="tab-description" class="tab-pane active">
  [Полный текст описания с HTML]
</div>
```

Regex: `/id=["']tab-description["'][^>]*>([\s\S]*?)(?:<div[^>]*id=["']tab-|<\/div>\s*<\/div>\s*<\/div>)/i`

Очистить: убрать HTML-теги, decode entities, trim, нормализовать пробелы.

### Характеристики

```html
<span class="attr-name-line">Довжина шини, дюйми/см</span>
<span class="attr-text-line">15 | 38</span>

<span class="attr-name-line">Тип двигуна</span>
<span class="attr-text-line">Бензиновий, 2-тактний</span>
```

Regex для имён: `/class=["']attr-name-line["'][^>]*>([\s\S]*?)<\/span>/gi`
Regex для значений: `/class=["']attr-text-line["'][^>]*>([\s\S]*?)<\/span>/gi`

Собрать в пары по индексу.

### Пример спарсенных данных

```json
{
  "article": "127523",
  "title": "Бензопила Solo by Al-Ko 6646 Premium PRO",
  "short_description": "Бензопила Solo by Al-Ko 6646 Premium PRO потужністю 2 кВт, вагою 5,6 кг працює з шинами довжиною 38 см (15\"). З ланцюгами з кроком 0.325\".",
  "full_description": "Потужна бензопила Solo by Al-Ko 6646 Premium PRO для вимогливих користувачів. Випущена відповідно до інноваційних технічних стандартів...",
  "characteristics": {
    "Довжина шини, дюйми/см": "15 | 38",
    "Крок ланцюга, дюйми": "0.325\"",
    "Потужність, кВт/к.с.": "2 | 2.7",
    "Тип двигуна": "Бензиновий, 2-тактний",
    "Виробник": "Solo by Al-Ko",
    "Гарантія, міс": "12",
    "Вага, кг": "5.6",
    "Країна виробництва": "Китай"
  },
  "language": "uk",
  "source_url": "https://alko-instrument.kiev.ua/ua-benzopila-al-ko-6646-premium-pro-127523"
}
```

---

## Этап 1: Скрейпинг → `src/scripts/scrape-competitor.mjs`

Standalone `.mjs` скрипт (паттерн как `src/scripts/fix-thumbnails.mjs`).

### Алгоритм

1. **Получить все URL** через CDX API → отфильтровать `*-detail` → дедупликация → ~398 URL
2. **Загрузить наши артикулы** из PostgreSQL:
   ```sql
   SELECT id, title, metadata->>'alko_article' as article, LEFT(description, 200) as current_desc
   FROM product
   WHERE deleted_at IS NULL AND metadata->>'alko_article' IS NOT NULL
   ```
   Построить `Map<article, {id, title, current_desc}>`
3. **Для каждого URL** (с rate limiting 1 запрос / 2 секунды):
   - Fetch через Wayback Machine
   - Парсить HTML (regex-ы выше)
   - Определить язык по URL (ua- prefix)
   - Найти совпадение по артикулу в нашей Map
   - Сохранить результат
4. **Сохранить** в `data/scraped-competitor.json`
5. **Вывести статистику**: всего URL, успешно спарсено, совпало с нашими, не найдено, ошибки

### Возобновление при перезапуске

При старте проверить `data/scraped-competitor.json`. Если существует — загрузить уже обработанные артикулы и пропустить их. Сохранять JSON после каждых 10 успешных скрейпов.

### Retry логика

3 попытки с задержкой 3s, 6s, 12s. Таймаут на запрос: 15 секунд.

### DB Config

```javascript
const DB_CONFIG = {
  host: "localhost",
  port: 5432,
  database: "medusa_alko",
  user: "medusa_alko",
  password: "medusa_alko_2026",
};
```

### Выходной формат `data/scraped-competitor.json`

```json
{
  "scraped_at": "2026-03-18T...",
  "stats": {
    "total_urls": 398,
    "successfully_scraped": 350,
    "matched_to_our_products": 280,
    "unmatched": 70,
    "failed": 48
  },
  "products": [
    {
      "article": "127523",
      "competitor_title": "Бензопила Solo by Al-Ko 6646 Premium PRO",
      "our_product_id": "prod_01...",
      "our_title": "Пила бензинова 6646",
      "short_description": "Бензопила потужністю 2 кВт...",
      "full_description": "Потужна бензопила для вимогливих...",
      "characteristics": {"Тип двигуна": "Бензиновий", ...},
      "language": "uk",
      "source_url": "https://alko-instrument.kiev.ua/ua-benzopila-...",
      "scraped_at": "2026-03-18T..."
    }
  ]
}
```

### Запуск

```bash
cd /home/developer/projects/alko-store
mkdir -p data
node src/scripts/scrape-competitor.mjs
```

---

## Этап 2: AI-рерайт → `src/scripts/rewrite-descriptions.mjs`

### Алгоритм

1. **Читать** `data/scraped-competitor.json`
2. **Отфильтровать**: только товары с `our_product_id` (совпавшие) и с описанием > 50 символов
3. **Для каждого товара** — вызов OpenAI API (GPT-4o Mini)
4. **Сохранить** в `data/rewritten-descriptions.json`

### OpenAI API вызов (через fetch, без SDK)

```javascript
async function callOpenAI(systemPrompt, userPrompt) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}
```

### Системный промпт

```
Ти — досвідчений копірайтер інтернет-магазину садової техніки AL-KO для українського ринку.

Твоя задача — переписати опис товару СВОЇМИ СЛОВАМИ, зробивши його повністю УНІКАЛЬНИМ.

Вимоги:
1. ПОВНА УНІКАЛЬНІСТЬ — не копіювати жодного речення дослівно, повністю перефразувати кожну думку
2. SEO-оптимізація — природно включити назву товару та ключові технічні характеристики в текст
3. Інформативність — зберегти ВСІ технічні деталі, переваги та особливості товару
4. Структура — розділити на логічні абзаци для зручного читання
5. Стиль — професійний, але зрозумілий пересічному покупцю
6. Без markdown-розмітки (без **, ##, - тощо)
7. Без емоджі
8. Короткий опис — 1-2 речення, що передають суть товару та його ключову перевагу
9. Повний опис — 3-5 абзаців з детальним описом можливостей, переваг та сфери застосування

Відповідь — ТІЛЬКИ валідний JSON (без markdown code block):
{
  "short_description_uk": "Короткий опис українською (1-2 речення, 100-200 символів)",
  "short_description_ru": "Краткое описание на русском (1-2 предложения, 100-200 символов)",
  "description_uk": "Повний опис українською (3-5 абзаців, 400-800 символів, абзаци розділені \\n\\n)",
  "description_ru": "Полное описание на русском (3-5 абзацев, 400-800 символов, абзацы разделены \\n\\n)"
}
```

### Пользовательский промпт (для каждого товара)

```
Товар: {our_title}
Артикул: {article}

Опис конкурента (для натхнення, НЕ копіювати):
{competitor_full_description}

Короткий опис конкурента:
{competitor_short_description}

Характеристики:
{characteristics_formatted — каждая на новой строке: "Ключ: Значение"}

Наш поточний опис (короткий, потрібно покращити):
{our_current_description}

Перепиши опис для нашого магазину AL-KO Garden Store.
```

### Rate limiting и retry

- 1 запрос / 1 секунда
- При 429 (rate limit): retry с exponential backoff (2s, 4s, 8s, 16s)
- При ошибке парсинга JSON: retry 2 раза
- Максимум 3 retry на товар, затем skip + лог в errors

### Возобновление

При перезапуске — загрузить существующий `data/rewritten-descriptions.json`, пропустить уже обработанные артикулы.

### Выходной формат `data/rewritten-descriptions.json`

```json
{
  "rewritten_at": "2026-03-18T...",
  "model": "gpt-4o-mini",
  "stats": {
    "total_processed": 280,
    "successful": 275,
    "failed": 5
  },
  "products": [
    {
      "article": "127523",
      "product_id": "prod_01...",
      "title": "Пила бензинова 6646",
      "short_description_uk": "Потужна бензопила AL-KO 6646 Premium PRO...",
      "short_description_ru": "Мощная бензопила AL-KO 6646 Premium PRO...",
      "description_uk": "Бензопила AL-KO 6646 Premium PRO — надійний...",
      "description_ru": "Бензопила AL-KO 6646 Premium PRO — надёжный...",
      "enriched_specs": {"spec_engine_type": "Бензиновий, 2-тактний", ...},
      "original_description": "...",
      "competitor_description": "..."
    }
  ]
}
```

### Запуск

```bash
node src/scripts/rewrite-descriptions.mjs
```

---

## Этап 3: Применение в БД → `src/scripts/apply-descriptions.mjs`

### Алгоритм

1. **Читать** `data/rewritten-descriptions.json`
2. **Backup** (при `--apply`):
   ```sql
   CREATE TABLE product_description_backup AS
   SELECT id, title, description, metadata FROM product WHERE deleted_at IS NULL;
   ```
3. **Для каждого товара** обновить:
   ```sql
   -- Украинское описание → основное поле
   UPDATE product SET description = $1 WHERE id = $2;

   -- Русское описание + краткие описания → metadata
   UPDATE product
   SET metadata = metadata || $1::jsonb
   WHERE id = $2;
   -- где $1 = {"description_ru": "...", "short_description_uk": "...", "short_description_ru": "..."}
   ```
4. **Обогащение характеристик** (только НОВЫЕ, не перезаписывая существующие):
   ```sql
   -- Добавить spec_* ключи которых нет
   UPDATE product
   SET metadata = $new_specs::jsonb || metadata
   WHERE id = $id;
   -- Порядок: new || old — old перезаписывает new, т.е. существующие значения сохраняются
   ```

### Маппинг характеристик конкурента в spec_* ключи

Характеристики конкурента могут быть на украинском ИЛИ русском. Использовать две карты маппинга.

**Украинская карта** (из `src/scripts/import-alko.ts:160-233`):
```javascript
const SPEC_KEY_MAP_UK = {
  "Виробник": "spec_brand",
  "Серія": "spec_series",
  "Тип": "spec_type",
  "Вид": "spec_kind",
  "Тип двигуна": "spec_engine_type",
  "Двигун": "spec_engine",
  "Потужність двигуна, к.с.": "spec_power_hp",
  "Напруга, В": "spec_voltage",
  "Ширина захвату": "spec_cutting_width",
  "Рекомендована площа": "spec_recommended_area",
  "Рівень шуму, дБ": "spec_noise_db",
  "Призначення": "spec_purpose",
  "Модель": "spec_model",
  "Особливості": "spec_features",
  "Гарантійні умови": "spec_warranty_terms",
  "Країна реєстрації бренду": "spec_brand_country",
  "Країна-виробник товару": "spec_made_in",
  "Матеріал": "spec_material",
  "Об'єм двигуна, куб. см": "spec_engine_cc",
  "Об'єм бака, л": "spec_tank_volume",
  "Висота скошування": "spec_cutting_height",
  "Травозбірник": "spec_grass_catcher",
  "Діаметр різання": "spec_cut_diameter",
  "Тип акумулятора": "spec_battery_type",
  "Ємність акумулятора, Аг": "spec_battery_ah",
  "Максимальний тиск, бар": "spec_max_pressure",
  "Гарантія": "spec_warranty",
  "Клас": "spec_class",
  "Колір": "spec_color",
  "Живлення": "spec_power_source",
  "Система запуску": "spec_start_system",
  "Тип палива": "spec_fuel_type",
  "Комплектація": "spec_equipment",
  "Комплект поставки": "spec_delivery_set",
  "Потужність двигуна, Вт": "spec_power_watts",
  "Потужність двигуна, кВт": "spec_power_kw",
  "Напруга акумулятора, В": "spec_battery_voltage",
  "Акумулятор в комплекті": "spec_battery_included",
  "Довжина шини, мм": "spec_bar_length",
  "Крок ланцюга, дюйм": "spec_chain_pitch",
  "Сумісність": "spec_compatibility",
  "Застосування": "spec_application",
  "Ріжуча система": "spec_cutting_system",
};
```

**Русская карта** (для русскоязычных страниц конкурента):
```javascript
const SPEC_KEY_MAP_RU = {
  "Производитель": "spec_brand",
  "Серия": "spec_series",
  "Тип": "spec_type",
  "Вид": "spec_kind",
  "Тип двигателя": "spec_engine_type",
  "Двигатель": "spec_engine",
  "Мощность двигателя, л.с.": "spec_power_hp",
  "Напряжение, В": "spec_voltage",
  "Ширина захвата": "spec_cutting_width",
  "Рекомендуемая площадь": "spec_recommended_area",
  "Уровень шума, дБ": "spec_noise_db",
  "Назначение": "spec_purpose",
  "Модель": "spec_model",
  "Особенности": "spec_features",
  "Гарантийные условия": "spec_warranty_terms",
  "Страна регистрации бренда": "spec_brand_country",
  "Страна-производитель": "spec_made_in",
  "Материал": "spec_material",
  "Объем двигателя, куб. см": "spec_engine_cc",
  "Объем бака, л": "spec_tank_volume",
  "Высота скашивания": "spec_cutting_height",
  "Травосборник": "spec_grass_catcher",
  "Диаметр среза": "spec_cut_diameter",
  "Тип аккумулятора": "spec_battery_type",
  "Емкость аккумулятора, Ач": "spec_battery_ah",
  "Максимальное давление, бар": "spec_max_pressure",
  "Гарантия": "spec_warranty",
  "Класс": "spec_class",
  "Цвет": "spec_color",
  "Питание": "spec_power_source",
  "Система запуска": "spec_start_system",
  "Тип топлива": "spec_fuel_type",
  "Комплектация": "spec_equipment",
  "Комплект поставки": "spec_delivery_set",
  "Мощность двигателя, Вт": "spec_power_watts",
  "Мощность двигателя, кВт": "spec_power_kw",
  "Напряжение аккумулятора, В": "spec_battery_voltage",
  "Аккумулятор в комплекте": "spec_battery_included",
  "Длина шины, мм": "spec_bar_length",
  "Шаг цепи, дюйм": "spec_chain_pitch",
  "Совместимость": "spec_compatibility",
  "Применение": "spec_application",
  "Режущая система": "spec_cutting_system",
  "Корпус": "spec_body_material",
  "Мощность, кВт / л.с.": "spec_power_kw",
  "Регулировка высоты": "spec_cutting_height",
  "Режимы работы": "spec_features",
  "Тип рукоятки": "spec_construction",
  "Ширина колеи, см": "spec_working_width",
  "Контейнер для сбора, л": "spec_grass_catcher",
};
```

### Режимы запуска

```bash
node src/scripts/apply-descriptions.mjs              # dry-run — показывает что будет обновлено
node src/scripts/apply-descriptions.mjs --preview 5   # показать 5 примеров с текущим и новым описанием
node src/scripts/apply-descriptions.mjs --apply        # ПРИМЕНИТЬ изменения в БД
```

### Откат (если нужно)

```sql
-- Восстановить описания из backup
UPDATE product p
SET description = b.description, metadata = b.metadata
FROM product_description_backup b
WHERE p.id = b.id;

-- Удалить backup после проверки
DROP TABLE product_description_backup;
```

---

## Этап 4: Обновление Storefront

### 4a. Краткое описание в шапке товара

**Файл:** `/home/developer/projects/alko-store-storefront/src/modules/products/templates/product-info/index.tsx`

Добавить после блока с SKU/бренд/серія/гарантія — блок краткого описания:
```tsx
// Получить locale из серверного перевода
const { t, locale } = await getServerTranslation()

// Показать краткое описание
const shortDesc = locale === "ru"
  ? metadata?.short_description_ru
  : metadata?.short_description_uk

// В JSX, после блока с характеристиками:
{shortDesc && (
  <p className="text-sm text-gray-600 leading-relaxed mt-3">
    {shortDesc}
  </p>
)}
```

### 4b. Двуязычное полное описание в табе "Про товар"

**Файл:** `/home/developer/projects/alko-store-storefront/src/modules/products/components/product-tabs/index.tsx`

Компонент `DescriptionTab` (строки 89-101) — сделать его client component с useTranslation:

```tsx
const DescriptionTab = ({ product }: { product: HttpTypes.StoreProduct }) => {
  const { locale } = useTranslation()
  const metadata = (product.metadata || {}) as Record<string, any>

  // При русской локали — показать русское описание, иначе — украинское (основное)
  const description = locale === "ru" && metadata.description_ru
    ? String(metadata.description_ru)
    : product.description

  return (
    <div className="prose prose-sm max-w-none">
      {description ? (
        <p className="text-gray-600 leading-relaxed whitespace-pre-line">
          {description}
        </p>
      ) : (
        <p className="text-gray-400">Опис товару відсутній.</p>
      )}
    </div>
  )
}
```

### 4c. Скрыть новые metadata-ключи из таблицы характеристик

**Файл:** тот же `product-tabs/index.tsx`

В `HIDDEN_META_KEYS` (строка 14-18) добавить:
```tsx
const HIDDEN_META_KEYS = new Set([
  "alko_article", "alko_vendor", "alko_url", "alko_xml_id",
  "brand", "series", "warranty",
  "video_url", "video_urls",
  // Новые поля описаний — не показывать в характеристиках
  "description_ru", "short_description_uk", "short_description_ru",
])
```

---

## Порядок выполнения

```bash
# 0. Подготовка
cd /home/developer/projects/alko-store
echo 'data/' >> .gitignore
mkdir -p data
# Убедиться что OPENAI_API_KEY есть в .env

# 1. Скрейпинг (~1-2 часа, ~398 страниц)
node src/scripts/scrape-competitor.mjs

# 2. AI-рерайт (~30-60 минут, ~280 товаров)
node src/scripts/rewrite-descriptions.mjs

# 3. Применение в БД
node src/scripts/apply-descriptions.mjs --preview 5    # Сначала preview
node src/scripts/apply-descriptions.mjs --apply         # Потом применить

# 4. Обновить storefront (ручные правки в 2 файлах)
# - product-info/index.tsx — краткое описание
# - product-tabs/index.tsx — двуязычное описание + hidden keys
```

---

## Верификация

После выполнения всех этапов:

1. **Проверить в админке:** http://localhost:9000/app → Products → открыть любой товар → описание должно быть длинным и на украинском
2. **Проверить storefront (украинский):** открыть товар → вкладка "Про товар" → украинское описание
3. **Проверить storefront (русский):** переключить язык на русский → описание на русском
4. **Краткое описание:** видно в шапке товара (под артикулом/серией)
5. **SQL-проверка:**
   ```sql
   -- Средняя длина описания (было ~176, должно стать ~500+)
   SELECT AVG(LENGTH(description)) FROM product WHERE deleted_at IS NULL;

   -- Сколько товаров получили русское описание
   SELECT COUNT(*) FROM product WHERE metadata->>'description_ru' IS NOT NULL AND deleted_at IS NULL;

   -- Сколько товаров получили краткое описание
   SELECT COUNT(*) FROM product WHERE metadata->>'short_description_uk' IS NOT NULL AND deleted_at IS NULL;
   ```

---

## Новые поля в metadata товаров (после выполнения)

| Ключ metadata | Описание | Пример |
|---------------|----------|--------|
| `short_description_uk` | Краткое описание (укр, 100-200 символов) | "Потужна бензопила AL-KO 6646 з двигуном 2 кВт..." |
| `short_description_ru` | Краткое описание (рус, 100-200 символов) | "Мощная бензопила AL-KO 6646 с двигателем 2 кВт..." |
| `description_ru` | Полное описание (рус, 400-800 символов) | "Бензопила AL-KO 6646 Premium PRO — надёжный инструмент для..." |

Основное `product.description` = полное описание на **украинском** (400-800 символов).
