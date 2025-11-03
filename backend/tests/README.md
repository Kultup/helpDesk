# Тести Help Desk Backend

## Структура тестів

```
tests/
├── setup.js                    # Глобальне налаштування тестів
├── helpers/
│   └── testHelpers.js         # Допоміжні функції для тестів
├── unit/                      # Unit тести
│   ├── controllers/           # Тести контролерів
│   ├── middleware/            # Тести middleware
│   ├── services/              # Тести сервісів
│   └── models/               # Тести моделей
└── integration/              # Integration тести
    └── api/                  # Тести API endpoints
```

## Запуск тестів

### Всі тести
```bash
npm test
```

### Тести з покриттям
```bash
npm run test:coverage
```

### Тести в режимі watch
```bash
npm run test:watch
```

### Конкретний тестовий файл
```bash
npm test -- authController.test.js
```

### Тільки unit тести
```bash
npm run test:unit
```

### Тільки integration тести
```bash
npm run test:integration
```

### Пропуск тестів

#### Пропуск integration тестів
```bash
npm run test:skip:integration
```

#### Пропуск unit тестів
```bash
npm run test:skip:unit
```

#### Пропуск окремих тестів в коді
Використовуйте `.skip()` для пропуску тестів:
```javascript
it.skip('should skip this test', () => {
  // цей тест буде пропущено
});

describe.skip('Skipped suite', () => {
  // весь describe буде пропущено
});
```

#### Умовний пропуск тестів
Використовуйте `.skipIf()` (доступно глобально):
```javascript
it.skipIf(process.env.SKIP_INTEGRATION_TESTS === 'true')('integration test', () => {
  // тест буде пропущено якщо SKIP_INTEGRATION_TESTS=true
});
```

## Налаштування

### Змінні середовища

Створіть файл `.env.test` в корені `backend/`:

```env
NODE_ENV=test
MONGODB_TEST_URI=mongodb://localhost:27017/helpdesk_test
JWT_SECRET=test-jwt-secret-key-for-testing-purposes-only
JWT_REFRESH_SECRET=test-refresh-secret-key-for-testing-purposes-only
```

### Тестова база даних

Тести використовують окрему тестову базу даних (`helpdesk_test`), яка автоматично очищається перед кожним тестом.

## Написання тестів

### Приклад unit тесту

```javascript
const { connectDB, disconnectDB, clearDatabase, createTestUser } = require('../helpers/testHelpers');

describe('MyController', () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await clearDatabase();
    await disconnectDB();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  it('should do something', async () => {
    const user = await createTestUser();
    // ваш тест
  });
});
```

### Приклад integration тесту

```javascript
const request = require('supertest');
const { connectDB, disconnectDB, clearDatabase } = require('../helpers/testHelpers');

let app;

beforeAll(async () => {
  await connectDB();
  // налаштування app
});

afterAll(async () => {
  await clearDatabase();
  await disconnectDB();
});

it('should return 200', async () => {
  const response = await request(app)
    .get('/api/endpoint');
  
  expect(response.status).toBe(200);
});
```

## Покриття коду

Мета покриття:
- Загальне: мінімум 50%
- Критичні модулі (authController, ticketController): мінімум 60%

Переглянути звіт про покриття:
```bash
open coverage/lcov-report/index.html
```

## Best Practices

1. **Очищайте базу даних** перед кожним тестом
2. **Використовуйте helper функції** для створення тестових даних
3. **Мокайте зовнішні залежності** (email, telegram, тощо)
4. **Тестуйте як успішні, так і невдалі сценарії**
5. **Використовуйте описові назви тестів**

