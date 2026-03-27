# CLAUDE.md - Инструкции для проекта AL-KO Rozetka

## О проекте

Это проект интеграции интернет-магазина AL-KO (садовая техника) с маркетплейсом Rozetka в Украине.

**Владелец:** Игорь
**Сайт:** https://alko-technics.com.ua
**Основной язык общения:** русский/украинский

## Ключевые URL

- **XML источник (AL-KO):** `https://apipim.al-ko.ua/storage/xml_files/PriceList.xml`
- **Сайт магазина:** `https://alko-technics.com.ua`
- **Rozetka валидатор:** `https://seller.rozetka.com.ua/gomer/pricevalidate/check/index`
- **Требования Rozetka:** `https://sellerhelp.rozetka.com.ua/p176-items.html`

## Текущее состояние

### ✅ Готово:
1. PHP прокси-скрипт для трансформации XML
2. Автоматическое исправление available=true при stock=0
3. Исключение товаров без фото
4. Удаление URL из параметров
5. Нормализация бренда везде к "AL-KO"
6. Форматирование названий: "Тип AL-KO Модель"
7. Уникализация дубликатов названий через артикул

### ❌ Нужно доделать:
1. Развернуть скрипты на сервере Игоря
2. Добавить недостающие параметры для фильтров Rozetka (пункт 6 от менеджера)
3. Проверить и исключить ассортиментные товары (пункт 1)
4. Пройти валидацию на Rozetka

## Структура проекта

```
rozetka-feed/
├── index.php              # Основной прокси
├── config.php             # Настройки
├── rozetka_standalone.php # Standalone версия
├── status.php             # Веб-панель (пароль: alko2024admin)
├── .htaccess              # Конфиг Apache
├── cache/                 # Кеш XML (chmod 777)
└── logs/                  # Логи (chmod 777)
```

## Команды

```bash
# Тест скрипта
php index.php | head -50

# Подсчёт товаров в исходнике
curl -s https://apipim.al-ko.ua/storage/xml_files/PriceList.xml | grep -c '<offer '

# Очистка кеша
rm -f cache/pricelist_cache.xml

# Проверка логов
tail -f logs/proxy_$(date +%Y-%m-%d).log
```

## Важные настройки (config.php)

```php
'source_xml_url' => 'https://apipim.al-ko.ua/storage/xml_files/PriceList.xml',
'brand_name' => 'AL-KO',
'exclude_articles' => ['123097', '127192'],  // Товары без фото
'cache_time' => 3600,  // 1 час
```

## Требования Rozetka (от менеджера)

1. Одна карточка = один товар (без ассортимента)
2. available=false если stock=0
3. Все товары должны иметь фото
4. Нет URL в параметрах
5. Единое написание производителя
6. Достаточно параметров для фильтров
7. Бренд в названии после типа товара, уникальные названия

## Будущие задачи

После Rozetka планируется интеграция с:
- Epicentr (уже была работа в других чатах)
- Prom.ua

## Стиль работы

Игорь предпочитает:
- Автоматизированные решения
- Минимум ручного вмешательства
- Production-ready код с логированием и кешированием
- Чёткие инструкции по развёртыванию
