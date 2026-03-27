# CL MERCH — Полное руководство по развёртыванию проекта

## Обзор задачи

Развернуть копию интернет-магазина на базе Medusa.js v2 + Next.js для проекта **CL MERCH** (военно-тактическое снаряжение, дропшиппинг, украинский рынок). Проект создаётся на основе существующей сборки AL-KO Store, которая уже содержит все необходимые модули, интеграции и UI-компоненты.

**Исходная сборка (донор):**
- Backend: `/home/developer/projects/alko-store/` (GitHub: `git@github.com:allidevelop/alko-tech-kiev.git`)
- Storefront: `/home/developer/projects/alko-store-storefront/` (GitHub: `git@github.com:allidevelop/alko-store-storefront.git`)

**Целевой проект:**
- Backend: `/home/developer/projects/clmerch-store/`
- Storefront: `/home/developer/projects/clmerch-storefront/`
- Домен: `clmerch.com`
- Storefront порт: **3107**
- Backend порт: **9001**

---

## Техническое задание клиента (краткое содержание)

**CL Merch** — интернет-магазин военно-тактического снаряжения (дропшиппинг).

### Поставщики (5 штук):
| Поставщик | Префикс SKU | Формат фида | Сайт |
|-----------|-------------|-------------|------|
| Klost | KLO | XML (Prom) | klost.ua |
| FamTac | FAM | XLSX (Excel) | famtac.com |
| Свит | SVT | XML (Prom) | svit.net.ua |
| Мелго | MLG | XML (Google Merchant) | melgo.prom.ua |
| Kiborg | KBG | XML (Prom) | tactic-shop.in.ua |

### Ключевые требования:
- SKU с префиксом поставщика: `KLO-789234`, `FAM-T4512` и т.д.
- Система модерации импорта (новые товары НЕ публикуются автоматически)
- Маппинг категорий поставщиков → категории магазина
- 4 роли: Super Admin, Менеджер, Контент-менеджер, Модератор импорта
- MeiliSearch для полнотекстового поиска
- Дизайн: тёмные тона (милитари), минимализм
- Нова Пошта — обязательно
- Оплата: наложенный платёж (обязательно), онлайн (LiqPay/Monobank — опционально)
- Язык: украинский (основной), русский (опционально)
- Валюта: UAH
- Google Analytics 4, Facebook Pixel
- Binotel CRM (второй этап)

---

## Серверные требования

Проект разворачивается на том же VPS-сервере (Contabo), где уже работает AL-KO Store.

### Уже установлено на сервере:
- Node.js 20+ и npm 10+
- PostgreSQL 16
- Redis 7+
- PM2 (менеджер процессов)
- nginx
- Certbot (SSL)
- Git
- Python 3.12 (для скриптов)

### Нужно будет установить дополнительно:
- **MeiliSearch** (self-hosted) — для полнотекстового поиска

```bash
# Установка MeiliSearch
curl -L https://install.meilisearch.com | sh
# Или через Docker:
# docker run -d -p 7700:7700 getmeili/meilisearch:latest
```

---

## Шаг 1: Создание базы данных

```bash
# Подключиться к PostgreSQL
sudo -u postgres psql

# Создать пользователя и базу
CREATE USER medusa_clmerch WITH PASSWORD 'medusa_clmerch_2026';
CREATE DATABASE medusa_clmerch OWNER medusa_clmerch;
GRANT ALL PRIVILEGES ON DATABASE medusa_clmerch TO medusa_clmerch;
\q
```

**Проверка подключения:**
```bash
psql postgres://medusa_clmerch:medusa_clmerch_2026@localhost:5432/medusa_clmerch -c "SELECT 1;"
```

---

## Шаг 2: Клонирование и настройка Backend

### 2.1 Клонирование
```bash
cd /home/developer/projects
git clone git@github.com:allidevelop/alko-tech-kiev.git clmerch-store
cd clmerch-store
```

### 2.2 Установка зависимостей
```bash
npm install
```

### 2.3 Настройка .env

Создать файл `/home/developer/projects/clmerch-store/.env`:

```env
MEDUSA_ADMIN_ONBOARDING_TYPE=nextjs

# CORS — обновить под новый домен и порты
STORE_CORS=http://localhost:3107,http://144.91.95.134:3107,http://clmerch.com,https://clmerch.com,https://docs.medusajs.com
ADMIN_CORS=http://localhost:5173,http://localhost:9001,http://144.91.95.134:9001,http://clmerch.com,https://clmerch.com,https://docs.medusajs.com
AUTH_CORS=http://localhost:5173,http://localhost:9001,http://localhost:3107,http://144.91.95.134:9001,http://144.91.95.134:3107,http://clmerch.com,https://clmerch.com,https://docs.medusajs.com

# Redis — использовать отдельную БД (database 1, чтобы не конфликтовать с AL-KO на database 0)
REDIS_URL=redis://localhost:6379/1

# Секреты — СГЕНЕРИРОВАТЬ НОВЫЕ!
JWT_SECRET=<сгенерировать: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
COOKIE_SECRET=<сгенерировать: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">

# База данных
DATABASE_URL=postgres://medusa_clmerch:medusa_clmerch_2026@localhost:5432/medusa_clmerch

MEDUSA_ADMIN_ONBOARDING_NEXTJS_DIRECTORY=clmerch-storefront

# Публичные URL
MEDUSA_BACKEND_URL=https://clmerch.com
STORE_URL=https://clmerch.com

# Nova Poshta — ЗАПРОСИТЬ У КЛИЕНТА свой API-ключ или использовать общий
NOVAPOSHTA_API_KEY=<api_key_клиента_или_существующий>

# Платежи — НАСТРОИТЬ ПОД КЛИЕНТА
# Monobank (опционально — если клиент подключит)
# MONOBANK_TOKEN=<token>
# MONOBANK_CHAST_STORE_ID=<store_id>
# MONOBANK_CHAST_STORE_SECRET=<secret>

# LiqPay (опционально)
# LIQPAY_PUBLIC_KEY=<public_key>
# LIQPAY_PRIVATE_KEY=<private_key>

# Google Analytics — ЗАПРОСИТЬ У КЛИЕНТА
# GA_MEASUREMENT_ID=<measurement_id>
# GA_API_SECRET=<api_secret>

# Google OAuth (опционально)
# GOOGLE_CLIENT_ID=<client_id>
# GOOGLE_CLIENT_SECRET=<client_secret>
# GOOGLE_CALLBACK_URL=https://clmerch.com/ua/google-callback

# Telegram уведомления — НАСТРОИТЬ НА БОТА КЛИЕНТА
# TELEGRAM_BOT_TOKEN=<bot_token>
# TELEGRAM_CHAT_ID=<chat_id>

# Кэширование
MEDUSA_FF_CACHING=true

# Checkbox — фискализация (опционально, настроить если нужно)
# CHECKBOX_PIN_CODE=<pin>
# CHECKBOX_LICENSE_KEY=<license>
# CHECKBOX_CASHIER_LOGIN=<login>

# Resend — email (настроить домен клиента)
# RESEND_API_KEY=<api_key>
# RESEND_FROM=CL Merch <noreply@clmerch.com>

# MeiliSearch
MEILISEARCH_HOST=http://localhost:7700
MEILISEARCH_API_KEY=<master_key>

# Backend порт
PORT=9001
```

### 2.4 Обновить medusa-config.ts

Файл: `/home/developer/projects/clmerch-store/medusa-config.ts`

Изменения:
1. Заменить `allowedHosts` с `alko-technics.kiev.ua` на `clmerch.com`
2. Убрать модули, которые не нужны на старте (checkbox — пока не нужен)
3. Добавить модуль MeiliSearch (если будет подключён)

```typescript
import { loadEnv, defineConfig } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

const authProviders: any[] = [
  {
    resolve: "@medusajs/medusa/auth-emailpass",
    id: "emailpass",
  },
]

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  authProviders.push({
    resolve: "@medusajs/medusa/auth-google",
    id: "google",
    options: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackUrl: process.env.GOOGLE_CALLBACK_URL,
    },
  })
}

module.exports = defineConfig({
  featureFlags: {
    caching: true,
    translation: true,
  },
  admin: {
    vite: () => ({
      server: {
        allowedHosts: ["clmerch.com", "localhost"],
      },
    }),
  },
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    }
  },
  modules: [
    {
      resolve: "./src/modules/product-specs",
    },
    {
      resolve: "./src/modules/resend-notification",
    },
    {
      resolve: "./src/modules/import-manager",
    },
    {
      resolve: "@medusajs/medusa/translation",
    },
    {
      resolve: "@medusajs/medusa/caching",
      options: {
        providers: [
          {
            resolve: "@medusajs/caching-redis",
            id: "caching-redis",
            is_default: true,
            options: {
              redisUrl: process.env.REDIS_URL || "redis://localhost:6379/1",
            },
          },
        ],
      },
    },
    {
      resolve: "@medusajs/medusa/auth",
      options: {
        providers: authProviders,
      },
    },
    {
      resolve: "@medusajs/medusa/fulfillment",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/fulfillment-manual",
            id: "manual",
          },
          {
            resolve: "./src/modules/nova-poshta-fulfillment",
            id: "nova-poshta",
          },
        ],
      },
    },
    {
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [
          {
            resolve: "./src/modules/cod-payment",
            id: "cod",
          },
          // Раскомментировать когда клиент предоставит ключи:
          // {
          //   resolve: "./src/modules/monobank-payment",
          //   id: "monobank",
          // },
          // {
          //   resolve: "./src/modules/liqpay-payment",
          //   id: "liqpay-payment",
          //   options: {
          //     publicKey: process.env.LIQPAY_PUBLIC_KEY,
          //     privateKey: process.env.LIQPAY_PRIVATE_KEY,
          //   },
          // },
        ],
      },
    },
  ],
})
```

### 2.5 Запуск миграций и seed

```bash
cd /home/developer/projects/clmerch-store

# Запуск миграций (создаёт все таблицы)
npx medusa db:migrate

# Создание admin-пользователя
npx medusa user -e admin@clmerch.com -p Admin123!
```

### 2.6 Первый запуск (проверка)

```bash
PORT=9001 npx medusa develop
# Должен запуститься на http://localhost:9001
# Admin панель: http://localhost:9001/app
# Логин: admin@clmerch.com / Admin123!
```

### 2.7 Начальная настройка через Admin UI

После первого входа в админку (http://localhost:9001/app):

1. **Store Settings** → изменить название магазина на "CL Merch"
2. **Regions** → создать регион "Украина":
   - Currency: UAH
   - Countries: UA (Украина)
   - Payment providers: COD (наложенный платёж)
   - Fulfillment providers: Nova Poshta + Manual
3. **Sales Channels** → создать "CL Merch Webstore"
4. **API Keys** → создать Publishable Key, привязать к Sales Channel → **СОХРАНИТЬ КЛЮЧ** для storefront .env
5. **Категории** — создать структуру категорий согласно ТЗ:
   - Рації та зв'язок
   - Плитоноски
   - Засоби індивідуального захисту
   - Тактична медицина
   - Аксесуари
   - (остальные — согласовать с клиентом)

---

## Шаг 3: Клонирование и настройка Storefront

### 3.1 Клонирование
```bash
cd /home/developer/projects
git clone git@github.com:allidevelop/alko-store-storefront.git clmerch-storefront
cd clmerch-storefront
```

### 3.2 Установка зависимостей
```bash
npm install
```

### 3.3 Настройка .env.local

Создать файл `/home/developer/projects/clmerch-storefront/.env.local`:

```env
# Backend URL — для dev и production
MEDUSA_BACKEND_URL=http://localhost:9001
NEXT_PUBLIC_MEDUSA_BACKEND_URL=https://clmerch.com

# Publishable Key — взять из Admin UI (Шаг 2.7, п.4)
NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=<pk_из_админки>

# Public URL магазина
NEXT_PUBLIC_BASE_URL=https://clmerch.com

# Internal URL (server-to-server)
NEXT_INTERNAL_URL=http://localhost:3107

# Регион по умолчанию
NEXT_PUBLIC_DEFAULT_REGION=ua

# Stripe (не используется на старте)
NEXT_PUBLIC_STRIPE_KEY=
NEXT_PUBLIC_MEDUSA_PAYMENTS_PUBLISHABLE_KEY=
NEXT_PUBLIC_MEDUSA_PAYMENTS_ACCOUNT_ID=

# Revalidation
REVALIDATE_SECRET=<сгенерировать_новый>

# MeiliSearch (для клиентского поиска)
# NEXT_PUBLIC_MEILISEARCH_HOST=https://clmerch.com/search
# NEXT_PUBLIC_MEILISEARCH_API_KEY=<public_search_key>

# S3 (если будет)
MEDUSA_CLOUD_S3_HOSTNAME=
MEDUSA_CLOUD_S3_PATHNAME=
```

### 3.4 Ребрендинг storefront

Необходимо заменить все упоминания AL-KO на CL Merch:

#### 3.4.1 Файлы для замены текстов и брендинга:

```
src/app/layout.tsx                    — title, description, metadata
src/app/robots.ts                     — sitemap URL → clmerch.com
src/app/sitemap.ts                    — base URL → clmerch.com
src/lib/constants.tsx                 — название магазина, контакты
src/lib/config.ts                     — конфигурация
src/modules/layout/templates/nav/     — логотип, навигация
src/modules/layout/templates/footer/  — подвал, контакты, соцсети
src/modules/home/components/hero/     — главный баннер
src/lib/i18n/messages/uk.json         — переводы (заменить AL-KO → CL Merch)
src/lib/i18n/messages/ru.json         — переводы (заменить AL-KO → CL Merch)
```

#### 3.4.2 Дизайн — изменить цветовую схему:

Файл: `tailwind.config.js` и `src/styles/globals.css`

Текущая схема AL-KO (зелёный/белый) → заменить на тёмную милитари-схему:
- Primary: тёмно-зелёный (#2D3B2D) или оливковый (#556B2F)
- Background: тёмный (#1A1A1A или #0F1410)
- Surface: антрацит (#2A2A2A)
- Text: светлый (#E5E5E5)
- Accent: оранжевый (#FF6B35) или хаки (#8B7D6B)
- **Согласовать точные цвета с клиентом перед реализацией!**

#### 3.4.3 Логотип

Заменить файлы логотипа:
```
public/logo.svg          (или .png)
public/favicon.ico
public/apple-touch-icon.png
public/og-image.jpg      (Open Graph превью)
```
**Логотип запросить у клиента.**

#### 3.4.4 Удалить AL-KO-специфичный контент

- `public/products/` — удалить все картинки товаров AL-KO (433 МБ)
- Статические страницы: `/about`, `/delivery`, `/warranty`, `/terms`, `/privacy` — переписать под CL Merch
- SEO-тексты категорий — удалить (будут свои)
- AI Chat — убрать или перенастроить промпт под тактическое снаряжение

#### 3.4.5 Faceted SEO

Файл `src/lib/faceted-seo.ts` — полностью переписать:
- Убрать фильтры по типу двигателя (акумуляторні/бензинові/електричні)
- Добавить фильтры, релевантные для тактического снаряжения (по бренду, типу, назначению)

### 3.5 Сборка и первый запуск

```bash
cd /home/developer/projects/clmerch-storefront

# Сначала убедиться, что backend работает на 9001
npm run build
npm run start -- -p 3107

# Проверить: http://localhost:3107/ua
```

---

## Шаг 4: Настройка PM2

### 4.1 Создать ecosystem.config.js

Файл: `/home/developer/projects/clmerch-store/ecosystem.config.js`

```javascript
module.exports = {
  apps: [
    {
      name: "clmerch-backend",
      cwd: "/home/developer/projects/clmerch-store",
      script: "./node_modules/.bin/medusa",
      args: "develop",
      exec_mode: "fork",
      env: {
        NODE_ENV: "development",
        PORT: 9001,
      },
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      error_file: "/home/developer/.pm2/logs/clmerch-backend-error.log",
      out_file: "/home/developer/.pm2/logs/clmerch-backend-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
    {
      name: "clmerch-storefront",
      cwd: "/home/developer/projects/clmerch-storefront",
      script: "./node_modules/.bin/next",
      args: "start -p 3107",
      exec_mode: "fork",
      env: {
        NODE_ENV: "development",
        PORT: 3107,
      },
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      error_file: "/home/developer/.pm2/logs/clmerch-storefront-error.log",
      out_file: "/home/developer/.pm2/logs/clmerch-storefront-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
}
```

### 4.2 Запуск через PM2

```bash
cd /home/developer/projects/clmerch-store
pm2 start ecosystem.config.js
pm2 save
```

---

## Шаг 5: Настройка nginx

Создать файл: `/etc/nginx/sites-available/clmerch.conf`

```nginx
# CL Merch Backend (API + Admin)
server {
    listen 80;
    server_name clmerch.com www.clmerch.com;

    # Redirect to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name clmerch.com www.clmerch.com;

    # SSL — будет настроено Certbot
    ssl_certificate /etc/letsencrypt/live/clmerch.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/clmerch.com/privkey.pem;

    # Admin panel и API
    location /app {
        proxy_pass http://localhost:9001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Medusa API routes
    location ~ ^/(admin|store|auth|hooks)/ {
        proxy_pass http://localhost:9001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Health check
    location /health {
        proxy_pass http://localhost:9001;
    }

    # Storefront (всё остальное)
    location / {
        proxy_pass http://localhost:3107;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Лимиты
    client_max_body_size 50M;
}
```

### Активация и SSL:

```bash
sudo ln -s /etc/nginx/sites-available/clmerch.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# SSL сертификат (после того как DNS настроен на сервер)
sudo certbot --nginx -d clmerch.com -d www.clmerch.com
```

---

## Шаг 6: Создать deploy.sh

Файл: `/home/developer/projects/clmerch-store/deploy.sh`

```bash
#!/bin/bash
# CL Merch — безопасный деплой
# Использование: bash deploy.sh [backend|storefront|all]
set -e

BACKEND_DIR="/home/developer/projects/clmerch-store"
STOREFRONT_DIR="/home/developer/projects/clmerch-storefront"
BACKEND_PORT=9001
STOREFRONT_PORT=3107

deploy_backend() {
  echo "=== Backend: сборка ==="
  cd "$BACKEND_DIR"
  npx medusa build 2>&1 | tail -3

  mkdir -p "$BACKEND_DIR/public/admin"
  cp -r "$BACKEND_DIR/.medusa/server/public/admin/"* "$BACKEND_DIR/public/admin/"

  echo "=== Backend: очистка Redis кэша (db 1) ==="
  redis-cli -n 1 FLUSHDB 2>/dev/null || true

  echo "=== Backend: перезапуск ==="
  pm2 restart clmerch-backend

  for i in $(seq 1 30); do
    if curl -sf http://localhost:$BACKEND_PORT/health > /dev/null 2>&1; then
      echo "✔ Backend готов (${i}s)"
      return 0
    fi
    sleep 1
  done
  echo "✘ Backend не запустился за 30 секунд!"
  pm2 logs clmerch-backend --err --lines 10 --nostream
  return 1
}

deploy_storefront() {
  echo "=== Проверка backend ==="
  if ! curl -sf http://localhost:$BACKEND_PORT/health > /dev/null 2>&1; then
    echo "✘ Backend недоступен! Сначала запустите backend."
    return 1
  fi
  echo "✔ Backend работает"

  echo "=== Storefront: остановка ==="
  pm2 stop clmerch-storefront 2>/dev/null || true

  echo "=== Storefront: сборка ==="
  cd "$STOREFRONT_DIR"
  npm run build 2>&1 | tail -5

  echo "=== Storefront: очистка кэша и запуск ==="
  rm -rf "$STOREFRONT_DIR/.next/cache/fetch-cache"
  pm2 start clmerch-storefront

  sleep 3
  if curl -sf http://localhost:$STOREFRONT_PORT/ua > /dev/null 2>&1; then
    echo "✔ Storefront готов"
  else
    echo "⚠ Storefront вернул ошибку, проверьте: pm2 logs clmerch-storefront --err --lines 20"
  fi
}

case "${1:-all}" in
  backend)    deploy_backend ;;
  storefront) deploy_storefront ;;
  all)        deploy_backend && deploy_storefront ;;
  *)          echo "Использование: bash deploy.sh [backend|storefront|all]"; exit 1 ;;
esac

pm2 save
echo "=== Деплой завершён ==="
```

---

## Шаг 7: Адаптация Backend-модулей

### 7.1 Модули, которые переиспользуются без изменений:
- `nova-poshta-fulfillment` — Нова Пошта API (один и тот же)
- `cod-payment` — наложенный платёж
- `product-specs` — характеристики товаров (универсальный)
- `import-manager` — универсальный импорт (парсеры XML/CSV/JSON/XLSX)
- `resend-notification` — email-уведомления (изменить только FROM)

### 7.2 Модули, которые нужно адаптировать:
- `monobank-payment` — переключить на ключи клиента (когда будут)
- `liqpay-payment` — переключить на ключи клиента (когда будут)
- `monobank-installments` — скорее всего не нужно для тактического снаряжения

### 7.3 Модули, которые нужно убрать или заменить:
- `checkbox` — фискальные чеки (не нужно на старте, убрать из medusa-config)
- `@variablevic/google-analytics-medusa` — заменить на GA4 ID клиента

### 7.4 RBAC — адаптировать роли

Файл: `src/lib/rbac/permissions.ts`

Текущие роли AL-KO: `super_admin`, `content_manager`, `order_manager`, `viewer`

Для CL Merch добавить роль **import_moderator** (Модератор импорта):

```typescript
import_moderator: {
  allowed_routes: [
    "/admin/import.*",           // очередь импорта
    "/admin/products.*",         // просмотр/редактирование товаров
    "/admin/product-categories.*", // маппинг категорий
  ],
  denied_routes: [
    "/admin/users.*",
    "/admin/api-keys.*",
    "/admin/stores.*",
    "/admin/payment.*",
  ],
  read_only_routes: [
    "/admin/orders.*",
    "/admin/customers.*",
  ],
}
```

### 7.5 Система импорта — настройка поставщиков

После развёртывания, в Admin UI → Импорт нужно создать 5 профилей:

| Профиль | Формат | URL фида | Авто-обновление |
|---------|--------|----------|-----------------|
| Klost (KLO) | XML Prom | URL от klost.ua | Каждые 4 часа |
| FamTac (FAM) | XLSX | Ручная загрузка | Нет |
| Свит (SVT) | XML Prom | URL от svit.net.ua | Каждые 4 часа |
| Мелго (MLG) | XML GMC | URL от melgo.prom.ua | Каждые 4 часа |
| Kiborg (KBG) | XML Prom | URL от tactic-shop.in.ua | Каждые 4 часа |

**ВАЖНО:** Каждый профиль должен содержать:
- `sku_prefix` — трёхбуквенный префикс (KLO, FAM, SVT, MLG, KBG)
- `auto_publish: false` — новые товары идут на модерацию
- `category_mapping` — маппинг категорий поставщика → магазин (заполняется вручную)

### 7.6 Скрипты — что убрать

Удалить AL-KO-специфичные скрипты из `src/scripts/`:
- `import-alko.ts` — импорт товаров AL-KO
- `scrape-competitor.mjs` — скрейпинг конкурента
- `rewrite-descriptions.mjs` — AI-рерайт описаний
- `apply-descriptions.mjs` — применение описаний
- `fix-brand-descriptions.mjs`
- `fix-thumbnails.mjs`
- `generate-category-seo.mjs`
- `generate-descriptions-cli.mjs`
- `push-ru-translations.py`
- `translate-spec-attributes.py`
- `fix-category-assignments.py`
- `update-metadata-from-xml.mjs`
- `update-descriptions.ts`

Оставить:
- `seed.ts` — шаблон для seed (адаптировать)
- `seed-product-specs.sql` — SQL для характеристик (адаптировать)

### 7.7 Subscribers — адаптировать

- `order-telegram.ts` — изменить текст на CL Merch, использовать нового бота
- `order-confirmation-email.ts` — изменить шаблон email (название, логотип)
- `order-checkbox-receipt.ts` — отключить (checkbox не нужен на старте)

### 7.8 Jobs (фоновые задачи)

- `sync-prices-stock.ts` — адаптировать: вместо одного XML AL-KO, проходить по всем активным профилям import-manager
- `checkbox-open-shift.ts` / `checkbox-close-shift.ts` — убрать

### 7.9 Email-шаблоны

Файлы в `src/modules/resend-notification/templates/`:
- `order-confirmation.ts` — заменить "AL-KO Technics" → "CL Merch", обновить стиль
- `order-shipped.ts` — аналогично
- `password-reset.ts` — аналогично

### 7.10 Admin виджеты

- `product-specs-widget.tsx` — оставить (универсальный)
- `bulk-products-widget.tsx` — оставить
- `bulk-categories-widget.tsx` — оставить
- `bulk-orders-widget.tsx` — оставить
- `user-roles-widget.tsx` — оставить, добавить роль `import_moderator`

### 7.11 Admin брендинг

Файл: `public/admin/index.html` — изменить title на "CL Merch Admin"

В Admin UI Settings → Branding:
- Загрузить логотип CL Merch
- Изменить название магазина

### 7.12 Документация — убрать AL-KO-специфичную

Удалить файлы из корня:
- `SCRAPE-AND-REWRITE-PLAN.md`
- `FACETED-SEO-PLAN.md`
- `RBAC-PLAN.md`
- `UNIVERSAL-IMPORT-PLAN.md`
- `orders_completed.txt`

Обновить:
- `CLAUDE.md` — переписать полностью под CL Merch
- `README.md` — переписать

---

## Шаг 8: Адаптация Storefront (детально)

### 8.1 Ключевые файлы для ребрендинга

#### Layout и метаданные:
```
src/app/layout.tsx          → title: "CL Merch — Тактичне спорядження"
                              description: "Інтернет-магазин військово-тактичного спорядження"
```

#### Хедер и навигация:
```
src/modules/layout/templates/nav/index.tsx    → логотип, ссылки
src/modules/layout/components/main-header/    → логотип, поиск, иконки
src/modules/layout/components/mega-menu/      → категории тактического снаряжения
src/modules/layout/components/mobile-menu/    → мобильное меню
```

#### Главная страница:
```
src/modules/home/components/hero/             → баннер (тактическая тематика)
src/modules/home/components/featured-products/ → рекомендуемые товары
src/modules/home/components/categories-grid/  → сетка категорий
src/modules/home/components/benefits/         → преимущества магазина
```

#### Футер:
```
src/modules/layout/templates/footer/          → контакты CL Merch, соцсети
```

#### Статические страницы:
```
src/app/[countryCode]/(main)/about/page.tsx      → О нас (CL Merch)
src/app/[countryCode]/(main)/delivery/page.tsx   → Доставка и оплата
src/app/[countryCode]/(main)/warranty/page.tsx   → Гарантия
src/app/[countryCode]/(main)/terms/page.tsx      → Условия использования
src/app/[countryCode]/(main)/privacy/page.tsx    → Политика конфиденциальности
```

#### Переводы (i18n):
```
src/lib/i18n/messages/uk.json  → заменить все "AL-KO", "Алко", "садова техніка" → "CL Merch", "тактичне спорядження"
src/lib/i18n/messages/ru.json  → аналогично
```

### 8.2 Цветовая схема (Tailwind)

Файл: `tailwind.config.js`

Заменить цвета на тёмную милитари-тему. Ключевые CSS-переменные в `src/styles/globals.css`:

```css
:root {
  --color-primary: #556B2F;      /* оливковый */
  --color-primary-dark: #2D3B2D; /* тёмно-зелёный */
  --color-accent: #FF6B35;       /* оранжевый акцент */
  --color-bg: #0F1410;           /* тёмный фон */
  --color-surface: #1A2118;      /* карточки */
  --color-text: #E5E5E5;         /* основной текст */
  --color-text-muted: #9CA3AF;   /* приглушённый текст */
}
```

### 8.3 Что удалить из storefront

- Картинки товаров: `public/products/` (вся папка — 433 МБ, это товары AL-KO)
- AI Chat: `src/modules/chat/` и `src/app/api/chat/` (или перенастроить промпт)
- Калькулятор рассрочки Monobank: `src/modules/products/components/installments-calc/` (не нужен на старте)
- Сравнение товаров: `src/modules/comparison/` (опционально — оставить если нужно)
- Wishlist: `src/modules/wishlist/` (опционально — оставить если нужно)
- Faceted SEO данные AL-KO: `src/lib/faceted-seo.ts` (переписать)
- Category SEO контент: `src/modules/categories/components/seo-content/` (переписать)

### 8.4 Google Shopping Feed

Файл: `src/api/feed/route.ts` — обновить метаданные фида (название магазина, URL).

---

## Шаг 9: Специфические требования CL Merch

### 9.1 Система SKU с префиксами

Реализовать в модуле `import-manager`:
- При импорте товара формировать SKU: `{PREFIX}-{supplier_article}`
- PREFIX берётся из настроек профиля поставщика (3 символа)
- Если у поставщика нет артикула — генерировать автоинкрементный ID
- SKU уникален в рамках магазина
- SKU не меняется после первого присвоения

Добавить поле `sku_prefix` в модель `ImportProfile`.

### 9.2 Очередь модерации импорта

Реализовать в `import-manager`:
- Новые товары получают статус `draft` (не `published`)
- В Admin UI — страница "Очередь модерации" со списком товаров на проверку
- Кнопки: "Одобрить" / "Отклонить" / "Одобрить все"
- Одобренные товары переходят в статус `published`
- Цена и остатки обновляются автоматически (без модерации)
- Новые категории поставщика → уведомление модератору

### 9.3 MeiliSearch интеграция

```bash
# Установка пакета
cd /home/developer/projects/clmerch-store
npm install @medusajs/index-meilisearch meilisearch

# Добавить в medusa-config.ts:
{
  resolve: "@medusajs/index-meilisearch",
  options: {
    config: {
      host: process.env.MEILISEARCH_HOST,
      apiKey: process.env.MEILISEARCH_API_KEY,
    },
    settings: {
      products: {
        searchableAttributes: ["title", "description", "sku", "handle"],
        displayedAttributes: ["title", "description", "thumbnail", "handle", "sku"],
        filterableAttributes: ["categories", "tags", "type"],
      },
    },
  },
}
```

### 9.4 Facebook Pixel

Добавить в storefront `src/app/layout.tsx`:
```html
<!-- Facebook Pixel Code — ID запросить у клиента -->
<script>
  !function(f,b,e,v,n,t,s){...}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', 'PIXEL_ID');
  fbq('track', 'PageView');
</script>
```

---

## Шаг 10: Создание GitHub-репозиториев

```bash
# Создать новые репозитории на GitHub (через gh CLI или вручную)
gh repo create allidevelop/clmerch-store --private
gh repo create allidevelop/clmerch-storefront --private

# Backend
cd /home/developer/projects/clmerch-store
git remote set-url origin git@github.com:allidevelop/clmerch-store.git
git add -A
git commit -m "feat: Initial CL Merch setup based on AL-KO Store"
git push -u origin master

# Storefront
cd /home/developer/projects/clmerch-storefront
git remote set-url origin git@github.com:allidevelop/clmerch-storefront.git
git add -A
git commit -m "feat: Initial CL Merch storefront based on AL-KO Storefront"
git push -u origin master
```

---

## Чек-лист запуска

### Инфраструктура:
- [ ] PostgreSQL база `medusa_clmerch` создана
- [ ] Redis доступен (database 1)
- [ ] MeiliSearch установлен и запущен
- [ ] SSL-сертификат для clmerch.com
- [ ] nginx конфиг настроен
- [ ] PM2 процессы запущены
- [ ] DNS для clmerch.com указывает на сервер (IP: 144.91.95.134)

### Backend:
- [ ] .env настроен с новыми секретами
- [ ] medusa-config.ts обновлён
- [ ] Миграции прошли успешно
- [ ] Admin-пользователь создан
- [ ] Регион "Украина" (UAH) настроен
- [ ] Sales Channel создан
- [ ] Publishable Key сгенерирован
- [ ] COD payment provider подключён
- [ ] Nova Poshta fulfillment подключён
- [ ] RBAC роли настроены (+ import_moderator)
- [ ] Email шаблоны обновлены (CL Merch)
- [ ] AL-KO-специфичные скрипты удалены
- [ ] Профили импорта 5 поставщиков созданы
- [ ] Health check: `curl http://localhost:9001/health` → OK

### Storefront:
- [ ] .env.local настроен (Publishable Key!)
- [ ] Ребрендинг: логотип, название, цвета
- [ ] Цветовая схема: тёмная/милитари
- [ ] Переводы (uk.json, ru.json) обновлены
- [ ] Статические страницы переписаны
- [ ] AL-KO контент удалён
- [ ] Картинки товаров AL-KO удалены
- [ ] Сборка проходит без ошибок
- [ ] Главная страница отображается: `curl http://localhost:3107/ua`

### Финальная проверка:
- [ ] https://clmerch.com → storefront загружается
- [ ] https://clmerch.com/app → admin панель доступна
- [ ] Вход admin@clmerch.com / Admin123! → работает
- [ ] Создание тестового товара → отображается на storefront
- [ ] Оформление тестового заказа → проходит
- [ ] Нова Пошта → поиск отделений работает
- [ ] Наложенный платёж → работает

---

## Порты и процессы (итого на сервере)

| Проект | Процесс | Порт |
|--------|---------|------|
| AL-KO Backend | alko-backend | 9000 |
| AL-KO Storefront | alko-storefront | 3104 |
| **CL Merch Backend** | **clmerch-backend** | **9001** |
| **CL Merch Storefront** | **clmerch-storefront** | **3107** |
| Redis | redis-server | 6379 |
| PostgreSQL | postgres | 5432 |
| MeiliSearch | meilisearch | 7700 |

---

## Важные замечания

1. **НЕ УДАЛЯТЬ и не изменять ничего в AL-KO проектах** — они продолжают работать независимо
2. **Redis** — CL Merch использует database 1 (`redis://localhost:6379/1`), AL-KO — database 0
3. **PostgreSQL** — отдельная база `medusa_clmerch`, не пересекается с `medusa_alko`
4. **Секреты (.env)** — ОБЯЗАТЕЛЬНО сгенерировать новые JWT_SECRET и COOKIE_SECRET
5. **Publishable Key** — генерируется в Admin UI, НЕ копировать из AL-KO
6. **Домен** — пока DNS не настроен, работать через `http://144.91.95.134:3107`
7. **Логотип и дизайн** — согласовать с клиентом ДО начала вёрстки
8. **API-ключи поставщиков** — запросить URL XML/XLSX фидов у клиента
