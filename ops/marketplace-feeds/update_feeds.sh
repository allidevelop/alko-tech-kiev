#!/bin/bash
#
# AL-KO Feeds Auto-Update Script
# Обновляет фиды для Epicentr, Rozetka и Prom.ua из источника AL-KO
#
# Источник: https://apipim.al-ko.ua/storage/xml_files/PriceList.xml
#
# Запуск: ./update_feeds.sh
# Cron:   0 */2 * * * /home/developer/projects/alko_technics/update_feeds.sh
#

set -e

# Директории
PROJECT_DIR="/home/developer/projects/alko-store/ops/marketplace-feeds"
EPICENTR_SCRIPT="$PROJECT_DIR/alko-epicentr-project/scripts/alko_to_epicentr.py"
ROZETKA_DIR="/home/developer/www/rozetka-feed"
PROM_DIR="$PROJECT_DIR/prom-integration"
LOG_FILE="$PROJECT_DIR/feeds_update.log"

# Выходные файлы
EPICENTR_OUTPUT="/var/www/html/epicentr_feed.xml"
EPICENTR_BACKUP="$PROJECT_DIR/alko-epicentr-project/feeds/epicentr_feed.xml"

# Timestamp
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$TIMESTAMP] === Начало обновления фидов ===" >> "$LOG_FILE"

# 1. Обновление Epicentr фида
echo "[$TIMESTAMP] Обновление Epicentr фида..." >> "$LOG_FILE"
if python3 "$EPICENTR_SCRIPT" --output "$EPICENTR_BACKUP" >> "$LOG_FILE" 2>&1; then
    # Копируем в web-директорию
    cp "$EPICENTR_BACKUP" "$EPICENTR_OUTPUT" 2>/dev/null || {
        echo "[$TIMESTAMP] ВНИМАНИЕ: Не удалось скопировать в $EPICENTR_OUTPUT (нужен sudo)" >> "$LOG_FILE"
    }
    echo "[$TIMESTAMP] Epicentr фид обновлён успешно" >> "$LOG_FILE"
else
    echo "[$TIMESTAMP] ОШИБКА: Не удалось обновить Epicentr фид" >> "$LOG_FILE"
fi

# 2. Rozetka фид обновляется автоматически (PHP-прокси)
# Проверяем доступность
echo "[$TIMESTAMP] Проверка Rozetka фида..." >> "$LOG_FILE"
if curl -s -o /dev/null -w "%{http_code}" "http://localhost:8089/rozetka_standalone.php" | grep -q "200"; then
    echo "[$TIMESTAMP] Rozetka фид доступен (динамический)" >> "$LOG_FILE"
else
    echo "[$TIMESTAMP] ВНИМАНИЕ: Rozetka фид недоступен на порту 8089" >> "$LOG_FILE"
fi

# 3. Prom.ua фид — проверяем доступность
echo "[$TIMESTAMP] Проверка Prom.ua фида..." >> "$LOG_FILE"
if curl -s -o /dev/null -w "%{http_code}" "http://localhost:8090/prom_standalone.php" | grep -q "200"; then
    PROM_COUNT=$(curl -s "http://localhost:8090/prom_standalone.php" 2>/dev/null | grep -c '<offer ' || echo "0")
    echo "[$TIMESTAMP] Prom.ua фид доступен ($PROM_COUNT товаров)" >> "$LOG_FILE"
else
    echo "[$TIMESTAMP] ВНИМАНИЕ: Prom.ua фид недоступен на порту 8090" >> "$LOG_FILE"
fi

TIMESTAMP_END=$(date '+%Y-%m-%d %H:%M:%S')
echo "[$TIMESTAMP_END] === Обновление завершено ===" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"
