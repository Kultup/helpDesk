#!/bin/bash

# Скрипт для налаштування Firebase service account key на сервері

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
FIREBASE_DIR="$BACKEND_DIR/.firebase"
SERVICE_ACCOUNT_FILE="$FIREBASE_DIR/heldeskm-service-account.json"

echo "🔧 Налаштування Firebase для FCM сповіщень"
echo ""

# Створюємо директорію якщо не існує
if [ ! -d "$FIREBASE_DIR" ]; then
    echo "📁 Створюю директорію $FIREBASE_DIR"
    mkdir -p "$FIREBASE_DIR"
fi

# Перевіряємо чи файл вже існує
if [ -f "$SERVICE_ACCOUNT_FILE" ]; then
    echo "⚠️  Файл $SERVICE_ACCOUNT_FILE вже існує"
    read -p "Перезаписати? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Скасовано"
        exit 0
    fi
fi

echo ""
echo "📝 Інструкції:"
echo "1. Перейдіть на https://console.firebase.google.com/"
echo "2. Виберіть проект 'heldeskm'"
echo "3. Project Settings → Service accounts"
echo "4. Натисніть 'Generate new private key'"
echo "5. Завантажте JSON файл"
echo ""
read -p "Натисніть Enter після завантаження файлу..."

echo ""
echo "📤 Вставте вміст JSON файлу (Ctrl+D для завершення):"
echo ""

# Читаємо вміст з stdin
cat > "$SERVICE_ACCOUNT_FILE"

# Перевіряємо чи файл валідний JSON
if ! python3 -m json.tool "$SERVICE_ACCOUNT_FILE" > /dev/null 2>&1; then
    echo "❌ Помилка: файл не є валідним JSON"
    rm "$SERVICE_ACCOUNT_FILE"
    exit 1
fi

# Встановлюємо права доступу
chmod 600 "$SERVICE_ACCOUNT_FILE"
echo "✅ Права доступу встановлено (600)"

# Перевіряємо структуру файлу
if grep -q '"type": "service_account"' "$SERVICE_ACCOUNT_FILE" && \
   grep -q '"project_id": "heldeskm"' "$SERVICE_ACCOUNT_FILE"; then
    echo "✅ Файл валідний"
    echo ""
    echo "📁 Файл створено: $SERVICE_ACCOUNT_FILE"
    echo ""
    echo "🚀 Наступні кроки:"
    echo "1. Перезапустіть бекенд сервер"
    echo "2. Перевірте логи на наявність: '✅ Firebase Admin SDK ініціалізовано для FCM'"
else
    echo "⚠️  Попередження: файл може бути некоректним"
    echo "   Перевірте чи project_id = 'heldeskm'"
fi

