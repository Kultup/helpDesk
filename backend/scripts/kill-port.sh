#!/bin/bash

# Скрипт для вбивання процесів на зайнятих портах
# Використання: ./kill-port.sh 5000

PORT=${1:-5000}

echo "🔍 Перевіряю порт $PORT..."

# Перевіряємо чи порт зайнятий
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "⚠️  Порт $PORT зайнятий. Завершую процеси..."

    # Отримуємо PID процесів на порту
    PIDS=$(lsof -ti :$PORT)

    if [ -n "$PIDS" ]; then
        echo "🔪 Знайдено процеси: $PIDS"
        
        # Спочатку пробуємо коректно зупинити (SIGTERM)
        echo "📴 Надсилаю SIGTERM..."
        kill -15 $PIDS 2>/dev/null
        
        # Чекаємо 3 секунди
        sleep 3
        
        # Перевіряємо чи порт звільнився
        if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
            echo "⚠️  Порт все ще зайнятий. Вбиваю примусово (SIGKILL)..."
            kill -9 $PIDS 2>/dev/null
            sleep 1
        fi

        # Фінальна перевірка
        if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
            echo "❌ Не вдалося звільнити порт $PORT"
            exit 1
        else
            echo "✅ Порт $PORT звільнено"
            exit 0
        fi
    fi
else
    echo "✅ Порт $PORT вільний"
    exit 0
fi
