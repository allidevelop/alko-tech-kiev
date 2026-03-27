## Language
Always respond in Russian. Exception: technical terms that are commonly written in English (API, webhook, middleware, etc.).

# AL-KO Garden Store

Medusa.js v2 e-commerce backend for AL-KO garden equipment store (Ukrainian market).

## Quick Start
```bash
npm run dev          # Start dev server on port 9000
npm run build        # Build for production
```

## Storefront
Located at: `/home/developer/projects/alko-store-storefront/`
```bash
cd /home/developer/projects/alko-store-storefront && npm run dev  # Port 8000
```

## Database
PostgreSQL: `postgres://medusa_alko:medusa_alko_2026@localhost:5432/medusa_alko`

## Production
- Domain: https://alko-technics.kiev.ua
- Admin: https://alko-technics.kiev.ua/app
- Storefront: https://alko-technics.kiev.ua
- Deploy: `bash deploy.sh all` (or `backend` / `storefront`)
- IMPORTANT: Always reference production URLs, not localhost

## Admin Credentials
- Email: admin@alko-store.ua
- Password: Admin123!

## Notifications
After completing each task/iteration, send a Telegram notification:
```bash
curl -s -X POST "https://api.telegram.org/bot8080753063:AAF3JMs_4xzaJvkmy_1gtO16N8ElU_wgaSc/sendMessage" \
  -d chat_id=6552346228 \
  -d parse_mode=Markdown \
  -d text="MESSAGE_HERE"
```

## Product Catalog
- Source: `https://apipim.al-ko.ua/storage/xml_files/PriceList.xml`
- 650 products, 36 categories, Ukrainian language, UAH currency

## Integrations
- Nova Poshta (shipping): API key in .env
- Monobank (payments): Token in .env
- LiqPay (payments): To be configured

## Architecture
Medusa v2 modular architecture:
- `src/modules/` — custom modules (nova-poshta, monobank, liqpay)
- `src/api/` — custom API routes
- `src/scripts/` — import scripts
- `src/workflows/` — business logic workflows
- `src/subscribers/` — event handlers

## Documentation & Reference
- **FULL Medusa docs**: `.ralph/docs/medusa-llms-full.txt` (6.3 MB, 166K lines — ALL of Medusa v2 docs in one file)
- **Medusa MCP Server**: connected at `https://docs.medusajs.com/mcp` — query for real-time docs
- **Agent Skills**: `.ralph/docs/medusa-skills/` + `.ralph/docs/storefront-skills/` — official best practices
- **Module docs**: `.ralph/docs/NOVA-POSHTA-MODULE.md`, `MONOBANK-PAYMENT-MODULE.md`, `LIQPAY-PAYMENT-MODULE.md`
- **Payment Provider API**: `.ralph/docs/MEDUSA-PAYMENT-PROVIDER-REFERENCE.md`

---

## Operations (`ops/`)

Автоматизация заказов, маркетплейс-фиды и Telegram-бот расположены в `ops/`:

```
ops/
├── order-automation/         # B2B дилер, stock-check, NP TTN, Monobank оплата
│   ├── .env                  # Credentials (Prom, NP, B2B, Gmail, Mono)
│   ├── cron-automation.js    # Полный пайплайн обработки заказов
│   ├── prom-monitor.js       # Мониторинг новых заказов Prom.ua (*/5 мин)
│   ├── prom-api.js           # Prom.ua API
│   ├── rozetka-api.js        # Rozetka API
│   ├── nova-poshta.js        # Создание ТТН
│   ├── stock-checker.js      # Проверка наличия (XML + Excel)
│   ├── b2b-dealer.js         # Puppeteer: оформление в B2B кабинете AL-KO
│   ├── np-tracker.js         # Трекинг посылок НП
│   ├── monobank/             # KEP-логин, оплата счетов, сессия
│   ├── dashboard.db          # SQLite: заказы и события
│   ├── documents/            # PDF накладных НП
│   └── logs/                 # Логи всех кронов
├── telegram-bridge/          # Telegram <-> Claude Code мост
│   └── bot.js                # @alko_technics_bot
├── marketplace-feeds/        # XML фиды для маркетплейсов
│   ├── rozetka-integration/  # PHP прокси (порт 8089)
│   ├── prom-integration/     # PHP прокси (порт 8090)
│   ├── alko-epicentr-project/ # Python конвертер
│   ├── epicentr-api/         # Node.js утилиты Epicentr API
│   └── update_feeds.sh       # Обновление всех фидов
└── credentials/              # KEP .pfx, OAuth секреты
```

## Order Automation Pipeline

Автоматическая обработка заказов Prom.ua / Rozetka:
1. **Мониторинг** — prom-monitor.js каждые 5 мин проверяет новые заказы
2. **Проверка наличия** — XML каталог + Excel остатки из Gmail
3. **Создание ТТН** — Nova Poshta API (наложка / предоплата)
4. **Скачивание документов** — express + zebra PDF
5. **Сохранение декларации** — привязка ТТН к заказу на маркетплейсе
6. **B2B кабинет** — Puppeteer оформляет заказ на b2b.al-ko.ua
7. **Оплата счетов** — мониторинг Gmail, оплата через MonoBank KEP
8. **Ответ поставщику** — reply Наташе с квитанцией + накладными

### Команды order-automation
```bash
cd ops/order-automation
node prom-monitor.js                      # Проверить новые заказы
node cron-automation.js                   # Полный пайплайн
node np-tracker.js                        # Трекинг НП
node monobank/kep-login.js                # Обновить сессию MonoBank
node monobank/process-invoices.js         # Обработать счета
node stock-snapshot.js                    # Снапшот остатков
```

## Marketplace Feeds

| Маркетплейс | Формат | Порт | Команда |
|-------------|--------|------|---------|
| Rozetka | PHP proxy | 8089 | `php ops/marketplace-feeds/rozetka-integration/rozetka-xml-proxy/index.php` |
| Prom.ua | PHP proxy | 8090 | `php ops/marketplace-feeds/prom-integration/index.php` |
| Epicentr | Python | — | `python3 ops/marketplace-feeds/alko-epicentr-project/scripts/alko_to_epicentr.py` |

**XML источник:** `https://apipim.al-ko.ua/storage/xml_files/PriceList.xml`

## Cron Jobs (`ops/order-automation/`)

```
*/5  * * * *  prom-monitor.js           # Мониторинг заказов Prom
*/30 * * * *  monobank/process-invoices  # Оплата счетов
0 */6 * * *   np-tracker.js             # Трекинг НП
0 */6 * * *   monobank/kep-login.js     # Обновление сессии MonoBank
0 9   * * *   stock-snapshot.js         # Снапшот остатков
30 10 * * *   cron-automation.js        # Полный пайплайн
```

## Telegram Bot Commands

- `/help` — все команды
- `/status` — текущий статус
- `/danger` — пропустить подтверждения
- `/safe` — требовать подтверждения
- `/new` — новая сессия
- `/opus` — модель Opus
- `/sonnet` — модель Sonnet

## Key URLs

| Ресурс | URL |
|--------|-----|
| AL-KO XML | https://apipim.al-ko.ua/storage/xml_files/PriceList.xml |
| Rozetka Validator | https://seller.rozetka.com.ua/gomer/pricevalidate/check/index |
| Epicentr API | https://api.epicentrm.com.ua/swagger/ |
| B2B кабинет | https://b2b.al-ko.ua |
| Dashboard | http://144.91.95.134:3999 |
