# HelpDesk Mobile (Flutter)

Мінімальний старт мобільного застосунку на Flutter, який підключається до вашого бекенду HelpDesk.

## Встановлення

1. Встановіть Flutter SDK (3.3+).
2. Перейдіть у папку `mobile_flutter` і виконайте:

```
flutter pub get
```

## Запуск (з параметрами середовища)

Потрібно передати базову адресу API та Socket:

```
flutter run \
  --dart-define=API_BASE_URL=https://api.example.com/api \
  --dart-define=SOCKET_URL=https://api.example.com
```

- Для Android емулятора `localhost` автоматично заміниться на `10.0.2.2`.
- Для iOS симулятора `localhost` працює напряму.

## Структура

- `lib/main.dart` — точка входу, навігація на Login/Tickets.
- `lib/src/config/app_config.dart` — читання `dart-define`, переклад localhost для Android.
- `lib/src/services/api_client.dart` — `Dio` з JWT у `Authorization`.
- `lib/src/services/secure_storage.dart` — зберігання токена.
- `lib/src/repositories/auth_repository.dart` — логін, збереження токена.
- `lib/src/services/socket_service.dart` — Socket.IO з хедером `Authorization`.
- `lib/src/screens/login_screen.dart` — екран входу.
- `lib/src/screens/tickets_list_screen.dart` — список тікетів.

## Узгодження з бекендом

- Логін: `POST /api/auth/login` повертає `{ token, user }`.
- Список тікетів: `GET /api/tickets` повертає `{ success, data: [], pagination }`.
- JWT передається як `Authorization: Bearer <token>`.

## Далі

- Додати екран деталей тікета, створення/коментарі.
- Підписка на Socket.IO події для оновлень у реальному часі.
- Кеш/офлайн, помилки, локалізація.