# Redis для Help Desk проекту

Цей каталог містить конфігурацію та інструкції для роботи з Redis.

## Швидкий старт

### 1. Запуск Redis через Docker Compose

```bash
# Запуск Redis
docker-compose -f docker-compose.redis.yml up -d

# Перевірка статусу
docker-compose -f docker-compose.redis.yml ps

# Перегляд логів
docker-compose -f docker-compose.redis.yml logs -f redis
```

### 2. Налаштування змінних оточення

Додайте до вашого `.env` файлу в корені проекту:

```env
# Redis конфігурація
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=          # Опціонально, для production використовуйте сильний пароль
REDIS_DB=0
REDIS_TLS=false

# Або використовуйте повний URL
REDIS_URL=redis://localhost:6379/0

# Для Redis Commander (опціонально)
REDIS_COMMANDER_PORT=8081
REDIS_COMMANDER_USER=admin
REDIS_COMMANDER_PASSWORD=admin
```

### 3. Перевірка підключення

```bash
# Через redis-cli (якщо встановлений локально)
redis-cli ping
# Повинно повернути: PONG

# Або через Docker
docker exec -it helpdesk-redis redis-cli ping
```

## Доступ до Redis

### Через redis-cli

```bash
# Локальний redis-cli
redis-cli

# Або через Docker
docker exec -it helpdesk-redis redis-cli

# Якщо встановлений пароль
redis-cli -a your_password
# або
docker exec -it helpdesk-redis redis-cli -a your_password
```

### Через Redis Commander (веб-інтерфейс)

```bash
# Запуск з профілем tools
docker-compose -f docker-compose.redis.yml --profile tools up -d redis-commander

# Відкрийте в браузері
http://localhost:8081
```

## Корисні команди Redis

```bash
# Перевірка підключення
PING

# Отримати всі ключі
KEYS *

# Отримати ключі за паттерном
KEYS cache:*

# Отримати значення ключа
GET cache:user:123

# Встановити значення
SET mykey "Hello Redis"

# Встановити значення з TTL (час життя)
SETEX mykey 3600 "Hello Redis"  # 3600 секунд = 1 година

# Видалити ключ
DEL mykey

# Видалити всі ключі (ОБЕРЕЖНО!)
FLUSHDB

# Інформація про сервер
INFO

# Статистика
INFO stats

# Використання пам'яті
INFO memory

# Кількість ключів
DBSIZE
```

## Керування даними

### Збереження даних

Redis автоматично зберігає дані на диск через RDB snapshots та AOF (append-only file).

Файли зберігаються в Docker volume `redis_data`:
- `dump.rdb` - RDB snapshot
- `appendonly.aof` - AOF файл

### Резервне копіювання

```bash
# Створити backup
docker exec helpdesk-redis redis-cli BGSAVE

# Скопіювати файли з контейнера
docker cp helpdesk-redis:/data/dump.rdb ./backups/redis-dump-$(date +%Y%m%d).rdb
docker cp helpdesk-redis:/data/appendonly.aof ./backups/redis-aof-$(date +%Y%m%d).aof
```

### Відновлення з backup

```bash
# Зупинити Redis
docker-compose -f docker-compose.redis.yml stop redis

# Скопіювати файли назад
docker cp ./backups/redis-dump-20240101.rdb helpdesk-redis:/data/dump.rdb
docker cp ./backups/redis-aof-20240101.aof helpdesk-redis:/data/appendonly.aof

# Запустити Redis
docker-compose -f docker-compose.redis.yml start redis
```

## Моніторинг

### Перевірка здоров'я Redis

```bash
# Health check через Docker
docker exec helpdesk-redis redis-cli ping

# Детальна інформація
docker exec helpdesk-redis redis-cli INFO
```

### Метрики продуктивності

```bash
# Статистика команд
docker exec helpdesk-redis redis-cli INFO stats

# Інформація про пам'ять
docker exec helpdesk-redis redis-cli INFO memory

# Медлені запити
docker exec helpdesk-redis redis-cli SLOWLOG GET 10
```

## Troubleshooting

### Redis не запускається

1. Перевірте логи:
```bash
docker-compose -f docker-compose.redis.yml logs redis
```

2. Перевірте, чи порт 6379 не зайнятий:
```bash
# Windows
netstat -ano | findstr :6379

# Linux/Mac
lsof -i :6379
```

3. Перевірте конфігурацію:
```bash
docker exec helpdesk-redis redis-cli CONFIG GET "*"
```

### Проблеми з пам'яттю

Якщо Redis досяг обмеження пам'яті (`maxmemory`), він почне видаляти ключі згідно з `maxmemory-policy`.

Перевірте:
```bash
docker exec helpdesk-redis redis-cli INFO memory
```

### Очищення кешу

```bash
# Видалити всі ключі з поточної бази (ОБЕРЕЖНО!)
docker exec helpdesk-redis redis-cli FLUSHDB

# Видалити всі ключі з усіх баз (ОБЕРЕЖНО!)
docker exec helpdesk-redis redis-cli FLUSHALL

# Видалити конкретні ключі за паттерном
docker exec helpdesk-redis redis-cli --scan --pattern "cache:*" | xargs docker exec helpdesk-redis redis-cli DEL
```

## Зупинка та видалення

```bash
# Зупинити Redis
docker-compose -f docker-compose.redis.yml stop redis

# Зупинити та видалити контейнери
docker-compose -f docker-compose.redis.yml down

# Зупинити, видалити контейнери та volumes (видалить всі дані!)
docker-compose -f docker-compose.redis.yml down -v
```

## Інтеграція з проектом

Redis автоматично підключається до проекту через `backend/config/redis.js`.

Переконайтеся, що змінні оточення правильно налаштовані, і Redis буде використовуватися для:
- Кешування GET запитів
- Сесій (якщо налаштовано)
- Rate limiting
- Інших операцій кешування

## Безпека

Для production середовища:

1. **Встановіть пароль**:
```env
REDIS_PASSWORD=your_strong_random_password_here
```

2. **Обмежте доступ до Redis**:
   - Не відкривайте порт 6379 публічно
   - Використовуйте файрвол
   - Використовуйте Docker networks для ізоляції

3. **Шифрування**:
   - Використовуйте TLS для з'єднань (`REDIS_TLS=true`)
   - Налаштуйте SSL сертифікати

4. **Моніторинг**:
   - Налаштуйте логи
   - Використовуйте Redis Commander або інші інструменти моніторингу
   - Встановіть алерти на критичні події

## Додаткові ресурси

- [Офіційна документація Redis](https://redis.io/documentation)
- [Redis Commands](https://redis.io/commands)
- [Redis Best Practices](https://redis.io/docs/manual/patterns/)

