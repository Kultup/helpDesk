#!/bin/bash

# Wrapper для PM2 який завжди очищає порти перед запуском
# Використання: bash pm2-wrapper.sh start|restart|reload

ACTION=${1:-restart}
BACKEND_NAME="helpdesk-backend"

echo "🔄 PM2 Wrapper: $ACTION"

# Завжди очищаємо порти перед будь-якою операцією
echo "🧹 Очищення портів..."
cd /srv/helpDesk/backend
bash scripts/cleanup-ports.sh

# Виконуємо PM2 команду
case $ACTION in
    start)
        echo "🚀 Запуск $BACKEND_NAME..."
        pm2 start ecosystem.config.js --env production
        ;;
    restart)
        echo "🔄 Перезапуск $BACKEND_NAME..."
        pm2 restart $BACKEND_NAME
        ;;
    reload)
        echo "♻️  Reload $BACKEND_NAME..."
        pm2 reload $BACKEND_NAME
        ;;
    stop)
        echo "🛑 Зупинка $BACKEND_NAME..."
        pm2 stop $BACKEND_NAME
        ;;
    delete)
        echo "🗑️  Видалення $BACKEND_NAME..."
        pm2 delete $BACKEND_NAME
        ;;
    *)
        echo "❌ Невідома дія: $ACTION"
        echo "Використання: $0 [start|restart|reload|stop|delete]"
        exit 1
        ;;
esac

# Перевіряємо статус після операції
sleep 2
pm2 status $BACKEND_NAME

# Перевіряємо API
sleep 3
echo ""
echo "🔍 Перевірка API..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/health 2>/dev/null)
if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ API відповідає (HTTP $HTTP_CODE)"
else
    echo "⚠️  API не відповідає (HTTP $HTTP_CODE)"
fi
