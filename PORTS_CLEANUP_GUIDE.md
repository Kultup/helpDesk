# Автоматичне очищення портів

## Проблема

Коли Node.js процес не завершується коректно, порт може залишитись зайнятим ("zombie" процес), що призводить до помилки:
```
Error: listen EADDRINUSE: address already in use :::5000
```

## Рішення

### 1. Автоматичне очищення (Рекомендовано)

Тепер PM2 автоматично очищає порти перед кожним запуском завдяки `pre_start` скрипту в `ecosystem.config.js`.

**Що відбувається:**
1. PM2 намагається перезапустити бекенд
2. Перед запуском виконується `scripts/pre-start.sh`
3. Скрипт перевіряє чи порт 5000 зайнятий
4. Якщо зайнятий - вбиває процеси на цьому порту
5. Запускає бекенд

### 2. Ручне очищення

Якщо потрібно вручну очистити порти:

```bash
cd /srv/helpDesk/backend

# Очистити всі порти додатку
bash scripts/cleanup-ports.sh

# Або очистити конкретний порт
bash scripts/kill-port.sh 5000

# Перезапустити сервіси
pm2 restart all
```

### 3. Одноразові команди

```bash
# Знайти процес на порту 5000
lsof -i :5000
# або
netstat -tulpn | grep :5000

# Вбити процес
kill -9 $(lsof -t -i:5000)
# або
fuser -k 5000/tcp

# Перезапустити бекенд
pm2 restart helpdesk-backend
```

## Налаштування

### ecosystem.config.js

```javascript
{
  name: 'helpdesk-backend',
  // ...
  pre_start: './scripts/pre-start.sh',  // Виконується перед запуском
  kill_timeout: 5000,                    // Час на graceful shutdown
  listen_timeout: 10000                  // Час очікування старту
}
```

### Скрипти

1. **scripts/kill-port.sh** - Вбиває процеси на конкретному порту
2. **scripts/pre-start.sh** - Pre-start hook, очищає порти перед запуском
3. **scripts/cleanup-ports.sh** - Очищує всі порти додатку

## Права доступу

Після deploy на сервер дайте права на виконання:

```bash
cd /srv/helpDesk/backend/scripts
chmod +x *.sh
```

## Моніторинг

Перевірити чи працює:

```bash
# Подивитись логи
pm2 logs helpdesk-backend --lines 50

# Перевірити статус
pm2 status

# Перевірити які порти зайняті
lsof -i :5000
```

## Troubleshooting

### Скрипт не спрацьовує

1. Перевірте права: `ls -la scripts/`
2. Дайте права: `chmod +x scripts/*.sh`
3. Перевірте шебанг: перший рядок має бути `#!/bin/bash`

### lsof не знайдено

На деяких системах потрібно встановити:
```bash
# Ubuntu/Debian
sudo apt-get install lsof

# CentOS/RHEL
sudo yum install lsof
```

### PM2 не виконує pre_start

1. Перевірте версію PM2: `pm2 --version` (має бути >= 4.0)
2. Оновіть PM2: `npm install -g pm2@latest`
3. Перезавантажте конфігурацію: `pm2 delete all && pm2 start ecosystem.config.js --env production`

## Примітки

- `pre_start` скрипт виконується при **кожному** запуску/перезапуску
- Якщо `pre_start` повертає exit code != 0, процес не запуститься
- `kill_timeout` - час який PM2 дає процесу на graceful shutdown перед force kill
- Zombie процеси з'являються коли процес падає без коректного закриття порту
