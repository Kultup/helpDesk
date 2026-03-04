#!/bin/bash

# Скрипт виконується перед запуском бекенда
# Очищує порти та перевіряє залежності

echo "🚀 Pre-start перевірки для helpdesk-backend..."
echo "⏰ Час: $(date '+%Y-%m-%d %H:%M:%S')"

# Перевіряємо та очищуємо порт 5000
echo "🔍 Перевірка порту 5000..."
if command -v lsof &> /dev/null; then
    SCRIPT_DIR="$(dirname "$0")"
    bash "$SCRIPT_DIR/kill-port.sh" 5000
    RESULT=$?
    if [ $RESULT -eq 0 ]; then
        echo "✅ Порт 5000 готовий"
    else
        echo "❌ Не вдалося звільнити порт 5000"
        exit 1
    fi
else
    echo "⚠️  lsof не знайдено, пропускаю перевірку портів"
fi

# Перевіряємо чи існує .env
if [ ! -f "$(dirname "$0")/../.env" ]; then
    echo "⚠️  Файл .env не знайдено"
fi

# Перевіряємо підключення до MongoDB
echo "🔍 Перевірка MongoDB..."
if command -v mongosh &> /dev/null; then
    mongosh --eval "db.adminCommand('ping')" --quiet > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo "✅ MongoDB доступна"
    else
        echo "⚠️  MongoDB недоступна"
    fi
fi

echo "✅ Pre-start перевірки завершено"
echo "⏰ Час завершення: $(date '+%Y-%m-%d %H:%M:%S')"
exit 0
