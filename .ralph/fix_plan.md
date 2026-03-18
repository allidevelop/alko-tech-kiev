# AL-KO Store — Phase 13-17: Описания товаров + Служебные страницы

## Статус предыдущих фаз
Phases 1-12: ВСЕ ЗАВЕРШЕНЫ. Не нужно ничего из них делать.

---

## Phase 13: Скрейпинг описаний конкурента [x]

**Задача:** Запустить скрипт скрейпинга описаний товаров с сайта конкурента через Wayback Machine.

**Шаги:**
- [ ] 13.1. Убедиться что `data/` директория существует: `mkdir -p data`
- [ ] 13.2. Запустить скрипт: `cd /home/developer/projects/alko-store && node src/scripts/scrape-competitor.mjs`
- [ ] 13.3. Дождаться завершения, проверить `data/scraped-competitor.json`
- [ ] 13.4. Проверить статистику: сколько URL обработано, сколько совпало с нашими товарами
- [ ] 13.5. Если скрипт упал — исправить ошибку и перезапустить (resume поддерживается)

**Результат:** Файл `data/scraped-competitor.json` с описаниями товаров.

**Примечание:** Скрипт работает через Wayback Machine API с rate limiting 1 запрос/2 сек. Ожидаемое время: 1-2 часа. Скрипт поддерживает resume — если упадёт, при перезапуске продолжит с места остановки.

---

## Phase 14: AI-рерайт описаний [x]

**Задача:** Запустить GPT-4o Mini рерайт всех спарсенных описаний.

**Шаги:**
- [ ] 14.1. Убедиться что `OPENAI_API_KEY` есть в `.env`
- [ ] 14.2. Убедиться что `data/scraped-competitor.json` существует и содержит данные
- [ ] 14.3. Запустить скрипт: `cd /home/developer/projects/alko-store && node src/scripts/rewrite-descriptions.mjs`
- [ ] 14.4. Дождаться завершения, проверить `data/rewritten-descriptions.json`
- [ ] 14.5. Проверить качество: выборочно просмотреть 3-5 описаний (uk + ru)
- [ ] 14.6. Убедиться что нигде не упоминается "alko-instrument" или другие конкуренты

**Результат:** Файл `data/rewritten-descriptions.json` с уникальными описаниями (uk + ru).

**Примечание:** Rate limit 1 запрос/сек. Ожидаемое время: 30-60 минут. Resume поддерживается.

---

## Phase 15: Применение описаний в БД + Storefront [DONE]

**Задача:** Применить переписанные описания в базу данных и обновить storefront для двуязычного отображения.

### 15a. Применение в БД

**Шаги:**
- [ ] 15.1. Preview: `node src/scripts/apply-descriptions.mjs --preview 5` — проверить 5 примеров
- [ ] 15.2. Dry-run: `node src/scripts/apply-descriptions.mjs` — увидеть общую статистику
- [ ] 15.3. Apply: `node src/scripts/apply-descriptions.mjs --apply` — применить в БД
- [ ] 15.4. SQL-проверка средней длины описания:
  ```sql
  SELECT AVG(LENGTH(description)) FROM product WHERE deleted_at IS NULL;
  ```
  Было ~176, должно стать ~500+.
- [ ] 15.5. SQL-проверка русских описаний:
  ```sql
  SELECT COUNT(*) FROM product WHERE metadata->>'description_ru' IS NOT NULL AND deleted_at IS NULL;
  ```

### 15b. Обновление storefront — двуязычные описания

**Файлы для изменения:**

#### `/home/developer/projects/alko-store-storefront/src/modules/products/components/product-tabs/index.tsx`

1. Компонент `DescriptionTab` (строки 89-101) — сделать двуязычным:
```tsx
const DescriptionTab = ({ product }: { product: HttpTypes.StoreProduct }) => {
  const { locale } = useTranslation()
  const metadata = (product.metadata || {}) as Record<string, any>

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
Убедись что `useTranslation` уже импортируется. Если нет — добавь: `import { useTranslation } from "@lib/i18n/translation-context"`

2. В `HIDDEN_META_KEYS` (строка 14-18) добавить новые ключи описаний:
```tsx
const HIDDEN_META_KEYS = new Set([
  "alko_article", "alko_vendor", "alko_url", "alko_xml_id",
  "brand", "series", "warranty",
  "video_url", "video_urls",
  "description_ru", "short_description_uk", "short_description_ru",
])
```

#### `/home/developer/projects/alko-store-storefront/src/modules/products/templates/product-info/index.tsx`

Добавить краткое описание после блока metadata. `getServerTranslation` уже импортирован, нужно добавить `locale`:
```tsx
const { t, locale } = await getServerTranslation()
// ...existing code...
const shortDesc = locale === "ru"
  ? metadata?.short_description_ru
  : metadata?.short_description_uk

// В return, после </div> с метаданными (sku, brand, series, warranty):
{shortDesc && (
  <p className="text-sm text-gray-600 leading-relaxed mt-3">
    {shortDesc}
  </p>
)}
```

### 15c. Build и Deploy

- [ ] 15.6. `cd /home/developer/projects/alko-store-storefront && npm run build`
- [ ] 15.7. Если build ОК — deploy: `pm2 restart alko-storefront`
- [ ] 15.8. Проверить что товар показывает полное описание на storefront
- [ ] 15.9. Git commit всех изменений в storefront

---

## Phase 16: Служебные страницы — переписать контент с i18n [DONE]

**Задача:** Переписать 5 служебных страниц. Все тексты — СВОИМИ СЛОВАМИ, уникальные. Добавить переводы в i18n систему для двуязычности (uk/ru).

### Контент-вдохновение (НЕ копировать!):

#### Про нас:
- Магазин Alko-Technics — спеціалізований магазин садової техніки AL-KO
- Фокус ТІЛЬКИ на AL-KO, український ринок
- Оригінальна продукція, офіційна гарантія виробника
- Доставка по всій Україні Новою Поштою
- Професійна консультація

#### Доставка та оплата:
- Доставка Новою Поштою (у відділення та кур'єром), 1-3 робочих дні
- Вартість за тарифами Нової Пошти
- Оплата: онлайн карткою (Visa/MC), Plata by Mono, накладений платіж
- Відправка 1-2 робочих дні

#### Гарантія та повернення:
- Закон України: 14 днів повернення
- Офіційна гарантія виробника AL-KO
- Гарантійний термін вказано на картці товару
- Повернення: товар не використаний, оригінальна упаковка, чек

#### Політика конфіденційності:
- Стандартна політика конфіденційності для українського інтернет-магазину
- Які дані збираємо, як використовуємо, кому передаємо (НП, платіжні системи)
- Cookies, права користувачів

#### Умови використання:
- Стандартні умови використання
- Товари та ціни, оформлення замовлення, доставка, оплата, повернення
- Інтелектуальна власність, відповідальність

### Техническая реализация:

**Подход:** Добавить переводы в i18n JSON файлы, переписать компоненты страниц с `t()`.

**Шаги:**

- [ ] 16.1. Добавить секцию `"pages"` в `src/lib/i18n/messages/uk.json` с подсекциями для каждой страницы
- [ ] 16.2. Добавить секцию `"pages"` в `src/lib/i18n/messages/ru.json`
- [ ] 16.3. Зарегистрировать секцию `"pages"` в `src/lib/i18n/index.ts`
- [ ] 16.4. Переписать `about/page.tsx` — заменить хардкод на `t("pages", "about_xxx")`
- [ ] 16.5. Переписать `delivery/page.tsx`
- [ ] 16.6. Переписать `warranty/page.tsx`
- [ ] 16.7. Переписать `privacy/page.tsx`
- [ ] 16.8. Переписать `terms/page.tsx`
- [ ] 16.9. Build: `cd /home/developer/projects/alko-store-storefront && npm run build`
- [ ] 16.10. Deploy: `pm2 restart alko-storefront`
- [ ] 16.11. Проверить каждую страницу в обоих языках
- [ ] 16.12. Git commit

**КРИТИЧЕСКИ ВАЖНО:**
- НИГДЕ не упоминать "alko-instrument", "alko-instrument.kiev.ua", "М-онлайн"
- Все тексты — СВОИ, уникальные
- Название магазина: "Alko-Technics" (НЕ "AL-KO Garden Store")
- Email: info@alko-technics.kiev.ua
- Телефон: +38 099 401 95 21
- Страницы — серверные компоненты, использовать `getServerTranslation()`

---

## Phase 17: Страница "Інформація" + навігація [DONE]

**Задача:** Создать хаб-страницу с ссылками на все служебные страницы.

**Шаги:**
- [ ] 17.1. Создать `/info/page.tsx` — страница с карточками-ссылками на: Про нас, Каталог, Доставка та оплата, Гарантія та повернення, Політика конфіденційності, Умови використання
- [ ] 17.2. Убедиться что в футере есть ссылки на все служебные страницы
- [ ] 17.3. Build + Deploy + Verify
- [ ] 17.4. Git commit

---

## Порядок выполнения

Phase 13 → Phase 14 → Phase 15 → Phase 16 → Phase 17

Каждая фаза зависит от предыдущей!
