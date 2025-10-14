# Залежності Help Desk системи

Цей документ містить повний список всіх бібліотек та залежностей, необхідних для роботи Help Desk системи.

## Системні вимоги

### Основні компоненти
- **Node.js**: v16.0.0+ (рекомендовано v18.x LTS)
- **npm**: v8.0.0+
- **MongoDB**: v5.0+ (рекомендовано v6.0+)
- **PM2**: v5.3.0+ (для продакшену)

### Операційні системи
- Ubuntu 20.04+ / Debian 11+
- CentOS 8+ / RHEL 8+
- Windows Server 2019+
- macOS 12+

## Backend залежності

### Production залежності (backend/package.json)

#### Основні фреймворки та бібліотеки
- **express**: ^4.18.2 - веб-фреймворк для Node.js
- **mongoose**: ^7.5.0 - ODM для MongoDB
- **socket.io**: ^4.8.1 - WebSocket бібліотека для real-time комунікації

#### Автентифікація та безпека
- **jsonwebtoken**: ^9.0.2 - JWT токени
- **bcryptjs**: ^2.4.3 - хешування паролів
- **helmet**: ^7.0.0 - безпека HTTP заголовків
- **cors**: ^2.8.5 - CORS middleware
- **express-rate-limit**: ^6.10.0 - обмеження кількості запитів
- **express-mongo-sanitize**: ^2.2.0 - санітизація MongoDB запитів
- **xss-clean**: ^0.1.4 - захист від XSS атак

#### Active Directory інтеграція
- **activedirectory2**: ^2.2.0 - інтеграція з Active Directory
- **ldap-authentication**: ^3.3.4 - LDAP автентифікація
- **ldapjs**: ^3.0.7 - LDAP клієнт

#### Telegram інтеграція
- **node-telegram-bot-api**: ^0.66.0 - Telegram Bot API

#### Валідація та обробка даних
- **express-validator**: ^7.0.1 - валідація запитів
- **joi**: ^17.9.2 - схема валідації
- **multer**: ^1.4.5-lts.1 - завантаження файлів

#### Утиліти та допоміжні бібліотеки
- **axios**: ^1.12.2 - HTTP клієнт
- **moment**: ^2.29.4 - робота з датами
- **uuid**: ^9.0.0 - генерація UUID
- **dotenv**: ^16.3.1 - змінні середовища
- **compression**: ^1.7.4 - стиснення HTTP відповідей

#### Експорт даних
- **exceljs**: ^4.4.0 - робота з Excel файлами
- **json2csv**: ^6.0.0-alpha.2 - конвертація JSON в CSV
- **xlsx**: https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz - робота з Excel

#### Логування та моніторинг
- **winston**: ^3.10.0 - система логування
- **winston-daily-rotate-file**: ^4.7.1 - ротація лог файлів
- **morgan**: ^1.10.0 - HTTP request logger

#### Пагінація та планувальник
- **mongoose-paginate-v2**: ^1.9.1 - пагінація для Mongoose
- **node-cron**: ^4.2.1 - планувальник завдань

### Development залежності (backend)
- **eslint**: ^8.47.0 - лінтер коду
- **eslint-config-node**: ^4.1.0 - ESLint конфігурація для Node.js
- **eslint-plugin-node**: ^11.1.0 - ESLint плагін для Node.js
- **jest**: ^29.6.2 - фреймворк для тестування
- **nodemon**: ^3.0.1 - автоматичний перезапуск сервера
- **pm2**: ^5.3.0 - менеджер процесів
- **supertest**: ^6.3.3 - тестування HTTP

## Frontend залежності

### Production залежності (frontend/package.json)

#### React екосистема
- **react**: ^19.1.1 - основна React бібліотека
- **react-dom**: ^19.1.1 - React DOM рендерер
- **react-router-dom**: ^7.9.1 - маршрутизація
- **react-scripts**: 5.0.1 - Create React App скрипти

#### UI компоненти та іконки
- **@heroicons/react**: ^2.2.0 - Heroicons іконки
- **lucide-react**: ^0.544.0 - Lucide іконки
- **react-icons**: ^5.5.0 - популярні іконки

#### Стилізація
- **tailwindcss**: ^3.4.17 - CSS фреймворк
- **autoprefixer**: ^10.4.21 - автопрефікси для CSS
- **postcss**: ^8.5.6 - CSS постпроцесор
- **clsx**: ^2.1.1 - утиліта для класів
- **tailwind-merge**: ^3.3.1 - об'єднання Tailwind класів

#### Графіки та візуалізація
- **chart.js**: ^4.5.0 - бібліотека графіків
- **react-chartjs-2**: ^5.3.0 - React обгортка для Chart.js

#### Карти
- **leaflet**: ^1.9.4 - бібліотека карт
- **react-leaflet**: ^5.0.0 - React компоненти для Leaflet

#### HTTP клієнт та WebSocket
- **axios**: ^1.12.2 - HTTP клієнт
- **socket.io-client**: ^4.8.1 - WebSocket клієнт

#### Інтернаціоналізація
- **i18next**: ^25.5.3 - система перекладів
- **i18next-browser-languagedetector**: ^8.2.0 - детектор мови
- **react-i18next**: ^16.0.0 - React інтеграція для i18next

#### Експорт та обробка файлів
- **jspdf**: ^3.0.3 - генерація PDF
- **jspdf-autotable**: ^5.0.2 - таблиці в PDF
- **papaparse**: ^5.5.3 - парсинг CSV
- **xlsx**: https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz - робота з Excel

#### Уведомлення та UX
- **react-hot-toast**: ^2.6.0 - toast уведомлення
- **web-vitals**: ^2.1.4 - метрики продуктивності

#### TypeScript
- **typescript**: ^4.9.5 - TypeScript компілятор
- **@types/jest**: ^27.5.2 - типи для Jest
- **@types/node**: ^16.18.126 - типи для Node.js
- **@types/papaparse**: ^5.3.16 - типи для PapaParse
- **@types/react**: ^19.1.13 - типи для React
- **@types/react-dom**: ^19.1.9 - типи для React DOM

#### Тестування
- **@testing-library/dom**: ^10.4.1 - утиліти тестування DOM
- **@testing-library/jest-dom**: ^6.8.0 - Jest матчери для DOM
- **@testing-library/react**: ^16.3.0 - утиліти тестування React
- **@testing-library/user-event**: ^13.5.0 - симуляція користувацьких подій

### Development залежності (frontend)
- **@types/leaflet**: ^1.9.20 - типи для Leaflet
- **@types/react-router-dom**: ^5.3.3 - типи для React Router
- **cross-env**: ^10.1.0 - кросплатформні змінні середовища

## Глобальні залежності

### Кореневий проект (package.json)
- **concurrently**: ^7.6.0 - одночасний запуск команд

### Глобальні npm пакети (встановлюються окремо)
- **pm2**: ^5.3.0 - менеджер процесів для продакшену
- **cross-env**: ^10.1.0 - кросплатформні змінні середовища

## Системні пакети

### Linux (Ubuntu/Debian)
```bash
# Основні пакети
curl
wget
git
build-essential
python3
python3-pip

# Веб-сервер та SSL
nginx
certbot
python3-certbot-nginx

# MongoDB
mongodb-org
```

### Linux (CentOS/RHEL)
```bash
# Основні пакети
curl
wget
git
python3
python3-pip

# Інструменти розробки
"Development Tools"

# Веб-сервер та SSL
nginx
certbot
python3-certbot-nginx

# MongoDB
mongodb-org
```

### Windows
```powershell
# Через Chocolatey
git
python3
visualstudio2019buildtools
nodejs
mongodb
```

## Скрипти встановлення

### Автоматичне встановлення
Використовуйте один з наданих скриптів:

#### Linux/macOS
```bash
chmod +x install-dependencies.sh
./install-dependencies.sh
```

#### Windows
```powershell
.\install-dependencies.ps1
```

### Ручне встановлення

#### 1. Встановлення системних компонентів
```bash
# Node.js (через NodeSource)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# MongoDB
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org
```

#### 2. Встановлення глобальних npm пакетів
```bash
npm install -g pm2 cross-env
```

#### 3. Встановлення проектних залежностей
```bash
# Кореневі залежності
npm install

# Backend залежності
cd backend && npm install && cd ..

# Frontend залежності
cd frontend && npm install && cd ..
```

## Версії та сумісність

### Node.js версії
- **Мінімальна**: v16.0.0
- **Рекомендована**: v18.x LTS
- **Тестована**: v18.19.0

### MongoDB версії
- **Мінімальна**: v5.0
- **Рекомендована**: v6.0+
- **Тестована**: v6.0.4

### Браузери (Frontend)
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Оновлення залежностей

### Перевірка застарілих пакетів
```bash
# Backend
cd backend && npm outdated

# Frontend
cd frontend && npm outdated
```

### Оновлення пакетів
```bash
# Оновлення minor та patch версій
npm update

# Оновлення major версій (обережно!)
npm install package@latest
```

## Безпека

### Аудит безпеки
```bash
# Перевірка вразливостей
npm audit

# Автоматичне виправлення
npm audit fix
```

### Рекомендації
- Регулярно оновлюйте залежності
- Використовуйте `npm ci` для продакшену
- Перевіряйте вразливості перед деплоєм
- Використовуйте lock файли (package-lock.json)

## Підтримка

Для отримання допомоги з встановленням залежностей:
1. Перевірте логи встановлення
2. Переконайтеся, що всі системні вимоги виконані
3. Використовуйте офіційну документацію пакетів
4. Зверніться до команди розробки