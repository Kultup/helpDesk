# План діагностики та виправлення інтеграції Zabbix з Telegram ботом

## Опис проблеми

Потрібно перевірити чому сповіщення про алерти Zabbix не приходять в Telegram бота та виправити проблеми.

## Етапи діагностики та виправлення

### 1. Перевірка ініціалізації Telegram сервісу

**Файл:** `backend/services/telegramService.js`

**Проблема:** Можливо `isInitialized` не встановлюється правильно або бот не ініціалізується.

**Дії:**
- Перевірити чи встановлюється `this.isInitialized = true` після успішної ініціалізації
- Додати логування стану ініціалізації
- Перевірити чи викликається `telegramService.initialize()` в `app.js`

**Файли для зміни:**
- `backend/services/telegramService.js` - додати `this.isInitialized = true` в методі `initialize()`
- `backend/app.js` - перевірити виклик `telegramService.initialize()`

### 2. Перевірка методу sendNotification

**Файл:** `backend/services/telegramService.js` (рядок 1581)

**Проблема:** Метод `sendNotification` може не обробляти Markdown форматування правильно для Zabbix алертів.

**Дії:**
- Перевірити чи правильно форматується повідомлення з Markdown
- Додати обробку помилок форматування
- Переконатися що `parse_mode: 'Markdown'` встановлюється правильно

**Файли для зміни:**
- `backend/services/telegramService.js` - покращити метод `sendNotification` для підтримки Markdown

### 3. Перевірка отримання адміністраторів з Telegram ID

**Файл:** `backend/models/ZabbixAlertGroup.js` (метод `getAdminsWithTelegram`)

**Проблема:** Можливо адміністратори не мають `telegramId` або вони неактивні.

**Дії:**
- Додати логування кількості знайдених адміністраторів
- Перевірити чи правильно працює фільтр `telegramId: { $exists: true, $ne: null }`
- Додати перевірку на `isActive: true`

**Файли для зміни:**
- `backend/models/ZabbixAlertGroup.js` - покращити логування в методі `getAdminsWithTelegram`
- `backend/services/zabbixAlertService.js` - додати детальне логування при відправці сповіщень

### 4. Перевірка Zabbix конфігурації

**Файл:** `backend/models/ZabbixConfig.js`

**Проблема:** Можливо конфігурація не активна або не має валідного токену.

**Дії:**
- Перевірити чи `enabled: true` в конфігурації
- Перевірити чи є валідний `apiToken`
- Перевірити чи правильно працює метод `decryptToken()`

**Файли для зміни:**
- `backend/models/ZabbixConfig.js` - додати валідацію при отриманні активної конфігурації
- `backend/services/zabbixService.js` - покращити обробку помилок при ініціалізації

### 5. Перевірка cron job для опитування Zabbix

**Файл:** `backend/jobs/zabbixPolling.js`

**Проблема:** Можливо cron job не запускається або запускається з помилками.

**Дії:**
- Перевірити чи правильно налаштований cron pattern
- Додати детальне логування кожного кроку опитування
- Перевірити чи викликається `setupZabbixPolling()` в `app.js`

**Файли для зміни:**
- `backend/jobs/zabbixPolling.js` - додати детальне логування
- `backend/app.js` - перевірити виклик `setupZabbixPolling()`

### 6. Перевірка обробки нових алертів

**Файл:** `backend/services/zabbixAlertService.js` (метод `processNewAlerts`)

**Проблема:** Можливо нові алерти не знаходяться або не відправляються.

**Дії:**
- Додати логування кількості знайдених проблем
- Додати логування кількості критичних алертів
- Додати логування кількості нових алертів для сповіщень
- Додати логування результатів відправки сповіщень

**Файли для зміни:**
- `backend/services/zabbixAlertService.js` - додати детальне логування в `processNewAlerts` та `sendNotifications`

### 7. Додавання API endpoint для тестування

**Файл:** `backend/routes/zabbix.js`

**Дії:**
- Додати endpoint для ручного тестування відправки сповіщень
- Додати endpoint для перевірки стану інтеграції
- Додати endpoint для тестування підключення до Zabbix

**Файли для зміни:**
- `backend/routes/zabbix.js` - додати тестові endpoints
- `backend/controllers/zabbixController.js` - додати методи для тестування

### 8. Покращення обробки помилок

**Дії:**
- Додати try-catch блоки в критичних місцях
- Покращити повідомлення про помилки
- Додати fallback механізми

**Файли для зміни:**
- `backend/services/zabbixAlertService.js` - покращити обробку помилок
- `backend/services/zabbixService.js` - покращити обробку помилок
- `backend/services/telegramService.js` - покращити обробку помилок

## Конкретні виправлення

### Виправлення 1: Додати isInitialized в TelegramService

**Файл:** `backend/services/telegramService.js`

Додати властивість `isInitialized` в конструктор та встановлювати її в `true` після успішної ініціалізації.

### Виправлення 2: Покращити sendNotification для Markdown

**Файл:** `backend/services/telegramService.js`

Переконатися що Markdown форматування правильно обробляється, особливо для повідомлень з Zabbix.

### Виправлення 3: Додати детальне логування

**Файли:** 
- `backend/services/zabbixAlertService.js`
- `backend/services/zabbixService.js`
- `backend/jobs/zabbixPolling.js`

Додати логування на кожному етапі обробки алертів та відправки сповіщень.

### Виправлення 4: Додати перевірку стану інтеграції

**Файл:** `backend/routes/zabbix.js`

Додати endpoint `GET /api/zabbix/status` для перевірки стану інтеграції (чи увімкнена, чи ініціалізована, чи є адміністратори з Telegram ID).

## Тестування

1. Перевірити чи запускається cron job
2. Перевірити чи знаходяться проблеми в Zabbix
3. Перевірити чи знаходяться критичні алерти
4. Перевірити чи знаходяться адміністратори з Telegram ID
5. Перевірити чи відправляються сповіщення в Telegram
6. Перевірити логи на наявність помилок

## Очікуваний результат

Після виправлень сповіщення про критичні алерти Zabbix (High та Disaster) мають автоматично надходити в Telegram бота адміністраторам, які налаштовані в групах сповіщень.

