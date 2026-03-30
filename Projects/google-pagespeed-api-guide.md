# Google PageSpeed Insights API — Полное руководство

## API-ключ

```
AIzaSyA_Qkzo6L6aWvgPjaqV0eAPKEKZDkFwxHg
```

Переменная окружения:
```env
GOOGLE_PAGESPEED_API_KEY=AIzaSyA_Qkzo6L6aWvgPjaqV0eAPKEKZDkFwxHg
```

Ключ создан в [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
Для него включены два API:
- **PageSpeed Insights API** — Lighthouse-анализ любого сайта
- **Chrome UX Report API** — реальные данные пользователей (CrUX)

---

## 1. PageSpeed Insights API (основной)

### Endpoint

```
GET https://www.googleapis.com/pagespeedonline/v5/runPagespeed
```

### Параметры

| Параметр | Обязательный | Описание |
|----------|:---:|-----------|
| `url` | да | URL страницы для анализа (полный, с `https://`) |
| `key` | нет* | API-ключ. Без ключа — жёсткий лимит (несколько запросов/мин). С ключом — 25 000 запросов/день |
| `strategy` | нет | `mobile` (по умолчанию) или `desktop` |
| `category` | нет | Можно указывать несколько: `PERFORMANCE`, `ACCESSIBILITY`, `BEST_PRACTICES`, `SEO` |
| `locale` | нет | Язык результатов, напр. `cs` для чешского |

### Пример запроса

```bash
curl "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?\
url=https://example.com&\
strategy=mobile&\
category=PERFORMANCE&\
category=ACCESSIBILITY&\
category=BEST_PRACTICES&\
category=SEO&\
key=AIzaSyA_Qkzo6L6aWvgPjaqV0eAPKEKZDkFwxHg"
```

### Пример на TypeScript/Node.js

```typescript
import "dotenv/config";

const API_KEY = process.env.GOOGLE_PAGESPEED_API_KEY || "";

type PageSpeedResult = {
  performance: number;       // 0-100
  accessibility: number;     // 0-100
  bestPractices: number;     // 0-100
  seo: number;               // 0-100
  metrics: {
    firstContentfulPaint: number;     // мс
    largestContentfulPaint: number;   // мс
    totalBlockingTime: number;        // мс
    cumulativeLayoutShift: number;    // безразмерное
    speedIndex: number;               // мс
    interactive: number;              // мс (Time to Interactive)
  };
  loadTimeSeconds: number;   // TTI в секундах
};

async function fetchPageSpeed(url: string): Promise<PageSpeedResult | null> {
  const keyParam = API_KEY ? `&key=${API_KEY}` : "";
  const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?` +
    `url=${encodeURIComponent(url)}` +
    `&strategy=mobile` +
    `&category=PERFORMANCE&category=ACCESSIBILITY&category=BEST_PRACTICES&category=SEO` +
    keyParam;

  try {
    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(90000) });
    if (!res.ok) {
      console.error(`PageSpeed error: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json();
    const categories = data.lighthouseResult?.categories;
    const audits = data.lighthouseResult?.audits;
    if (!categories) return null;

    return {
      // Scores приходят как 0.0-1.0, умножаем на 100
      performance: Math.round((categories.performance?.score || 0) * 100),
      accessibility: Math.round((categories.accessibility?.score || 0) * 100),
      bestPractices: Math.round((categories["best-practices"]?.score || 0) * 100),
      seo: Math.round((categories.seo?.score || 0) * 100),
      metrics: {
        firstContentfulPaint: audits?.["first-contentful-paint"]?.numericValue || 0,
        largestContentfulPaint: audits?.["largest-contentful-paint"]?.numericValue || 0,
        totalBlockingTime: audits?.["total-blocking-time"]?.numericValue || 0,
        cumulativeLayoutShift: audits?.["cumulative-layout-shift"]?.numericValue || 0,
        speedIndex: audits?.["speed-index"]?.numericValue || 0,
        interactive: audits?.["interactive"]?.numericValue || 0,
      },
      loadTimeSeconds: parseFloat(
        ((audits?.["interactive"]?.numericValue || 0) / 1000).toFixed(2)
      ),
    };
  } catch (e: any) {
    console.error(`PageSpeed error: ${e.message}`);
    return null;
  }
}

// Использование:
const result = await fetchPageSpeed("https://example.com");
console.log(result);
// { performance: 85, accessibility: 92, bestPractices: 100, seo: 90, metrics: {...}, loadTimeSeconds: 2.3 }
```

### Структура ответа (ключевые поля)

```jsonc
{
  "lighthouseResult": {
    "categories": {
      "performance": { "score": 0.85 },       // 0.0 — 1.0
      "accessibility": { "score": 0.92 },
      "best-practices": { "score": 1.0 },
      "seo": { "score": 0.90 }
    },
    "audits": {
      "first-contentful-paint": {
        "numericValue": 1234.5,                // миллисекунды
        "displayValue": "1.2 s"
      },
      "largest-contentful-paint": {
        "numericValue": 2500.0
      },
      "total-blocking-time": {
        "numericValue": 150.0
      },
      "cumulative-layout-shift": {
        "numericValue": 0.05
      },
      "speed-index": {
        "numericValue": 3200.0
      },
      "interactive": {
        "numericValue": 3500.0                 // Time to Interactive
      },
      // ... 100+ других аудитов
      "render-blocking-resources": { ... },
      "unused-javascript": { ... },
      "modern-image-formats": { ... }
    }
  }
}
```

---

## 2. Chrome UX Report API (CrUX) — реальные данные пользователей

Показывает **реальные метрики** от пользователей Chrome (28-дневная агрегация). Работает только для сайтов с достаточным трафиком.

### Endpoint

```
POST https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=API_KEY
```

### Пример запроса

```typescript
async function fetchCrux(origin: string): Promise<CruxResult | null> {
  const apiUrl = `https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${API_KEY}`;

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ origin }), // напр. "https://example.com"
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) return null; // 404 = недостаточно данных

  const data = await res.json();
  const m = data.record?.metrics;
  if (!m) return null;

  return {
    lcp: { p75: m.largest_contentful_paint?.percentiles?.p75, category: "..." },
    fid: m.first_input_delay ? { p75: m.first_input_delay.percentiles.p75, category: "..." } : null,
    cls: { p75: m.cumulative_layout_shift?.percentiles?.p75, category: "..." },
    ttfb: { p75: m.experimental_time_to_first_byte?.percentiles?.p75, category: "..." },
    inp: m.interaction_to_next_paint ? { p75: m.interaction_to_next_paint.percentiles.p75, category: "..." } : null,
  };
}
```

### Структура ответа CrUX

```jsonc
{
  "record": {
    "metrics": {
      "largest_contentful_paint": {
        "histogram": [
          { "start": 0, "end": 2500, "density": 0.75 },     // good
          { "start": 2500, "end": 4000, "density": 0.15 },   // needs improvement
          { "start": 4000, "density": 0.10 }                  // poor
        ],
        "percentiles": { "p75": 2100 }  // миллисекунды
      },
      "cumulative_layout_shift": {
        "percentiles": { "p75": 0.05 }  // безразмерное
      },
      "interaction_to_next_paint": {
        "percentiles": { "p75": 200 }   // миллисекунды
      },
      "experimental_time_to_first_byte": {
        "percentiles": { "p75": 800 }   // миллисекунды
      }
    }
  }
}
```

---

## 3. Core Web Vitals — пороговые значения

| Метрика | Good | Needs Improvement | Poor |
|---------|:----:|:-----------------:|:----:|
| LCP (Largest Contentful Paint) | ≤ 2.5s | 2.5–4.0s | > 4.0s |
| FID (First Input Delay) | ≤ 100ms | 100–300ms | > 300ms |
| CLS (Cumulative Layout Shift) | ≤ 0.1 | 0.1–0.25 | > 0.25 |
| INP (Interaction to Next Paint) | ≤ 200ms | 200–500ms | > 500ms |
| TTFB (Time to First Byte) | ≤ 800ms | 800–1800ms | > 1800ms |
| FCP (First Contentful Paint) | ≤ 1.8s | 1.8–3.0s | > 3.0s |
| Speed Index | ≤ 3.4s | 3.4–5.8s | > 5.8s |
| TTI (Time to Interactive) | ≤ 3.8s | 3.8–7.3s | > 7.3s |
| TBT (Total Blocking Time) | ≤ 200ms | 200–600ms | > 600ms |

---

## 4. Лимиты и квоты

| Ресурс | Без ключа | С ключом |
|--------|:---------:|:--------:|
| PageSpeed Insights | ~2 запроса/мин | **25 000 запросов/день** |
| CrUX API | не работает | **150 запросов/мин** |
| Время ответа PageSpeed | 10-90 секунд | 10-90 секунд |
| Время ответа CrUX | ~1 секунда | ~1 секунда |

Рекомендуемый таймаут для PageSpeed: **90 секунд** (`AbortSignal.timeout(90000)`).

---

## 5. Практические советы

1. **Всегда тестируй mobile** (`strategy=mobile`) — Google использует mobile-first индексацию
2. **Кэшируй результаты** — анализ одного URL занимает 10-90 сек, повторный запрос того же URL через API вернёт кэшированный результат Google
3. **Указывай все 4 категории** — один запрос вернёт Performance + Accessibility + Best Practices + SEO
4. **CrUX возвращает 404** для сайтов с малым трафиком — это нормально, просто пропускай
5. **Scores приходят как 0.0–1.0** — умножай на 100 для привычных процентов
6. **`numericValue` в аудитах** — это миллисекунды (кроме CLS — безразмерная величина)
7. **Без ключа API работает** (PageSpeed), но с жёсткими лимитами — для продакшена ключ обязателен
