# 🔄 Handoff Document: AL-KO Rozetka XML Proxy

## Контекст проекта

**Клиент:** Игорь (Igor)
**Бизнес:** E-commerce продажа садовой техники AL-KO в Украине
**Сайт:** https://alko-technics.com.ua
**Источник данных:** https://apipim.al-ko.ua/storage/xml_files/PriceList.xml

**Текущая задача:** Интеграция с маркетплейсом Rozetka через XML-фид

---

## Проблема

Игорь подал заявку на Rozetka, предоставил ссылку на свой XML прайс-лист. Менеджер Rozetka (Лімін Валерій) прислал список из 7 правок, которые нужно исправить для прохождения модерации:

### Список правок от Rozetka:

1. **Ассортиментные товары** — одна карточка = один товар, фото только конкретного товара
2. **available=true при stock_quantity=0** — нужно ставить available=false
3. **Товары без фото** — артикулы 123097, 127192 не имеют фото
4. **Ссылки в параметрах** — в значениях param есть URL, нужно удалить
5. **Разное написание производителя** — нужно везде "AL-KO" одинаково
6. **Недостаточно параметров** — нужно добавить больше характеристик для фильтров
7. **Бренд в названии товара** — формат: "Тип товару + Бренд + Модель", дубликаты названий (178 шт.)

**Ссылки от менеджера:**
- Требования к XML: https://sellerhelp.rozetka.com.ua/p176-items.html
- Валидатор: https://seller.rozetka.com.ua/gomer/pricevalidate/check/index

---

## Что уже сделано (в этом чате)

### ✅ Создан PHP прокси-сервис

Полностью рабочий скрипт, который:
- Загружает исходный XML с AL-KO
- Трансформирует под требования Rozetka
- Кеширует результат (1 час по умолчанию)
- Отдает готовый XML по HTTP

### ✅ Автоматические исправления:

| Проблема | Статус | Реализация |
|----------|--------|------------|
| 1. Ассортимент | ⚠️ Частично | Нужен ручной анализ каких товаров касается |
| 2. available при stock=0 | ✅ Готово | Автоматически ставит available="false" |
| 3. Товары без фото | ✅ Готово | Исключаются + артикулы 123097, 127192 в blacklist |
| 4. URL в параметрах | ✅ Готово | Regex удаляет все http/https/www ссылки |
| 5. Нормализация виробника | ✅ Готово | Везде приводится к "AL-KO" |
| 6. Доп. параметры | ❌ Не сделано | Нужен анализ категорий Rozetka |
| 7. Формат названий | ✅ Готово | "Газонокосарка AL-KO Moweo 42.0 Li" |
| 7b. Уникальность названий | ✅ Готово | Дубликаты получают "(арт. XXXXX)" |

---

## Файлы проекта

Все файлы находятся в `/home/claude/rozetka-xml-proxy/`:

```
rozetka-xml-proxy/
├── index.php              # Основной прокси (расширенная версия с классом)
├── rozetka_proxy.php      # Альтернативная версия (процедурная)
├── rozetka_standalone.php # Standalone версия в одном файле
├── config.php             # Конфигурация (отдельный файл)
├── status.php             # Веб-панель статистики (с паролем)
├── .htaccess              # Конфиг Apache
├── cache/                 # Папка для кеша XML
│   └── .gitkeep
├── logs/                  # Папка для логов
│   └── .gitkeep
└── README.md              # Документация для пользователя
```

### Ключевые настройки в config.php:

```php
'source_xml_url' => 'https://apipim.al-ko.ua/storage/xml_files/PriceList.xml',
'brand_name' => 'AL-KO',
'shop_url' => 'https://alko-technics.com.ua',
'exclude_articles' => ['123097', '127192'],  // Без фото
'cache_time' => 3600,  // 1 час
```

---

## Что нужно сделать дальше

### 1. Развернуть на сервере Игоря
```bash
# Создать директорию
mkdir -p /var/www/alko-technics.com.ua/rozetka-feed

# Скопировать файлы
cp -r /path/to/rozetka-xml-proxy/* /var/www/alko-technics.com.ua/rozetka-feed/

# Права доступа
chmod 755 /var/www/alko-technics.com.ua/rozetka-feed/
chmod 777 /var/www/alko-technics.com.ua/rozetka-feed/cache/
chmod 777 /var/www/alko-technics.com.ua/rozetka-feed/logs/

# Настроить владельца (если нужно)
chown -R www-data:www-data /var/www/alko-technics.com.ua/rozetka-feed/
```

### 2. Проверить работу
```bash
# Тест загрузки XML
curl -I https://alko-technics.com.ua/rozetka-feed/

# Проверить размер и валидность
curl -s https://alko-technics.com.ua/rozetka-feed/ | head -50
```

### 3. Проверить валидатором Rozetka
После развертывания — прогнать через https://seller.rozetka.com.ua/gomer/pricevalidate/check/index

### 4. Пункт 6 — добавление параметров
Нужно:
- Получить список обязательных параметров для категорий садовой техники на Rozetka
- Добавить маппинг существующих параметров AL-KO на параметры Rozetka
- Возможно добавить недостающие параметры из description

### 5. Пункт 1 — ассортиментные товары
Нужно:
- Проанализировать XML на наличие товаров с несколькими вариантами
- Либо разбить на отдельные карточки, либо исключить

---

## Структура исходного XML (AL-KO)

```xml
<yml_catalog date="2025-11-01 10:09">
  <shop>
    <n>Al-KO</n>
    <company>Al-KO Kober</company>
    <url>https://alko-garden.com.ua</url>
    <currencies>
      <currency id="UAH" rate="1"/>
    </currencies>
    <categories>
      <category id="1">Газонокосарки</category>
      <category id="2">Тримери та мотокоси</category>
      <!-- ... 36 категорий всего -->
    </categories>
    <offers>
      <offer id="113278" available="true">
        <stock_quantity>0</stock_quantity>
        <price>18699</price>
        <currencyId>UAH</currencyId>
        <categoryId>1</categoryId>
        <picture>https://alko-garden.com.ua/out/pictures/...</picture>
        <url>https://alko-garden.com.ua/...</url>
        <vendor>AL-KO</vendor>
        <article>113278</article>
        <name_ua>Газонокосарка акумуляторна Moweo 38.5 Li</name_ua>
        <description_ua><![CDATA[...]]></description_ua>
        <param name="Штрихкод">4003718055009</param>
        <param name="Ширина захвату">37</param>
        <param name="Виробник">AL-KO</param>
        <!-- много параметров -->
      </offer>
    </offers>
  </shop>
</yml_catalog>
```

---

## Полезные команды

```bash
# Скачать и посмотреть исходный XML
curl -s https://apipim.al-ko.ua/storage/xml_files/PriceList.xml | head -100

# Посчитать количество товаров
curl -s https://apipim.al-ko.ua/storage/xml_files/PriceList.xml | grep -c '<offer '

# Найти товары без фото
curl -s https://apipim.al-ko.ua/storage/xml_files/PriceList.xml | grep -B5 '<picture></picture>'

# Найти товары с stock=0 но available=true
curl -s https://apipim.al-ko.ua/storage/xml_files/PriceList.xml | grep -B2 '<stock_quantity>0</stock_quantity>'

# Тест PHP скрипта локально
php /path/to/rozetka_standalone.php | head -50

# Очистить кеш
rm -f /path/to/cache/pricelist_cache.xml
```

---

## Контакты и ресурсы

- **Сайт Игоря:** https://alko-technics.com.ua
- **XML источник:** https://apipim.al-ko.ua/storage/xml_files/PriceList.xml
- **Rozetka Seller Help:** https://sellerhelp.rozetka.com.ua/
- **Rozetka валидатор:** https://seller.rozetka.com.ua/gomer/pricevalidate/check/index

---

## Примечания

1. Игорь общается на русском/украинском
2. Предпочитает автоматизированные решения без ручного вмешательства
3. Использует PHP на хостинге
4. Сервер, вероятно, на Apache (учитывай .htaccess)
5. В будущем планирует интеграцию с Epicentr и Prom.ua (другие маркетплейсы)

---

## Quick Start для Claude Code CLI

```bash
# 1. Перейти в директорию проекта (создать если нет)
cd /var/www/alko-technics.com.ua
mkdir -p rozetka-feed && cd rozetka-feed

# 2. Создать основные файлы (скопировать из этого handoff или из архива)

# 3. Создать папки
mkdir -p cache logs
chmod 777 cache logs

# 4. Проверить работу
php index.php | head -20

# 5. Настроить веб-сервер (nginx или apache) на отдачу этой директории
```

---

*Документ создан: 2024-12-04*
*Передача из: Claude.ai Web Interface → Claude Code CLI*
