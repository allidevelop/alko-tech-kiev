#!/bin/bash
# AL-KO Store — безопасный деплой без даунтайма
# Использование: bash deploy.sh [backend|storefront|all]
set -e

BACKEND_DIR="/home/developer/projects/alko-store"
STOREFRONT_DIR="/home/developer/projects/alko-store-storefront"

deploy_backend() {
  echo "=== Backend: сборка ==="
  cd "$BACKEND_DIR"
  npx medusa build 2>&1 | tail -3

  # Копируем admin build в место, где medusa start его ожидает
  mkdir -p "$BACKEND_DIR/public/admin"
  cp -r "$BACKEND_DIR/.medusa/server/public/admin/"* "$BACKEND_DIR/public/admin/"

  echo "=== Backend: очистка Redis кэша ==="
  redis-cli FLUSHALL 2>/dev/null || true

  echo "=== Backend: перезапуск ==="
  pm2 restart alko-backend

  # Ждём готовности
  for i in $(seq 1 30); do
    if curl -sf http://localhost:9000/health > /dev/null 2>&1; then
      echo "✔ Backend готов (${i}s)"
      return 0
    fi
    sleep 1
  done
  echo "✘ Backend не запустился за 30 секунд!"
  pm2 logs alko-backend --err --lines 10 --nostream
  return 1
}

deploy_storefront() {
  # Проверяем, что backend доступен (нужен для SSG)
  echo "=== Проверка backend ==="
  if ! curl -sf http://localhost:9000/health > /dev/null 2>&1; then
    echo "✘ Backend недоступен! Сначала запустите backend."
    return 1
  fi
  echo "✔ Backend работает"

  echo "=== Storefront: остановка ==="
  pm2 stop alko-storefront 2>/dev/null || true

  echo "=== Storefront: сборка ==="
  cd "$STOREFRONT_DIR"
  npm run build 2>&1 | tail -5

  echo "=== Storefront: очистка кэша и запуск ==="
  rm -rf "$STOREFRONT_DIR/.next/cache/fetch-cache"
  pm2 start alko-storefront

  sleep 3
  if curl -sf -b "_medusa_cache_id=deploy" http://localhost:3104/ua > /dev/null 2>&1; then
    echo "✔ Storefront готов"
  else
    echo "⚠ Storefront вернул ошибку, проверьте логи: pm2 logs alko-storefront --err --lines 20"
  fi
}

case "${1:-all}" in
  backend)
    deploy_backend
    ;;
  storefront)
    deploy_storefront
    ;;
  all)
    deploy_backend && deploy_storefront
    ;;
  *)
    echo "Использование: bash deploy.sh [backend|storefront|all]"
    exit 1
    ;;
esac

pm2 save
echo "=== Деплой завершён ==="
