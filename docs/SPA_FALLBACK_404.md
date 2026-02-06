# Усунення 404 для сторінок додатку (наприклад Налаштування AI)

## Проблема

При прямому відкритті посилання типу `https://helpdesk.krainamriy.fun/admin/settings/ai` з’являється **404 Сторінка не знайдена**, хоча ви маєте права адміністратора.

Це через те, що фронтенд — це односторінковий додаток (SPA). Усі маршрути (`/admin/settings/ai`, `/tickets`, тощо) має обробляти один і той самий файл `index.html`; потім React Router показує потрібну сторінку. Якщо веб-сервер намагається знайти файл за шляхом `/admin/settings/ai`, він його не знаходить і повертає 404.

## Рішення

Потрібно налаштувати сервер так, щоб для **будь-якого** шляху, який не є реальним файлом, повертався `index.html` (SPA fallback).

### Якщо фронтенд віддає Nginx

Додайте або змініть `location` для вашого домену:

```nginx
server {
    server_name helpdesk.krainamriy.fun;
    root /шлях/до/збірки/фронтенду;   # наприклад /srv/helpDesk/frontend/build

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://127.0.0.1:5000;   # бекенд
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Важливо: саме **`try_files $uri $uri/ /index.html;`** змушує для маршрутів на кшталт `/admin/settings/ai` повертати `index.html`, а не 404.

### Якщо фронтенд запускається через `npm start` (dev-сервер)

Переконайтесь, що в конфігурації (наприклад webpack) увімкнено **historyApiFallback**: для невідомих шляхів має віддаватися `index.html`. У багатьох шаблонах це вже є за замовчуванням.

### Після змін

1. Перезавантажте Nginx: `sudo nginx -t && sudo systemctl reload nginx`
2. Відкрийте в браузері: `https://helpdesk.krainamriy.fun/admin/settings/ai`

Після цього сторінка «Налаштування AI» має відкриватися, і ви зможете налаштувати AI-асистента (Groq/OpenAI та увімкнути першу лінію).
