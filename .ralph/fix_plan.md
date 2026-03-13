# AL-KO Garden Store — План разработки

## Phase 1: Backend — Импорт товаров из XML

- [x] 1.1 Создать скрипт импорта XML (`src/scripts/import-alko.ts`)
  - Скачать XML с `https://apipim.al-ko.ua/storage/xml_files/PriceList.xml`
  - Распарсить YML-формат (fast-xml-parser)
  - Маппинг категорий: `<category id="N">Назва</category>` → Medusa product categories
  - Создано 35 категорий через Medusa workflows
  - Импортировано 641/650 товаров (9 пропущено — дубликаты/битые артикулы)
  - Запуск: `npx medusa exec ./src/scripts/import-alko.ts`

- [x] 1.2 Настроить регион Украина и валюту UAH
  - Регион "Україна" с валютой UAH (default)
  - ПДВ 20% — tax region UA
  - Sales channel + publishable API key + stock location "Склад Україна"
  - Shipping options: Нова Пошта — Відділення (70 UAH), Кур'єр (120 UAH)

- [x] 1.3 Верифицировать импорт
  - 641 товаров в базе, 35 категорій
  - Store API /store/products работает с API key
  - Продукты имеют цены UAH, изображения, SKU, metadata со спецификациями

## Phase 2: Backend — Интеграция с Новой Поштой

**ВАЖНО**: Подробная документация по реализации — `.ralph/docs/NOVA-POSHTA-MODULE.md`. Прочитай этот файл ПЕРЕД началом работы — он содержит готовые типы, API-клиент, провайдер и API route.

- [x] 2.1 Создать API-клиент Нової Пошти (`src/modules/nova-poshta-fulfillment/lib/nova-poshta.ts`)
  - searchCities, getWarehouses, isConfigured — работают через Nova Poshta API v2.0
  - DeliveryCity ref используется корректно (не Settlement ref)

- [x] 2.2 Создать Fulfillment Provider (`src/modules/nova-poshta-fulfillment/service.ts`)
  - AbstractFulfillmentProviderService, identifier="nova-poshta"
  - 2 опции: nova-poshta-warehouse (70 UAH), nova-poshta-courier (120 UAH)

- [x] 2.3 Создать API Route для автокомплита (`src/api/store/nova-poshta/route.ts`)
  - POST /store/nova-poshta — проксирует searchCities и getWarehouses

- [x] 2.4 Зарегистрировать в `medusa-config.ts` и тестировать
  - Провайдер зарегистрирован, сервер стартует, API работает
  - Тест: searchCities("Київ") → 9 результатов, getWarehouses(kyivRef) → 50+ відділень

## Phase 3: Backend — Платёжные системы

**ВАЖНО**: Подробная документация — `.ralph/docs/MONOBANK-PAYMENT-MODULE.md`. Прочитай ПЕРЕД началом работы — содержит готовый код провайдера, API-клиент, верификацию подписи, webhook handler.

- [x] 3.1 Создать API-клиент Monobank (`src/modules/monobank-payment/lib/monobank.ts`)
  - createInvoice, getInvoiceStatus, verifyWebhookSignature (ECDSA SHA256)
  - Суми в копійках, ccy=980, public key кешується

- [x] 3.2 Создать Payment Provider (`src/modules/monobank-payment/service.ts`)
  - AbstractPaymentProvider, identifier="monobank"
  - initiatePayment → createInvoice → { invoiceId, pageUrl }
  - getWebhookActionAndData → ECDSA верифікація → PaymentActions.AUTHORIZED/FAILED

- [x] 3.3 Создать Payment Provider для LiqPay (`src/modules/liqpay-payment/`)
  - **ОБЯЗАТЕЛЬНО прочитай**: `.ralph/docs/LIQPAY-PAYMENT-MODULE.md` — содержит ВЕСЬ готовый код!
  - LiqPay API: `https://www.liqpay.ua/api/3/checkout`
  - Env vars: `LIQPAY_PUBLIC_KEY`, `LIQPAY_PRIVATE_KEY` (уже в .env)
  - **Справочник по Payment Provider API**: `.ralph/docs/MEDUSA-PAYMENT-PROVIDER-REFERENCE.md`
  - **Структура файлов**:
    - `src/modules/liqpay-payment/index.ts` — ModuleProvider registration
    - `src/modules/liqpay-payment/service.ts` — AbstractPaymentProvider, identifier="liqpay"
    - `src/modules/liqpay-payment/lib/liqpay.ts` — API клиент
  - **API клиент** (`lib/liqpay.ts`):
    - `createPayment(orderId, amount, currency, description, serverUrl, resultUrl)` — формирует data + signature (base64 JSON → SHA1 с private key → base64)
    - `verifyCallback(data, signature)` — проверяет signature = base64(sha1(private_key + data + private_key))
    - `decodeData(data)` — base64 decode → JSON parse
    - LiqPay data формат: `{ public_key, version: 3, action: "pay", amount, currency: "UAH", description, order_id, server_url, result_url }`
  - **Payment Provider** (`service.ts`):
    - `initiatePayment` → createPayment → return { data: base64, signature: base64, checkoutUrl: "https://www.liqpay.ua/api/3/checkout" }
    - `authorizePayment` → return { status: "authorized", data: input.data }
    - `capturePayment` → return { data: input.data } (LiqPay auto-captures)
    - `getWebhookActionAndData` → verifyCallback → если status="success"/"sandbox" → AUTHORIZED
    - `cancelPayment`, `refundPayment` — базовые реализации
  - **Регистрация в `medusa-config.ts`**: добавить liqpay-payment provider рядом с monobank
  - **Webhook**: встроенный Medusa path `/hooks/payment/liqpay-payment_liqpay`
  - **Тестирование**: сервер должен стартовать, провайдер доступен в admin для подключения к региону

- [x] 3.4 Зарегистрировать payment providers в `medusa-config.ts`
  - Monobank зареєстрований, сервер стартує успішно
  - Webhook URL: /hooks/payment/monobank_monobank

## Phase 4: Storefront — Украинская локализация

- [x] 4.1 Украинизация storefront
  - 31 файл переведён на украинский язык (без i18n библиотеки — прямая замена строк)
  - lang="uk" в layout.tsx, locale "uk-UA" в money.ts для формата ₴
  - Переведено: навигация, footer, cart, checkout (адреса, доставка, оплата, перевірка),
    товарні сторінки (додати до кошика, інфо, вкладки), аккаунт (вхід, реєстрація, навігація),
    каталог (сортування), головна (hero з AL-KO брендингом)
  - Metadata: title "AL-KO Garden Store — Садова техніка", Ukrainian description

- [x] 4.2 Адаптировать header/footer
  - Навігація: "AL-KO Garden", "Кабінет", "Кошик", "Меню"
  - Footer: категорії, колекції, контакти (телефон, email, сайт)
  - Hero: "AL-KO Garden Store — Садова техніка для вашого дому та саду"
  - Copyright: "AL-KO Garden Store. Всі права захищені."
  - Домен alko-garden.com.ua додано до next.config.js для зображень

- [x] 4.3 Страница каталога
  - CategorySidebar: дерево категорій (top-level + дочірні) з посиланнями
  - Сортування: Новинки, Ціна зростання/спадання (вже переведено в 4.1)
  - Пагінація: smart page buttons (вже працює)
  - Карточки: зображення, назва, ціна (з UAH форматуванням)
  - Metadata: "Каталог — AL-KO Garden Store", категорії "Назва — AL-KO Garden Store"

## Phase 5: Storefront — Checkout с Новой Поштою

**ВАЖНО**: Документация по компонентам — `.ralph/docs/NOVA-POSHTA-MODULE.md` (Layer 3: Frontend Components)

- [x] 5.1 Компонент NovaPoshtaCitySelect (автокомплит міст)
  - `src/modules/checkout/components/nova-poshta-city-select/index.tsx`
  - "use client", debounce 300ms, fetch POST /store/nova-poshta { action: "searchCities", query }
  - Dropdown з cityName, fullName, warehouseCount
  - Keyboard: ArrowUp/Down, Enter, Escape; click-outside closes
  - Іконки: spinner (loading), checkmark (selected), search (default)

- [x] 5.2 Компонент NovaPoshtaWarehouseSelect (автокомплит відділень)
  - `src/modules/checkout/components/nova-poshta-warehouse-select/index.tsx`
  - Eager load all warehouses on cityRef change, filter locally (debounce 150ms)
  - Плейсхолдер "Спочатку оберіть місто" коли немає cityRef
  - "Відділення не знайдено" when filter returns empty

- [x] 5.3 Інтеграція checkout форми
  - Shipping address form: ПІБ, телефон, Місто (NovaPoshtaCitySelect), Відділення НП (NovaPoshtaWarehouseSelect)
  - City selection auto-fills city + province (area), warehouse fills address_1
  - Hidden inputs for form submission compatibility with Medusa setAddresses action
  - Country select stays visible, postal_code defaults to "00000"

## Phase 6: Финализация

- [x] 6.1 SEO и метаданные
  - Title, description для всех 12 страниц (home, store, product, collection, category, cart, checkout, account, login, profile, orders, addresses)
  - "Medusa Store" → "AL-KO Garden Store" во всех metadata
  - Open Graph теги на страницах продуктов (title, description, images)
  - `src/app/sitemap.ts` — динамічний sitemap з products, categories, collections
  - `src/app/robots.ts` — disallow checkout/account/cart для краулерів
  - Перевод контента account страниц на украинский (orders, addresses, profile)

- [x] 6.2 PM2 и production deploy
  - `ecosystem.config.js` з двома сервісами: alko-backend (medusa develop, port 9000), alko-storefront (next dev, port 3104)
  - Логи в `~/.pm2/logs/` (щоб уникнути конфліктів з watcher)
  - Backend: health check OK (/health), API працює
  - Storefront: HTTP 200 на /ua, сторінки рендеряться
  - `pm2 save` — стан збережено для перезапуску

- [x] 6.3 Финальная проверка
  - Backend health: OK (http://localhost:9000/health)
  - Store Products API: 641 товарів, Ukrainian titles, UAH prices
  - Nova Poshta API: searchCities("Київ") → 11429 warehouses, OK
  - Categories API: 35 категорій з українськими назвами
  - Storefront pages: Home (200), Store (200), Cart (200) — all working
  - Titles: "AL-KO Garden Store — Садова техніка", "Каталог — AL-KO", "Кошик — AL-KO"
  - robots.txt: served correctly, disallows checkout/account/cart
  - PM2: alko-backend (154MB), alko-storefront (82MB) — both online

---

## Phase 7: Улучшение импорта — ВСЕ данные из XML

**ЦЕЛЬ**: Импортировать ВСЕ данные из XML: характеристики → product options/attributes, ВСЕ изображения, видео, вес, габариты, бренд. Сейчас всё лежит в metadata, а нужно в структурированных полях.

**XML справка**: Формат — Yandex Market YML. 650 товаров. 174 уникальных параметра.

- [x] 7.1 Обновить скрипт импорта — структурированные характеристики
  - Сейчас все `<param>` идут в `metadata.*` — нужно создать product options/custom attributes
  - **Вес**: `<param name="Вага, кг">` → variant weight (Medusa shipping profile)
  - **Габариты**: `<param name="Довжина упаковки, см">`, `<param name="Ширина упаковки, см">`, `<param name="Висота упаковки, см">` → variant length/width/height
  - **Бренд**: `<vendor>` тег + `<param name="Виробник">` → product.metadata.brand + отображение на фронте
  - **Серія**: `<param name="Серія">` → product.metadata.series
  - **Гарантія**: `<param name="Гарантія">` → product.metadata.warranty
  - **Штрихкод**: `<param name="Штрихкод">` → variant.barcode
  - **Ключевые характеристики** (ТОП-30 по частоте встречаемости) должны быть доступны для фильтрации
  - Данные для фильтрации сохранять в metadata с prefixed keys: `spec_*` (например `spec_width`, `spec_power`)

- [x] 7.2 Обновить импорт — ВСЕ изображения
  - Основное: `<picture>` — уже импортируется
  - Дополнительные фото: `<param name="Посилання на фото">` — 6 товаров
  - Lifestyle фото: `<param name="Посилання на life style фото">` — 129 товаров (19.8%)
  - Все URL изображений → массив `images[]` в product (не только первое)
  - Проверять валидность URL перед добавлением

- [x] 7.3 Обновить импорт — видео ссылки
  - `<param name="Посилання на відео">` — 49 товаров (7.5%)
  - Сохранять в `metadata.video_url`
  - Отображать на фронте в карточке товара (embed YouTube/Vimeo если URL совместим)

- [x] 7.4 Перезапустить импорт с обновленным скриптом
  - Очистить старые данные (или update existing по article)
  - Запустить `npx medusa exec ./src/scripts/import-alko.ts`
  - Верифицировать: характеристики подтянулись, изображения все, вес/габариты заполнены
  - В админке Medusa: проверить что поля отображаются

## Phase 8: Редизайн Storefront — дизайн как WiseCat Shop

**ЦЕЛЬ**: Полный редизайн сторфронта по образцу WiseCat Shop (wisecat.shop). Скриншоты всех страниц — в `.ralph/docs/wisecat-shop-screenshots/`. Весь UI строить на **shadcn/ui компонентах** (уже настроен, есть `components.json`).

**ВАЖНО**: Перед началом прочитай все скриншоты из `.ralph/docs/wisecat-shop-screenshots/` — home.png, catalog.png, product.png, wishlist.png, comparison.png, about.png. Это целевой дизайн!

- [x] 8.1 Header и навигация
  - **Top bar** (тёмный): телефон, email, часы работы, соцсети (Viber, Telegram, WhatsApp), переключатель языков UA/RU
  - **Main header**: логотип AL-KO слева, кнопка "Каталог" (зелёная с иконкой ☰), поиск по центру с `Ctrl+K` хоткеем, иконки справа: избранное (сердечко), сравнение (весы), корзина
  - **Мега-меню**: при клике на "Каталог" — dropdown с категориями и подкатегориями, иконки категорий
  - Мобильная адаптация: бургер-меню
  - Все компоненты через **shadcn/ui**: Sheet (для мобильного меню), DropdownMenu, Dialog, Button, Input

- [x] 8.2 Главная страница
  - **Hero секция**: фоновое изображение газонокосарки, текст "Садова техніка AL-KO", подзаголовок, CTA кнопки "Перейти до каталогу" + "Про бренд"
  - **Категорії техніки**: сетка карточек категорий с иконками (Газонокосарки, Тримери, Культиватори, Пили, Мийки, Генератори, Подрібнювачі)
  - **Популярні товари**: горизонтальний слайдер/грід карточок товарів (фото, назва, ціна, кнопка "Купити")
  - **Переваги**: блок с иконками — "Німецька якість", "Доставка по Україні", "Гарантія від виробника", "Консультація"
  - **Про бренд**: секція з текстом про AL-KO (90 років, Баварія), зображення

- [x] 8.3 Каталог / Категория
  - **Sidebar фільтри**: по категоріях (дерево), по ціні (range slider), по характеристиках (checkboxes — бренд, серія, тип, потужність тощо)
  - **Сортування**: "Новинки", "Від дешевих", "Від дорогих", "За популярністю"
  - **Grid товарів**: 3-4 колонки на десктопі, 2 на планшеті, 1 на мобільному
  - **Карточка товару в каталозі**: фото, назва, рейтинг (зірочки якщо є), ціна, кнопка "Купити" (червона), іконки "В обране" + "Порівняти"
  - Пагінація внизу

- [x] 8.4 Карточка товара (Product Detail Page)
  - **Галерея**: основне фото великим + мініатюри (все зображення з XML)
  - **Відео**: якщо є video_url — embed плеєр під галереєю або в окремому табі
  - **Інфо справа**: назва, артикул, бренд, серія, ціна, наявність, кнопка "Купити" + "В обране" + "Порівняти"
  - **Табы**: "Опис" (HTML description з XML), "Характеристики" (таблиця всіх параметрів), "Відео" (якщо є)
  - **Характеристики**: таблиця зебра-стиль — кожен param з XML відображається як рядок: назва | значення
  - **Рекомендовані товари**: блок знизу з товарами з тієї ж категорії

- [x] 8.5 Кошик (Cart) — Cart Drawer
  - **Cart Drawer**: при клику на корзину — плавно виїжджає правий сайдбар (shadcn Sheet component, side="right")
  - Всередині: список позицій (фото, назва, ціна, кількість +/-, видалити)
  - Підсумок: загальна сума, кнопка "Оформити замовлення"
  - **Fly-to-cart анімація**: при клику "Купити" — мініатюра товару анімовано летить до іконки корзини в хедері
    - Створити clone елемент зображення товару
    - Анімувати position від карточки до іконки корзини (transform + scale + opacity)
    - По завершенню анімації — bounce-ефект на іконці корзини
    - Використати CSS transitions або framer-motion
  - Закриття drawer: клік за межами, кнопка X, Escape

- [x] 8.6 Checkout — одна сторінка
  - **Спрощена форма** на одній сторінці (як на скриншоті WiseCat Shop):
    - Блок 1: Контактні дані (ПІБ, телефон, email)
    - Блок 2: Доставка — Нова Пошта (місто → відділення)
    - Блок 3: Оплата (вибір: LiqPay, Monobank, наложений платіж)
    - Блок 4: Коментар до замовлення
  - Справа: Сводка замовлення (товари, кількість, сума, доставка, загалом)
  - Кнопка "Замовити" внизу
  - Вся сторінка без перезагрузок, валідація в реальному часі

## Phase 9: Глобальний пошук (Ctrl+K)

**ЦЕЛЬ**: Реалізувати пошук як в адмінці Medusa — Ctrl+K оверлей з instant search

**Документація**: `.ralph/docs/search-kit-docs/AGENT_INSTRUCTIONS.md` — повна архітектура пошуку (адаптувати під Medusa API замість Payload CMS)

- [x] 9.1 Backend API для пошуку
  - API Route: `GET /store/search?q=...&limit=15`
  - Пошук по products: title, description, metadata (article, vendor)
  - Пошук по categories: name
  - Повертає: `{ products: [...], categories: [...] }`
  - Debounce на клієнті, мінімум 2 символи

- [x] 9.2 Frontend — Search Overlay компонент
  - **Тригер**: натиснути `Ctrl+K` або клікнути іконку пошуку в хедері
  - **Оверлей**: модальне вікно по центру з backdrop-blur (shadcn Dialog)
  - **Input**: велике поле пошуку з іконкою 🔍 і хінтом "Ctrl+K"
  - **Результати**: список з бейджами (ТОВАР, КАТЕГОРІЯ) — фото, назва, ціна
  - **Навігація**: стрілки вверх/вниз для вибору, Enter — перехід, Escape — закрити
  - **Debounce**: 300ms після останнього натискання
  - **Loading**: скелетон під час завантаження
  - **Empty state**: "Нічого не знайдено" з іконкою

## Phase 10: Мультиязычность (UA + RU)

**ЦЕЛЬ**: Додати підтримку українською та російською мовами. Весь контент перекладений.

- [x] 10.1 Встановити та налаштувати i18n (lightweight, без next-intl)
  - Використано існуючу систему `_medusa_locale` cookie замість next-intl
  - Locales: `uk` (default), `ru`
  - Messages: `src/lib/i18n/messages/uk.json`, `ru.json` (~160 ключів кожен)
  - `TranslationProvider` + `useTranslation()` для client components
  - `getServerTranslation()` для server components
  - Обидва layout'и (main + checkout) обгорнуті TranslationProvider

- [x] 10.2 Перекласти весь статичний контент
  - TopBar, MainHeader, HeaderIcons, SideMenu, MobileMenu
  - Hero, CategoriesGrid, Benefits, AboutBrand, PopularProducts
  - Footer — всі секції (категорії, інформація, контакти)
  - Cart: CartDrawer, CartTemplate, Summary, EmptyCartMessage
  - Checkout: layout, CartTotals
  - Store: StoreTemplate, SortProducts
  - Search: SearchOverlay
  - Product: ProductInfo

- [x] 10.3 Динамічний контент товарів
  - Товари та категорії залишаються українською (з XML)
  - RU-переклад продуктів потребує зміни скрипту імпорту — відкладено

- [x] 10.4 Переключатель мов в хедері
  - UA / RU кнопки в TopBar (desktop) — активна мова підсвічена білим
  - UA / RU кнопки в MobileMenu з Globe іконкою
  - Використовує `updateLocale()` + `router.refresh()` для перемикання
  - Зберігає вибір у cookie `_medusa_locale`

## Phase 11: Избранное і Порівняння товарів

- [ ] 11.1 Функціонал "Обране" (Wishlist)
  - Зберігати в localStorage (для незареєстрованих) або в Medusa customer metadata
  - Іконка сердечка на кожній карточці товару — toggle додати/видалити
  - Сторінка `/wishlist`: список обраних товарів (фото, назва, ціна, кнопка "Купити", видалити)
  - Лічильник обраних на іконці в хедері
  - Пустий стан: "Список бажань порожній" + кнопка "Перейти до каталогу" (як на скриншоті)

- [ ] 11.2 Функціонал "Порівняння" (Comparison)
  - Зберігати в localStorage
  - Іконка ваги на кожній карточці товару — toggle
  - Сторінка `/comparison`: таблиця порівняння — товари як колонки, характеристики як рядки
  - Показувати ВСІ характеристики з metadata (spec_*)
  - Виділяти різні значення кольором
  - Максимум 4 товари для порівняння
  - Лічильник на іконці в хедері
  - Пустий стан: "Список порівняння порожній" + кнопка "Перейти до каталогу"

## Phase 12: Фільтрація, Нова Пошта fix, Payment E2E

- [ ] 12.1 Фільтрація та сортування на основі характеристик
  - **Sidebar фільтри** на сторінці каталогу:
    - По ціні: range slider (min-max)
    - По категорії: дерево з чекбоксами
    - По бренду: checkbox list (з metadata spec_brand)
    - По серії: checkbox list
    - По потужності: checkbox list або range
    - По наявності: toggle "Тільки в наявності"
  - Фільтри працюють через query params або Medusa API filtering
  - URL оновлюється при зміні фільтрів (bookmarkable)
  - Кількість результатів оновлюється динамічно

- [ ] 12.2 Виправити Нову Пошту — відділення не підтягуються
  - **Баг**: при виборі міста відділення НЕ завантажуються
  - Діагностика: перевірити API endpoint `/store/nova-poshta`, логи, response format
  - Перевірити: CityRef правильно передається, API key валідний, response parsing коректний
  - Перевірити frontend: NovaPoshtaWarehouseSelect отримує cityRef, fetch спрацьовує
  - Виправити та протестувати end-to-end: місто → відділення → адреса в checkout

- [ ] 12.3 Тестування платіжних систем end-to-end
  - **LiqPay sandbox**: створити замовлення → оплатити → callback → статус оновлено
  - **Monobank**: перевірити initiatePayment → redirect → webhook
  - Перевірити що payment providers підключені до регіону "Україна"
  - Checkout flow: товар в корзину → НП доставка → оплата → замовлення створено
  - Перевірити webhook URLs доступні ззовні (або через ngrok для тесту)

- [ ] 12.4 Фінальна збірка та перевірка
  - `npm run build` — backend і storefront без помилок
  - PM2: рестарт обох сервісів
  - Перевірити всі сторінки: головна, каталог, товар, кошик, checkout, обране, порівняння, пошук
  - Перевірити мобільну версію
  - Перевірити обидві мови UA/RU
