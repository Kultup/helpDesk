#!/bin/bash

###############################################################################
# Автоматичний моніторинг здоров'я системи
# Запускається через cron кожні 5 хвилин
###############################################################################

# Налаштування
BACKEND_PORT=5000
FRONTEND_PORT=3000
LOG_FILE="/srv/helpDesk/backend/logs/health-monitor.log"
MAX_LOG_SIZE=10485760  # 10MB

# Функція логування
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Обрізати лог файл якщо занадто великий
if [ -f "$LOG_FILE" ] && [ $(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null) -gt $MAX_LOG_SIZE ]; then
    tail -n 1000 "$LOG_FILE" > "$LOG_FILE.tmp"
    mv "$LOG_FILE.tmp" "$LOG_FILE"
fi

log "🔍 Початок перевірки..."

# Перевірка 1: MongoDB
if ! systemctl is-active --quiet mongod && ! systemctl is-active --quiet mongodb; then
    log "❌ MongoDB не працює! Спроба запуску..."
    sudo systemctl start mongod 2>/dev/null || sudo systemctl start mongodb 2>/dev/null
    sleep 3
    
    if systemctl is-active --quiet mongod || systemctl is-active --quiet mongodb; then
        log "✅ MongoDB успішно запущено"
    else
        log "❌ КРИТИЧНО: Не вдалося запустити MongoDB!"
    fi
fi

# Перевірка 2: Redis (не критично)
if ! systemctl is-active --quiet redis && ! systemctl is-active --quiet redis-server; then
    log "⚠️  Redis не працює. Спроба запуску..."
    sudo systemctl start redis 2>/dev/null || sudo systemctl start redis-server 2>/dev/null || true
fi

# Перевірка 3: Backend health endpoint
if ! curl -f -s --max-time 5 http://localhost:$BACKEND_PORT/api/health > /dev/null 2>&1; then
    log "❌ Backend health check failed! Перевірка PM2..."
    
    # Перевірити статус PM2
    backend_status=$(pm2 jlist 2>/dev/null | jq -r '.[] | select(.name=="helpdesk-backend") | .pm2_env.status' 2>/dev/null || echo "not_found")
    
    if [ "$backend_status" != "online" ]; then
        log "❌ Backend PM2 status: $backend_status. Перезапуск..."
        pm2 restart helpdesk-backend
        sleep 10
        
        # Повторна перевірка
        if curl -f -s --max-time 5 http://localhost:$BACKEND_PORT/api/health > /dev/null 2>&1; then
            log "✅ Backend відновлено після перезапуску"
        else
            log "❌ КРИТИЧНО: Backend не відповідає після перезапуску!"
            # Запустити повну перевірку
            /srv/helpDesk/scripts/check-and-start.sh >> "$LOG_FILE" 2>&1
        fi
    else
        log "⚠️  PM2 каже що backend online, але health check fails. Перезапуск..."
        pm2 restart helpdesk-backend
    fi
else
    log "✅ Backend OK"
fi

# Перевірка 4: Frontend (перевірка порту)
if ! lsof -Pi :$FRONTEND_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    log "❌ Frontend не відповідає на порту $FRONTEND_PORT"
    
    frontend_status=$(pm2 jlist 2>/dev/null | jq -r '.[] | select(.name=="helpdesk-frontend") | .pm2_env.status' 2>/dev/null || echo "not_found")
    
    if [ "$frontend_status" != "online" ]; then
        log "❌ Frontend PM2 status: $frontend_status. Перезапуск..."
        pm2 restart helpdesk-frontend
    fi
else
    log "✅ Frontend OK"
fi

# Перевірка 5: Disk space
disk_usage=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$disk_usage" -gt 90 ]; then
    log "⚠️  УВАГА: Диск заповнено на ${disk_usage}%!"
fi

# Перевірка 6: Memory
mem_usage=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100.0}')
if [ "$mem_usage" -gt 90 ]; then
    log "⚠️  УВАГА: Пам'ять використано на ${mem_usage}%!"
fi

log "✅ Перевірка завершена"
echo ""
