# Налаштування Redis для Help Desk

Цей документ описує налаштування та використання Redis для кешування в проекті Help Desk.

## Встановлення

Redis встановлюється автоматично при встановленні залежностей:

```bash
npm install
```

Для локальної розробки найпростіше використовувати Docker Compose:

### Швидкий старт з Docker Compose (рекомендовано)

В корені проекту є файл `docker-compose.redis.yml` - просто запустіть:

```bash
# Запуск Redis
docker-compose -f docker-compose.redis.yml up -d

# Перевірка статусу
docker-compose -f docker-compose.redis.yml ps

# Перегляд логів
docker-compose -f docker-compose.redis.yml logs -f redis
```

Redis буде доступний на `localhost:6379`.

### Альтернативні способи встановлення

#### Windows
Завантажте Redis з [Redis для Windows](https://github.com/microsoftarchive/redis/releases) або використовуйте Docker:
```bash
docker run -d -p 6379:6379 redis:alpine
```

#### Linux/Mac
```bash
# Ubuntu/Debian
sudo apt-get install redis-server

# macOS
brew install redis
```

Детальні інструкції з використання Docker Compose дивіться в `redis/README.md`.

## Конфігурація

Додайте наступні змінні оточення в ваш `.env` файл:

```env
# Redis конфігурація
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=          # Опціонально, якщо потрібен пароль
REDIS_DB=0              # Номер бази даних (0-15)
REDIS_TLS=false         # Використовувати TLS (true/false)

# Або використовуйте повний URL
REDIS_URL=redis://localhost:6379/0
```

## Використання

### Автоматичне кешування в роутах

Redis автоматично інтегровано в роути через middleware:

```javascript
const { cacheMiddleware, invalidateCache, cacheKeyGenerators } = require('../middleware/cache');

// Кешування GET запиту на 5 хвилин (300 секунд)
router.get('/categories', 
  authenticateToken,
  cacheMiddleware(300, cacheKeyGenerators.categories),
  categoryController.getCategories
);

// Інвалідація кешу після змін
router.post('/categories',
  authenticateToken,
  adminAuth,
  invalidateCache('cache:categories:*'),
  categoryController.createCategory
);
```

### Програмне використання CacheService

```javascript
const cacheService = require('../services/cacheService');

// Отримати значення
const value = await cacheService.get('cache:user:123');

// Зберегти значення з TTL 1 година (3600 секунд)
await cacheService.set('cache:user:123', userData, 3600);

// Отримати або встановити (cache-aside pattern)
const user = await cacheService.getOrSet(
  'cache:user:123',
  async () => {
    // Функція виконується тільки якщо кеш порожній
    return await User.findById('123');
  },
  3600 // TTL
);

// Видалити ключ
await cacheService.delete('cache:user:123');

// Видалити за паттерном
await cacheService.deleteByPattern('cache:users:*');

// Інкремент/декремент
await cacheService.increment('cache:views:123');
await cacheService.decrement('cache:stock:123');
```

## Генератори ключів

Доступні готові генератори ключів для різних типів ресурсів:

```javascript
const { cacheKeyGenerators } = require('../middleware/cache');

// Категорії
cacheKeyGenerators.categories(req)      // 'cache:categories:true/false'
cacheKeyGenerators.category(req)        // 'cache:category:123'

// Користувачі
cacheKeyGenerators.users(req)           // 'cache:users:1:10:hash'
cacheKeyGenerators.user(req)            // 'cache:user:123'

// Тікети
cacheKeyGenerators.tickets(req)         // 'cache:tickets:1:10:hash'
cacheKeyGenerators.ticket(req)         // 'cache:ticket:123'

// Статистика
cacheKeyGenerators.stats(req)           // 'cache:stats:general'
```

## Налаштування TTL

Рекомендовані значення TTL для різних типів даних:

- **Статичні дані** (категорії, міста, посади): 1 година (3600 сек)
- **Списки з пагінацією**: 5 хвилин (300 сек)
- **Окремі ресурси**: 5-15 хвилин (300-900 сек)
- **Статистика**: 10-30 хвилин (600-1800 сек)
- **Аналітика**: 1 година (3600 сек)

## Інвалідація кешу

Кеш автоматично інвалідується при змінах через middleware `invalidateCache`:

```javascript
// Інвалідація конкретного ключа
invalidateCache((req) => `cache:category:${req.params.id}`)

// Інвалідація за паттерном
invalidateCache('cache:categories:*')
invalidateCache('cache:users:*')
```

## Перевірка стану Redis

Перевірити стан підключення до Redis можна через health check:

```javascript
const redisClient = require('../config/redis');

const status = await redisClient.healthCheck();
console.log(status);
// { status: 'healthy', message: 'Redis connection is healthy', ... }
```

## Працювання без Redis

Якщо Redis недоступний, додаток продовжить працювати без кешування. У режимі розробки це не критично, але в production рекомендується налаштувати Redis для кращої продуктивності.

## Моніторинг

Для моніторингу Redis використовуйте:

```bash
# Підключення до Redis CLI
redis-cli

# Перевірка статусу
redis-cli ping

# Перегляд всіх ключів
redis-cli KEYS "cache:*"

# Статистика
redis-cli INFO stats
```

## Безпека

- Не зберігайте чутливі дані (паролі, токени) в Redis без шифрування
- Використовуйте пароль для production середовища
- Обмежте доступ до Redis тільки з необхідних серверів
- Використовуйте TLS для з'єднань в production

## Troubleshooting

### Redis не підключається

1. Перевірте, чи запущений Redis: `redis-cli ping`
2. Перевірте змінні оточення в `.env`
3. Перевірте файрвол/мережеві налаштування
4. Перевірте логи додатку

### Кеш не працює

1. Перевірте, чи `cacheService.isEnabled === true`
2. Перевірте логи на помилки Redis
3. Перевірте, чи правильно налаштовані ключі кешу
4. Використовуйте `X-Cache` заголовок у відповідях для діагностики

