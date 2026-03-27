# Quick Start: AL-KO Rozetka Proxy

## TL;DR для Claude Code CLI

**Задача:** XML прокси для маркетплейса Rozetka

**Исходник:** `https://apipim.al-ko.ua/storage/xml_files/PriceList.xml`

**Что делает скрипт:**
- ✅ stock=0 → available=false
- ✅ Удаляет товары без фото
- ✅ Удаляет URL из параметров
- ✅ Нормализует бренд → "AL-KO"
- ✅ Формат названия: "Газонокосарка AL-KO Moweo 42.0 Li"
- ✅ Дубликаты названий → добавляет артикул

**Осталось:**
- ❌ Добавить недостающие параметры для фильтров Rozetka
- ❌ Проверить ассортиментные товары (1 карточка = 1 товар)
- ❌ Развернуть на сервере и проверить валидатором

## Быстрый деплой

```bash
# Распаковать архив в нужную директорию
unzip rozetka-project-full.zip -d /var/www/site/

# Или использовать standalone (один файл)
cp rozetka_standalone.php /var/www/site/rozetka-feed/index.php

# Права
chmod 777 cache/ logs/

# Тест
curl http://localhost/rozetka-feed/
```

## Ключевые файлы

| Файл | Назначение |
|------|------------|
| `index.php` | Основной прокси (OOP версия) |
| `rozetka_standalone.php` | Всё в одном файле |
| `config.php` | Настройки |
| `CLAUDE_CODE_HANDOFF.md` | Полная документация |

## Настройки (config.php)

```php
'source_xml_url' => 'https://apipim.al-ko.ua/storage/xml_files/PriceList.xml',
'exclude_articles' => ['123097', '127192'],  // без фото
'cache_time' => 3600,
```

## Проверка

1. Валидатор Rozetka: https://seller.rozetka.com.ua/gomer/pricevalidate/check/index
2. Требования: https://sellerhelp.rozetka.com.ua/p176-items.html

---

Подробности в `CLAUDE_CODE_HANDOFF.md`
