#!/bin/bash

###############################################################################
# Скрипт перевірки та запуску HelpDesk системи
# Використання: ./scripts/check-and-start.sh
###############################################################################

set -e

# Кольори для виводу
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Налаштування
BACKEND_PORT=5000
FRONTEND_PORT=3000
PROJECT_DIR="/srv/helpDesk"
MAX_RETRIES=3
RETRY_DELAY=5

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   HelpDesk System Startup Check & Recovery Script         ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

###############################################################################
# Функція: Перевірка чи порт зайнятий
###############################################################################
check_port() {
    local port=$1
    local name=$2
    
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Порт $port ($name) зайнятий!${NC}"
        return 0
    else
        echo -e "${GREEN}✅ Порт $port ($name) вільний${NC}"
        return 1
    fi
}

###############################################################################
# Функція: Вбити процес на порту
###############################################################################
kill_port() {
    local port=$1
    local name=$2
    
    echo -e "${YELLOW}🔪 Звільняю порт $port ($name)...${NC}"
    
    # Знайти PID процесу
    local pid=$(lsof -ti:$port)
    
    if [ -z "$pid" ]; then
        echo -e "${GREEN}✅ Порт $port вже вільний${NC}"
        return 0
    fi
    
    # Спочатку спробувати graceful shutdown (SIGTERM)
    echo -e "${BLUE}   Відправляю SIGTERM до процесу $pid...${NC}"
    kill -15 $pid 2>/dev/null || true
    
    # Зачекати 3 секунди
    sleep 3
    
    # Перевірити чи процес ще живий
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${YELLOW}   Процес не завершився. Відправляю SIGKILL...${NC}"
        kill -9 $pid 2>/dev/null || true
        sleep 1
    fi
    
    # Фінальна перевірка
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${RED}❌ Не вдалося звільнити порт $port${NC}"
        return 1
    else
        echo -e "${GREEN}✅ Порт $port звільнено${NC}"
        return 0
    fi
}

###############################################################################
# Функція: Перевірка стану MongoDB
###############################################################################
check_mongodb() {
    echo -e "${BLUE}🔍 Перевірка MongoDB...${NC}"
    
    if systemctl is-active --quiet mongod || systemctl is-active --quiet mongodb; then
        echo -e "${GREEN}✅ MongoDB працює${NC}"
        return 0
    else
        echo -e "${RED}❌ MongoDB не працює!${NC}"
        echo -e "${YELLOW}   Спроба запуску MongoDB...${NC}"
        
        sudo systemctl start mongod 2>/dev/null || sudo systemctl start mongodb 2>/dev/null || {
            echo -e "${RED}❌ Не вдалося запустити MongoDB${NC}"
            return 1
        }
        
        sleep 3
        
        if systemctl is-active --quiet mongod || systemctl is-active --quiet mongodb; then
            echo -e "${GREEN}✅ MongoDB успішно запущено${NC}"
            return 0
        else
            echo -e "${RED}❌ MongoDB не запустився${NC}"
            return 1
        fi
    fi
}

###############################################################################
# Функція: Перевірка стану Redis
###############################################################################
check_redis() {
    echo -e "${BLUE}🔍 Перевірка Redis...${NC}"
    
    if systemctl is-active --quiet redis || systemctl is-active --quiet redis-server; then
        echo -e "${GREEN}✅ Redis працює${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠️  Redis не працює (не критично)${NC}"
        echo -e "${YELLOW}   Спроба запуску Redis...${NC}"
        
        sudo systemctl start redis 2>/dev/null || sudo systemctl start redis-server 2>/dev/null || {
            echo -e "${YELLOW}⚠️  Redis не запущено (система працюватиме без кешу)${NC}"
            return 0
        }
        
        sleep 2
        echo -e "${GREEN}✅ Redis запущено${NC}"
        return 0
    fi
}

###############################################################################
# Функція: Перевірка PM2 процесів
###############################################################################
check_pm2() {
    echo -e "${BLUE}🔍 Перевірка PM2 процесів...${NC}"
    
    # Перевірити чи PM2 взагалі встановлено
    if ! command -v pm2 &> /dev/null; then
        echo -e "${RED}❌ PM2 не встановлено!${NC}"
        return 1
    fi
    
    # Отримати список процесів
    local backend_status=$(pm2 jlist 2>/dev/null | jq -r '.[] | select(.name=="helpdesk-backend") | .pm2_env.status' 2>/dev/null || echo "not_found")
    local frontend_status=$(pm2 jlist 2>/dev/null | jq -r '.[] | select(.name=="helpdesk-frontend") | .pm2_env.status' 2>/dev/null || echo "not_found")
    
    echo -e "${BLUE}   Backend: ${NC}$backend_status"
    echo -e "${BLUE}   Frontend: ${NC}$frontend_status"
    
    if [ "$backend_status" = "online" ] && [ "$frontend_status" = "online" ]; then
        echo -e "${GREEN}✅ Всі PM2 процеси працюють${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠️  Деякі PM2 процеси не працюють${NC}"
        return 1
    fi
}

###############################################################################
# Функція: Запуск PM2 процесів
###############################################################################
start_pm2() {
    echo -e "${BLUE}🚀 Запуск PM2 процесів...${NC}"
    
    cd $PROJECT_DIR
    
    # Зупинити всі процеси (якщо є)
    pm2 stop all 2>/dev/null || true
    pm2 delete all 2>/dev/null || true
    
    # Запустити з ecosystem файлу
    pm2 start ecosystem.config.js
    
    # Зачекати 5 секунд для старту
    sleep 5
    
    # Перевірити статус
    pm2 list
    
    # Зберегти список процесів для автозапуску
    pm2 save
    
    echo -e "${GREEN}✅ PM2 процеси запущено${NC}"
}

###############################################################################
# Функція: Health check
###############################################################################
health_check() {
    echo -e "${BLUE}🏥 Health check...${NC}"
    
    local retry=0
    local max_retries=10
    
    while [ $retry -lt $max_retries ]; do
        # Перевірка backend
        if curl -f -s http://localhost:$BACKEND_PORT/api/health > /dev/null 2>&1; then
            echo -e "${GREEN}✅ Backend health check OK${NC}"
            return 0
        fi
        
        retry=$((retry + 1))
        echo -e "${YELLOW}   Спроба $retry/$max_retries...${NC}"
        sleep 2
    done
    
    echo -e "${RED}❌ Backend health check failed${NC}"
    return 1
}

###############################################################################
# Головна функція
###############################################################################
main() {
    echo -e "${BLUE}📅 $(date '+%Y-%m-%d %H:%M:%S')${NC}"
    echo ""
    
    # 1. Перевірка MongoDB
    check_mongodb || {
        echo -e "${RED}❌ Критична помилка: MongoDB не працює!${NC}"
        exit 1
    }
    echo ""
    
    # 2. Перевірка Redis
    check_redis
    echo ""
    
    # 3. Перевірка портів
    echo -e "${BLUE}🔍 Перевірка портів...${NC}"
    
    backend_busy=false
    frontend_busy=false
    
    if check_port $BACKEND_PORT "Backend"; then
        backend_busy=true
    fi
    
    if check_port $FRONTEND_PORT "Frontend"; then
        frontend_busy=true
    fi
    
    echo ""
    
    # 4. Звільнення портів якщо потрібно
    if [ "$backend_busy" = true ] || [ "$frontend_busy" = true ]; then
        echo -e "${YELLOW}⚠️  Знайдено зайняті порти. Звільняю...${NC}"
        
        if [ "$backend_busy" = true ]; then
            kill_port $BACKEND_PORT "Backend"
        fi
        
        if [ "$frontend_busy" = true ]; then
            kill_port $FRONTEND_PORT "Frontend"
        fi
        
        echo ""
    fi
    
    # 5. Перевірка PM2
    if ! check_pm2; then
        echo ""
        echo -e "${YELLOW}🔄 Перезапуск PM2 процесів...${NC}"
        start_pm2
        echo ""
    fi
    
    # 6. Health check
    health_check || {
        echo -e "${RED}❌ Health check failed. Перезапуск...${NC}"
        start_pm2
        echo ""
        
        # Повторний health check
        health_check || {
            echo -e "${RED}❌ Система не запустилася коректно!${NC}"
            echo -e "${YELLOW}📋 Логи:${NC}"
            pm2 logs --lines 50 --nostream
            exit 1
        }
    }
    
    # 7. Фінальний звіт
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                  ✅ СИСТЕМА ЗАПУЩЕНА                       ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BLUE}📊 Статус сервісів:${NC}"
    pm2 list
    echo ""
    echo -e "${BLUE}🌐 Endpoints:${NC}"
    echo -e "   Backend:  http://localhost:$BACKEND_PORT"
    echo -e "   Frontend: http://localhost:$FRONTEND_PORT"
    echo ""
}

# Запуск
main "$@"
