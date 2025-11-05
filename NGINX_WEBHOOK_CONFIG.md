# Налаштування Nginx для Telegram Webhook

## Проблема
Telegram отримує 404 Not Found при зверненні до `/api/telegram/webhook` на сервері `https://krainamriy.fun`.

## Рішення

### 1. Перевірте конфігурацію Nginx

Переконайтеся, що в конфігурації Nginx (`/etc/nginx/sites-available/your-site.conf` або `/etc/nginx/nginx.conf`) правильно налаштовано проксування для `/api/telegram/webhook`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name krainamriy.fun www.krainamriy.fun;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name krainamriy.fun www.krainamriy.fun;

    # SSL certificates
    ssl_certificate /path/to/your/cert.pem;
    ssl_certificate_key /path/to/your/key.pem;

    # Root directory (if needed)
    root /var/www/html;
    index index.html;

    # Важливо: Проксування для Telegram webhook
    location /api/telegram/webhook {
        proxy_pass http://localhost:5000/api/telegram/webhook;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Важливо для Telegram webhook
        proxy_read_timeout 30s;
        proxy_connect_timeout 10s;
        proxy_send_timeout 30s;
        
        # Дозволяємо великі тіла запитів
        client_max_body_size 10M;
    }

    # Проксування для решти API
    location /api/ {
        proxy_pass http://localhost:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Статичні файли frontend
    location / {
        try_files $uri $uri/ /index.html;
        root /var/www/html;  # або ваш шлях до frontend
    }
}
```

### 2. Важливі моменти

1. **Порядок location блоків**: Більш специфічні location (наприклад, `/api/telegram/webhook`) повинні бути **ПЕРЕД** загальними (наприклад, `/api/`), інакше Nginx буде використовувати загальний блок.

2. **Proxy pass URL**: Переконайтеся, що порт в `proxy_pass` відповідає порту вашого Node.js сервера (за замовчуванням 5000).

3. **SSL сертифікати**: Telegram вимагає HTTPS для webhook, тому переконайтеся, що SSL сертифікати налаштовані правильно.

### 3. Перевірка конфігурації

Після зміни конфігурації Nginx:

```bash
# Перевірте синтаксис
sudo nginx -t

# Якщо все ОК, перезавантажте Nginx
sudo systemctl reload nginx
# або
sudo service nginx reload
```

### 4. Тестування webhook

Після налаштування Nginx, перевірте доступність webhook:

```bash
# Тестовий GET запит
curl https://krainamriy.fun/api/telegram/webhook

# Очікувана відповідь:
# {"success":true,"message":"Webhook endpoint доступний",...}
```

### 5. Перевірка логів

Якщо проблема залишається, перевірте логи:

```bash
# Логи Nginx
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log

# Логи Node.js сервера
# Перевірте логи вашого додатку
```

### 6. Альтернативне рішення

Якщо використовуєте PM2 або інший процес-менеджер, переконайтеся, що сервер працює на правильному порту:

```bash
# Перевірте, чи працює Node.js сервер
ps aux | grep node

# Перевірте, чи слухає порт 5000
sudo netstat -tlnp | grep 5000
# або
sudo ss -tlnp | grep 5000
```

### 7. Додаткова інформація

- Webhook URL має бути: `https://krainamriy.fun/api/telegram/webhook`
- Telegram вимагає, щоб webhook відповідав статусом 200 OK
- Webhook має обробляти POST запити з JSON тілом
- Webhook має відповідати швидко (не більше 5 секунд)

## Якщо проблема залишається

1. Перевірте, чи Node.js сервер працює і слухає правильний порт
2. Перевірте firewall налаштування
3. Перевірте, чи SSL сертифікат дійсний
4. Перевірте логи обох серверів (Nginx та Node.js)

