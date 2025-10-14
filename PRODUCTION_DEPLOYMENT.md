# Production Deployment Guide

## Огляд системи

Help Desk система з інтеграцією Telegram, побудована на React (frontend) та Node.js/Express (backend) з MongoDB як базою даних.

## Системні вимоги

### Мінімальні вимоги
- **CPU**: 2 ядра
- **RAM**: 4GB
- **Диск**: 20GB SSD
- **Node.js**: v16.0.0+
- **MongoDB**: v5.0+ (локальна установка на сервері)
- **PM2**: v5.3.0+

### Рекомендовані вимоги для продакшену
- **CPU**: 4+ ядра
- **RAM**: 8GB+
- **Диск**: 50GB+ SSD (включаючи простір для MongoDB та логів)
- **Мережа**: 100Mbps+
- **MongoDB**: v6.0+ з достатнім дисковим простором для бази даних

## Підготовка до деплою

### 1. Клонування репозиторію
```bash
git clone <repository-url>
cd helpdesk
```

### 2. Встановлення залежностей

#### Backend
```bash
cd backend
npm install --production
```

#### Frontend
```bash
cd frontend
npm install
```

### 3. Налаштування змінних середовища

#### Backend (.env)
```bash
# Скопіюйте .env.example та налаштуйте
cp .env.example .env
```

Обов'язкові змінні для продакшену:
- `NODE_ENV=production`
- `MONGODB_URI=mongodb://localhost:27017/helpdesk` - підключення до локальної MongoDB
- `JWT_SECRET` - безпечний ключ для JWT
- `JWT_REFRESH_SECRET` - безпечний ключ для refresh токенів
- `SESSION_SECRET` - безпечний ключ для сесій
- `TELEGRAM_BOT_TOKEN` - токен Telegram бота
- `FRONTEND_URL` - URL фронтенду
- `CORS_ORIGIN` - домен для CORS

#### Frontend (.env)
```bash
REACT_APP_API_URL=https://your-api-domain.com/api
```

## Деплой

### 1. Збірка фронтенду
```bash
cd frontend
npm run build:prod
```

### 2. Запуск бекенду з PM2
```bash
cd backend
npm run start:pm2:prod
```

### 3. Налаштування веб-сервера (Nginx)

#### Конфігурація Nginx
```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/ssl/certificate.crt;
    ssl_certificate_key /path/to/ssl/private.key;

    # Frontend
    location / {
        root /path/to/frontend/build;
        try_files $uri $uri/ /index.html;
        
        # Кешування статичних файлів
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket для Socket.IO
    location /socket.io/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Uploads
    location /uploads/ {
        alias /path/to/backend/uploads/;
        expires 1d;
    }
}
```

## Моніторинг та логування

### 1. Health Checks
- **Liveness**: `GET /health/live`
- **Readiness**: `GET /health/ready`
- **Detailed**: `GET /health`

### 2. PM2 моніторинг
```bash
# Статус процесів
pm2 status

# Логи
pm2 logs helpdesk-backend

# Моніторинг ресурсів
pm2 monit

# Перезапуск
pm2 restart helpdesk-backend
```

### 3. Логи
Логи зберігаються в:
- PM2 логи: `~/.pm2/logs/`
- Додаток логи: `backend/logs/`

## Безпека

### 1. Firewall
```bash
# Дозволити тільки необхідні порти
ufw allow 22    # SSH
ufw allow 80    # HTTP
ufw allow 443   # HTTPS
ufw enable
```

### 2. SSL/TLS
- Використовуйте Let's Encrypt або комерційні сертифікати
- Налаштуйте автоматичне оновлення сертифікатів

### 3. Оновлення безпеки
```bash
# Регулярно оновлюйте залежності
npm audit fix

# Оновлення системи
apt update && apt upgrade
```

## Резервне копіювання

### 1. База даних MongoDB
```bash
# Встановлення MongoDB на Ubuntu/Debian
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org

# Запуск MongoDB
sudo systemctl start mongod
sudo systemctl enable mongod

# Створення бази даних та користувача (опціонально)
mongo
> use helpdesk
> db.createUser({
    user: "helpdesk_user",
    pwd: "secure_password",
    roles: [{ role: "readWrite", db: "helpdesk" }]
  })
> exit

# Створення бекапу
mongodump --db helpdesk --out=/backup/$(date +%Y%m%d)

# Відновлення
mongorestore --db helpdesk /backup/20240101/helpdesk
```

### 2. Файли завантажень
```bash
# Синхронізація uploads директорії
rsync -av /path/to/backend/uploads/ /backup/uploads/
```

### 3. Автоматичне резервне копіювання
Додайте до crontab:
```bash
# Щоденний бекап о 2:00
0 2 * * * /path/to/backup-script.sh
```

## Масштабування

### 1. Горизонтальне масштабування
- Використовуйте Load Balancer (nginx, HAProxy)
- Запускайте кілька інстансів з PM2 cluster mode
- Використовуйте Redis для сесій та кешування

### 2. Вертикальне масштабування
- Збільшуйте RAM та CPU за потреби
- Оптимізуйте MongoDB індекси
- Використовуйте CDN для статичних файлів

## Troubleshooting

### 1. Перевірка статусу сервісів
```bash
# PM2 процеси
pm2 status

# MongoDB
systemctl status mongod

# Nginx
systemctl status nginx

# Дисковий простір
df -h

# Використання пам'яті
free -h
```

### 2. Часті проблеми

#### Високе використання пам'яті
```bash
# Перезапуск PM2 процесів
pm2 restart all

# Очищення логів
pm2 flush
```

#### Проблеми з базою даних
```bash
# Перевірка підключення
mongo --eval "db.adminCommand('ping')"

# Перевірка індексів
mongo helpdesk --eval "db.tickets.getIndexes()"
```

#### SSL сертифікати
```bash
# Перевірка сертифікату
openssl x509 -in /path/to/certificate.crt -text -noout

# Оновлення Let's Encrypt
certbot renew
```

## Контакти підтримки

- **Технічна підтримка**: support@your-domain.com
- **Документація**: https://your-domain.com/docs
- **Моніторинг**: https://monitoring.your-domain.com

## Чекліст деплою

- [ ] Налаштовані змінні середовища
- [ ] Встановлені SSL сертифікати
- [ ] Налаштований firewall
- [ ] Запущені PM2 процеси
- [ ] Налаштований Nginx
- [ ] Перевірені health checks
- [ ] Налаштоване резервне копіювання
- [ ] Налаштований моніторинг
- [ ] Проведено навантажувальне тестування
- [ ] Документація оновлена