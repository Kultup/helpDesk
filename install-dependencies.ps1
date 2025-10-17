# Скрипт для встановлення всіх залежностей Help Desk системи
# Використовується для Windows серверів

param(
    [switch]$Production,
    [switch]$Development,
    [switch]$Help
)

# Налаштування виконання скриптів
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force

# Кольори для виводу
$Colors = @{
    Red = "Red"
    Green = "Green"
    Yellow = "Yellow"
    Blue = "Blue"
    White = "White"
}

# Функції для виводу повідомлень
function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor $Colors.Blue
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor $Colors.Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor $Colors.Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor $Colors.Red
}

# Перевірка наявності Node.js
function Test-NodeJS {
    Write-Info "Перевірка наявності Node.js..."
    
    try {
        $nodeVersion = node --version
        $npmVersion = npm --version
        Write-Success "Node.js версія: $nodeVersion"
        Write-Success "npm версія: $npmVersion"
        return $true
    }
    catch {
        Write-Error "Node.js не встановлено!"
        Write-Info "Завантажте та встановіть Node.js з https://nodejs.org/"
        Write-Info "Рекомендована версія: 18.x LTS"
        return $false
    }
}

# Перевірка наявності MongoDB
function Test-MongoDB {
    Write-Info "Перевірка наявності MongoDB..."
    
    try {
        $mongoVersion = mongod --version
        Write-Success "MongoDB встановлено"
        return $true
    }
    catch {
        Write-Warning "MongoDB не встановлено!"
        Write-Info "Завантажте та встановіть MongoDB з https://www.mongodb.com/try/download/community"
        Write-Info "Рекомендована версія: 6.0+"
        return $false
    }
}

# Встановлення Chocolatey (пакетний менеджер для Windows)
function Install-Chocolatey {
    Write-Info "Перевірка наявності Chocolatey..."
    
    try {
        choco --version | Out-Null
        Write-Success "Chocolatey вже встановлено"
    }
    catch {
        Write-Info "Встановлення Chocolatey..."
        Set-ExecutionPolicy Bypass -Scope Process -Force
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
        Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
        Write-Success "Chocolatey встановлено"
    }
}

# Встановлення системних пакетів через Chocolatey
function Install-SystemPackages {
    Write-Info "Встановлення системних пакетів..."
    
    $packages = @(
        "git",
        "python3",
        "visualstudio2019buildtools",
        "nodejs",
        "mongodb"
    )
    
    foreach ($package in $packages) {
        try {
            Write-Info "Встановлення $package..."
            choco install $package -y
            Write-Success "$package встановлено"
        }
        catch {
            Write-Warning "Не вдалося встановити $package"
        }
    }
}


# Встановлення PM2 глобально
function Install-PM2 {
    Write-Info "Встановлення PM2..."
    
    try {
        pm2 --version | Out-Null
        Write-Success "PM2 вже встановлено"
    }
    catch {
        npm install -g pm2
        Write-Success "PM2 встановлено"
    }
}

# Встановлення cross-env глобально
function Install-CrossEnv {
    Write-Info "Встановлення cross-env..."
    
    try {
        npm install -g cross-env
        Write-Success "cross-env встановлено"
    }
    catch {
        Write-Warning "Не вдалося встановити cross-env"
    }
}

# Встановлення залежностей кореневого проекту
function Install-RootDependencies {
    Write-Info "Встановлення залежностей кореневого проекту..."
    
    try {
        npm install
        Write-Success "Залежності кореневого проекту встановлено"
    }
    catch {
        Write-Error "Помилка встановлення залежностей кореневого проекту"
        throw
    }
}

# Встановлення залежностей backend
function Install-BackendDependencies {
    Write-Info "Встановлення залежностей backend..."
    
    try {
        Set-Location backend
        
        if ($Production) {
            npm ci --only=production
            Write-Success "Production залежності backend встановлено"
        }
        else {
            npm install
            Write-Success "Всі залежності backend встановлено"
        }
        
        Set-Location ..
    }
    catch {
        Write-Error "Помилка встановлення залежностей backend"
        Set-Location ..
        throw
    }
}

# Встановлення залежностей frontend
function Install-FrontendDependencies {
    Write-Info "Встановлення залежностей frontend..."
    
    try {
        Set-Location frontend
        npm install
        Write-Success "Залежності frontend встановлено"
        Set-Location ..
    }
    catch {
        Write-Error "Помилка встановлення залежностей frontend"
        Set-Location ..
        throw
    }
}

# Створення необхідних директорій
function New-ProjectDirectories {
    Write-Info "Створення необхідних директорій..."
    
    $directories = @(
        "backend\logs",
        "frontend\logs",
        "backend\uploads",
        "backup"
    )
    
    foreach ($dir in $directories) {
        if (!(Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
            Write-Success "Створено директорію: $dir"
        }
        else {
            Write-Info "Директорія вже існує: $dir"
        }
    }
}

# Перевірка встановлення
function Test-Installation {
    Write-Info "Перевірка встановлення..."
    
    $errors = @()
    
    # Перевірка Node.js модулів
    if (!(Test-Path "node_modules") -or !(Test-Path "backend\node_modules") -or !(Test-Path "frontend\node_modules")) {
        $errors += "Деякі Node.js модулі не встановлено"
    }
    
    # Перевірка PM2
    try {
        pm2 --version | Out-Null
    }
    catch {
        $errors += "PM2 не встановлено"
    }
    
    if ($errors.Count -eq 0) {
        Write-Success "Всі компоненти встановлено успішно!"
        return $true
    }
    else {
        foreach ($error in $errors) {
            Write-Error $error
        }
        return $false
    }
}

# Показати довідку
function Show-Help {
    Write-Host @"
Скрипт для встановлення залежностей Help Desk системи

Використання:
    .\install-dependencies.ps1 [параметри]

Параметри:
    -Production     Встановити тільки production залежності
    -Development    Встановити всі залежності (за замовчуванням)
    -Help          Показати цю довідку

Приклади:
    .\install-dependencies.ps1
    .\install-dependencies.ps1 -Production
    .\install-dependencies.ps1 -Development

"@ -ForegroundColor $Colors.White
}

# Головна функція
function Main {
    if ($Help) {
        Show-Help
        return
    }
    
    Write-Info "🚀 Початок встановлення залежностей Help Desk системи..."
    
    try {
        # Встановлення режиму
        if ($Production) {
            $env:NODE_ENV = "production"
            Write-Info "Режим: Production"
        }
        else {
            $env:NODE_ENV = "development"
            Write-Info "Режим: Development"
        }
        
        # Перевірка основних компонентів
        if (!(Test-NodeJS)) {
            throw "Node.js не встановлено"
        }
        
        Test-MongoDB
        
        # Встановлення пакетів
        Install-Chocolatey
        Install-PM2
        Install-CrossEnv
        
        # Встановлення Node.js залежностей
        Install-RootDependencies
        Install-BackendDependencies
        Install-FrontendDependencies
        
        # Налаштування системи
        New-ProjectDirectories
        
        # Перевірка
        if (Test-Installation) {
            Write-Host ""
            Write-Success "🎉 Всі залежності встановлено успішно!"
            Write-Host ""
            Write-Info "Наступні кроки:"
            Write-Host "1. Налаштуйте змінні середовища в backend\.env"
            Write-Host "2. Налаштуйте змінні середовища в frontend\.env"
            Write-Host "3. Запустіть систему командою: .\deploy.sh staging"
            Write-Host ""
        }
        else {
            throw "Встановлення завершилося з помилками"
        }
    }
    catch {
        Write-Error "Помилка встановлення: $_"
        exit 1
    }
}

# Запуск головної функції
Main