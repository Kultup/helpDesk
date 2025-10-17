# Help Desk Backend API Documentation

## 📋 Зміст

1. [Загальна інформація](#загальна-інформація)
2. [Технічний стек](#технічний-стек)
3. [Аутентифікація та безпека](#аутентифікація-та-безпека)
4. [Валідація даних](#валідація-даних)
5. [Моделі даних](#моделі-даних)
6. [Коди помилок](#коди-помилок)
7. [Інтерактивна документація](#інтерактивна-документація)
8. [Системні ендпоінти](#системні-ендпоінти)
9. [Аутентифікація](#аутентифікація)
10. [Користувачі](#користувачі)
11. [Тикети](#тикети)
12. [Коментарі](#коментарі)
13. [Міста](#міста)
14. [Посади](#посади)
15. [Аналітика](#аналітика)
16. [Telegram інтеграція](#telegram-інтеграція)
17. [Завантаження файлів](#завантаження-файлів)
17. [Теги](#теги)
18. [Сповіщення](#сповіщення)
19. [Active Directory](#active-directory)
20. [Швидкі поради](#швидкі-поради)
21. [Шаблони тикетів](#шаблони-тикетів)
22. [Категорії](#категорії)
23. [Рейтинги](#рейтинги)
24. [Події](#події)
25. [Історія тикетів](#історія-тикетів)
26. [Адміністративні нотатки](#адміністративні-нотатки)
27. [Коди відповідей](#коди-відповідей)
28. [Обробка помилок](#обробка-помилок)
29. [Загальні примітки](#загальні-примітки)

---

## 🔧 Загальна інформація

**Base URL:** Use `API_BASE_URL` env or relative `/api`  
**Version:** 1.0.0  
**Content-Type:** `application/json`  
**API Versioning:** Поточна версія API - v1.0.0, версіонування через заголовки не використовується

### Технічний стек
- **Backend:** Node.js v16+, Express.js v4.18.2
- **Database:** MongoDB з Mongoose ODM
- **Authentication:** JWT (JSON Web Tokens)
- **Validation:** express-validator
- **Security:** Helmet, express-rate-limit, express-mongo-sanitize
- **File Upload:** Multer
- **Real-time:** Socket.IO v4.8.1

---

## 🔐 Аутентифікація та безпека

### JWT Authentication
Більшість ендпоінтів потребують JWT токена в заголовку:
```http
Authorization: Bearer <your-jwt-token>
```

### Middleware та валідація
API використовує наступні middleware:
- **authenticateToken** - Перевірка JWT токена
- **requireAdmin** - Вимагає права адміністратора
- **requirePermission(permission)** - Перевірка конкретних дозволів
- **requireOwnershipOrAdmin** - Перевірка власності ресурсу або прав адміна
- **sanitizeData** - Захист від NoSQL ін'єкцій
- **securityHeaders** - Встановлення безпечних HTTP заголовків

### Валідація даних
Всі вхідні дані валідуються за допомогою express-validator з наступними правилами:
- **Email:** Валідний формат email
- **Password:** Мінімум 6 символів, містить велику/малу літеру та цифру
- **Names:** 2-50 символів, тільки літери, пробіли, дефіси
- **Phone:** Формат +380XXXXXXXXX
- **MongoDB ObjectId:** Валідний ObjectId формат

---

## Коди помилок

### HTTP статус коди
- **200** - Успішний запит
- **201** - Ресурс створено
- **400** - Помилка валідації або неправильний запит
- **401** - Не авторизований
- **403** - Доступ заборонено
- **404** - Ресурс не знайдено
- **409** - Конфлікт (наприклад, дублікат email)
- **422** - Помилка валідації даних
- **429** - Перевищено ліміт запитів
- **500** - Внутрішня помилка сервера

### Структура помилок
```json
{
  "success": false,
  "message": "Опис помилки",
  "errors": [
    {
      "field": "email",
      "message": "Невірний формат email"
    }
  ],
  "timestamp": "2024-01-15T10:30:00.000Z",
  "path": "/api/auth/register"
}
```

### Типові помилки валідації
- **Email**: "Невірний формат email", "Email є обов'язковим"
- **Пароль**: "Пароль повинен містити мінімум 6 символів"
- **Обов'язкові поля**: "Поле є обов'язковим"
- **MongoDB ID**: "Невірний формат ID"
- **Номер телефону**: "Невірний формат номера телефону"

### Помилки аутентифікації
- **401**: "Токен не надано", "Невірний токен", "Токен прострочений"
- **403**: "Доступ заборонено", "Недостатньо прав"

### Помилки ресурсів
- **404**: "Користувач не знайдено", "Тикет не знайдено", "Ресурс не існує"
- **409**: "Користувач з таким email вже існує"

---

## Моделі даних

### User Model
```javascript
{
  _id: ObjectId,
  email: String, // required, unique
  password: String, // hashed with bcrypt
  firstName: String, // required
  lastName: String, // required
  fullName: String, // virtual field
  phone: String, // optional, format: +380XXXXXXXXX
  position: ObjectId, // ref: Position
  city: ObjectId, // ref: City
  role: String, // enum: ['admin', 'user'], default: 'user'
  permissions: [String], // array of permission strings
  isActive: Boolean, // default: true
  registrationStatus: String, // enum: ['pending', 'approved', 'rejected']
  telegram: {
    chatId: String,
    username: String,
    isLinked: Boolean
  },
  preferences: {
    language: String, // default: 'uk'
    notifications: {
      email: Boolean,
      telegram: Boolean,
      push: Boolean
    },
    theme: String // enum: ['light', 'dark']
  },
  lastLogin: Date,
  createdAt: Date,
  updatedAt: Date
}
```

### Ticket Model
```javascript
{
  _id: ObjectId,
  title: String, // required, 5-200 chars
  description: String, // required, 10-2000 chars
  status: String, // enum: ['open', 'in_progress', 'resolved', 'closed']
  priority: String, // enum: ['low', 'medium', 'high', 'urgent']
  category: ObjectId, // ref: Category
  createdBy: ObjectId, // ref: User
  assignedTo: ObjectId, // ref: User, optional
  city: ObjectId, // ref: City, optional
  tags: [ObjectId], // ref: Tag
  attachments: [{
    filename: String,
    originalName: String,
    mimetype: String,
    size: Number,
    uploadedAt: Date,
    uploadedBy: ObjectId
  }],
  dueDate: Date,
  resolvedAt: Date,
  closedAt: Date,
  rating: {
    score: Number, // 1-5
    comment: String,
    ratedBy: ObjectId,
    ratedAt: Date
  },
  createdAt: Date,
  updatedAt: Date
}
```

### Comment Model
```javascript
{
  _id: ObjectId,
  content: String, // required, 1-1000 chars
  ticket: ObjectId, // ref: Ticket, required
  author: ObjectId, // ref: User, required
  isInternal: Boolean, // default: false
  attachments: [String], // array of filenames
  createdAt: Date,
  updatedAt: Date
}
```

### Category Model
```javascript
{
  _id: ObjectId,
  name: String, // required, unique
  description: String,
  color: String, // hex color code
  icon: String, // icon name/class
  isActive: Boolean, // default: true
  sortOrder: Number, // for ordering
  createdBy: ObjectId, // ref: User
  createdAt: Date,
  updatedAt: Date
}
```

### City Model
```javascript
{
  _id: ObjectId,
  name: String, // required
  nameEn: String,
  region: String, // required
  regionEn: String,
  coordinates: {
    lat: Number, // -90 to 90
    lng: Number // -180 to 180
  },
  population: Number,
  area: Number,
  timezone: String,
  postalCodes: [String],
  phoneCode: String,
  isCapital: Boolean,
  isRegionalCenter: Boolean,
  isActive: Boolean, // default: true
  description: String,
  website: String,
  mayor: String,
  statistics: {
    totalTickets: Number,
    activeUsers: Number,
    lastUpdated: Date
  }
}
```

## Системні ендпоінти

### Загальні
- `GET /` - Головна сторінка API з інформацією про доступні ендпоінти
- `GET /health` - Перевірка здоров'я системи
- `GET /status` - Статус сервісів та підключення до бази даних
- `GET /metrics` - Метрики системи

## Аутентифікація (`/api/auth`)

### POST /api/auth/register
**Опис**: Реєстрація нового користувача

**Параметри запиту (Body)**:
```json
{
  "email": "string (required, email format)",
  "password": "string (required, min 6 chars)",
  "firstName": "string (required, max 50 chars)",
  "lastName": "string (required, max 50 chars)",
  "position": "string (required, MongoDB ObjectId)",
  "department": "string (required)",
  "city": "string (required, MongoDB ObjectId)",
  "phone": "string (optional, international format)",
  "telegramId": "string (optional)"
}
```

**Приклад запиту**:
```json
{
  "email": "john.doe@company.com",
  "password": "securePassword123",
  "firstName": "Іван",
  "lastName": "Петренко",
  "position": "507f1f77bcf86cd799439011",
  "department": "IT відділ",
  "city": "507f1f77bcf86cd799439012",
  "phone": "+380501234567",
  "telegramId": "@john_doe"
}
```

**Успішна відповідь (201)**:
```json
{
  "success": true,
  "message": "Заявку на реєстрацію подано. Очікуйте підтвердження від адміністратора.",
  "data": {
    "user": {
      "_id": "507f1f77bcf86cd799439013",
      "email": "john.doe@company.com",
      "firstName": "Іван",
      "lastName": "Петренко",
      "position": {
        "_id": "507f1f77bcf86cd799439011",
        "name": "Розробник"
      },
      "department": "IT відділ",
      "city": {
        "_id": "507f1f77bcf86cd799439012",
        "name": "Київ",
        "region": "Київська область"
      },
      "phone": "+380501234567",
      "telegramId": "@john_doe",
      "registrationStatus": "pending",
      "isActive": false,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

**Помилки**:
- **400**: Валідаційні помилки, користувач вже існує
- **500**: Внутрішня помилка сервера

---

### POST /api/auth/login
**Опис**: Авторизація користувача

**Параметри запиту (Body)**:
```json
{
  "email": "string (required, email format)",
  "password": "string (required)"
}
```

**Приклад запиту**:
```json
{
  "email": "john.doe@company.com",
  "password": "securePassword123"
}
```

**Успішна відповідь (200)**:
```json
{
  "success": true,
  "message": "Авторизація успішна",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "_id": "507f1f77bcf86cd799439013",
      "email": "john.doe@company.com",
      "firstName": "Іван",
      "lastName": "Петренко",
      "role": "user",
      "position": {
        "_id": "507f1f77bcf86cd799439011",
        "name": "Розробник"
      },
      "city": {
        "_id": "507f1f77bcf86cd799439012",
        "name": "Київ"
      },
      "isActive": true,
      "registrationStatus": "approved"
    }
  }
}
```

**Помилки**:
- **400**: Валідаційні помилки
- **401**: Невірний email або пароль, користувач неактивний
- **500**: Внутрішня помилка сервера

---

### GET /api/auth/me
**Опис**: Отримання інформації про поточного користувача

**Заголовки**:
```
Authorization: Bearer <token>
```

**Успішна відповідь (200)**:
```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "507f1f77bcf86cd799439013",
      "email": "john.doe@company.com",
      "firstName": "Іван",
      "lastName": "Петренко",
      "role": "user",
      "position": {
        "_id": "507f1f77bcf86cd799439011",
        "name": "Розробник"
      },
      "city": {
        "_id": "507f1f77bcf86cd799439012",
        "name": "Київ"
      },
      "isActive": true,
      "lastLogin": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

**Помилки**:
- **401**: Токен не надано або невірний
- **404**: Користувач не знайдено

### Реєстрація та вхід
- `POST /logout` - Вихід з системи
- `POST /refresh` - Оновлення токена доступу

## Користувачі (`/api/users`)

### Управління користувачами
- `GET /` - Отримання списку користувачів (адмін)
- `GET /admins` - Отримання списку адміністраторів
- `GET /pending-registrations` - Отримання заявок на реєстрацію (адмін)
- `GET /:id` - Отримання користувача за ID
- `POST /` - Створення нового користувача (адмін)
- `PUT /:id` - Оновлення користувача (адмін)
- `DELETE /:id` - Видалення користувача (адмін)
- `DELETE /:id/force` - Примусове видалення користувача (адмін)

### Профіль користувача
- `GET /profile/me` - Отримання власного профілю
- `PUT /profile/me` - Оновлення власного профілю
- `PUT /profile/change-password` - Зміна пароля

### Статус та налаштування
- `PATCH /:id/toggle-active` - Перемикання активності користувача (адмін)
- `PATCH /bulk/toggle-active` - Масове перемикання активності (адмін)
- `GET /:id/preferences` - Отримання налаштувань користувача
- `PUT /:id/preferences` - Оновлення налаштувань користувача

### Реєстрації
- `PATCH /:id/approve-registration` - Схвалення реєстрації (адмін)
- `PATCH /:id/reject-registration` - Відхилення реєстрації (адмін)
- `POST /cleanup-registrations` - Очищення старих реєстрацій

### Коментарі користувача
- `GET /:userId/comments` - Отримання коментарів користувача

## Тикети

### GET /api/tickets
**Опис**: Отримання списку тикетів з пагінацією та фільтрацією

**Query параметри**:
- `page` - номер сторінки (за замовчуванням: 1)
- `limit` - кількість записів на сторінку (за замовчуванням: 10, максимум: 100)
- `status` - фільтр за статусом (open, in_progress, resolved, closed)
- `priority` - фільтр за пріоритетом (low, medium, high, urgent)
- `assignedTo` - фільтр за призначеним користувачем (MongoDB ObjectId)
- `createdBy` - фільтр за автором (MongoDB ObjectId)
- `city` - фільтр за містом (MongoDB ObjectId)
- `category` - фільтр за категорією (MongoDB ObjectId)
- `search` - пошук по заголовку та опису
- `sortBy` - поле для сортування (createdAt, updatedAt, priority, status)
- `sortOrder` - порядок сортування (asc, desc)
- `dateFrom` - фільтр за датою створення (від)
- `dateTo` - фільтр за датою створення (до)

**Заголовки**:
```
Authorization: Bearer <token>
```

**Приклад запиту**:
```
GET /api/tickets?page=1&limit=10&status=open&priority=high&sortBy=createdAt&sortOrder=desc
```

**Успішна відповідь (200)**:
```json
{
  "success": true,
  "data": {
    "tickets": [
      {
        "_id": "507f1f77bcf86cd799439014",
        "title": "Проблема з принтером",
        "description": "Принтер не друкує документи",
        "status": "open",
        "priority": "high",
        "category": {
          "_id": "507f1f77bcf86cd799439015",
          "name": "Технічні проблеми",
          "color": "#ff6b6b"
        },
        "createdBy": {
          "_id": "507f1f77bcf86cd799439013",
          "firstName": "Іван",
          "lastName": "Петренко",
          "email": "john.doe@company.com"
        },
        "assignedTo": {
          "_id": "507f1f77bcf86cd799439016",
          "firstName": "Марія",
          "lastName": "Іваненко",
          "email": "maria@company.com"
        },
        "city": {
          "_id": "507f1f77bcf86cd799439012",
          "name": "Київ",
          "region": "Київська область"
        },
        "attachments": [
          {
            "filename": "error_screenshot.png",
            "originalName": "Знімок екрана помилки.png",
            "mimetype": "image/png",
            "size": 245760,
            "url": "/uploads/tickets/507f1f77bcf86cd799439014/error_screenshot.png"
          }
        ],
        "tags": ["принтер", "технічна підтримка"],
        "source": "web",
        "createdAt": "2024-01-15T10:30:00.000Z",
        "updatedAt": "2024-01-15T11:00:00.000Z",
        "estimatedTime": 120,
        "actualTime": 0
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalItems": 47,
      "itemsPerPage": 10,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

**Помилки**:
- **400**: Невірні параметри запиту
- **401**: Не авторизований
- **500**: Внутрішня помилка сервера

---

### POST /api/tickets
**Опис**: Створення нового тикету

**Заголовки**:
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Параметри запиту (Body)**:
```json
{
  "title": "string (required, max 200 chars)",
  "description": "string (required, max 2000 chars)",
  "priority": "string (required, enum: low|medium|high|urgent)",
  "category": "string (required, MongoDB ObjectId)",
  "city": "string (optional, MongoDB ObjectId)",
  "assignedTo": "string (optional, MongoDB ObjectId)",
  "tags": "array of strings (optional)",
  "estimatedTime": "number (optional, minutes)",
  "attachments": "array of objects (optional)"
}
```

**Приклад запиту**:
```json
{
  "title": "Проблема з принтером HP LaserJet",
  "description": "Принтер не друкує документи. При спробі друку з'являється помилка 'Paper Jam', хоча паперу достатньо і замятин немає.",
  "priority": "high",
  "category": "507f1f77bcf86cd799439015",
  "city": "507f1f77bcf86cd799439012",
  "tags": ["принтер", "HP", "технічна підтримка"],
  "estimatedTime": 60
}
```

**Успішна відповідь (201)**:
```json
{
  "success": true,
  "message": "Тикет успішно створено",
  "data": {
    "_id": "507f1f77bcf86cd799439017",
    "title": "Проблема з принтером HP LaserJet",
    "description": "Принтер не друкує документи. При спробі друку з'являється помилка 'Paper Jam', хоча паперу достатньо і замятин немає.",
    "status": "open",
    "priority": "high",
    "category": {
      "_id": "507f1f77bcf86cd799439015",
      "name": "Технічні проблеми"
    },
    "createdBy": {
      "_id": "507f1f77bcf86cd799439013",
      "firstName": "Іван",
      "lastName": "Петренко",
      "email": "john.doe@company.com"
    },
    "city": {
      "_id": "507f1f77bcf86cd799439012",
      "name": "Київ",
      "region": "Київська область"
    },
    "tags": ["принтер", "HP", "технічна підтримка"],
    "source": "web",
    "estimatedTime": 60,
    "actualTime": 0,
    "createdAt": "2024-01-15T12:00:00.000Z",
    "updatedAt": "2024-01-15T12:00:00.000Z"
  }
}
```

**Помилки**:
- **400**: Валідаційні помилки
- **401**: Не авторизований
- **404**: Категорія або місто не знайдено
- **500**: Внутрішня помилка сервера

---

### GET /api/tickets/:id
**Опис**: Отримання конкретного тикету за ID

**Заголовки**:
```
Authorization: Bearer <token>
```

**Параметри URL**:
- `id` - MongoDB ObjectId тикету

**Успішна відповідь (200)**:
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439017",
    "title": "Проблема з принтером HP LaserJet",
    "description": "Принтер не друкує документи...",
    "status": "in_progress",
    "priority": "high",
    "category": {
      "_id": "507f1f77bcf86cd799439015",
      "name": "Технічні проблеми",
      "color": "#ff6b6b"
    },
    "createdBy": {
      "_id": "507f1f77bcf86cd799439013",
      "firstName": "Іван",
      "lastName": "Петренко",
      "email": "john.doe@company.com"
    },
    "assignedTo": {
      "_id": "507f1f77bcf86cd799439016",
      "firstName": "Марія",
      "lastName": "Іваненко",
      "email": "maria@company.com"
    },
    "city": {
      "_id": "507f1f77bcf86cd799439012",
      "name": "Київ"
    },
    "comments": [
      {
        "_id": "507f1f77bcf86cd799439018",
        "content": "Перевірив принтер, проблема в драйверах",
        "author": {
          "_id": "507f1f77bcf86cd799439016",
          "firstName": "Марія",
          "lastName": "Іваненко"
        },
        "createdAt": "2024-01-15T13:00:00.000Z"
      }
    ],
    "attachments": [],
    "tags": ["принтер", "HP", "технічна підтримка"],
    "estimatedTime": 60,
    "actualTime": 30,
    "createdAt": "2024-01-15T12:00:00.000Z",
    "updatedAt": "2024-01-15T13:30:00.000Z"
  }
}
```

**Помилки**:
- **401**: Не авторизований
- **403**: Доступ заборонено (не автор, не призначений, не адмін)
- **404**: Тикет не знайдено
- **500**: Внутрішня помилка сервера

---

### PUT /api/tickets/:id
**Опис**: Оновлення тикету

**Заголовки**:
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Параметри URL**:
- `id` - MongoDB ObjectId тикету

**Параметри запиту (Body)**:
```json
{
  "title": "string (optional, max 200 chars)",
  "description": "string (optional, max 2000 chars)",
  "status": "string (optional, enum: open|in_progress|resolved|closed)",
  "priority": "string (optional, enum: low|medium|high|urgent)",
  "assignedTo": "string (optional, MongoDB ObjectId)",
  "category": "string (optional, MongoDB ObjectId)",
  "tags": "array of strings (optional)",
  "estimatedTime": "number (optional, minutes)"
}
```

**Приклад запиту**:
```json
{
  "status": "resolved",
  "assignedTo": "507f1f77bcf86cd799439016",
  "actualTime": 45
}
```

**Успішна відповідь (200)**:
```json
{
  "success": true,
  "message": "Тикет успішно оновлено",
  "data": {
    "_id": "507f1f77bcf86cd799439017",
    "title": "Проблема з принтером HP LaserJet",
    "status": "resolved",
    "priority": "high",
    "assignedTo": {
      "_id": "507f1f77bcf86cd799439016",
      "firstName": "Марія",
      "lastName": "Іваненко"
    },
    "actualTime": 45,
    "updatedAt": "2024-01-15T14:00:00.000Z"
  }
}
```

**Помилки**:
- **400**: Валідаційні помилки
- **401**: Не авторизований
- **403**: Доступ заборонено
- **404**: Тикет не знайдено
- **500**: Внутрішня помилка сервера

## Інтерактивна документація

### Swagger UI
Для зручного тестування API доступна інтерактивна документація Swagger UI:

**URL**: `/api/swagger/docs`

**Функції**:
- Інтерактивне тестування всіх ендпоінтів
- Автоматична валідація запитів
- Приклади запитів та відповідей
- Авторизація через JWT токени
- Фільтрація та пошук по ендпоінтах
- Експорт схеми в JSON/YAML форматах

**Додаткові URL**:
- JSON схема: `/api/swagger/swagger.json`
- YAML схема: `/api/swagger/swagger.yaml`

### Як використовувати
1. Відкрийте браузер та перейдіть за адресою `/api/swagger/docs` (або за доменом, вказаним у `API_BASE_URL`)
2. Для тестування захищених ендпоінтів:
   - Натисніть кнопку "Authorize" у верхній частині сторінки
   - Введіть JWT токен у форматі: `Bearer <your_token>`
   - Токен можна отримати через ендпоінт `/api/auth/login`
3. Виберіть потрібний ендпоінт та натисніть "Try it out"
4. Заповніть необхідні параметри та натисніть "Execute"

---

### GET /api/tickets/:id/comments
**Опис**: Отримання коментарів до тикету

**Заголовки**:
```
Authorization: Bearer <token>
```

**Параметри URL**:
- `id` - MongoDB ObjectId тикету

**Query параметри**:
- `page` - номер сторінки (за замовчуванням: 1)
- `limit` - кількість записів на сторінку (за замовчуванням: 20)
- `sortOrder` - порядок сортування (asc, desc, за замовчуванням: asc)

**Успішна відповідь (200)**:
```json
{
  "success": true,
  "data": {
    "comments": [
      {
        "_id": "507f1f77bcf86cd799439018",
        "content": "Перевірив принтер, проблема в драйверах. Потрібно оновити драйвери до останньої версії.",
        "author": {
          "_id": "507f1f77bcf86cd799439016",
          "firstName": "Марія",
          "lastName": "Іваненко",
          "email": "maria@company.com",
          "avatar": "/uploads/avatars/maria.jpg"
        },
        "ticket": "507f1f77bcf86cd799439017",
        "isInternal": false,
        "attachments": [
          {
            "filename": "driver_info.txt",
            "originalName": "Інформація про драйвери.txt",
            "size": 1024,
            "url": "/uploads/comments/507f1f77bcf86cd799439018/driver_info.txt"
          }
        ],
        "createdAt": "2024-01-15T13:00:00.000Z",
        "updatedAt": "2024-01-15T13:00:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 1,
      "totalItems": 3,
      "itemsPerPage": 20
    }
  }
}
```

**Помилки**:
- **401**: Не авторизований
- **403**: Доступ заборонено
- **404**: Тикет не знайдено

---

### POST /api/tickets/:id/comments
**Опис**: Додавання коментаря до тикету

**Заголовки**:
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Параметри URL**:
- `id` - MongoDB ObjectId тикету

**Параметри запиту (Body)**:
```json
{
  "content": "string (required, max 2000 chars)",
  "isInternal": "boolean (optional, default: false)",
  "attachments": "array of objects (optional)"
}
```

**Приклад запиту**:
```json
{
  "content": "Оновив драйвери принтера. Тестування показало, що проблема вирішена. Рекомендую закрити тикет.",
  "isInternal": false
}
```

**Успішна відповідь (201)**:
```json
{
  "success": true,
  "message": "Коментар успішно додано",
  "data": {
    "_id": "507f1f77bcf86cd799439019",
    "content": "Оновив драйвери принтера. Тестування показало, що проблема вирішена. Рекомендую закрити тикет.",
    "author": {
      "_id": "507f1f77bcf86cd799439016",
      "firstName": "Марія",
      "lastName": "Іваненко"
    },
    "ticket": "507f1f77bcf86cd799439017",
    "isInternal": false,
    "attachments": [],
    "createdAt": "2024-01-15T14:30:00.000Z",
    "updatedAt": "2024-01-15T14:30:00.000Z"
  }
}
```

**Помилки**:
- **400**: Валідаційні помилки
- **401**: Не авторизований
- **403**: Доступ заборонено
- **404**: Тикет не знайдено

---

## Файли та вкладення

### POST /api/tickets/:id/attachments
**Опис**: Завантаження файлу до тикету

**Заголовки**:
```
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Параметри URL**:
- `id` - MongoDB ObjectId тикету

**Параметри запиту (Form Data)**:
- `file` - файл для завантаження (required)
- `description` - опис файлу (optional)

**Обмеження**:
- Максимальний розмір файлу: 10MB
- Дозволені типи: images (jpg, png, gif), documents (pdf, doc, docx, txt), archives (zip, rar)

**Успішна відповідь (201)**:
```json
{
  "success": true,
  "message": "Файл успішно завантажено",
  "data": {
    "_id": "507f1f77bcf86cd799439020",
    "filename": "screenshot_20240115.png",
    "originalName": "Знімок екрана 2024-01-15.png",
    "mimetype": "image/png",
    "size": 245760,
    "url": "/uploads/tickets/507f1f77bcf86cd799439017/screenshot_20240115.png",
    "description": "Знімок екрана з помилкою принтера",
    "uploadedBy": {
      "_id": "507f1f77bcf86cd799439013",
      "firstName": "Іван",
      "lastName": "Петренко"
    },
    "createdAt": "2024-01-15T15:00:00.000Z"
  }
}
```

**Помилки**:
- **400**: Невірний тип файлу або розмір перевищує ліміт
- **401**: Не авторизований
- **403**: Доступ заборонено
- **404**: Тикет не знайдено
- **413**: Файл занадто великий

---

### GET /api/tickets/:id/attachments/:attachmentId/download
**Опис**: Завантаження файлу з тикету

**Заголовки**:
```
Authorization: Bearer <token>
```

**Параметри URL**:
- `id` - MongoDB ObjectId тикету
- `attachmentId` - MongoDB ObjectId файлу

**Успішна відповідь (200)**:
```
Content-Type: [mimetype файлу]
Content-Disposition: attachment; filename="[оригінальна назва файлу]"
Content-Length: [розмір файлу]

[бінарні дані файлу]
```

**Помилки**:
- **401**: Не авторизований
- **403**: Доступ заборонено
- **404**: Файл або тикет не знайдено

### Коментарі до тикетів
- `POST /:id/comments` - Додавання коментаря до тикета

### Відстеження часу
- `POST /:id/time-entries/start` - Початок відстеження часу
- `POST /:id/time-entries/stop` - Зупинка відстеження часу
- `GET /:id/time-entries` - Отримання записів часу
- `GET /:id/time-entries/active` - Отримання активної сесії
- `PUT /:id/time-entries/:entryId` - Оновлення запису часу
- `DELETE /:id/time-entries/:entryId` - Видалення запису часу

### Теги тикетів
- `POST /:ticketId/tags/:tagId` - Додавання тега до тикета
- `DELETE /:ticketId/tags/:tagId` - Видалення тега з тикета
- `GET /:ticketId/tags` - Отримання тегів тикета

### Нотатки до тикетів
- `GET /:id/notes` - Отримання нотаток тикета
- `GET /:id/notes/:noteId` - Отримання нотатки за ID
- `POST /:id/notes` - Створення нотатки
- `PUT /:id/notes/:noteId` - Оновлення нотатки
- `DELETE /:id/notes/:noteId` - Видалення нотатки
- `PATCH /:id/notes/:noteId/restore` - Відновлення нотатки
- `POST /:id/notes/:noteId/tags` - Додавання тега до нотатки
- `DELETE /:id/notes/:noteId/tags/:tag` - Видалення тега з нотатки
- `PATCH /:id/notes/:noteId/reminder` - Встановлення нагадування
- `GET /:id/notes/statistics` - Статистика нотаток

### Історія тикетів
- `GET /:id/history` - Отримання історії тикета
- `GET /:id/history/stats` - Статистика змін тикета

## Коментарі (`/api/comments`)

### Основні операції
- `GET /` - Отримання списку коментарів
- `GET /:id` - Отримання коментаря за ID
- `POST /` - Створення коментаря
- `PUT /:id` - Оновлення коментаря
- `DELETE /:id` - Видалення коментаря
- `PATCH /:id/restore` - Відновлення коментаря

### Фільтрація та пошук
- `GET /ticket/:ticketId` - Коментарі до тикета
- `GET /user/:userId` - Коментарі користувача
- `GET /search/content` - Пошук по вмісту коментарів

### Реакції
- `POST /:id/reactions` - Додавання реакції
- `DELETE /:id/reactions` - Видалення реакції

### Модерація
- `GET /moderation` - Коментарі для модерації
- `PATCH /:id/moderate` - Модерація коментаря
- `PATCH /bulk/moderate` - Масова модерація
- `PATCH /bulk/restore` - Масове відновлення

### Статистика та аналітика
- `GET /statistics` - Статистика коментарів
- `GET /analytics/trends` - Тренди коментарів
- `GET /export/data` - Експорт даних

### Масові операції
- `DELETE /bulk/delete` - Масове видалення

## Міста (`/api/cities`)

### Основні операції
- `GET /` - Отримання списку міст
- `GET /:id` - Отримання міста за ID
- `POST /` - Створення міста (адмін)
- `PUT /:id` - Оновлення міста (адмін)
- `DELETE /:id` - Видалення міста (адмін)

### Пошук та фільтрація
- `GET /search/query` - Пошук міст
- `GET /regions/list` - Список регіонів
- `GET /region/:region` - Міста за регіоном
- `GET /simple/list` - Простий список міст

### Статистика
- `GET /statistics/overview` - Загальна статистика міст (адмін)
- `GET /:id/statistics` - Детальна статистика міста
- `GET /heatmap/data` - Дані для теплової карти

### Користувачі та тикети
- `GET /:id/users` - Користувачі міста
- `GET /:id/tickets` - Тикети міста

### Масові операції
- `PATCH /bulk/update` - Масове оновлення (адмін)
- `DELETE /bulk/delete` - Масове видалення (адмін)
- `PATCH /:id/toggle-status` - Перемикання статусу міста (адмін)

### Додаткові функції
- `GET /export/data` - Експорт даних (адмін)
- `POST /import/data` - Імпорт даних (адмін)
- `POST /validate/data` - Валідація даних (адмін)
- `GET /:id/nearby` - Найближчі міста
- `GET /map/coordinates` - Координати для карти
- `POST /sync/external` - Синхронізація з зовнішніми джерелами (адмін)
- `GET /:id/history` - Історія змін міста (адмін)
- `POST /:id/restore` - Відновлення міста (адмін)

## Посади (`/api/positions`)

### Основні операції
- `GET /` - Отримання списку посад
- `GET /:id` - Отримання посади за ID
- `POST /` - Створення посади (адмін)
- `PUT /:id` - Оновлення посади (адмін)
- `DELETE /:id` - Видалення посади (адмін)

### Статистика
- `GET /:id/statistics` - Статистика посади

### Додаткові функції
- `PATCH /:id/activate` - Активація посади (адмін)
- `GET /departments/list` - Список відділів
- `DELETE /bulk/delete` - Масове видалення (адмін)
- `GET /permissions/list` - Список дозволів
- `GET /simple/list` - Простий список посад

## Аналітика (`/api/analytics`)

### Загальна аналітика
- `GET /overview` - Загальний огляд
- `GET /dashboard` - Дашборд
- `GET /performance` - Показники продуктивності

### Аналітика за містами та посадами
- `GET /cities` - Аналітика по містах
- `GET /positions` - Аналітика по посадах

### Реєстрації користувачів
- `GET /user-registrations` - Реєстрації користувачів
- `GET /user-registration-stats` - Статистика реєстрацій

### Графіки
- `GET /charts/weekly-tickets` - Тижневі тикети
- `GET /charts/category-distribution` - Розподіл по категоріях
- `GET /charts/workload-by-day` - Навантаження по днях

### Експорт
- `GET /export` - Експорт аналітичних даних

## Telegram інтеграція (`/api/telegram`)

### Webhook та зв'язування
- `POST /webhook` - Webhook для Telegram бота
- `POST /link` - Зв'язування Telegram акаунта
- `DELETE /unlink` - Від'єднання Telegram акаунта
- `POST /generate-link-code` - Генерація коду для зв'язування

### Сповіщення
- `POST /send-notification` - Відправка сповіщення через Telegram

### Статус
- `GET /status` - Статус Telegram інтеграції

## Завантаження файлів (`/api/upload`)

### Основні операції завантаження
- `POST /single` - Завантаження одного файлу
- `POST /multiple` - Завантаження кількох файлів
- `POST /fields` - Завантаження з полями
- `POST /avatar` - Завантаження аватара
- `POST /ticket/:ticketId` - Завантаження до тикета

### Отримання файлів
- `GET /file/:fileId` - Отримання файлу
- `GET /info/:fileId` - Інформація про файл
- `GET /my-files` - Мої файли
- `GET /all` - Всі файли (адмін)

### Управління файлами
- `PUT /:fileId` - Оновлення файлу
- `DELETE /:fileId` - Видалення файлу
- `DELETE /bulk/delete` - Масове видалення

### Обробка зображень
- `POST /:fileId/thumbnail` - Створення мініатюри
- `POST /:fileId/resize` - Зміна розміру
- `POST /:fileId/crop` - Обрізання

### Статистика та управління
- `GET /stats/overview` - Загальна статистика
- `GET /stats/storage` - Статистика сховища
- `GET /stats/top-downloads` - Топ завантажень

### Очищення та обслуговування
- `POST /cleanup/old-files` - Очищення старих файлів
- `POST /cleanup/orphaned` - Очищення осиротілих файлів
- `POST /verify/integrity` - Перевірка цілісності

### Експорт та архівування
- `GET /export/list` - Експорт списку файлів
- `POST /archive/create` - Створення архіву

## Теги (`/api/tags`)

### Основні операції
- `GET /` - Отримання списку тегів
- `GET /:id` - Отримання тега за ID
- `POST /` - Створення тега
- `PUT /:id` - Оновлення тега
- `DELETE /:id` - Видалення тега

### Пошук та статистика
- `GET /search` - Пошук тегів
- `GET /most-used` - Найбільш використовувані теги

## Сповіщення (`/api/notifications`)

### Основні операції
- `GET /` - Отримання сповіщень
- `GET /:id` - Отримання сповіщення за ID
- `POST /` - Створення сповіщення
- `PUT /:id` - Оновлення сповіщення
- `DELETE /:id` - Видалення сповіщення

### Статус сповіщень
- `GET /unread-count` - Кількість непрочитаних
- `PATCH /:id/read` - Позначити як прочитане
- `PATCH /:id/unread` - Позначити як непрочитане
- `PATCH /mark-all/read` - Позначити всі як прочитані

### Масові операції
- `DELETE /bulk/delete` - Масове видалення
- `PATCH /bulk/read` - Масове позначення як прочитані

### Налаштування
- `GET /settings/preferences` - Налаштування сповіщень
- `PUT /settings/preferences` - Оновлення налаштувань
- `POST /settings/reset` - Скидання налаштувань

### Тестування
- `POST /test/email` - Тест email сповіщення
- `POST /test/telegram` - Тест Telegram сповіщення
- `POST /test/web` - Тест web сповіщення

### Шаблони
- `GET /templates/list` - Список шаблонів
- `GET /templates/:id` - Шаблон за ID
- `POST /templates` - Створення шаблону
- `PUT /templates/:id` - Оновлення шаблону
- `DELETE /templates/:id` - Видалення шаблону

### Аналітика
- `GET /analytics/overview` - Загальна аналітика
- `GET /analytics/delivery` - Аналітика доставки
- `GET /analytics/engagement` - Аналітика залученості

### Експорт та очищення
- `GET /export/notifications` - Експорт сповіщень
- `GET /export/analytics` - Експорт аналітики
- `DELETE /cleanup/read` - Очищення прочитаних
- `DELETE /cleanup/old` - Очищення старих

### Real-time
- `GET /realtime/connect` - Підключення до real-time сповіщень

## Active Directory (`/api/active-directory`)

### Користувачі та комп'ютери
- `GET /users` - Отримання користувачів AD
- `GET /computers` - Отримання комп'ютерів AD
- `GET /users/search/:username` - Пошук користувача AD

### Тестування та статистика
- `GET /test` - Тест підключення до AD
- `GET /statistics` - Статистика AD

## Швидкі поради (`/api/quick-tips`)

### Публічні операції
- `GET /category/:categoryId` - Поради за категорією
- `GET /search` - Пошук порад
- `POST /:tipId/rate` - Оцінка поради

### Адміністративні операції
- `GET /` - Всі поради (адмін)
- `POST /` - Створення поради (адмін)
- `PUT /:tipId` - Оновлення поради (адмін)
- `DELETE /:tipId` - Видалення поради (адмін)

## Шаблони тикетів (`/api/ticket-templates`)

### Основні операції
- `GET /` - Отримання шаблонів
- `GET /:id` - Шаблон за ID
- `POST /` - Створення шаблону (адмін)
- `PUT /:id` - Оновлення шаблону (адмін)
- `DELETE /:id` - Видалення шаблону (адмін)

### Спеціальні операції
- `GET /popular` - Популярні шаблони
- `GET /category/:categoryId` - Шаблони за категорією
- `POST /:id/use` - Використання шаблону

### Telegram інтеграція
- `GET /telegram/:id` - Шаблон для Telegram (без авторизації)
- `GET /telegram` - Шаблони для Telegram (без авторизації)

## Категорії (`/api/categories`)

### Основні операції
- `GET /` - Отримання категорій
- `GET /:id` - Категорія за ID
- `POST /` - Створення категорії (адмін)
- `PUT /:id` - Оновлення категорії (адмін)
- `DELETE /:id` - Видалення категорії (адмін)

### Статистика та управління
- `GET /stats/usage` - Статистика використання
- `PATCH /:id/deactivate` - Деактивація категорії (адмін)
- `PATCH /:id/activate` - Активація категорії (адмін)

## Рейтинги (`/api/ratings`)

### Основні операції
- `POST /ticket/:ticketId` - Створення рейтингу для тикета
- `GET /ticket/:ticketId` - Рейтинг тикета
- `GET /` - Отримання рейтингів
- `PUT /:ratingId` - Оновлення рейтингу
- `DELETE /:ratingId` - Видалення рейтингу

### Статистика
- `GET /stats` - Статистика рейтингів

## Події (`/api/events`)

### Основні операції
- `GET /` - Отримання подій (адмін)
- `GET /:id` - Подія за ID (адмін)
- `POST /` - Створення події (адмін)
- `PUT /:id` - Оновлення події (адмін)
- `DELETE /:id` - Видалення події (адмін)

### Спеціальні операції
- `GET /upcoming` - Майбутні події (адмін)
- `PATCH /:id/complete` - Позначити як завершену (адмін)
- `PATCH /:id/cancel` - Скасувати подію (адмін)

### Учасники
- `POST /:id/attendees` - Додати учасника (адмін)
- `DELETE /:id/attendees/:userId` - Видалити учасника (адмін)

## Історія тикетів (`/api/ticket-history`)

### Основні операції
- `GET /:ticketId/history` - Історія тикета
- `GET /:ticketId/history/stats` - Статистика змін тикета
- `POST /:ticketId/history` - Додати запис в історію
- `PUT /history/:historyId/visibility` - Оновити видимість запису
- `DELETE /history/:historyId` - Видалити запис з історії

## Адміністративні нотатки (`/api/admin-notes`)

### Основні операції
- `GET /` - Отримання адмін нотаток (адмін)
- `GET /:id` - Нотатка за ID (адмін)
- `POST /` - Створення нотатки (адмін)
- `PUT /:id` - Оновлення нотатки (адмін)
- `DELETE /:id` - Видалення нотатки (адмін)

### Спеціальні операції
- `GET /pinned` - Закріплені нотатки (адмін)
- `GET /statistics` - Статистика нотаток (адмін)
- `PATCH /:id/pin` - Перемикання закріплення (адмін)

### Теги нотаток
- `POST /:id/tags` - Додати тег до нотатки (адмін)
- `DELETE /:id/tags` - Видалити тег з нотатки (адмін)

---

## Коди відповідей

### Успішні відповіді
- `200` - OK
- `201` - Created
- `204` - No Content

### Помилки клієнта
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `422` - Unprocessable Entity

### Помилки сервера
- `500` - Internal Server Error
- `503` - Service Unavailable

## Аутентифікація

Більшість ендпоінтів вимагають аутентифікації через JWT токен у заголовку:
```
Authorization: Bearer <token>
```

Деякі ендпоінти також вимагають адміністративних прав (`adminAuth` middleware).

## Примітки

- Всі дати повертаються у форматі ISO 8601
- Пагінація підтримується для списків через параметри `page` та `limit`
- Фільтрація та сортування доступні для більшості списків
- Валідація даних виконується на рівні middleware
- Логування всіх запитів виконується автоматично