# Epicentr Marketplace API Integration

## API Documentation
- Swagger: https://api.epicentrm.com.ua/swagger/
- Categories V2: `GET /v2/pim/categories`
- Attribute Sets V2: `GET /v2/pim/attribute-sets`

## Setup

1. Получите Bearer токен в личном кабинете продавца Эпицентр Маркетплейс
2. Установите токен:
   ```bash
   export EPICENTR_API_TOKEN="your_token_here"
   ```

## Usage

### Получить все категории
```bash
npm run categories
# или
node get-categories.js
```

Создаст файлы:
- `categories.json` - полный список категорий
- `category-mapping.json` - маппинг code -> title

### Работа с маппингами

```bash
# Обновить маппинги из categories.json
npm run update-mappings

# Поиск категории
npm run search -- "дриль"
node category-mappings.js search "дриль"

# Показать текущие маппинги
node category-mappings.js list
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /v2/pim/categories` | Список категорий |
| `GET /v2/pim/categories?filter[hasChild]=false` | Только конечные категории |
| `GET /v2/pim/attribute-sets` | Наборы атрибутов |
| `GET /v2/pim/attribute-options` | Опции атрибутов |

## Notes

- Используйте V2 endpoints (V1 устарел)
- Код категории указывайте как string
- Для товаров используйте только конечные категории (hasChild=false)
