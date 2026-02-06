#!/bin/bash

# Скрипт для моніторингу та автоматичного перезапуску з очищенням портів
# Запускається через cron кожні 5 хвилин

LOG_FILE="/srv/helpDesk/backend/logs/monitor.log"
BACKEND_NAME="helpdesk-backend"
PORT=5000

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "🔍 Перевірка стану сервісу $BACKEND_NAME..."

# Перевіряємо чи PM2 процес запущений
PM2_STATUS=$(pm2 jlist | grep -o "\"name\":\"$BACKEND_NAME\"" | wc -l)

if [ "$PM2_STATUS" -eq 0 ]; then
    log "❌ PM2 процес $BACKEND_NAME не знайдено!"
    log "🚀 Запускаю сервіс..."
    cd /srv/helpDesk/backend
    bash scripts/cleanup-ports.sh
    pm2 start ecosystem.config.js --env production
    log "✅ Сервіс запущено"
    exit 0
fi

# Перевіряємо чи процес в статусі online
PM2_ONLINE=$(pm2 jlist | grep -A5 "\"name\":\"$BACKEND_NAME\"" | grep -o "\"status\":\"online\"" | wc -l)

if [ "$PM2_ONLINE" -eq 0 ]; then
    log "⚠️  Процес $BACKEND_NAME не в статусі online"
    log "🔄 Очищаю порти та перезапускаю..."
    cd /srv/helpDesk/backend
    bash scripts/cleanup-ports.sh
    pm2 restart $BACKEND_NAME
    log "✅ Перезапуск виконано"
    exit 0
fi

# Перевіряємо чи порт відповідає
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$PORT/health 2>/dev/null)

if [ "$HTTP_CODE" != "200" ]; then
    log "⚠️  API не відповідає (HTTP $HTTP_CODE)"
    log "🔄 Перезапускаю з очищенням портів..."
    cd /srv/helpDesk/backend
    bash scripts/cleanup-ports.sh
    pm2 restart $BACKEND_NAME
    sleep 3
    
    # Перевірка після перезапуску
    HTTP_CODE_AFTER=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$PORT/health 2>/dev/null)
    if [ "$HTTP_CODE_AFTER" = "200" ]; then
        log "✅ API відновлено після перезапуску"
    else
        log "❌ API все ще не відповідає, потрібна ручна перевірка"
    fi
    exit 0
fi

log "✅ Сервіс працює нормально"
