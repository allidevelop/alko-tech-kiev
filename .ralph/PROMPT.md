# AL-KO Garden Store — Medusa.js E-Commerce

## Context

Ты разрабатываешь интернет-магазин садовой техники AL-KO для украинского рынка.
Платформа: **Medusa.js v2** (backend) + **Next.js Starter Storefront** (frontend).
650 товаров импортируются из XML-каталога AL-KO. Целевая аудитория — Украина.
Валюта — UAH, язык — украинский.

Проект состоит из двух частей:
- **Backend (Medusa)**: `/home/developer/projects/alko-store/` — порт 9000
- **Storefront (Next.js)**: `/home/developer/projects/alko-store-storefront/` — порт 3104

## Current Objectives

Следуй плану в `.ralph/fix_plan.md`. Выполняй задачи последовательно, по одной за итерацию.

## Key Technical Details

### Stack
- **Backend**: Medusa.js v2.13, Node.js 22, PostgreSQL 16, TypeScript
- **Frontend**: Next.js (Medusa Starter Storefront), Tailwind CSS
- **DB**: PostgreSQL — `medusa_alko` на `localhost:5432`
- **Backend port**: 9000 (Medusa default)
- **Storefront port**: 3104 (изменён с дефолтного 8000, т.к. 8000 занят)

### Database
```
DATABASE_URL=postgres://medusa_alko:medusa_alko_2026@localhost:5432/medusa_alko
```

### XML Каталог товаров
- URL: `https://apipim.al-ko.ua/storage/xml_files/PriceList.xml`
- Формат: YML (Yandex Market Language)
- 650 товаров, 36 категорий
- Поля: `name_ua`, `description_ua`, `price` (UAH), `stock_quantity`, `picture` (URLs), `categoryId`, `article`, `vendor`, `param` (specs)
- Параметры: Штрихкод, Вага, Серія, Гарантія, Виробник, Тип, Ширина захвату и др.

### API Keys
- **Nova Poshta API**: env var `NOVAPOSHTA_API_KEY=05a0e1a779265accf96c4dfdbd9fde4c`
- **Monobank Token**: `mzmCQy1XQBw1f4C1wqmvMww`

### Документация по модулям
- **Nova Poshta Module** (полная реализация): `.ralph/docs/NOVA-POSHTA-MODULE.md`
  - Содержит: API-клиент, типы, Fulfillment Provider, API route, frontend компоненты
  - ОБЯЗАТЕЛЬНО прочитай этот файл перед Phase 2 и Phase 5
- **Monobank Payment Module** (полная реализация): `.ralph/docs/MONOBANK-PAYMENT-MODULE.md`
  - Содержит: API-клиент, createInvoice, ECDSA webhook verification, Payment Provider, webhook handler
  - Redirect-based flow: initiatePayment → pageUrl → webhook → AUTHORIZED
  - ОБЯЗАТЕЛЬНО прочитай этот файл перед Phase 3

### Medusa v2 Architecture

Medusa v2 uses a modular architecture. Custom functionality is added through:

1. **Modules** (`src/modules/`) — custom data models, services, repositories
2. **API Routes** (`src/api/`) — custom REST endpoints
3. **Subscribers** (`src/subscribers/`) — event handlers
4. **Workflows** (`src/workflows/`) — multi-step business logic
5. **Links** (`src/links/`) — relationships between modules
6. **Jobs** (`src/jobs/`) — scheduled tasks

**Important Medusa v2 conventions:**
- Use `@medusajs/framework` for all utilities
- Custom modules need to be registered in `medusa-config.ts`
- Admin customizations go to `src/admin/`
- Storefront uses Medusa JS SDK (`@medusajs/js-sdk`) or REST API

### Useful Commands
```bash
# Backend
cd /home/developer/projects/alko-store
npm run dev                    # Start backend (port 9000)
npm run build                  # Build
npx medusa exec ./src/scripts/seed.ts  # Seed data

# Storefront
cd /home/developer/projects/alko-store-storefront
npm run dev                    # Start storefront (port 3104)
npm run build                  # Build
```

## Key Principles

1. **ONE task per loop** — закончи одну задачу, зафиксируй результат, потом переходи к следующей
2. **Используй subagents** для больших исследований (Task tool с Explore agent)
3. **Коммить после каждой задачи** — `git add . && git commit -m "описание"`
4. **ВСЕГДА проверяй** что backend/storefront запускается после изменений
5. **Читай документацию Medusa** через WebFetch если не уверен в API
6. **Не меняй** `.ralph/`, `.ralphrc` — это protected files
7. **Пиши на украинском** весь пользовательский контент (UI, описания, категории)

## Protected Files

- `.ralph/` — вся директория Ralph
- `.ralphrc` — конфиг Ralph
- `.env` — переменные окружения (можно читать, менять осторожно)

## Testing Guidelines

- После каждого модуля: запускай `npm run dev` и проверяй что сервер поднимается
- Для storefront: `npm run build` должен проходить без ошибок
- Интеграционные тесты не обязательны на первом этапе
- Фокус на работоспособность: товары отображаются, корзина работает, checkout проходит

## Status Reporting

После каждой итерации обновляй `.ralph/fix_plan.md` — отмечай выполненные задачи `[x]`.

В конце каждой итерации пиши блок:
```
<!-- RALPH_STATUS
loop: N
task: "название задачи"
status: done|in_progress|blocked
next: "следующая задача"
error: "описание ошибки если есть"
-->
```
