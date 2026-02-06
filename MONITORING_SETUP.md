# Автоматичний моніторинг та відновлення HelpDesk

## Огляд системи

Система автоматичного моніторингу та відновлення складається з кількох компонентів:

1. **Monitor Script** - Перевіряє стан сервісу та перезапускає при проблемах
2. **Cron Job** - Запускає моніторинг кожні 5 хвилин
3. **Systemd Timer** - Альтернатива cron (більш надійна)
4. **PM2 Wrapper** - Обгортка для PM2 з автоматичним очищенням портів
5. **Pre-start Hook** - PM2 hook який очищає порти перед запуском

## Швидке налаштування

### На сервері виконайте:

```bash
cd /srv/helpDesk/backend

# Дайте права на скрипти
chmod +x scripts/*.sh

# Запустіть автоматичне налаштування
sudo bash scripts/setup-monitoring.sh
```

Це автоматично налаштує:
- ✅ Cron job для моніторингу
- ✅ Systemd timer
- ✅ Права на всі скрипти
- ✅ Директорії для логів

## Компоненти системи

### 1. Monitor Script (`monitor-and-restart.sh`)

Автоматично перевіряє:
- Чи PM2 процес запущений
- Чи процес в статусі "online"
- Чи API відповідає (HTTP 200 на `/health`)

При проблемах:
- Очищує порти
- Перезапускає PM2
- Логує всі дії

**Запускається автоматично кожні 5 хвилин**

### 2. PM2 Wrapper (`pm2-wrapper.sh`)

Замість прямих команд PM2, використовуйте wrapper:

```bash
# Замість: pm2 restart helpdesk-backend
bash scripts/pm2-wrapper.sh restart

# Замість: pm2 start ecosystem.config.js
bash scripts/pm2-wrapper.sh start

# Інші команди
bash scripts/pm2-wrapper.sh reload
bash scripts/pm2-wrapper.sh stop
```

Wrapper автоматично:
1. Очищає порти перед операцією
2. Виконує PM2 команду
3. Перевіряє статус після операції
4. Тестує API endpoint

### 3. Cleanup Ports (`cleanup-ports.sh`)

Очищає всі порти додатку:

```bash
bash scripts/cleanup-ports.sh
```

### 4. Kill Port (`kill-port.sh`)

Вбиває процеси на конкретному порту:

```bash
bash scripts/kill-port.sh 5000
bash scripts/kill-port.sh 3000
```

## Моніторинг

### Перевірити статус

```bash
# Systemd timer
systemctl status helpdesk-monitor.timer
systemctl list-timers | grep helpdesk

# Cron job
crontab -l
```

### Логи

```bash
# Логи моніторингу
tail -f /srv/helpDesk/backend/logs/monitor.log

# Логи cron
tail -f /srv/helpDesk/backend/logs/cron.log

# PM2 логи
pm2 logs helpdesk-backend --lines 50
```

### Ручний запуск моніторингу

```bash
bash /srv/helpDesk/backend/scripts/monitor-and-restart.sh
```

## Що робить система автоматично

### Кожні 5 хвилин:
1. ✅ Перевіряє чи PM2 процес існує
2. ✅ Перевіряє чи процес online
3. ✅ Перевіряє чи API відповідає
4. ✅ При проблемах - очищає порти та перезапускає
5. ✅ Логує всі дії

### При перезапуску PM2 (через webhook або вручну):
1. ✅ Виконується `pre_start` hook
2. ✅ Очищаються порти
3. ✅ Запускається процес

### При git push (через webhook):
1. ✅ Git pull з очищенням
2. ✅ Встановлення залежностей
3. ✅ Права на скрипти
4. ✅ Очищення портів
5. ✅ Перезапуск PM2

## Управління

### Вимкнути моніторинг

```bash
# Systemd timer
sudo systemctl stop helpdesk-monitor.timer
sudo systemctl disable helpdesk-monitor.timer

# Cron
crontab -l | grep -v "monitor-and-restart.sh" | crontab -
```

### Увімкнути моніторинг

```bash
# Systemd timer
sudo systemctl enable helpdesk-monitor.timer
sudo systemctl start helpdesk-monitor.timer

# Cron
(crontab -l; echo "*/5 * * * * bash /srv/helpDesk/backend/scripts/monitor-and-restart.sh >> /srv/helpDesk/backend/logs/cron.log 2>&1") | crontab -
```

### Змінити інтервал перевірки

#### Для systemd:
```bash
sudo nano /etc/systemd/system/helpdesk-monitor.timer

# Змініть OnUnitActiveSec на потрібний інтервал:
# OnUnitActiveSec=1min   # Кожну хвилину
# OnUnitActiveSec=5min   # Кожні 5 хвилин (за замовчуванням)
# OnUnitActiveSec=10min  # Кожні 10 хвилин

sudo systemctl daemon-reload
sudo systemctl restart helpdesk-monitor.timer
```

#### Для cron:
```bash
crontab -e

# Змініть перші значення:
*/1 * * * *   # Кожну хвилину
*/5 * * * *   # Кожні 5 хвилин (за замовчуванням)
*/10 * * * *  # Кожні 10 хвилин
```

## Troubleshooting

### Система не перезапускає автоматично

1. Перевірте чи працює timer:
   ```bash
   systemctl status helpdesk-monitor.timer
   systemctl list-timers | grep helpdesk
   ```

2. Перевірте логи:
   ```bash
   tail -f /srv/helpDesk/backend/logs/monitor.log
   ```

3. Запустіть вручну:
   ```bash
   bash /srv/helpDesk/backend/scripts/monitor-and-restart.sh
   ```

### Порти все ще зайняті

```bash
# Перевірте які процеси на порту
lsof -i :5000

# Вбийте вручну
bash /srv/helpDesk/backend/scripts/kill-port.sh 5000

# Або
fuser -k 5000/tcp
```

### PM2 wrapper не працює

```bash
# Перевірте права
ls -la /srv/helpDesk/backend/scripts/

# Дайте права
chmod +x /srv/helpDesk/backend/scripts/*.sh

# Запустіть напряму
bash /srv/helpDesk/backend/scripts/pm2-wrapper.sh restart
```

## Рекомендації

1. **Використовуйте PM2 wrapper** замість прямих команд PM2
2. **Перевіряйте логи** регулярно
3. **Тримайте інтервал 5 хвилин** - це оптимально
4. **Не вимикайте моніторинг** - він запобігає простою
5. **При deploy** - все робиться автоматично через webhook

## Відмінності від PM2 auto-restart

PM2 має власний `autorestart`, але він:
- ❌ Не очищає порти
- ❌ Не перевіряє API
- ❌ Не логує детально

Наша система моніторингу:
- ✅ Очищає zombie процеси
- ✅ Перевіряє здоров'я API
- ✅ Детальні логи
- ✅ Повністю автоматична

## Безпека

Система не має побічних ефектів:
- Працює тільки з процесами HelpDesk
- Не зачіпає інші сервіси
- Логує всі дії
- Можна відключити в будь-який момент
