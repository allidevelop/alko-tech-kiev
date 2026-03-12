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

- [ ] 2.1 Создать модуль Fulfillment Provider для Нової Пошти (`src/modules/nova-poshta/`)
  - API Key: `05a0e1a779265accf96c4dfdbd9fde4c`
  - Реализовать Medusa Fulfillment Provider interface
  - API эндпоинты Нової Пошти:
    - `Address/searchSettlements` — поиск населённых пунктов
    - `AddressGeneral/getWarehouses` — получить отделения/поштомати
    - `InternetDocument/save` — создать ТТН (накладную)
    - `InternetDocument/getDocumentPrice` — рассчитать стоимость доставки
  - Базовый URL: `https://api.novaposhta.ua/v2.0/json/`

- [ ] 2.2 Создать API routes для поиска отделений (`src/api/store/nova-poshta/`)
  - `GET /store/nova-poshta/cities?q=Київ` — поиск городов
  - `GET /store/nova-poshta/warehouses?cityRef=XXX` — отделения в городе
  - Кэширование результатов (в памяти или Redis)

- [ ] 2.3 Зарегистрировать fulfillment provider в Medusa
  - Добавить модуль в `medusa-config.ts`
  - Настроить shipping options (доставка на відділення, поштомат, кур'єр)
  - Тестировать расчёт стоимости

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

## Phase 5: Storefront — Checkout с Новой Поштой

- [ ] 5.1 Форма доставки
  - Автокомплит города Нової Пошти (поиск через API)
  - Выбор отделения/поштомату из списка
  - Отображение стоимости доставки
  - Поля: ПІБ одержувача, телефон

- [ ] 5.2 Форма оплаты
  - Выбор: Monobank / LiqPay / Оплата при отриманні (накладний платіж)
  - Редирект на страницу оплаты (Monobank/LiqPay)
  - Страница успешной оплаты / ошибки

- [ ] 5.3 Страница заказа
  - Підтвердження замовлення
  - Номер ТТН (когда создана)
  - Статус замовлення

## Phase 6: Финализация

- [ ] 6.1 SEO и метаданные
  - Title, description для всех страниц
  - Open Graph теги
  - Sitemap.xml
  - robots.txt

- [ ] 6.2 PM2 и production deploy
  - Настроить PM2 для backend (порт 9000)
  - Настроить PM2 для storefront (порт 8000)
  - `npm run build` для обоих
  - Проверить production mode

- [ ] 6.3 Финальная проверка
  - Весь flow: каталог → карточка товара → корзина → checkout → оплата
  - Мобільна версія
  - Перевірка всіх 36 категорій
  - Перевірка пошуку товарів
