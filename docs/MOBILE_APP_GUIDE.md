# Мобільний застосунок Help Desk — Документація

## Огляд
- Мета: забезпечити смартфон-еквівалент веб-додатку Help Desk.
- Основні функції: авторизація, створення/перегляд/оновлення тикетів, коментарі, сповіщення, аналітика (для адмінів), швидкі поради.
- Підключення: мобільний клієнт працює з бекендом через `API_BASE_URL` та отримує події в реальному часі через Socket.IO (`WS_URL`).

## Архітектура
- Клієнт: React Native (TypeScript), React Navigation, Axios, Socket.IO Client.
- Сховище: `@react-native-async-storage/async-storage` для токенів та кешу.
- Данні: REST API (`/api/...`), реальний час через Socket.IO.
- Стейт: локальний стейт + опційно React Query для кешування/офлайн.

## Вимоги
- Node.js 16+, npm або yarn.
- Android SDK (Java 11), Xcode (для iOS).
- Бекенд доступний через HTTPS (`API_BASE_URL`), WebSocket-сумісний хост (`WS_URL`).

## Змінні середовища (мобільні)
Рекомендовано використовувати `react-native-config` або конфіг файл.
- `API_BASE_URL` — наприклад: `https://your-api-domain.com/api`.
- `WS_URL` — наприклад: `wss://your-api-domain.com` (або окремий сокет хост).
- `SOCKET_PATH` — за замовчуванням `/socket.io` (якщо змінено на сервері, вкажіть явно).

Альтернатива без `react-native-config`: створіть `src/config.ts`:
```
export const CONFIG = {
  API_BASE_URL: 'https://your-api-domain.com/api',
  WS_URL: 'wss://your-api-domain.com',
  SOCKET_PATH: '/socket.io',
};
```

## API інтеграція (Axios)
- Базовий клієнт з таймаутом, заголовками та інтерцепторами.
```
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CONFIG } from '../config';

export const api = axios.create({
  baseURL: CONFIG.API_BASE_URL,
  timeout: 12000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const status = error.response?.status;
    if (status === 401) {
      // тут можна ініціювати logout через глобальний стейт/навігацію
    }
    return Promise.reject(error);
  }
);
```

### Аутентифікація
- Логін: `POST /api/auth/login` (email/пароль) → отримати `accessToken` та, за потреби, `refreshToken`.
- Зберігання токенів: `AsyncStorage.setItem('token', accessToken)`.
- Перевірка сесії: `GET /api/auth/me`.

## Реальний час (Socket.IO)
Підключення з JWT та кімнатами (наприклад, кімнати користувача або тикетів).
```
import io from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CONFIG } from '../config';

export async function connectSocket() {
  const token = await AsyncStorage.getItem('token');
  const socket = io(CONFIG.WS_URL, {
    path: CONFIG.SOCKET_PATH,
    transports: ['websocket'],
    autoConnect: true,
    auth: token ? { token } : undefined,
  });

  socket.on('connect', () => console.log('Socket connected', socket.id));
  socket.on('disconnect', (r) => console.log('Socket disconnected', r));
  socket.on('notification:new', (payload) => {
    // показ сповіщення, оновлення списку подій
  });
  socket.on('ticket:updated', (ticket) => {
    // оновлення екрана деталізації або списку тикетів
  });

  return socket;
}
```

## Основні екрани
- Логін/Реєстрація.
- Список тикетів (фільтри, пошук, пагінація).
- Деталі тикета (статус, виконавець, коментарі, вкладення, історія).
- Створення тикета (категорія, опис, теги, файли).
- Коментарі (додавання/редагування/видалення).
- Сповіщення (реальний час + історія).
- Швидкі поради (категорії/пошук/перегляд).
- Аналітика (адмін): ключові метрики, фільтри.
- Профіль/Налаштування (мова, тема, сповіщення).

## Офлайн/кеш
- Кешування відповідей API (React Query або власний кеш у AsyncStorage).
- Черга відправки: зберігати запити для повторної відправки після відновлення мережі.
- Індикатор онлайн/офлайн на рівні додатку.

## Безпека
- Використовуйте `https`/`wss` (TLS).
- Не зберігайте чутливі дані у відкритому вигляді.
- Перевіряйте `CORS`/Socket.IO CORS на бекенді (`FRONTEND_URL`/`CORS_ORIGIN`).
- Актуальні JWT з коротким часом життя + refresh за потреби.

## Запуск (Dev)
```
# Встановлення залежностей
npm install

# iOS
npx pod-install ios
npm run ios

# Android
npm run android
```
- Налаштуйте `API_BASE_URL` та `WS_URL` у `src/config.ts` або через `react-native-config`.
- Переконайтеся, що бекенд доступний з телефона/емулятора (IP/домен, порти, TLS).

## Збірка (Release)
- Android: налаштування підпису, `gradlew assembleRelease`.
- iOS: архівація у Xcode, профілі підпису.
- Оточення: забезпечити правильні `API_BASE_URL`/`WS_URL` для прод.

## Тестування
- Модульні тести: Jest, React Native Testing Library.
- Інтеграційні: емулювання API через Mock Service Worker або ручні стаби.
- Перевірка продуктивності: довгі списки з FlatList/VirtualizedList.

## Траблшутінг
- 401/403: перевірити токен, ролі, інтерцептори.
- Не працює сокет: перевірити `WS_URL`, `SOCKET_PATH`, CORS на бекенді.
- Сертифікат: довірений TLS, однакові домени для API та сокета.
- Емулятор не бачить бекенд: використайте локальний IP машини, а не `localhost`.

## Сумісність з бекендом
- Базовий шлях — `/api` (Swagger: `backend/swagger.yaml`).
- CORS/Socket.IO налаштовані через змінні середовища (`FRONTEND_URL`, `CORS_ORIGIN`).
- Документація API: `API_DOCUMENTATION.md` та Swagger UI `/api/docs`.

## Швидкий старт
1. Налаштуйте `API_BASE_URL` та `WS_URL`.
2. Додайте інтерцептори Axios для токенів.
3. Реалізуйте логін та збереження токенів.
4. Підключіть Socket.IO та отримуйте сповіщення.
5. Зберіть екрани: Список/Деталі/Створення тикета, Коментарі, Сповіщення.
6. Додайте офлайн-кеш та чергу запитів.
7. Перевірте безпеку (TLS, ролі, CORS) і зберіть реліз.