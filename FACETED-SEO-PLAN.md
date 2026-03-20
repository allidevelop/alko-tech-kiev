# Faceted Navigation SEO — План реализации

## Цель
Генерация 20-40 лендинг-страниц на основе комбинаций "категория + тип техники" с уникальным SEO-контентом для увеличения органического трафика.

**Ожидаемый результат:** +20-40% органических страниц в индексе, захват long-tail поисковых запросов типа "акумуляторні газонокосарки AL-KO купити".

---

## Фаза 1: Аналитика ключевых слов (1-2 дня)

### Инструменты

| Инструмент | Тип | Для чего |
|-----------|-----|---------|
| **Google Search Console API** | Бесплатно (уже подключён) | Реальные запросы, по которым показывается сайт |
| **Google Keyword Planner** | Бесплатно (через Google Ads аккаунт) | Объём поиска по ключевым словам |
| **Ubersuggest API** | Бесплатно (3 запроса/день) или $29/мес | Объём, конкуренция, related keywords |
| **KeywordTool.io API** | Бесплатно (ограничено) | Autocomplete-подсказки Google для UA/RU |
| **DataForSEO API** | От $50 (pay-per-use) | Полная аналитика: volume, difficulty, SERP |
| **Google Trends** | Бесплатно | Сезонность запросов (садова техніка = весна) |
| **Serpstat API** | Бесплатно trial | Конкуренты, позиции, backlinks |

### Методология

1. **Сбор seed-запросов** из Google Search Console:
   ```
   Газонокосарка купити
   Тример AL-KO
   Акумуляторна газонокосарка
   Бензинова мотокоса
   Мийка високого тиску AL-KO
   ```

2. **Расширение через Google Autocomplete** (бесплатно через скрипт):
   ```bash
   # Для каждого seed-запроса получаем autocomplete
   curl "https://suggestqueries.google.com/complete/search?client=firefox&hl=uk&q=газонокосарка+акумуляторна"
   ```

3. **Фильтрация по объёму** — оставляем только запросы с volume > 50/мес

4. **Маппинг запросов на комбинации фильтров:**
   ```
   "акумуляторні газонокосарки" → категория: hazonokosarky, тип: акумуляторна
   "бензинові тримери"         → категория: trymery-ta-motokosy, тип: бензинова
   "електричні подрібнювачі"   → категория: podribnyuvachi, тип: електрична
   ```

---

## Фаза 2: Определение ценных комбинаций (1 день)

### Матрица: категории × типы

| Категория | Акумуляторні | Бензинові | Електричні | Механічні |
|-----------|:---:|:---:|:---:|:---:|
| Газонокосарки | ✅ высокий спрос | ✅ высокий | ✅ средний | ✅ низкий |
| Тримери та мотокоси | ✅ высокий | ✅ высокий | ✅ средний | — |
| Кущорізи | ✅ средний | ✅ низкий | ✅ средний | — |
| Повітродувки | ✅ средний | ✅ низкий | — | — |
| Пили | ✅ средний | ✅ средний | ✅ средний | — |
| Снігоприбирачі | — | ✅ высокий | ✅ средний | — |
| Подрібнювачі | — | — | ✅ средний | — |
| Мийки | — | — | ✅ высокий | — |
| Культиватори | — | ✅ средний | ✅ низкий | — |
| Насоси (поверхневі) | — | — | ✅ средний | — |
| Насоси (заглибл.) | — | — | ✅ средний | — |

### Критерии отбора для индексации:
- Поисковый объём > 50 запросов/месяц
- В категории > 2 товаров с этим типом
- Уникальный контент можно сгенерировать

**Ожидаемое количество: 25-35 страниц**

---

## Фаза 3: Техническая реализация (2-3 дня)

### URL-структура

```
/uk/categories/hazonokosarky/akumulyatorni
/uk/categories/hazonokosarky/benzynovi
/uk/categories/hazonokosarky/elektrychni
/uk/categories/hazonokosarky/mekhanichni
/uk/categories/trymery-ta-motokosy/akumulyatorni
/uk/categories/trymery-ta-motokosy/benzynovi
...
```

### Архитектура

1. **Новый route:** `src/app/[countryCode]/(main)/categories/[...category]/page.tsx`
   - Уже поддерживает вложенные пути через `[...category]`
   - Нужно добавить логику: если последний сегмент = тип фильтра → показать фильтрованную страницу

2. **Маппинг slug → фильтр:**
   ```typescript
   const FILTER_SLUGS: Record<string, { key: string; value: string; label_uk: string; label_ru: string }> = {
     "akumulyatorni": { key: "spec_type", value: "акумуляторна", label_uk: "Акумуляторні", label_ru: "Аккумуляторные" },
     "benzynovi":     { key: "spec_type", value: "бензинова", label_uk: "Бензинові", label_ru: "Бензиновые" },
     "elektrychni":   { key: "spec_type", value: "електрична", label_uk: "Електричні", label_ru: "Электрические" },
     "mekhanichni":   { key: "spec_type", value: "механічна", label_uk: "Механічні", label_ru: "Механические" },
   }
   ```

3. **`generateStaticParams`** — генерировать все валидные комбинации при билде

4. **Canonical URL** — фильтрованная страница = canonical (НЕ указывает на родительскую)

5. **Noindex для query-параметров** — `?spec_type=акумуляторна` → noindex, canonical → `/categories/hazonokosarky/akumulyatorni`

### SEO-элементы каждой страницы

```html
<title>Акумуляторні газонокосарки AL-KO — купити в Україні | Alko-Technics</title>
<meta name="description" content="Акумуляторні газонокосарки AL-KO серій EnergyFlex та Moweo.
  Від 2 999 грн. Безкоштовна доставка від 3000 грн. Офіційна гарантія.">
<link rel="canonical" href="https://alko-technics.kiev.ua/uk/categories/hazonokosarky/akumulyatorni">
<link rel="alternate" hreflang="uk" href="...../uk/categories/hazonokosarky/akumulyatorni">
<link rel="alternate" hreflang="ru" href="...../ru/categories/hazonokosarky/akumulyatorni">
```

---

## Фаза 4: Генерация SEO-контента (1-2 дня)

### Для каждой лендинг-страницы:

1. **Уникальный H1:** "Акумуляторні газонокосарки AL-KO"
2. **Вступний текст (2-3 абзаци):** описание типа техники в контексте категории
3. **SEO-блок внизу** (как у текущих категорий): "Що входить", "Переваги", "Чому варто купити"
4. **Breadcrumbs:** Головна > Газонокосарки > Акумуляторні
5. **Structured Data (JSON-LD):** CollectionPage + ItemList

### Генерация контента через CLI (как делаем сейчас):
- Запустить агентов на Sonnet для генерации текстов
- 25-35 страниц × 2 языка = 50-70 текстов

---

## Фаза 5: Sitemap и индексация (0.5 дня)

1. **Обновить `sitemap.xml`** — добавить все фасетные страницы с приоритетом 0.7
2. **Добавить в `robots.txt`:**
   ```
   # Allow faceted landing pages
   Allow: /uk/categories/*/akumulyatorni
   Allow: /uk/categories/*/benzynovi
   Allow: /uk/categories/*/elektrychni
   Allow: /uk/categories/*/mekhanichni

   # Block query-param filters (duplicate content)
   Disallow: /*?spec_type=
   Disallow: /*?spec_engine_type=
   ```
3. **Отправить sitemap** в Google Search Console
4. **Запросить индексацию** ключевых страниц через URL Inspection

---

## Фаза 6: Мониторинг (ongoing)

| Метрика | Инструмент | Цель |
|---------|-----------|------|
| Indexed pages | Google Search Console | +25-35 страниц за 2-4 недели |
| Organic impressions | GSC → Performance | +30% за 1 месяц |
| Organic clicks | GSC → Performance | +20% за 2 месяца |
| Keyword positions | GSC / Serpstat | Top-10 по целевым запросам |
| Crawl stats | GSC → Settings → Crawl stats | Без роста crawl-ошибок |

---

## Риски и митигация

| Риск | Вероятность | Митигация |
|------|------------|-----------|
| Duplicate content (фильтр vs лендинг) | Высокая | Canonical + noindex на query-params |
| Crawl budget waste | Средняя | robots.txt + XML sitemap only для ценных URL |
| Thin content | Средняя | Минимум 300 слов уникального текста на странице |
| Каннибализация (лендинг vs категория) | Низкая | Разные ключевые слова (категория = общий, лендинг = тип) |

---

## Timeline

| Фаза | Срок | Зависимости |
|------|------|-------------|
| 1. Аналитика ключевых слов | 1-2 дня | Google Search Console доступ |
| 2. Определение комбинаций | 1 день | Результаты фазы 1 |
| 3. Техническая реализация | 2-3 дня | — |
| 4. Генерация контента | 1-2 дня | Результаты фазы 2 |
| 5. Sitemap и индексация | 0.5 дня | Результаты фазы 3-4 |
| 6. Мониторинг | Ongoing | GSC |
| **Итого** | **~7 рабочих дней** | |

---

## Инструменты для аналитики (бесплатные/API)

### Рекомендованный стек:

1. **Google Search Console API** (бесплатно)
   - Уже подключён
   - Реальные запросы, CTR, позиции
   - API: `searchanalytics.query` method

2. **Google Autocomplete Scraper** (бесплатно, скрипт)
   ```
   https://suggestqueries.google.com/complete/search?client=firefox&hl=uk&q=ЗАПРОС
   ```
   - Можно написать Node.js скрипт для массового сбора подсказок

3. **Google Keyword Planner** (бесплатно через Google Ads)
   - Объём поиска, конкуренция
   - Нужен Google Ads аккаунт (можно без бюджета)

4. **KeywordTool.io** (бесплатно limited / API от $89/мес)
   - Google, YouTube, Amazon autocomplete
   - Хорош для украиноязычных запросов

5. **DataForSEO API** (pay-per-use, от $0.01 за запрос)
   - Самый полный: SERP, volume, difficulty, related
   - API: `https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live`

6. **Serpstat** (free trial 7 дней)
   - Конкуренты, позиции, domain comparison
   - Хорош для анализа alko-instrument.kiev.ua

### Альтернативный бесплатный подход:
- Google Search Console (текущие запросы) + Google Autocomplete (расширение) + ручная проверка volume через Google Ads → достаточно для 25-35 страниц
