# ============================================
# Help Desk System - Local Setup Script (Windows)
# ============================================
# Цей скрипт підготовлює проект для локального запуску

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Help Desk System - Local Setup" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Перевірка Node.js
Write-Host "Перевірка Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "✓ Node.js встановлено: $nodeVersion" -ForegroundColor Green
    
    # Перевірка версії Node.js
    $majorVersion = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
    if ($majorVersion -lt 18) {
        Write-Host "⚠ Попередження: Рекомендована версія Node.js 18+ (поточна: $nodeVersion)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "✗ Помилка: Node.js не встановлено!" -ForegroundColor Red
    Write-Host "Встановіть Node.js з https://nodejs.org/" -ForegroundColor Red
    exit 1
}

# Перевірка npm
Write-Host "Перевірка npm..." -ForegroundColor Yellow
try {
    $npmVersion = npm --version
    Write-Host "✓ npm встановлено: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Помилка: npm не встановлено!" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Створення .env файлів
Write-Host "Створення конфігураційних файлів..." -ForegroundColor Yellow

# Backend .env
if (Test-Path "backend\.env") {
    Write-Host "⚠ backend\.env вже існує, пропускаю..." -ForegroundColor Yellow
} else {
    if (Test-Path "backend\.env.example") {
        Copy-Item "backend\.env.example" "backend\.env"
        Write-Host "✓ Створено backend\.env з прикладу" -ForegroundColor Green
        
        # Генерація JWT секретів
        Write-Host "Генерація JWT секретів..." -ForegroundColor Yellow
        $jwtSecret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | ForEach-Object {[char]$_})
        $jwtRefreshSecret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | ForEach-Object {[char]$_})
        
        # Оновлення .env файлу
        $envContent = Get-Content "backend\.env" -Raw
        $envContent = $envContent -replace 'JWT_SECRET=.*', "JWT_SECRET=$jwtSecret"
        $envContent = $envContent -replace 'JWT_REFRESH_SECRET=.*', "JWT_REFRESH_SECRET=$jwtRefreshSecret"
        Set-Content "backend\.env" -Value $envContent -NoNewline
        Write-Host "✓ JWT секрети згенеровано та додано до backend\.env" -ForegroundColor Green
    } else {
        Write-Host "✗ Помилка: backend\.env.example не знайдено!" -ForegroundColor Red
    }
}

# Frontend .env
if (Test-Path "frontend\.env") {
    Write-Host "⚠ frontend\.env вже існує, пропускаю..." -ForegroundColor Yellow
} else {
    if (Test-Path "frontend\.env.example") {
        Copy-Item "frontend\.env.example" "frontend\.env"
        Write-Host "✓ Створено frontend\.env з прикладу" -ForegroundColor Green
    } else {
        Write-Host "⚠ frontend\.env.example не знайдено, створюю базовий .env..." -ForegroundColor Yellow
        @"
# Frontend Environment Variables
REACT_APP_API_URL=http://localhost:5000/api
"@ | Out-File "frontend\.env" -Encoding utf8
        Write-Host "✓ Створено базовий frontend\.env" -ForegroundColor Green
    }
}

Write-Host ""

# Перевірка MongoDB
Write-Host "Перевірка MongoDB..." -ForegroundColor Yellow
try {
    $mongoCheck = Get-Command mongod -ErrorAction SilentlyContinue
    if ($mongoCheck) {
        Write-Host "✓ MongoDB встановлено" -ForegroundColor Green
        Write-Host "  Переконайтеся, що MongoDB запущена: mongod" -ForegroundColor Cyan
    } else {
        Write-Host "⚠ MongoDB не знайдено в PATH" -ForegroundColor Yellow
        Write-Host "  Варіанти:" -ForegroundColor Cyan
        Write-Host "  1. Встановіть MongoDB локально: https://www.mongodb.com/try/download/community" -ForegroundColor Cyan
        Write-Host "  2. Використайте Docker: docker run -d -p 27017:27017 --name mongodb mongo:latest" -ForegroundColor Cyan
        Write-Host "  3. Використайте MongoDB Atlas (хмарна база): https://www.mongodb.com/cloud/atlas" -ForegroundColor Cyan
    }
} catch {
    Write-Host "⚠ Не вдалося перевірити MongoDB" -ForegroundColor Yellow
}

Write-Host ""

# Встановлення залежностей
Write-Host "Встановлення залежностей..." -ForegroundColor Yellow
Write-Host "Це може зайняти кілька хвилин..." -ForegroundColor Cyan
Write-Host ""

# Кореневий package.json
Write-Host "[1/3] Встановлення кореневих залежностей..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Помилка встановлення кореневих залежностей" -ForegroundColor Red
    exit 1
}

# Backend залежності
Write-Host "[2/3] Встановлення backend залежностей..." -ForegroundColor Yellow
Set-Location backend
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Помилка встановлення backend залежностей" -ForegroundColor Red
    Set-Location ..
    exit 1
}
Set-Location ..

# Frontend залежності
Write-Host "[3/3] Встановлення frontend залежностей..." -ForegroundColor Yellow
Set-Location frontend
npm install --legacy-peer-deps
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Помилка встановлення frontend залежностей" -ForegroundColor Red
    Set-Location ..
    exit 1
}
Set-Location ..

Write-Host ""
Write-Host "✓ Всі залежності встановлено успішно!" -ForegroundColor Green
Write-Host ""

# Створення необхідних директорій
Write-Host "Створення необхідних директорій..." -ForegroundColor Yellow
$directories = @(
    "backend\uploads",
    "backend\logs"
)

foreach ($dir in $directories) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "✓ Створено: $dir" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Налаштування завершено!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Наступні кроки:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Переконайтеся, що MongoDB запущена:" -ForegroundColor Cyan
Write-Host "   mongod" -ForegroundColor White
Write-Host "   або" -ForegroundColor White
Write-Host "   docker run -d -p 27017:27017 --name mongodb mongo:latest" -ForegroundColor White
Write-Host ""
Write-Host "2. Перевірте та налаштуйте змінні середовища:" -ForegroundColor Cyan
Write-Host "   - backend\.env (обов'язково: MONGODB_URI, JWT_SECRET, JWT_REFRESH_SECRET)" -ForegroundColor White
Write-Host "   - frontend\.env (опціонально для development)" -ForegroundColor White
Write-Host ""
Write-Host "3. Створіть адміністратора системи:" -ForegroundColor Cyan
Write-Host "   cd backend" -ForegroundColor White
Write-Host "   node scripts/createAdmin.js" -ForegroundColor White
Write-Host ""
Write-Host "4. Запустіть проект:" -ForegroundColor Cyan
Write-Host "   npm run dev" -ForegroundColor White
Write-Host "   (або окремо: npm run server та npm run client)" -ForegroundColor White
Write-Host ""
Write-Host "5. Відкрийте браузер:" -ForegroundColor Cyan
Write-Host "   http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "Облікові дані за замовчуванням:" -ForegroundColor Yellow
Write-Host "   Email: admin@test.com" -ForegroundColor White
Write-Host "   Пароль: admin123" -ForegroundColor White
Write-Host ""

