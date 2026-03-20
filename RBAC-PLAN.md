# RBAC (Role-Based Access Control) — План реализации

## Текущее состояние

Medusa v2 поддерживает роли на уровне API:
- `UserDTO` имеет поле `roles?: string[]`
- При создании пользователя можно указать `roles: ["role_super_admin"]`
- Нет встроенного UI для управления ролями
- Нет готовой системы проверки прав на конкретные действия

## Целевая архитектура

### Роли

| Роль | Код | Описание |
|------|-----|----------|
| **Супер-адмін** | `super_admin` | Полный доступ ко всему |
| **Контент-менеджер** | `content_manager` | Товары, категории, переводы, медиа, характеристики |
| **Менеджер замовлень** | `order_manager` | Заказы, клиенты, платежи, доставка |
| **Тільки перегляд** | `viewer` | Просмотр всех данных без возможности редактирования |

### Матрица доступа

| Ресурс | super_admin | content_manager | order_manager | viewer |
|--------|:-----------:|:---------------:|:-------------:|:------:|
| Товары (CRUD) | ✅ | ✅ | ❌ | 👁 |
| Категории (CRUD) | ✅ | ✅ | ❌ | 👁 |
| Характеристики | ✅ | ✅ | ❌ | 👁 |
| Переводы | ✅ | ✅ | ❌ | ❌ |
| Медіа | ✅ | ✅ | ❌ | 👁 |
| Заказы | ✅ | ❌ | ✅ | 👁 |
| Клиенты | ✅ | ❌ | ✅ | 👁 |
| Платежі | ✅ | ❌ | ✅ | 👁 |
| Доставка | ✅ | ❌ | ✅ | 👁 |
| Настройки магазина | ✅ | ❌ | ❌ | ❌ |
| Пользователи | ✅ | ❌ | ❌ | ❌ |
| Брендинг | ✅ | ✅ | ❌ | ❌ |
| Ценообразование | ✅ | ❌ | ❌ | 👁 |
| Checkbox (ПРРО) | ✅ | ❌ | ✅ | ❌ |
| API ключі | ✅ | ❌ | ❌ | ❌ |

👁 = только просмотр (GET), ❌ = нет доступа, ✅ = полный доступ

---

## Фаза 1: Backend middleware (1-2 часа)

### 1.1 Создать конфигурацию прав

```
src/lib/rbac/permissions.ts
```

```typescript
export const ROLE_PERMISSIONS: Record<string, {
  allowed_routes: string[]   // regex patterns
  denied_routes: string[]    // regex patterns
  read_only_routes: string[] // GET only
}> = {
  super_admin: {
    allowed_routes: [".*"],
    denied_routes: [],
    read_only_routes: [],
  },
  content_manager: {
    allowed_routes: [
      "/admin/products.*",
      "/admin/product-categories.*",
      "/admin/product-specs.*",
      "/admin/translations.*",
      "/admin/uploads.*",
      "/admin/stores.*",  // for branding
    ],
    denied_routes: [
      "/admin/users.*",
      "/admin/api-keys.*",
      "/admin/payment.*",
      "/admin/orders.*/fulfill",
      "/admin/orders.*/cancel",
    ],
    read_only_routes: [
      "/admin/orders.*",
      "/admin/customers.*",
      "/admin/pricing.*",
    ],
  },
  order_manager: {
    allowed_routes: [
      "/admin/orders.*",
      "/admin/customers.*",
      "/admin/payment.*",
      "/admin/fulfillments.*",
      "/admin/shipping.*",
    ],
    denied_routes: [
      "/admin/users.*",
      "/admin/api-keys.*",
      "/admin/stores.*",
    ],
    read_only_routes: [
      "/admin/products.*",
      "/admin/product-categories.*",
    ],
  },
  viewer: {
    allowed_routes: [],
    denied_routes: [
      "/admin/users.*",
      "/admin/api-keys.*",
    ],
    read_only_routes: [".*"],
  },
}
```

### 1.2 Создать middleware для проверки прав

```
src/api/middlewares.ts
```

Middleware перехватывает все `/admin/*` запросы, извлекает роли текущего пользователя из `req.auth_context`, проверяет по матрице `ROLE_PERMISSIONS`:
- Если route в `allowed_routes` → пропускаем
- Если route в `read_only_routes` и метод не GET → 403 Forbidden
- Если route в `denied_routes` → 403 Forbidden
- Если нет ни в одном → 403 по умолчанию (whitelist подход)

### 1.3 API для управления ролями

```
POST /admin/users/:id/roles   — назначить роли
GET  /admin/users/:id/roles   — получить роли
DELETE /admin/users/:id/roles — удалить роль
```

---

## Фаза 2: Admin UI для ролей (1-2 часа)

### 2.1 Виджет на странице пользователя

```
src/admin/widgets/user-roles-widget.tsx
```

Виджет в боковой панели страницы пользователя:
- Показывает текущие роли (бейджи)
- Кнопка "Змінити ролі" → модальное окно с чекбоксами
- Доступен только для `super_admin`

### 2.2 Страница настроек ролей

```
src/admin/routes/settings/roles/page.tsx
```

Настройки → Ролі:
- Список всех ролей с описанием
- Матрица доступа (визуальная таблица)
- Список пользователей по ролям
- Возможность создать кастомную роль (v2)

---

## Фаза 3: Frontend ограничения в Admin UI (1 час)

### 3.1 Скрытие UI элементов по роли

В Admin widgets и routes проверять роль текущего пользователя:

```typescript
// Утилита для проверки прав
import { useAdminGetSession } from "medusa-react" // или fetch /admin/users/me

const useCurrentRole = () => {
  const { user } = useAdminGetSession()
  return user?.roles?.[0] || "viewer"
}

// В компоненте
const role = useCurrentRole()
if (role === "content_manager") {
  // Скрыть кнопки удаления, настройки
}
```

### 3.2 Контекст ролей

Создать React context `RoleProvider` который:
- Загружает текущего пользователя при старте Admin
- Предоставляет `hasPermission(action, resource)` функцию
- Используется во всех виджетах и страницах

---

## Фаза 4: Аудит и логирование (опционально)

- Логировать все admin действия с user_id и role
- Страница "Журнал дій" в Admin Settings
- Фильтрация по пользователю, дате, типу действия

---

## Инструменты

| Инструмент | Назначение |
|-----------|-----------|
| Medusa User Module | Хранение пользователей и ролей |
| `authenticate()` middleware | Проверка аутентификации |
| `req.auth_context` | Получение текущего пользователя |
| Admin SDK `defineWidgetConfig` | UI виджеты |
| Admin SDK `defineRouteConfig` | UI страницы |

---

## Timeline

| Фаза | Срок | Зависимости |
|------|------|-------------|
| 1. Backend middleware | 1-2 часа | — |
| 2. Admin UI для ролей | 1-2 часа | Фаза 1 |
| 3. Frontend ограничения | 1 час | Фаза 1-2 |
| 4. Аудит (опционально) | 2-3 часа | Фаза 1 |
| **Итого** | **~4-6 часов** | |

---

## Заметки

- Medusa v2 не имеет встроенного RBAC UI — всё кастомное
- Роли хранятся в `user.metadata.roles` или в отдельной таблице
- Подход whitelist (всё запрещено, кроме разрешённого) безопаснее
- При обновлении Medusa проверять, не появился ли нативный RBAC
- Для мультитенантных проектов (несколько магазинов) роли нужно расширить контекстом магазина
