#!/bin/bash
# Автообновление Meta Ads long-lived token
# Запускается cron раз в 50 дней (токен живёт 60)
# Обновляет токен в Claude MCP конфиге

APP_ID="1390634508995767"
APP_SECRET="e3eb1dca2a7e6a1339eec0c5846b49de"
MCP_CONFIG="/home/developer/.claude.json"
PROJECT_PATH="/home/developer/projects/alko-store"
LOG="/home/developer/.pm2/logs/meta-token-refresh.log"
TELEGRAM_BOT="8080753063:AAF3JMs_4xzaJvkmy_1gtO16N8ElU_wgaSc"
TELEGRAM_CHAT="6552346228"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG"; }

send_telegram() {
  curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT}/sendMessage" \
    -d chat_id="$TELEGRAM_CHAT" \
    -d parse_mode=Markdown \
    -d text="$1" > /dev/null 2>&1
}

# Извлечь текущий токен из MCP конфига (project-level)
CURRENT_TOKEN=$(python3 -c "
import json
with open('$MCP_CONFIG') as f:
    cfg = json.load(f)
proj = cfg.get('projects', {}).get('$PROJECT_PATH', {})
servers = proj.get('mcpServers', {})
meta = servers.get('meta-ads-local', {})
env = meta.get('env', {})
print(env.get('META_ACCESS_TOKEN', ''))
" 2>/dev/null)

if [ -z "$CURRENT_TOKEN" ]; then
  log "ERROR: No current token found in MCP config"
  send_telegram "⚠️ *Meta Token Refresh FAILED*: токен не найден в конфиге"
  exit 1
fi

# Проверить срок действия текущего токена
EXPIRES=$(curl -s "https://graph.facebook.com/v21.0/debug_token?input_token=$CURRENT_TOKEN&access_token=${APP_ID}|${APP_SECRET}" | \
  python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('expires_at',0))" 2>/dev/null)

DAYS_LEFT=$(python3 -c "
import time
exp = int('${EXPIRES}' or '0')
if exp == 0: print(-1)
else: print(int((exp - time.time()) / 86400))
")

log "Token expires in $DAYS_LEFT days"

if [ "$DAYS_LEFT" -gt 15 ]; then
  log "Token still valid ($DAYS_LEFT days left), skipping refresh"
  exit 0
fi

# Обменять на новый long-lived токен
RESPONSE=$(curl -s "https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=$APP_ID&client_secret=$APP_SECRET&fb_exchange_token=$CURRENT_TOKEN")

NEW_TOKEN=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)

if [ -z "$NEW_TOKEN" ]; then
  ERROR=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error',{}).get('message','Unknown error'))" 2>/dev/null)
  log "ERROR: Token refresh failed: $ERROR"
  send_telegram "⚠️ *Meta Token Refresh FAILED*: $ERROR
Нужно вручную сгенерировать новый токен в Graph API Explorer."
  exit 1
fi

# Обновить токен в MCP конфиге (project-level)
python3 -c "
import json
with open('$MCP_CONFIG') as f:
    cfg = json.load(f)
cfg['projects']['$PROJECT_PATH']['mcpServers']['meta-ads-local']['env']['META_ACCESS_TOKEN'] = '$NEW_TOKEN'
with open('$MCP_CONFIG', 'w') as f:
    json.dump(cfg, f, indent=2)
print('Config updated')
"

log "SUCCESS: Token refreshed. New token: ${NEW_TOKEN:0:20}..."
send_telegram "✅ *Meta Ads Token обновлён*
Новый срок: ~60 дней
Старый оставалось: ${DAYS_LEFT} дней"
