# AL-KO Garden Store — План разработки

## Phase 1: Backend — Импорт товаров из XML

- [ ] 1.1 Создать скрипт импорта XML (`src/scripts/import-alko.ts`)
  - Скачать XML с `https://apipim.al-ko.ua/storage/xml_files/PriceList.xml`
  - Распарсить YML-формат (xml2js или fast-xml-parser)
  - Маппинг категорий: `<category id="N">Назва</category>` → Medusa product categories
  - Создать 36 категорий через Medusa Admin API или SDK
  - Импортировать 650 товаров: name_ua → title, description_ua → description, price → variant price (UAH), stock_quantity → inventory, picture → thumbnail/images, article → sku, params → metadata
  - Запустить: `npx medusa exec ./src/scripts/import-alko.ts`

- [ ] 1.2 Настроить регион Украина и валюту UAH
  - Создать регион "Україна" с валютой UAH
  - Настроить налоги (ПДВ 20% включен в цену)
  - Добавить sales channel для storefront

- [ ] 1.3 Верифицировать импорт
  - Проверить что все 650 товаров появились в Admin (localhost:9000/app)
  - Проверить категории, цены, изображения
  - Исправить ошибки импорта если есть

## Phase 2: Backend — Интеграция с Новой Поштой

**ВАЖНО**: Подробная документация по реализации — `.ralph/docs/NOVA-POSHTA-MODULE.md`. Прочитай этот файл ПЕРЕД началом работы — он содержит готовые типы, API-клиент, провайдер и API route.

- [ ] 2.1 Создать API-клиент Нової Пошти (`src/modules/nova-poshta-fulfillment/lib/nova-poshta.ts`)
  - Env: `NOVAPOSHTA_API_KEY` (уже в .env как `NOVA_POSHTA_API_KEY` — переименуй в `NOVAPOSHTA_API_KEY`)
  - Base URL: `https://api.novaposhta.ua/v2.0/json/` (всегда POST)
  - API key передаётся в body (НЕ в headers!)
  - Функция `searchCities(query)` → `Address.searchSettlements`
    - ВАЖНО: возвращай `DeliveryCity` как `ref`, НЕ `Ref` (Settlement ref) — это разные поля!
  - Функция `getWarehouses(cityRef, query?)` → `Address.getWarehouses`
  - Функция `isConfigured()` → проверка наличия API ключа
  - Типы: `NpCity { ref, name, fullName, area, settlementRef, warehouseCount }`, `NpWarehouse { ref, number, description, shortAddress, cityRef, typeRef }`

- [ ] 2.2 Создать Fulfillment Provider (`src/modules/nova-poshta-fulfillment/service.ts`)
  - Extends `AbstractFulfillmentProviderService` из `@medusajs/framework/utils`
  - `static identifier = "nova-poshta"`
  - `getFulfillmentOptions()` → 2 опции: `nova-poshta-warehouse` и `nova-poshta-courier`
  - `validateFulfillmentData()` → проверяет city_ref, city_name, warehouse_description
  - `calculatePrice()` → пока flat rate: 70 UAH (warehouse), 120 UAH (courier). Цены в копійках: 7000, 12000
  - `createFulfillment()` → сохраняет city_name, warehouse_description в data
  - Регистрация: `index.ts` → `ModuleProvider(Modules.FULFILLMENT, { services: [NovaPoshtaFulfillmentService] })`

- [ ] 2.3 Создать API Route для автокомплита (`src/api/store/nova-poshta/route.ts`)
  - `POST /store/nova-poshta` с body `{ action: "searchCities", query: "Ки" }` или `{ action: "getWarehouses", cityRef: "..." }`
  - Использует `MedusaRequest`/`MedusaResponse` из `@medusajs/framework/http`
  - Проксирует запросы к API-клиенту (скрывает API key)

- [ ] 2.4 Зарегистрировать в `medusa-config.ts` и тестировать
  - Добавить в `modules[]`: `{ resolve: "@medusajs/medusa/fulfillment", options: { providers: [{ resolve: "./src/modules/nova-poshta-fulfillment", id: "nova-poshta" }] } }`
  - Запустить backend, проверить `POST /store/nova-poshta { action: "searchCities", query: "Київ" }`
  - В Admin → Regions → Ukraine → добавить shipping options

## Phase 3: Backend — Платёжные системы

- [ ] 3.1 Создать Payment Provider для Monobank (`src/modules/monobank/`)
  - Token: `mzmCQy1XQBw1f4C1wqmvMww`
  - Monobank Acquiring API: `https://api.monobank.ua/api/merchant/invoice/create`
  - Реализовать Medusa Payment Provider interface
  - Создание инвойса → редирект на оплату → webhook подтверждения
  - Поля: amount (в копійках), merchantPaymInfo (reference, destination), redirectUrl, webHookUrl

- [ ] 3.2 Создать Payment Provider для LiqPay (`src/modules/liqpay/`)
  - LiqPay API: `https://www.liqpay.ua/api/3/checkout`
  - Формирование data + signature (base64 + SHA1)
  - Параметры: version=3, action=pay, amount, currency=UAH, description, order_id
  - Public/Private key нужно будет получить у пользователя (пока заглушка)
  - Callback URL для server-to-server уведомлений

- [ ] 3.3 Зарегистрировать payment providers в Medusa
  - Добавить модули в `medusa-config.ts`
  - Привязать к региону Україна
  - Настроить webhook endpoints

## Phase 4: Storefront — Украинская локализация

- [ ] 4.1 Украинизация storefront
  - Перевести все UI-строки на украинский язык
  - Файлы переводов / i18n настройка
  - Формат цен: `15 899 ₴` (пробел как разделитель тысяч, знак гривни)
  - Формат телефонов: `+380 XX XXX XX XX`

- [ ] 4.2 Адаптировать header/footer
  - Логотип AL-KO (взять с alko-garden.com.ua или из XML)
  - Навигация по категориям садовой техніки
  - Контакты, телефон, email в footer
  - Ссылки на соцсети (если есть)

- [ ] 4.3 Страница каталога
  - Фильтры по категориям (36 категорий)
  - Сортировка: по цене, по назві, по наявності
  - Пагінація
  - Карточки товаров с изображениями, ценой, кнопкой "В кошик"

## Phase 5: Storefront — Checkout с Новой Поштою

**ВАЖНО**: Документация по компонентам — `.ralph/docs/NOVA-POSHTA-MODULE.md` (Layer 3: Frontend Components)

- [ ] 5.1 Компонент NovaPoshtaCitySelect (автокомплит міст)
  - Storefront: `/home/developer/projects/alko-store-storefront/`
  - Пользователь вводит >= 2 символів → debounce 300ms → fetch `POST {MEDUSA_BACKEND_URL}/store/nova-poshta { action: "searchCities", query }`
  - Dropdown с cityName, fullName, warehouseCount
  - При выборе: `onSelect(city)` с { ref (DeliveryCity!), name, fullName, area, warehouseCount }
  - Keyboard: Enter = первый вариант, Escape = закрыть
  - Иконки: spinner (загрузка), checkmark (выбрано), search (по умолчанию)

- [ ] 5.2 Компонент NovaPoshtaWarehouseSelect (автокомплит відділень)
  - Получает `cityRef` prop (из city selection)
  - При смене cityRef — eager load ВСЕХ відділень для города
  - Пользовательский ввод фильтрует локально (без API call), debounce 150ms
  - При смене города — сброс выбранного відділення
  - Плейсхолдер "Спочатку оберіть місто" когда нет cityRef

- [ ] 5.3 Интеграция checkout формы
  - Форма доставки: ПІБ одержувача, телефон (+380), місто (NovaPoshtaCitySelect), відділення (NovaPoshtaWarehouseSelect)
  - При підтвердженні: `medusa.carts.addShippingMethod(cartId, { option_id, data: { city_ref, city_name, warehouse_description } })`
  - Форма оплати: Monobank / Оплата при отриманні
  - Підтвердження замовлення, статус

## Phase 6: Финализация

- [ ] 6.1 SEO и метаданные
  - Title, description для всех страниц
  - Open Graph теги
  - Sitemap.xml
  - robots.txt

- [ ] 6.2 PM2 и production deploy
  - Настроить PM2 для backend (порт 9000)
  - Настроить PM2 для storefront (порт 3104)
  - `npm run build` для обоих
  - Проверить production mode

- [ ] 6.3 Финальная проверка
  - Весь flow: каталог → карточка товара → корзина → checkout → оплата
  - Мобільна версія
  - Перевірка всіх 36 категорій
  - Перевірка пошуку товарів
