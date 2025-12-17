#!/bin/bash

# ============================================
# Help Desk System - Local Setup Script (Linux/macOS)
# ============================================
# Цей скрипт підготовлює проект для локального запуску

set -e

echo "============================================"
echo "Help Desk System - Local Setup"
echo "============================================"
echo ""

# Перевірка Node.js
echo "Перевірка Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "✓ Node.js встановлено: $NODE_VERSION"
    
    # Перевірка версії Node.js
    MAJOR_VERSION=$(echo $NODE_VERSION | sed 's/v\([0-9]*\).*/\1/')
    if [ "$MAJOR_VERSION" -lt 18 ]; then
        echo "⚠ Попередження: Рекомендована версія Node.js 18+ (поточна: $NODE_VERSION)"
    fi
else
    echo "✗ Помилка: Node.js не встановлено!"
    echo "Встановіть Node.js з https://nodejs.org/"
    exit 1
fi

# Перевірка npm
echo "Перевірка npm..."
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    echo "✓ npm встановлено: $NPM_VERSION"
else
    echo "✗ Помилка: npm не встановлено!"
    exit 1
fi

echo ""

# Створення .env файлів
echo "Створення конфігураційних файлів..."

# Backend .env
if [ -f "backend/.env" ]; then
    echo "⚠ backend/.env вже існує, пропускаю..."
else
    if [ -f "backend/.env.example" ]; then
        cp backend/.env.example backend/.env
        echo "✓ Створено backend/.env з прикладу"
        
        # Генерація JWT секретів
        echo "Генерація JWT секретів..."
        JWT_SECRET=$(openssl rand -hex 32)
        JWT_REFRESH_SECRET=$(openssl rand -hex 32)
        
        # Оновлення .env файлу
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            sed -i '' "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" backend/.env
            sed -i '' "s/JWT_REFRESH_SECRET=.*/JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET/" backend/.env
        else
            # Linux
            sed -i "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" backend/.env
            sed -i "s/JWT_REFRESH_SECRET=.*/JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET/" backend/.env
        fi
        echo "✓ JWT секрети згенеровано та додано до backend/.env"
    else
        echo "✗ Помилка: backend/.env.example не знайдено!"
    fi
fi

# Frontend .env
if [ -f "frontend/.env" ]; then
    echo "⚠ frontend/.env вже існує, пропускаю..."
else
    if [ -f "frontend/.env.example" ]; then
        cp frontend/.env.example frontend/.env
        echo "✓ Створено frontend/.env з прикладу"
    else
        echo "⚠ frontend/.env.example не знайдено, створюю базовий .env..."
        echo "# Frontend Environment Variables" > frontend/.env
        echo "REACT_APP_API_URL=http://localhost:5000/api" >> frontend/.env
        echo "✓ Створено базовий frontend/.env"
    fi
fi

echo ""

# Перевірка MongoDB
echo "Перевірка MongoDB..."
if command -v mongod &> /dev/null; then
    echo "✓ MongoDB встановлено"
    echo "  Переконайтеся, що MongoDB запущена: mongod"
elif command -v docker &> /dev/null; then
    echo "⚠ MongoDB не знайдено в PATH, але Docker встановлено"
    echo "  Можна використати: docker run -d -p 27017:27017 --name mongodb mongo:latest"
else
    echo "⚠ MongoDB не знайдено"
    echo "  Варіанти:"
    echo "  1. Встановіть MongoDB локально: https://www.mongodb.com/try/download/community"
    echo "  2. Використайте Docker: docker run -d -p 27017:27017 --name mongodb mongo:latest"
    echo "  3. Використайте MongoDB Atlas (хмарна база): https://www.mongodb.com/cloud/atlas"
fi

echo ""

# Встановлення залежностей
echo "Встановлення залежностей..."
echo "Це може зайняти кілька хвилин..."
echo ""

# Кореневий package.json
echo "[1/3] Встановлення кореневих залежностей..."
npm install
if [ $? -ne 0 ]; then
    echo "✗ Помилка встановлення кореневих залежностей"
    exit 1
fi

# Backend залежності
echo "[2/3] Встановлення backend залежностей..."
cd backend
npm install
if [ $? -ne 0 ]; then
    echo "✗ Помилка встановлення backend залежностей"
    cd ..
    exit 1
fi
cd ..

# Frontend залежності
echo "[3/3] Встановлення frontend залежностей..."
cd frontend
npm install --legacy-peer-deps
if [ $? -ne 0 ]; then
    echo "✗ Помилка встановлення frontend залежностей"
    cd ..
    exit 1
fi
cd ..

echo ""
echo "✓ Всі залежності встановлено успішно!"
echo ""

# Створення необхідних директорій
echo "Створення необхідних директорій..."
mkdir -p backend/uploads
mkdir -p backend/logs
echo "✓ Директорії створено"

echo ""
echo "============================================"
echo "Налаштування завершено!"
echo "============================================"
echo ""
echo "Наступні кроки:"
echo ""
echo "1. Переконайтеся, що MongoDB запущена:"
echo "   mongod"
echo "   або"
echo "   docker run -d -p 27017:27017 --name mongodb mongo:latest"
echo ""
echo "2. Перевірте та налаштуйте змінні середовища:"
echo "   - backend/.env (обов'язково: MONGODB_URI, JWT_SECRET, JWT_REFRESH_SECRET)"
echo "   - frontend/.env (опціонально для development)"
echo ""
echo "3. Створіть адміністратора системи:"
echo "   cd backend"
echo "   node scripts/createAdmin.js"
echo ""
echo "4. Запустіть проект:"
echo "   npm run dev"
echo "   (або окремо: npm run server та npm run client)"
echo ""
echo "5. Відкрийте браузер:"
echo "   http://localhost:3000"
echo ""
echo "Облікові дані за замовчуванням:"
echo "   Email: admin@test.com"
echo "   Пароль: admin123"
echo ""

