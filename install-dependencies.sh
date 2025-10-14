#!/bin/bash

# Скрипт для встановлення всіх залежностей Help Desk системи
# Використовується для Linux/macOS серверів

set -e  # Зупинити виконання при помилці

echo "🚀 Початок встановлення залежностей Help Desk системи..."

# Кольори для виводу
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Функція для виводу повідомлень
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Перевірка наявності Node.js
check_nodejs() {
    log_info "Перевірка наявності Node.js..."
    if ! command -v node &> /dev/null; then
        log_error "Node.js не встановлено!"
        log_info "Встановлення Node.js 18.x..."
        
        # Встановлення Node.js для Ubuntu/Debian
        if command -v apt-get &> /dev/null; then
            curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
            sudo apt-get install -y nodejs
        # Встановлення Node.js для CentOS/RHEL
        elif command -v yum &> /dev/null; then
            curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
            sudo yum install -y nodejs
        else
            log_error "Не вдалося автоматично встановити Node.js. Встановіть вручну з https://nodejs.org/"
            exit 1
        fi
    fi
    
    NODE_VERSION=$(node --version)
    NPM_VERSION=$(npm --version)
    log_success "Node.js версія: $NODE_VERSION"
    log_success "npm версія: $NPM_VERSION"
}

# Перевірка наявності MongoDB
check_mongodb() {
    log_info "Перевірка наявності MongoDB..."
    if ! command -v mongod &> /dev/null; then
        log_warning "MongoDB не встановлено!"
        log_info "Встановлення MongoDB 6.0..."
        
        # Встановлення MongoDB для Ubuntu/Debian
        if command -v apt-get &> /dev/null; then
            wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
            echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
            sudo apt-get update
            sudo apt-get install -y mongodb-org
            
            # Запуск MongoDB
            sudo systemctl start mongod
            sudo systemctl enable mongod
        else
            log_warning "Встановіть MongoDB вручну з https://docs.mongodb.com/manual/installation/"
        fi
    else
        log_success "MongoDB вже встановлено"
    fi
}

# Встановлення PM2 глобально
install_pm2() {
    log_info "Встановлення PM2..."
    if ! command -v pm2 &> /dev/null; then
        npm install -g pm2
        log_success "PM2 встановлено"
    else
        log_success "PM2 вже встановлено"
    fi
}

# Встановлення залежностей кореневого проекту
install_root_dependencies() {
    log_info "Встановлення залежностей кореневого проекту..."
    npm install
    log_success "Залежності кореневого проекту встановлено"
}

# Встановлення залежностей backend
install_backend_dependencies() {
    log_info "Встановлення залежностей backend..."
    cd backend
    
    # Встановлення production залежностей
    if [ "$NODE_ENV" = "production" ]; then
        npm ci --only=production
        log_success "Production залежності backend встановлено"
    else
        npm install
        log_success "Всі залежності backend встановлено"
    fi
    
    cd ..
}

# Встановлення залежностей frontend
install_frontend_dependencies() {
    log_info "Встановлення залежностей frontend..."
    cd frontend
    npm install
    log_success "Залежності frontend встановлено"
    cd ..
}

# Встановлення додаткових системних пакетів
install_system_packages() {
    log_info "Встановлення додаткових системних пакетів..."
    
    if command -v apt-get &> /dev/null; then
        # Ubuntu/Debian
        sudo apt-get update
        sudo apt-get install -y \
            curl \
            wget \
            git \
            build-essential \
            python3 \
            python3-pip \
            nginx \
            certbot \
            python3-certbot-nginx
        log_success "Системні пакети встановлено (Ubuntu/Debian)"
    elif command -v yum &> /dev/null; then
        # CentOS/RHEL
        sudo yum update -y
        sudo yum groupinstall -y "Development Tools"
        sudo yum install -y \
            curl \
            wget \
            git \
            python3 \
            python3-pip \
            nginx \
            certbot \
            python3-certbot-nginx
        log_success "Системні пакети встановлено (CentOS/RHEL)"
    else
        log_warning "Не вдалося визначити дистрибутив Linux. Встановіть пакети вручну."
    fi
}

# Створення необхідних директорій
create_directories() {
    log_info "Створення необхідних директорій..."
    
    # Директорії для логів
    mkdir -p backend/logs
    mkdir -p frontend/logs
    
    # Директорії для завантажень
    mkdir -p backend/uploads
    
    # Директорії для бекапів
    mkdir -p /backup
    sudo chown $USER:$USER /backup
    
    log_success "Директорії створено"
}

# Налаштування прав доступу
setup_permissions() {
    log_info "Налаштування прав доступу..."
    
    # Права для директорій завантажень та логів
    chmod 755 backend/uploads
    chmod 755 backend/logs
    chmod 755 frontend/logs
    
    log_success "Права доступу налаштовано"
}

# Перевірка встановлення
verify_installation() {
    log_info "Перевірка встановлення..."
    
    # Перевірка Node.js модулів
    if [ -d "node_modules" ] && [ -d "backend/node_modules" ] && [ -d "frontend/node_modules" ]; then
        log_success "Всі Node.js модулі встановлено"
    else
        log_error "Деякі Node.js модулі не встановлено"
        exit 1
    fi
    
    # Перевірка PM2
    if command -v pm2 &> /dev/null; then
        log_success "PM2 готовий до використання"
    else
        log_error "PM2 не встановлено"
        exit 1
    fi
    
    log_success "Встановлення завершено успішно!"
}

# Головна функція
main() {
    log_info "Початок встановлення залежностей..."
    
    # Перевірка та встановлення основних компонентів
    check_nodejs
    check_mongodb
    install_system_packages
    
    # Встановлення Node.js залежностей
    install_pm2
    install_root_dependencies
    install_backend_dependencies
    install_frontend_dependencies
    
    # Налаштування системи
    create_directories
    setup_permissions
    
    # Перевірка
    verify_installation
    
    echo ""
    log_success "🎉 Всі залежності встановлено успішно!"
    echo ""
    log_info "Наступні кроки:"
    echo "1. Налаштуйте змінні середовища в backend/.env"
    echo "2. Налаштуйте змінні середовища в frontend/.env"
    echo "3. Запустіть систему командою: ./deploy.sh staging"
    echo ""
}

# Обробка аргументів командного рядка
while [[ $# -gt 0 ]]; do
    case $1 in
        --production)
            export NODE_ENV=production
            log_info "Режим: Production"
            shift
            ;;
        --development)
            export NODE_ENV=development
            log_info "Режим: Development"
            shift
            ;;
        --help)
            echo "Використання: $0 [--production|--development] [--help]"
            echo ""
            echo "Опції:"
            echo "  --production   Встановити тільки production залежності"
            echo "  --development  Встановити всі залежності (за замовчуванням)"
            echo "  --help         Показати цю довідку"
            exit 0
            ;;
        *)
            log_error "Невідомий аргумент: $1"
            echo "Використовуйте --help для довідки"
            exit 1
            ;;
    esac
done

# Запуск головної функції
main