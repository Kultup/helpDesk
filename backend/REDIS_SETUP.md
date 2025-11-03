# Швидке налаштування Redis для Windows

## Варіант 1: Docker (рекомендовано)

Якщо у вас встановлений Docker Desktop:

```powershell
# Запуск Redis
docker-compose -f docker-compose.redis.yml up -d

# Перевірка статусу
docker ps --filter "name=helpdesk-redis"

# Перевірка підключення
docker exec helpdesk-redis redis-cli ping
```

## Варіант 2: Локальне встановлення Redis для Windows

### Через WSL2 (рекомендовано)

1. Встановіть WSL2 якщо ще не встановлено:
```powershell
wsl --install
```

2. Встановіть Redis в WSL:
```bash
sudo apt update
sudo apt install redis-server
sudo service redis-server start
```

3. Redis буде доступний на `localhost:6379`

### Через Memurai (альтернатива Redis для Windows)

1. Завантажте Memurai з [memurai.com](https://www.memurai.com/)
2. Встановіть та запустіть
3. Redis буде доступний на `localhost:6379`

### Через Chocolatey

```powershell
# Встановіть Chocolatey якщо ще не встановлено
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Встановіть Redis
choco install redis-64 -y

# Запустіть Redis
redis-server
```

## Варіант 3: Без Redis (додаток працює без кешування)

Додаток може працювати без Redis! Просто залиште налаштування як є в `.env` файлі.

При спробі підключення до Redis:
- У режимі розробки: додаток продовжить працювати з попередженням
- У режимі production: додаток не запуститься без Redis

## Перевірка налаштування

Після встановлення Redis перевірте підключення:

```powershell
# Якщо Redis встановлений локально
redis-cli ping
# Повинно повернути: PONG

# Якщо Redis в Docker
docker exec helpdesk-redis redis-cli ping
```

## Перезапуск бекенду

Після налаштування Redis перезапустіть бекенд:

```powershell
# Зупиніть поточний процес (Ctrl+C)
# Або знайдіть процес:
Get-Process -Name node | Where-Object {$_.Path -like "*node*"}

# Запустіть знову
cd backend
npm run dev
```

У логах ви побачите:
- `✅ Redis підключено успішно` - якщо Redis працює
- `⚠️ Продовжуємо роботу без Redis (режим розробки)` - якщо Redis недоступний

