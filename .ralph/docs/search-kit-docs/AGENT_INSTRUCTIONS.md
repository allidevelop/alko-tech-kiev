# Инструкция для AI-агента: Реализация поиска

## Обзор

Это готовая реализация **глобального поиска** из продакшн-проекта VIP Journal (https://vipjournal.us). Стек: Next.js 15 (App Router) + Payload CMS 3 + PostgreSQL. Нужно адаптировать под целевой проект (например, интернет-магазин).

## Архитектура поиска (3 компонента)

```
┌─────────────────────────────────────────────────────┐
│  Header                                             │
│  ┌──────┐                                           │
│  │ 🔍   │  ← кнопка .search-btn (или Ctrl+K)       │
│  └──────┘                                           │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  SearchOverlay (client component)                   │
│  ┌───────────────────────────────────────────────┐  │
│  │ 🔍  [___поисковый запрос___]          [ESC]   │  │
│  ├───────────────────────────────────────────────┤  │
│  │ ARTICLE   Title of article result             │  │
│  │           Short excerpt text...               │  │
│  │ EVENT     Title of event result               │  │
│  │           Short description...                │  │
│  │ BUSINESS  Title of business result            │  │
│  │           Short description...                │  │
│  └───────────────────────────────────────────────┘  │
│  ▒▒▒▒▒▒▒ backdrop-blur + bg-black/70 ▒▒▒▒▒▒▒▒▒▒▒  │
└─────────────────────────────────────────────────────┘
         │
         ▼  fetch /api/search?q=...&locale=en (debounce 300ms)
┌─────────────────────────────────────────────────────┐
│  API Route: /api/search (server)                    │
│                                                     │
│  Promise.all([                                      │
│    payload.find({ collection: 'articles', ... }),   │
│    payload.find({ collection: 'events', ... }),     │
│    payload.find({ collection: 'businesses', ... }), │
│  ])                                                 │
│                                                     │
│  → { results: [...articles, ...events, ...biz] }    │
└─────────────────────────────────────────────────────┘
```

## Принципы работы

1. **Триггер**: Пользователь нажимает `Ctrl+K` (или `Cmd+K` на Mac) или кликает по иконке 🔍 в хедере
2. **Оверлей**: Открывается модальное окно поверх страницы с backdrop-blur
3. **Ввод**: Пользователь начинает вводить текст (минимум 2 символа)
4. **Debounce**: Запрос отправляется через 300ms после последнего нажатия клавиши
5. **Параллельный поиск**: API ищет по нескольким коллекциям одновременно через `Promise.all`
6. **Результаты**: До 15 результатов (5 на коллекцию), каждый с цветным бейджем по типу
7. **Навигация**: Клик по результату → переход на страницу → оверлей закрывается

## Как адаптировать под интернет-магазин

### Шаг 1: API-эндпоинт

Файл: `api/search/route.ts` → положить в `src/app/api/search/route.ts`

**Что менять:**

Замени коллекции на свои. Пример для магазина:

```typescript
const [products, categories, brands] = await Promise.all([
  // Товары — основной поиск
  payload.find({
    collection: 'products',        // ← твоя коллекция товаров
    where: {
      and: [
        { status: { equals: 'published' } },
        {
          or: [
            { name: { contains: q } },        // название товара
            { description: { contains: q } },  // описание
            { sku: { contains: q } },           // артикул
          ],
        },
      ],
    },
    sort: '-createdAt',
    limit: 8,   // товаров показывай больше
    locale,
    depth: 1,
  }).catch(() => ({ docs: [] })),

  // Категории
  payload.find({
    collection: 'categories',
    where: { name: { contains: q } },
    limit: 3,
    locale,
  }).catch(() => ({ docs: [] })),

  // Бренды
  payload.find({
    collection: 'brands',
    where: { name: { contains: q } },
    limit: 3,
    locale,
  }).catch(() => ({ docs: [] })),
])
```

**Маппинг результатов** — адаптируй URL и поля:

```typescript
const results = [
  ...products.docs.map((p: any) => ({
    type: 'product' as const,
    title: p.name,
    excerpt: p.shortDescription || '',
    slug: p.slug,
    url: `/${locale}/products/${p.slug}`,
    price: p.price,           // ← доп. поля для магазина
    image: p.thumbnail?.url,  // ← картинка товара
  })),
  ...categories.docs.map((c: any) => ({
    type: 'category' as const,
    title: c.name,
    excerpt: `${c.productCount || ''} products`,
    slug: c.slug,
    url: `/${locale}/category/${c.slug}`,
  })),
  ...brands.docs.map((b: any) => ({
    type: 'brand' as const,
    title: b.name,
    excerpt: '',
    slug: b.slug,
    url: `/${locale}/brands/${b.slug}`,
    image: b.logo?.url,
  })),
]
```

### Шаг 2: Компонент оверлея

Файл: `components/SearchOverlay.tsx` → положить в `src/components/layout/SearchOverlay.tsx`

**Что менять:**

1. **Типы и бейджи** — замени на свои:

```typescript
const typeLabels: Record<string, string> = {
  product: 'Товар',       // или 'Product'
  category: 'Категория',  // или 'Category'
  brand: 'Бренд',         // или 'Brand'
}

const typeColors: Record<string, string> = {
  product: 'bg-blue-600',
  category: 'bg-emerald-600',
  brand: 'bg-purple-600',
}
```

2. **Интерфейс результата** — добавь нужные поля:

```typescript
interface SearchResult {
  type: 'product' | 'category' | 'brand'
  title: string
  excerpt: string
  slug: string
  url: string
  price?: number    // ← для товаров
  image?: string    // ← картинка
}
```

3. **Рендер результата** — можно добавить цену и картинку:

```tsx
<Link href={result.url} onClick={close} className="flex items-start gap-4 px-6 py-4 hover:bg-[var(--bg-secondary)] transition-colors">
  {result.image && (
    <img src={result.image} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
  )}
  <div className="min-w-0 flex-1">
    <p className="font-semibold text-base truncate">{result.title}</p>
    {result.excerpt && <p className="text-sm text-gray-500 line-clamp-1">{result.excerpt}</p>}
  </div>
  {result.price && (
    <span className="shrink-0 font-semibold text-green-600">${result.price}</span>
  )}
</Link>
```

4. **Placeholder текст** — замени на свой:

```
"Поиск товаров, категорий, брендов..."
```

### Шаг 3: Интеграция в Layout

В корневой layout (или в layout с хедером):

```tsx
import { SearchOverlay } from '@/components/layout/SearchOverlay'

export default function Layout({ children }) {
  return (
    <>
      <Header />
      <main>{children}</main>
      <Footer />
      <SearchOverlay locale="en" />   {/* ← добавь в конец */}
    </>
  )
}
```

### Шаг 4: Кнопка поиска в Header

Добавь кнопку с классом `search-btn` (SearchOverlay слушает клики на этот класс):

```tsx
<button
  className="search-btn w-9 h-9 rounded-full border border-gray-300 flex items-center justify-center hover:border-blue-500 hover:text-blue-500 transition-colors"
  aria-label="Search"
>
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35" />
  </svg>
</button>
```

## Ключевые UX-паттерны (не убирай!)

| Паттерн | Зачем |
|---------|-------|
| `Ctrl/Cmd + K` | Стандартный хоткей (VS Code, GitHub, Notion, Vercel) — power users ожидают его |
| Debounce 300ms | Не долбит API на каждый символ, но достаточно быстро |
| Минимум 2 символа | Фильтрация мусорных запросов (буква "a" вернёт тысячи результатов) |
| `Promise.all` | Параллельный поиск по коллекциям — быстрее чем последовательный |
| `backdrop-blur` | Фокус внимания на результатах, красивый эффект |
| `.catch(() => ({ docs: [] }))` | Если одна коллекция упала — остальные всё равно покажутся |
| `Cache-Control: s-maxage=60` | Одинаковые запросы кэшируются на 1 минуту |
| `stale-while-revalidate=300` | Старый кэш показывается 5 мин, пока обновляется в фоне |
| ESC для закрытия | Стандартное поведение модалки |
| Автофокус на инпут | Сразу можно печатать, не кликая |

## CSS-переменные (замени на свои)

Компонент использует CSS custom properties для темизации:

```css
--bg-primary       /* фон модалки */
--bg-secondary     /* фон при hover на результат */
--border-color     /* рамки */
--text-primary     /* основной текст */
--text-secondary   /* вторичный текст */
--text-muted       /* приглушённый текст (placeholder, подсказки) */
```

Если в проекте их нет — замени на конкретные цвета или Tailwind-классы:
- `bg-[var(--bg-primary)]` → `bg-white dark:bg-gray-900`
- `text-[var(--text-primary)]` → `text-gray-900 dark:text-white`
- и т.д.

## Зависимости

- **Next.js 15** (App Router, Route Handlers)
- **Payload CMS 3** (или любой другой ORM/API — замени вызовы `payload.find()`)
- **React 19** (hooks: useState, useEffect, useRef, useCallback)
- **Tailwind CSS** (стилизация)
- **next/link** (клиентская навигация)

Если проект НЕ на Payload CMS, замени `payload.find()` на свой метод запроса к БД (Prisma, Drizzle, REST API, и т.д.). Логика остаётся той же: параллельный поиск по нескольким таблицам/коллекциям с фильтром `ILIKE '%query%'`.

## Возможные улучшения

- **Fuzzy search**: Добавить pg_trgm или Meilisearch для нечёткого поиска (опечатки)
- **Навигация стрелками**: Arrow Up/Down по результатам + Enter для перехода
- **Недавние запросы**: localStorage для истории поиска
- **Популярные запросы**: Показывать при пустом инпуте
- **Картинки товаров**: Thumbnail рядом с результатом (для магазина must-have)
- **Цена в результатах**: Показывать цену товара прямо в выдаче
- **Подсветка совпадений**: Выделять найденный текст в результатах (highlight match)
- **Аналитика**: Логировать поисковые запросы для улучшения каталога
