# Project Summary: AL-KO Epicentr Integration

## Дата: 2025-12-15
## Контекст: Передача проекта в Claude Code CLI

---

## Что было сделано

### 1. Анализ требований Эпицентра

Изучена официальная документация:
- https://supportm.epicentrk.ua/xmlfayl/
- API Swagger: https://api.epicentrm.com.ua/swagger/

**Ключевые требования формата:**
- Двуязычные названия: `<name lang="ua">` и `<name lang="ru">`
- Двуязычные описания в CDATA
- Размеры в **миллиметрах** (не сантиметрах!)
- Вес в **граммах** (не килограммах!)
- Статус наличия: `in_stock` / `under_the_order` / `out_of_stock`
- Коды категорий и брендов из API Эпицентра

### 2. Анализ исходного XML AL-KO

URL фида: `https://apipim.al-ko.ua/storage/xml_files/PriceList.xml`

**Структура offer:**
```xml
<offer id="113278" available="true">
  <stock_quantity>0</stock_quantity>
  <price>18699</price>
  <categoryId>1</categoryId>
  <picture>https://...</picture>
  <name_ua>Газонокосарка акумуляторна Moweo 38.5 Li</name_ua>
  <description_ua><![CDATA[...]]></description_ua>
  <param name="Штрихкод">4003718055009</param>
  <param name="Ширина упаковки, см">45,0</param>
  <param name="Довжина упаковки, см">81,0</param>
  <param name="Висота упаковки, см">37,0</param>
  <param name="Вага, кг">18,3</param>
  <param name="Країна-виробник товару">Китай</param>
</offer>
```

### 3. Создан Python-скрипт конвертации

**Файл:** `scripts/alko_to_epicentr.py`

**Функционал:**
- Загрузка XML по URL или из файла
- Парсинг всех товаров
- Конвертация единиц измерения (см→мм, кг→г)
- Транслитерация UA→RU (базовая)
- Определение статуса наличия
- Генерация XML в формате Эпицентра
- Логирование и обработка ошибок
- Проверка заполненности маппингов

**Использование:**
```bash
python3 alko_to_epicentr.py                    # базовый запуск
python3 alko_to_epicentr.py --dry-run          # тест без сохранения
python3 alko_to_epicentr.py -o /path/feed.xml  # указать выходной файл
python3 alko_to_epicentr.py --verbose          # подробный вывод
```

### 4. Тестирование

Скрипт протестирован на тестовых данных (2 товара). Результат соответствует формату Эпицентра.

---

## Что НЕ сделано (требует действий)

### 1. Получение кодов категорий

**Нужно:**
1. Авторизоваться в личном кабинете Эпицентра
2. Использовать API: `https://api.epicentrm.com.ua/swagger/#/PIM/getCategoriesV2`
3. Токен: `5a6489d1a5c48c9d174bd31f2a0a8fd0`
4. Найти коды для категорий садовой техники
5. Заполнить `CATEGORY_MAPPING` в скрипте

**Пример маппинга после заполнения:**
```python
CATEGORY_MAPPING = {
    "1": ("12345", "Газонокосарки"),  # был XXXX
    "2": ("12346", "Тримери та мотокоси"),
    ...
}
```

### 2. Получение кода бренда AL-KO

**Нужно:**
1. Через API найти valuecode для бренда AL-KO
2. Заполнить `ALKO_BRAND_CODE` в скрипте

### 3. Улучшение перевода UA→RU

Текущая реализация — простая транслитерация (і→и, ї→и, є→е).

**Варианты улучшения:**
- Подключить Google Translate API
- Подключить DeepL API
- Запросить у AL-KO русские названия
- Оставить одинаковый текст (Эпицентр может принять)

### 4. Настройка автообновления

После заполнения маппингов настроить cron:
```bash
# Каждые 2 часа
0 */2 * * * cd /path/to/project && python3 scripts/alko_to_epicentr.py >> logs/cron.log 2>&1
```

---

## Файлы проекта

```
/path/to/alko-project/
├── CLAUDE.md                        # Инструкция для Claude Code CLI
├── PROJECT_SUMMARY.md               # Этот файл
├── scripts/
│   └── alko_to_epicentr.py         # Конвертер (production-ready)
├── feeds/
│   └── epicentr_feed.xml           # Выходной файл (создаётся скриптом)
└── logs/
    └── *.log                        # Логи
```

---

## API Reference

### Эпицентр API

```
Base URL: https://api.epicentrm.com.ua/
Token: 5a6489d1a5c48c9d174bd31f2a0a8fd0

Endpoints:
- GET /swagger/#/PIM/getCategoriesV2     - список категорий
- GET /swagger/#/PIM/getAttributeSetsV2  - наборы атрибутов
- GET /swagger/#/PIM/getAttributeOptionsV2 - опции атрибутов (бренды, страны)
```

### AL-KO XML

```
URL: https://apipim.al-ko.ua/storage/xml_files/PriceList.xml
Формат: YML (Yandex Market Language)
Кодировка: UTF-8
Обновление: регулярно (точный интервал уточнить у поставщика)
```

---

## Ранее выполненные задачи

### Rozetka Integration ✅
- PHP-прокси для трансформации XML
- Исправление 7 проблем по отчёту модерации
- Автоматическая синхронизация

### Сайт alko-technics.com.ua ✅
- Украиноязычный контент
- Условия доставки
- Интеграция с товарным фидом

---

## Контакты

- **Эпицентр поддержка:** merchant@epicentrk.ua
- **Документация:** https://supportm.epicentrk.ua/yak-importuvaty-tovary/
