# Налаштування Firebase для FCM сповіщень

## Отримання Service Account Key з Firebase Console

1. Перейдіть на [Firebase Console](https://console.firebase.google.com/)
2. Виберіть проект `heldeskm`
3. Перейдіть в **Project Settings** (⚙️ іконка біля назви проекту)
4. Вкладка **Service accounts**
5. Натисніть **Generate new private key**
6. Підтвердіть генерацію - файл JSON завантажиться автоматично

## Створення файлу на сервері

### Варіант 1: Через SSH та редактор

```bash
# Створіть директорію
mkdir -p /path/to/backend/.firebase

# Створіть файл
nano /path/to/backend/.firebase/heldeskm-service-account.json

# Вставте вміст завантаженого JSON файлу
# Збережіть (Ctrl+O, Enter, Ctrl+X)
```

### Варіант 2: Через SCP (з локального комп'ютера)

```bash
# З вашого локального комп'ютера
scp heldeskm-service-account.json user@server:/path/to/backend/.firebase/
```

### Варіант 3: Через змінну середовища

Якщо не хочете зберігати файл на сервері, можете використати змінну середовища:

```bash
# Встановіть змінну середовища з шляхом до файлу
export FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/heldeskm-service-account.json

# Або додайте в .env файл
echo "FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/heldeskm-service-account.json" >> .env
```

### Варіант 4: Через PM2 ecosystem (якщо використовуєте PM2)

Додайте в `ecosystem.config.js`:

```javascript
env: {
  FIREBASE_SERVICE_ACCOUNT_PATH: '/path/to/backend/.firebase/heldeskm-service-account.json'
}
```

## Перевірка прав доступу

Переконайтеся, що файл має правильні права доступу:

```bash
# Встановіть права тільки для власника
chmod 600 /path/to/backend/.firebase/heldeskm-service-account.json

# Перевірте власника
chown your-user:your-group /path/to/backend/.firebase/heldeskm-service-account.json
```

## Перевірка налаштування

Після створення файлу перезапустіть бекенд і перевірте логи:

```bash
# Перезапустіть сервер
pm2 restart helpdesk-backend

# Перевірте логи
pm2 logs helpdesk-backend | grep -i firebase
```

Має з'явитися повідомлення:
```
✅ Firebase Admin SDK ініціалізовано для FCM
```

## Структура файлу

Service account key має таку структуру:

```json
{
  "type": "service_account",
  "project_id": "heldeskm",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-...@heldeskm.iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "...",
  "universe_domain": "googleapis.com"
}
```

## Безпека

⚠️ **ВАЖЛИВО**: Service account key - це секретний файл!

- Ніколи не комітьте його в Git (вже додано в `.gitignore`)
- Не діліться ним публічно
- Використовуйте мінімальні права доступу (chmod 600)
- Якщо ключ скомпрометовано, негайно видаліть його в Firebase Console та створіть новий

