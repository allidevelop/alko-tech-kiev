# Phase 18-21: SEO-оптимизация категорий

Ты работаешь над сторфронтом AL-KO интернет-магазина Alko-Technics (alko-technics.kiev.ua).

## Контекст проекта
- Бэкенд: Medusa.js v2.13 — `/home/developer/projects/alko-store/`
- Сторфронт: Next.js 15 — `/home/developer/projects/alko-store-storefront/`
- БД: PostgreSQL 16, database `medusa_alko`, user `medusa_alko`, password `medusa_alko_2026`
- PM2: `alko-storefront` (id 34), `alko-backend` (id 35)

## Текущая структура категорий
- 35 категорий, все ПЛОСКИЕ (нет иерархии parent→child)
- Названия БЕЗ бренда ("Газонокосарки", а не "Газонокосарки AL-KO")
- Описания (`description`) ПУСТЫЕ
- `metadata` содержит только `{"icon": "...", "xml_id": "..."}`

## Конкурент (alko-instrument.kiev.ua) — паттерн для подражания
У конкурента:
1. Бренд "Al-Ko" в КАЖДОМ названии категории
2. Иерархия: 5 групп верхнего уровня → подкатегории
3. Развёрнутый SEO-текст на каждой категории (3-4 блока: описание, преимущества, как выбрать, почему у нас)

## ЗАДАЧИ

### Phase 18: Добавить "AL-KO" в названия категорий

В таблице `product_category` обновить поле `name`, добавив "AL-KO" в конце.

**ПРАВИЛА:**
- Категории с товарами ТОЛЬКО бренда AL-KO/solo by AL-KO → добавить "AL-KO" (пример: "Газонокосарки" → "Газонокосарки AL-KO")
- Категории с товарами РАЗНЫХ брендов (Mowox, OREGON, Briggs&Stratton) → НЕ добавлять "AL-KO"
- Проверяй бренд через: `SELECT DISTINCT p.metadata->>'brand' FROM product p JOIN product_category_product pcp ON pcp.product_id = p.id WHERE pcp.product_category_id = '<cat_id>'`
- Если в категории ТОЛЬКО AL-KO и solo by AL-KO → добавлять
- Если есть другие бренды → оставить как есть

**SQL для обновления:**
```sql
UPDATE product_category SET name = 'Газонокосарки AL-KO' WHERE id = '...' AND deleted_at IS NULL;
```

**ВАЖНО:** НЕ менять handle! Handle должен остаться прежним (`hazonokosarky`, не `hazonokosarky-al-ko`).

### Phase 19: Создать иерархию категорий (parent→child)

Создать 5 РОДИТЕЛЬСКИХ категорий верхнего уровня и привязать к ним существующие категории как дочерние.

**Родительские категории (создать новые):**

1. **Акумуляторна техніка AL-KO** (handle: `akumulyatorna-tekhnika-al-ko`)
   - Дочерние: Газонокосарки, Аератори, Кущорізи, Повітродувки, Висоторізи, Тримери та мотокоси, Аккумулятори та зарядні пристрої

2. **Бензотехніка AL-KO** (handle: `benzotekhnika-al-ko`)
   - Дочерние: Пили, Культиватори та мотоблоки, Генератори, Мотопомпи, Снігоприбиральна техніка, Двигуни

3. **Садова техніка AL-KO** (handle: `sadova-tekhnika-al-ko`)
   - Дочерние: Подрібнювачі, Компостери садові, Оприскувачі, Мийки, Садовий декор

4. **Насосне обладнання AL-KO** (handle: `nasosne-obladnannya-al-ko`)
   - Дочерние: Заглиблювальні насоси, Поверхневі насоси, Комплектуючі до насосів, Шланги

5. **Аксесуари та витратні матеріали** (handle: `aksesuary-ta-vytratni-materialy`)
   - Дочерние: Аксесуари для садової техніки, Витратні матеріали для мотокос, Ланцюги та шини для ланцюгових пил, Моторні оливи, Гідравлічні масла, Спеціалізована хімія

Оставшиеся мелкие категории:
- Мангали, барбекю, гриль + Аксесуари для мангалів → создать родительскую **Мангали та гриль** (handle: `manhaly-ta-hryl`)
- Каністри автомобільні, Навісне обладнання, Ліхтарі, Пристрої протискользіння → в группу **Аксесуари та витратні матеріали**
- Грилі → в группу **Мангали та гриль**

**Как создать родительскую категорию через Medusa Admin API:**
```bash
# Сначала получи auth token
TOKEN=$(curl -s -X POST http://0.0.0.0:9000/auth/user/emailpass -H 'Content-Type: application/json' -d '{"email":"admin@alko-technics.kiev.ua","password":"admin123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# Создать родительскую категорию
curl -s -X POST http://0.0.0.0:9000/admin/product-categories \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Акумуляторна техніка AL-KO", "handle": "akumulyatorna-tekhnika-al-ko", "is_active": true, "is_internal": false}'

# Привязать дочернюю
curl -s -X POST http://0.0.0.0:9000/admin/product-categories/<child_id> \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"parent_category_id": "<parent_id>"}'
```

Если Admin API не работает — используй SQL напрямую:
```sql
INSERT INTO product_category (id, name, handle, description, is_active, is_internal, rank, parent_category_id, metadata, created_at, updated_at)
VALUES (
  'pcat_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 27),
  'Акумуляторна техніка AL-KO',
  'akumulyatorna-tekhnika-al-ko',
  '',
  true, false, 0, NULL, '{}',
  NOW(), NOW()
);
```

**Привязать дочернюю:**
```sql
UPDATE product_category SET parent_category_id = '<parent_id>' WHERE id = '<child_id>';
```

**ВАЖНО:**
- НЕ перемещать товары! Товары остаются привязаны к текущим (теперь дочерним) категориям
- Родительские категории — это группы для навигации, у них НЕТ привязанных товаров напрямую
- Сторфронт уже поддерживает `category_children` и `parent_category` (см. `src/modules/categories/templates/index.tsx` строки 81-155)

### Phase 20: Сгенерировать SEO-описания для ВСЕХ категорий

Для каждой категории (и родительской, и дочерней) нужно:
1. Записать `description` — короткое описание (1-2 предложения, для meta description, 120-160 символів)
2. Записать в `metadata` поле `seo_text` — развёрнутый SEO-текст в HTML формате

**Формат `seo_text` (HTML, хранится в metadata->>'seo_text'):**
```html
<h2>Заголовок секції (з ключовим словом і брендом)</h2>
<p>Вступний абзац з ключовими словами та брендом.</p>

<h3>Переваги / Особливості</h3>
<ul>
<li><strong>Пункт 1</strong> — опис переваги.</li>
<li><strong>Пункт 2</strong> — опис переваги.</li>
</ul>

<h3>Як вибрати / На що звернути увагу</h3>
<p>Порадний абзац для покупця.</p>

<h3>Чому варто купити у Alko-Technics</h3>
<ul>
<li>Оригінальна продукція з гарантією</li>
<li>Швидка доставка по Україні</li>
<li>Консультації фахівців</li>
</ul>
```

**Генерация через Claude CLI:**
Напиши скрипт `src/scripts/generate-category-seo.mjs` который:
1. Получает все категории из БД
2. Для каждой вызывает `claude -p` с промптом
3. Записывает `description` и `metadata.seo_text` в БД

**Системный промпт:**
```
Ти — SEO-копірайтер інтернет-магазину садової техніки Alko-Technics (alko-technics.kiev.ua).
Напиши SEO-оптимізований текст для категорії товарів УКРАЇНСЬКОЮ мовою.

Формат відповіді — ТІЛЬКИ валідний JSON (без markdown code block):
{
  "description": "Короткий опис категорії (1-2 речення, 120-160 символів, для meta description)",
  "seo_text": "HTML-текст з h2, h3, p, ul, li тегами (3-4 секції, 500-800 слів)"
}

Вимоги:
1. Природне використання ключових слів (назва категорії + бренд + синоніми)
2. H2 — головний заголовок з назвою категорії та брендом
3. H3 — підзаголовки секцій
4. Списки ul/li для переваг та критеріїв вибору
5. Фінальна секція "Чому варто купити у Alko-Technics"
6. Без markdown — тільки HTML теги
7. Без емоджі
8. Магазин називається Alko-Technics (НЕ "алко-інструмент")
```

**User-промпт для каждой категории:**
```
Категорія: {category.name}
Кількість товарів: {product_count}
Приклади товарів: {top_5_product_titles}
```

**Записать в БД:**
```sql
UPDATE product_category
SET description = $1,
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('seo_text', $2)
WHERE id = $3;
```

### Phase 21: Обновить фронтенд для отображения SEO-текста

**1. Добавить `+metadata` в запрос категорий**

Файл: `src/lib/data/categories.ts`

В функции `getCategoryByHandle` изменить fields:
```typescript
// БЫЛО:
fields: "*category_children, *products",
// СТАЛО:
fields: "*category_children, *products, +metadata",
```

**2. Добавить SEO-текст внизу страницы категории**

Файл: `src/modules/categories/templates/index.tsx`

После `</ProductGridWrapper>` (после строки 174) добавить:
```tsx
{/* SEO content below products */}
{(category.metadata as Record<string, any>)?.seo_text && (
  <div
    className="mt-12 prose prose-sm max-w-none text-gray-600 border-t border-gray-200 pt-8"
    dangerouslySetInnerHTML={{
      __html: (category.metadata as Record<string, any>).seo_text
    }}
  />
)}
```

**3. Улучшить canonical URL в meta**

Файл: `src/app/[countryCode]/(main)/categories/[...category]/page.tsx`

В функции `generateMetadata` обновить canonical:
```typescript
alternates: {
  canonical: `https://alko-technics.kiev.ua/ua/categories/${params.category.join("/")}`,
},
```

**4. ПОСЛЕ всех изменений:**
```bash
cd /home/developer/projects/alko-store-storefront && npm run build && pm2 restart alko-storefront
```

### Phase 22: Исправить визуальное отображение каталога и страниц родительских категорий

После создания иерархии возникли проблемы:
1. Страница `/store` (каталог) — показывает только родительские категории с 📦 вместо картинок (потому что у них нет товаров напрямую)
2. Страницы родительских категорий — показывают "Немає товарів" (товары в дочерних категориях)
3. Подкатегории — просто текстовые ссылки без картинок

**Задача 22.1: Исправить страницу каталога `/store`**

Файл: `src/modules/store/templates/index.tsx`

Сейчас фильтрует `!c.parent_category_id` (строка 25) — показывает только родительские. Нужно переделать:

Вместо того чтобы показывать родительские категории, показывать **дочерние** (leaf) категории — те, у которых есть товары. Также для каждой плитки брать thumbnail от первого товара в категории. Дополнительно — для плитки показывать количество товаров.

**Изменить строку 24-26:**
```typescript
// БЫЛО:
const topCategories = (categories || []).filter(
  (c) => !c.parent_category_id
)

// СТАЛО: показывать категории у которых есть товары (leaf categories)
const topCategories = (categories || []).filter(
  (c) => c.parent_category_id !== null || (c.category_children?.length === 0)
)
```

НО это не идеальный подход. Лучший вариант — показывать на странице каталога **родительские категории КАК КАРТОЧКИ С КАРТИНКАМИ**, где картинка берётся от первого товара в первой дочерней категории:

```typescript
const parentCategories = (categories || []).filter(
  (c) => !c.parent_category_id && c.category_children && c.category_children.length > 0
)

// For each parent, count total products across all children and get a preview thumbnail
const categoryPreviews = await Promise.all(
  parentCategories.map(async (parent) => {
    const childIds = parent.category_children!.map((ch) => ch.id)
    let totalCount = 0
    let thumbnail: string | null = null

    for (const childId of childIds) {
      try {
        const { response } = await listProducts({
          countryCode,
          queryParams: { category_id: [childId], limit: 1 },
        })
        totalCount += response.count
        if (!thumbnail && response.products[0]?.thumbnail) {
          thumbnail = response.products[0].thumbnail
        }
      } catch {}
    }

    return { category: parent, thumbnail, count: totalCount }
  })
)
```

Также убрать fallback с 📦 emoji и заменить на красивый SVG-placeholder или просто серый фон с названием.

**Задача 22.2: Исправить страницы родительских категорий**

Файл: `src/modules/categories/templates/index.tsx`

Для родительских категорий (у которых есть `category_children` и нет товаров напрямую) — НЕ показывать сетку товаров с фильтрами. Вместо этого показывать **красивые плитки подкатегорий** с:
- Картинка из первого товара подкатегории (thumbnail)
- Название подкатегории
- Количество товаров

Логика:
```typescript
const isParentCategory = category.category_children && category.category_children.length > 0

// Если это родительская категория — показать плитки дочерних категорий
// Если это дочерняя (leaf) — показать товары как обычно
```

Для родительской категории вместо `ProductGridWrapper` + `PaginatedProducts` показывать:
```tsx
{isParentCategory ? (
  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
    {/* Плитки подкатегорий с картинками */}
    {childPreviews.map(({ child, thumbnail, count }) => (
      <LocalizedClientLink
        key={child.id}
        href={`/categories/${child.handle}`}
        className="group bg-white rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all duration-300 overflow-hidden flex flex-col"
      >
        <div className="aspect-square bg-white overflow-hidden relative">
          {thumbnail ? (
            <Thumbnail thumbnail={thumbnail} size="full" className="..." />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-50">
              <span className="text-gray-400 text-sm">{child.name}</span>
            </div>
          )}
          <span className="absolute top-2 right-2 bg-white/90 text-xs font-medium text-gray-600 px-2 py-1 rounded-full border border-gray-100">
            {count} товарів
          </span>
        </div>
        <div className="p-3 sm:p-4 border-t border-gray-50">
          <h3 className="text-sm font-semibold text-gray-800 group-hover:text-[var(--color-primary)] transition-colors line-clamp-2 text-center">
            {child.name}
          </h3>
        </div>
      </LocalizedClientLink>
    ))}
  </div>
) : (
  /* Обычная сетка товаров для leaf-категорий */
  <ProductGridWrapper ...>
    ...
  </ProductGridWrapper>
)}
```

Для этого нужно в компоненте CategoryTemplate загрузить thumbnails для дочерних категорий. Это серверный компонент, поэтому можно сделать fetch:

```typescript
// Fetch child category thumbnails (only for parent categories)
const childPreviews = isParentCategory
  ? await Promise.all(
      category.category_children!.map(async (child) => {
        try {
          const { response } = await listProducts({
            countryCode,
            queryParams: { category_id: [child.id], limit: 1 },
          })
          return {
            child,
            thumbnail: response.products[0]?.thumbnail || null,
            count: response.count,
          }
        } catch {
          return { child, thumbnail: null, count: 0 }
        }
      })
    )
  : []
```

Не забудь добавить необходимые импорты (`Thumbnail`, `listProducts`).

**Задача 22.3: Не забыть сделать `npm run build && pm2 restart alko-storefront` после Phase 22!**

### Phase 23: Мобильные фильтры + Sticky "Купити" кнопка

**Задача 23.1: Мобильные фильтры — спрятать за кнопку**

Файл: `src/modules/categories/templates/index.tsx` (и/или компонент фильтров)

Сейчас на мобилке фильтры полностью развёрнуты вверху страницы — это плохое UX. Нужно:

1. На мобилке (`sm:` и ниже) скрыть sidebar с фильтрами по умолчанию
2. Показать кнопку "Фільтри" (с иконкой) вверху, при нажатии — фильтры выезжают как drawer/sheet снизу или сбоку
3. На десктопе — оставить как есть (sidebar слева)

Реализация:
- Создать клиентский компонент `MobileFilterDrawer` (или использовать существующий)
- Использовать `useState` для open/close
- Кнопка: `<button className="sm:hidden flex items-center gap-2 px-4 py-2 border rounded-lg"><SlidersHorizontal className="w-4 h-4" /> Фільтри</button>`
- Drawer: overlay + slide-in panel с фильтрами, кнопка "Застосувати" внизу
- Sidebar на десктопе: добавить `hidden sm:block` к `<aside>`

**Задача 23.2: Sticky "Купити" кнопка на странице товара**

Файл: `src/modules/products/templates/index.tsx` (или product-actions)

На странице товара, когда пользователь скроллит вниз и кнопка "Купити" уходит из viewport:
- Показать **sticky bottom bar** с ценой и кнопками "Купити" / "Швидке замовлення"
- На мобилке: полная ширина, фиксированная внизу экрана
- На десктопе: компактная полоса внизу с ценой слева и кнопками справа

Реализация:
- Клиентский компонент `StickyAddToCart`
- Использовать `IntersectionObserver` чтобы отслеживать, когда оригинальная кнопка "Купити" выходит из viewport
- Когда она невидима → показать sticky bar снизу с `fixed bottom-0 left-0 right-0 z-40`
- Плавная анимация появления: `transition-transform duration-300`

```tsx
"use client"
import { useState, useEffect, useRef } from "react"

const StickyAddToCart = ({ product, children }: { product: any, children: React.ReactNode }) => {
  const [isSticky, setIsSticky] = useState(false)
  const targetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setIsSticky(!entry.isIntersecting),
      { threshold: 0 }
    )
    if (targetRef.current) observer.observe(targetRef.current)
    return () => observer.disconnect()
  }, [])

  return (
    <>
      <div ref={targetRef}>{children}</div>
      {/* Sticky bar */}
      <div className={`fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-lg transition-transform duration-300 ${isSticky ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="content-container flex items-center justify-between gap-4 py-3">
          <div className="flex items-center gap-3">
            {/* Цена */}
            <span className="text-lg font-bold text-gray-900">
              {/* актуальная цена */}
            </span>
          </div>
          <div className="flex gap-2">
            <button className="px-6 py-2.5 bg-[var(--color-primary)] text-white font-semibold rounded-lg hover:bg-red-700 transition-colors text-sm">
              Купити
            </button>
            <button className="px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors text-sm hidden sm:block">
              Швидке замовлення
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
```

Обернуть блок с кнопками add-to-cart в этот компонент. Кнопки sticky bar должны вызывать те же действия, что и обычные кнопки (добавление в корзину, быстрый заказ).

**ВАЖНО:** Не забыть про `pb-16` или `pb-20` на главном контейнере, чтобы sticky bar не перекрывал контент внизу страницы.

### Phase 24: Фейковая "акция" — старая цена + таймер

**Задача 24.1: Зачеркнутая "старая цена" (fake compare-at price)**

Для КАЖДОГО товара нужно показывать "старую цену", которая выше текущей на случайный процент (14%, 17%, 19%, 22%, 27%, 31% — неровные числа). Процент фиксируется **по категории** (все товары одной категории имеют одинаковый процент наценки).

**Реализация — НЕ менять данные в БД! Только фронтенд.**

Создать утилиту `src/lib/util/fake-discount.ts`:

```typescript
/**
 * Generates a deterministic "old price" markup percentage based on category ID.
 * Returns a percentage like 14, 17, 19, 22, 27, or 31.
 * Same category always gets the same percentage.
 */
export function getCategoryDiscount(categoryId: string): number {
  const DISCOUNTS = [14, 17, 19, 22, 27, 31]
  // Simple hash from category ID
  let hash = 0
  for (let i = 0; i < categoryId.length; i++) {
    hash = ((hash << 5) - hash) + categoryId.charCodeAt(i)
    hash |= 0 // Convert to 32bit integer
  }
  return DISCOUNTS[Math.abs(hash) % DISCOUNTS.length]
}

/**
 * Calculate fake "old price" from real price and category discount.
 */
export function getFakeOldPrice(realPrice: number, discountPercent: number): number {
  // oldPrice * (1 - discount/100) = realPrice
  // oldPrice = realPrice / (1 - discount/100)
  return Math.ceil(realPrice / (1 - discountPercent / 100))
}
```

**Где показывать:**
1. **Карточка товара** в сетке (`product-preview`) — маленький зачеркнутый текст рядом с ценой + бейдж "-XX%"
2. **Страница товара** (`product-actions` / `product-price`) — крупная зачеркнутая цена над/рядом с актуальной

Пример разметки:
```tsx
<div className="flex items-baseline gap-2">
  <span className="text-lg font-bold text-[var(--color-primary)]">12 499 ₴</span>
  <span className="text-sm text-gray-400 line-through">14 999 ₴</span>
  <span className="text-xs font-semibold text-white bg-red-500 px-1.5 py-0.5 rounded">-17%</span>
</div>
```

**Задача 24.2: Тикающий таймер акции**

Создать клиентский компонент `PromoTimer`:

```typescript
"use client"
import { useState, useEffect } from "react"

/**
 * Countdown timer that resets every 10 days.
 * Uses a fixed epoch so all users see the same timer.
 */
export function PromoTimer() {
  const [timeLeft, setTimeLeft] = useState(getTimeLeft())

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(getTimeLeft())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-gray-600 font-medium">До кінця акції:</span>
      <div className="flex gap-1">
        <TimeBlock value={timeLeft.days} label="дн" />
        <span className="text-red-500 font-bold">:</span>
        <TimeBlock value={timeLeft.hours} label="год" />
        <span className="text-red-500 font-bold">:</span>
        <TimeBlock value={timeLeft.minutes} label="хв" />
        <span className="text-red-500 font-bold">:</span>
        <TimeBlock value={timeLeft.seconds} label="сек" />
      </div>
    </div>
  )
}

function TimeBlock({ value, label }: { value: number; label: string }) {
  return (
    <div className="bg-gray-900 text-white rounded px-2 py-1 min-w-[36px] text-center">
      <span className="text-sm font-bold font-mono">{String(value).padStart(2, '0')}</span>
      <span className="text-[10px] text-gray-400 ml-0.5">{label}</span>
    </div>
  )
}

function getTimeLeft() {
  const PERIOD_MS = 10 * 24 * 60 * 60 * 1000 // 10 days
  const EPOCH = new Date("2026-01-01T00:00:00Z").getTime()
  const now = Date.now()
  const elapsed = (now - EPOCH) % PERIOD_MS
  const remaining = PERIOD_MS - elapsed

  return {
    days: Math.floor(remaining / (24 * 60 * 60 * 1000)),
    hours: Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000)),
    minutes: Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000)),
    seconds: Math.floor((remaining % (60 * 1000)) / 1000),
  }
}
```

**Где показывать таймер:**
1. На **странице товара** — над ценой или рядом с ценой
2. Можно также показать на **странице категории** один раз вверху

**Задача 24.3: Пересобрать и перезапустить после Phase 23 и 24!**

```bash
cd /home/developer/projects/alko-store-storefront && npm run build && pm2 restart alko-storefront
```

## Порядок выполнения
Phase 18 → Phase 19 → Phase 20 → Phase 21 → Phase 22 → Phase 23 → Phase 24

## Проверка результата
```sql
-- Phase 18: названия с AL-KO
SELECT name FROM product_category WHERE deleted_at IS NULL AND parent_category_id IS NULL ORDER BY name;

-- Phase 19: иерархия
SELECT c.name as child, p.name as parent
FROM product_category c
LEFT JOIN product_category p ON c.parent_category_id = p.id
WHERE c.deleted_at IS NULL
ORDER BY p.name NULLS FIRST, c.name;

-- Phase 20: описания
SELECT name, LEFT(description, 60) as desc_preview, metadata->>'seo_text' IS NOT NULL as has_seo
FROM product_category WHERE deleted_at IS NULL ORDER BY name;
```
