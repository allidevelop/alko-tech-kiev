# AL-KO Ukraine E-commerce Project

## О проекте

Это проект по продаже садовой техники и аксессуаров бренда AL-KO в Украине. Владелец - Игорь.

### Ключевые ресурсы

| Ресурс | URL |
|--------|-----|
| Сайт | https://alko-technics.com.ua/ua/ |
| Товарный фид (XML) | https://apipim.al-ko.ua/storage/xml_files/PriceList.xml |
| Поставщик | AL-KO Kober (Германия) |

### Направления работы

1. **Интеграция с маркетплейсами** — конвертация XML-фида под требования разных площадок
2. **Контент сайта** — украиноязычный контент, условия доставки
3. **Реклама** — Google Ads кампании

---

## Текущая задача: Интеграция с Эпицентром

### Статус: В процессе (80% готово)

Нужно конвертировать XML-фид AL-KO в формат маркетплейса Эпицентр.

### Что уже сделано

1. ✅ Изучена документация Эпицентра по XML-импорту
2. ✅ Проанализирована структура исходного XML AL-KO
3. ✅ Создан Python-скрипт конвертации `alko_to_epicentr.py`
4. ✅ Скрипт протестирован на тестовых данных

### Что осталось сделать

1. ⏳ Получить коды категорий через API Эпицентра
2. ⏳ Получить код бренда AL-KO в системе Эпицентра
3. ⏳ Заполнить маппинги в скрипте
4. ⏳ Запустить полную конвертацию
5. ⏳ Настроить автообновление (cron или аналог)

---

## Документация Эпицентра

### API эндпоинты

```
Токен: 5a6489d1a5c48c9d174bd31f2a0a8fd0

Категории:
https://api.epicentrm.com.ua/swagger/#/PIM/getCategoriesV2

Наборы атрибутов:
https://api.epicentrm.com.ua/swagger/#/PIM/getAttributeSetsV2

Опции атрибутов:
https://api.epicentrm.com.ua/swagger/#/PIM/getAttributeOptionsV2
```

### Формат XML Эпицентра (ключевые отличия от AL-KO)

| Параметр | AL-KO | Эпицентр |
|----------|-------|----------|
| Название | `<name_ua>` | `<name lang="ua">` + `<name lang="ru">` |
| Описание | `<description_ua>` | `<description lang="ua/ru">` в CDATA |
| Размеры | сантиметры | **миллиметры** |
| Вес | килограммы | **граммы** |
| Наличие | `available="true/false"` | + `<availability>in_stock/under_the_order/out_of_stock</availability>` |
| Категория | свой ID | код категории Эпицентра |
| Бренд | текст | paramcode + valuecode |

### Пример XML для Эпицентра

```xml
<?xml version="1.0" encoding="UTF-8"?>
<yml_catalog date="2025-12-15 10:00">
<offers>
  <offer id="113278" available="true">
    <price>18699</price>
    <availability>in_stock</availability>
    <category code="XXXX">Газонокосарки</category>
    <picture>https://example.com/photo.jpg</picture>
    <name lang="ru">Газонокосилка аккумуляторная Moweo 38.5 Li</name>
    <name lang="ua">Газонокосарка акумуляторна Moweo 38.5 Li</name>
    <description lang="ru"><![CDATA[Описание на русском]]></description>
    <description lang="ua"><![CDATA[Опис українською]]></description>
    <param paramcode="width" name="Ширина"><![CDATA[450]]></param>
    <param paramcode="height" name="Висота"><![CDATA[370]]></param>
    <param paramcode="length" name="Глибина"><![CDATA[810]]></param>
    <param paramcode="weight" name="Вага"><![CDATA[18300]]></param>
    <param paramcode="barcodes" name="Штрих код"><![CDATA[4003718055009]]></param>
    <param paramcode="country_of_origin" name="Країна-виробник" valuecode="chn">Китай</param>
    <param paramcode="brand" name="Бренд" valuecode="XXXXXX">AL-KO</param>
  </offer>
</offers>
</yml_catalog>
```

---

## Структура проекта на сервере

```
/path/to/alko-project/
├── CLAUDE.md                    # Эта инструкция
├── scripts/
│   └── alko_to_epicentr.py     # Конвертер XML
├── feeds/
│   └── epicentr_feed.xml       # Выходной файл для Эпицентра
├── logs/
│   └── conversion.log          # Логи конвертации
└── config/
    └── mappings.json           # Маппинги категорий (опционально)
```

---

## Скрипт конвертации

### Расположение
`scripts/alko_to_epicentr.py`

### Использование

```bash
# Базовый запуск (скачает XML с URL и создаст epicentr_feed.xml)
python3 alko_to_epicentr.py

# С указанием файлов
python3 alko_to_epicentr.py --input source.xml --output epicentr.xml

# Автообновление через cron (каждые 2 часа)
0 */2 * * * cd /path/to/alko-project && python3 scripts/alko_to_epicentr.py >> logs/conversion.log 2>&1
```

### Что нужно настроить в скрипте

1. **CATEGORY_MAPPING** — маппинг categoryId AL-KO на коды Эпицентра
2. **COUNTRY_MAPPING** — коды стран (частично заполнено)
3. **ALKO_BRAND_CODE** — код бренда AL-KO в системе Эпицентра

---

## Завершённые интеграции

### Rozetka ✅

Ранее была сделана интеграция с Розеткой через PHP-прокси. Решались проблемы:
- Фиксация наличия (stock availability)
- Валидация фото
- Нормализация названия производителя
- Удаление дубликатов

---

## Контакты и доступы

- Маркетплейс Эпицентр: merchant@epicentrk.ua
- Инструкция по XML: https://supportm.epicentrk.ua/xmlfayl/

---

## Примечания для Claude Code CLI

1. **Язык общения** — русский или украинский
2. **XML-фид большой** — несколько сотен товаров, используй потоковую обработку
3. **Сеть** — если curl не работает, используй Python urllib или requests
4. **Перевод UA→RU** — сейчас простая транслитерация, можно улучшить
5. **Тестирование** — всегда тестируй на нескольких товарах перед полным запуском
