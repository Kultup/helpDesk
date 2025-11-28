import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'dart:typed_data';
import 'notification_service.dart';

/// Обробка сповіщень, коли додаток на передньому плані або закритий
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  
  if (kDebugMode) {
    print('📱 Background message received: ${message.messageId}');
    print('Title: ${message.notification?.title}');
    print('Body: ${message.notification?.body}');
    print('Data: ${message.data}');
  }
  
  // Показуємо локальне сповіщення зі звуком навіть коли додаток закритий
  final FlutterLocalNotificationsPlugin localNotifications = FlutterLocalNotificationsPlugin();
  
  // Ініціалізуємо локальні сповіщення якщо ще не ініціалізовано
  const AndroidInitializationSettings initializationSettingsAndroid =
      AndroidInitializationSettings('@mipmap/ic_launcher');
  const InitializationSettings initializationSettings = InitializationSettings(
    android: initializationSettingsAndroid,
  );
  await localNotifications.initialize(initializationSettings);
  
  // Створюємо notification channel зі звуком
  final AndroidNotificationChannel channel = AndroidNotificationChannel(
    'helDesKM_channel',
    'HelDesKM Notifications',
    description: 'Сповіщення від HelDesKM',
    importance: Importance.max, // Максимальна важливість для звуку навіть коли екран заблоковано
    playSound: true,
    enableVibration: true,
    vibrationPattern: Int64List.fromList([0, 250, 250, 250]),
    showBadge: true,
  );
  
  final androidImplementation = localNotifications
      .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
  
  if (androidImplementation != null) {
    await androidImplementation.createNotificationChannel(channel);
  }
  
  // Використовуємо BigTextStyle для розгортання сповіщень (як у Telegram)
  final String? bodyText = message.notification?.body;
  final BigTextStyleInformation bigTextStyle = BigTextStyleInformation(
    bodyText ?? '',
    htmlFormatBigText: false,
    contentTitle: message.notification?.title ?? 'HelDesKM',
    htmlFormatContentTitle: false,
    summaryText: '',
    htmlFormatSummaryText: false,
  );
  
  final AndroidNotificationDetails androidPlatformChannelSpecifics =
      AndroidNotificationDetails(
    'helDesKM_channel',
    'HelDesKM Notifications',
    channelDescription: 'Сповіщення від HelDesKM',
    importance: Importance.max, // Максимальна важливість для звуку та heads-up
    priority: Priority.max, // Максимальний пріоритет
    showWhen: true,
    playSound: true,
    enableVibration: true,
    vibrationPattern: Int64List.fromList([0, 250, 250, 250]),
    enableLights: true,
    ledColor: const Color.fromARGB(255, 255, 0, 0),
    ledOnMs: 1000, // Час увімкнення LED (мс)
    ledOffMs: 500, // Час вимкнення LED (мс)
    category: AndroidNotificationCategory.message,
    fullScreenIntent: false,
    styleInformation: bigTextStyle, // Додаємо BigTextStyle для розгортання
    icon: '@mipmap/ic_launcher', // Іконка додатку
    largeIcon: const DrawableResourceAndroidBitmap('@mipmap/ic_launcher'), // Велика іконка
    autoCancel: true, // Автоматично закривається при кліку
    ongoing: false, // Не постійне сповіщення
    ticker: message.notification?.title ?? 'HelDesKM', // Ticker для heads-up notification
    channelShowBadge: true, // Показувати бейдж
    setAsGroupSummary: false,
    groupKey: 'helDesKM_group', // Групування сповіщень
  );

  final NotificationDetails platformChannelSpecifics = NotificationDetails(
    android: androidPlatformChannelSpecifics,
  );

  // Формуємо payload з даними для навігації
  final payload = message.data.isNotEmpty 
      ? message.data.toString() 
      : 'type=${message.data['type'] ?? 'notification'}&ticketId=${message.data['ticketId'] ?? ''}';
  
  await localNotifications.show(
    message.hashCode,
    message.notification?.title ?? 'HelDesKM',
    message.notification?.body ?? '',
    platformChannelSpecifics,
    payload: payload,
  );
}

class FirebaseMessagingService {
  static final FirebaseMessagingService _instance = FirebaseMessagingService._internal();
  factory FirebaseMessagingService() => _instance;
  FirebaseMessagingService._internal();

  final FirebaseMessaging _firebaseMessaging = FirebaseMessaging.instance;
  final FlutterLocalNotificationsPlugin _localNotifications = FlutterLocalNotificationsPlugin();

  String? _fcmToken;
  String? get fcmToken => _fcmToken;
  
  BuildContext? _context;
  
  void setContext(BuildContext? context) {
    _context = context;
  }

  /// Ініціалізація Firebase Messaging
  Future<void> initialize() async {
    try {
      // Запитуємо дозвіл на сповіщення
      NotificationSettings settings = await _firebaseMessaging.requestPermission(
        alert: true,
        announcement: false,
        badge: true,
        carPlay: false,
        criticalAlert: false,
        provisional: false,
        sound: true,
      );

      if (kDebugMode) {
        print('📱 Notification permission status: ${settings.authorizationStatus}');
      }

      if (settings.authorizationStatus == AuthorizationStatus.authorized) {
        // Отримуємо FCM токен
        _fcmToken = await _firebaseMessaging.getToken();
        if (kDebugMode) {
          print('📱 FCM Token: $_fcmToken');
        }

        // Налаштовуємо обробники сповіщень
        _setupMessageHandlers();

        // Налаштовуємо локальні сповіщення
        await _initializeLocalNotifications();

        // Слухаємо зміни токену
        _firebaseMessaging.onTokenRefresh.listen((newToken) {
          _fcmToken = newToken;
          if (kDebugMode) {
            print('📱 FCM Token refreshed: $newToken');
          }
          // Тут можна відправити новий токен на сервер
        });
      } else {
        if (kDebugMode) {
          print('📱 Notification permission denied');
        }
      }
    } catch (e) {
      if (kDebugMode) {
        print('❌ Error initializing Firebase Messaging: $e');
      }
    }
  }

  /// Налаштування обробників сповіщень
  void _setupMessageHandlers() {
    // Обробка сповіщень, коли додаток на передньому плані
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      if (kDebugMode) {
        print('📱 Foreground message received: ${message.messageId}');
        print('Title: ${message.notification?.title}');
        print('Body: ${message.notification?.body}');
        print('Data: ${message.data}');
        print('Type: ${message.data['type']}');
      }

      // Показуємо локальне сповіщення
      _showLocalNotification(message).catchError((error) {
        if (kDebugMode) {
          print('❌ Помилка показу локального сповіщення: $error');
        }
      });
    });

    // Обробка кліку по сповіщенню, коли додаток був закритий
    FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
      if (kDebugMode) {
        print('📱 Notification opened app: ${message.messageId}');
        print('Data: ${message.data}');
      }
      _handleNotificationTap(message);
    });

    // Перевіряємо, чи додаток був відкритий через сповіщення
    _firebaseMessaging.getInitialMessage().then((RemoteMessage? message) {
      if (message != null) {
        if (kDebugMode) {
          print('📱 App opened from notification: ${message.messageId}');
        }
        _handleNotificationTap(message);
      }
    });
  }

  /// Ініціалізація локальних сповіщень
  Future<void> _initializeLocalNotifications() async {
    const AndroidInitializationSettings initializationSettingsAndroid =
        AndroidInitializationSettings('@mipmap/ic_launcher');

    const InitializationSettings initializationSettings = InitializationSettings(
      android: initializationSettingsAndroid,
    );

    await _localNotifications.initialize(
      initializationSettings,
      onDidReceiveNotificationResponse: (NotificationResponse response) {
        if (kDebugMode) {
          print('📱 Local notification tapped: ${response.payload}');
        }
        // Обробка кліку по локальному сповіщенню для навігації
        if (response.payload != null && _context != null && _context!.mounted) {
          try {
            // Парсимо дані з payload
            final payload = response.payload;
            if (payload != null && payload.isNotEmpty) {
              // Спробуємо знайти ticketId в payload
              if (payload.contains('ticketId')) {
                final navigator = Navigator.of(_context!);
                navigator.pushNamed('/tickets');
              } else if (payload.contains('registration')) {
                final navigator = Navigator.of(_context!);
                navigator.pushNamed('/users');
              }
            }
          } catch (e) {
            if (kDebugMode) {
              print('⚠️ Помилка обробки кліку по сповіщенню: $e');
            }
          }
        }
      },
    );
    
    // Створюємо notification channel зі звуком для Android
    await _createNotificationChannel();
  }
  
  /// Створення notification channel зі звуком
  Future<void> _createNotificationChannel() async {
    final AndroidNotificationChannel channel = AndroidNotificationChannel(
      'helDesKM_channel',
      'HelDesKM Notifications',
      description: 'Сповіщення від HelDesKM',
      importance: Importance.max, // Максимальна важливість для звуку навіть коли екран заблоковано
      playSound: true,
      enableVibration: true,
      vibrationPattern: Int64List.fromList([0, 250, 250, 250]),
      showBadge: true,
    );
    
    final androidImplementation = _localNotifications
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    
    if (androidImplementation != null) {
      await androidImplementation.createNotificationChannel(channel);
      if (kDebugMode) {
        print('✅ Notification channel створено зі звуком');
      }
    }
  }

  /// Показ системного сповіщення з даних (для Socket повідомлень)
  Future<void> showSystemNotification({
    required String title,
    required String body,
    Map<String, dynamic>? data,
  }) async {
    final BigTextStyleInformation bigTextStyle = BigTextStyleInformation(
      body,
      htmlFormatBigText: false,
      contentTitle: title,
      htmlFormatContentTitle: false,
      summaryText: '',
      htmlFormatSummaryText: false,
    );
    
    final AndroidNotificationDetails androidPlatformChannelSpecifics =
        AndroidNotificationDetails(
      'helDesKM_channel',
      'HelDesKM Notifications',
      channelDescription: 'Сповіщення від HelDesKM',
      importance: Importance.max, // Максимальна важливість для звуку та heads-up
      priority: Priority.max, // Максимальний пріоритет
      showWhen: true,
      playSound: true,
      enableVibration: true,
      vibrationPattern: Int64List.fromList([0, 250, 250, 250]),
      enableLights: true,
      ledColor: const Color.fromARGB(255, 255, 0, 0),
      ledOnMs: 1000, // Час увімкнення LED (мс)
      ledOffMs: 500, // Час вимкнення LED (мс)
      category: AndroidNotificationCategory.message,
      fullScreenIntent: false,
      styleInformation: bigTextStyle,
      icon: '@mipmap/ic_launcher',
      largeIcon: const DrawableResourceAndroidBitmap('@mipmap/ic_launcher'),
      autoCancel: true,
      ongoing: false,
      ticker: title,
      channelShowBadge: true,
      setAsGroupSummary: false,
      groupKey: 'helDesKM_group',
    );

    final NotificationDetails platformChannelSpecifics = NotificationDetails(
      android: androidPlatformChannelSpecifics,
    );

    final payload = data != null && data.isNotEmpty 
        ? data.toString() 
        : 'type=notification';

    await _localNotifications.show(
      title.hashCode,
      title,
      body,
      platformChannelSpecifics,
      payload: payload,
    );
  }

  /// Показ локального сповіщення
  Future<void> _showLocalNotification(RemoteMessage message) async {
      // Використовуємо BigTextStyle для розгортання сповіщень (як у Telegram)
      final String? bodyText = message.notification?.body;
      final BigTextStyleInformation bigTextStyle = BigTextStyleInformation(
        bodyText ?? '',
        htmlFormatBigText: false,
        contentTitle: message.notification?.title ?? 'HelDesKM',
        htmlFormatContentTitle: false,
        summaryText: '',
        htmlFormatSummaryText: false,
      );
      
      final AndroidNotificationDetails androidPlatformChannelSpecifics =
        AndroidNotificationDetails(
      'helDesKM_channel',
      'HelDesKM Notifications',
      channelDescription: 'Сповіщення від HelDesKM',
      importance: Importance.max, // Максимальна важливість для звуку та heads-up
      priority: Priority.max, // Максимальний пріоритет
      showWhen: true,
      playSound: true,
      enableVibration: true,
      vibrationPattern: Int64List.fromList([0, 250, 250, 250]),
      enableLights: true,
      ledColor: const Color.fromARGB(255, 255, 0, 0),
      ledOnMs: 1000, // Час увімкнення LED (мс)
      ledOffMs: 500, // Час вимкнення LED (мс)
      category: AndroidNotificationCategory.message,
      fullScreenIntent: false,
      styleInformation: bigTextStyle, // Додаємо BigTextStyle для розгортання
      icon: '@mipmap/ic_launcher', // Іконка додатку
      largeIcon: const DrawableResourceAndroidBitmap('@mipmap/ic_launcher'), // Велика іконка
      autoCancel: true, // Автоматично закривається при кліку
      ongoing: false, // Не постійне сповіщення
      ticker: message.notification?.title ?? 'HelDesKM', // Ticker для heads-up notification
      channelShowBadge: true, // Показувати бейдж
      setAsGroupSummary: false,
      groupKey: 'helDesKM_group', // Групування сповіщень
    );

    final NotificationDetails platformChannelSpecifics = NotificationDetails(
      android: androidPlatformChannelSpecifics,
    );

    // Формуємо payload з даними для навігації
    final payload = message.data.isNotEmpty 
        ? message.data.toString() 
        : 'type=${message.data['type'] ?? 'notification'}&ticketId=${message.data['ticketId'] ?? ''}';
    
    await _localNotifications.show(
      message.hashCode,
      message.notification?.title ?? 'HelDesKM',
      message.notification?.body ?? '',
      platformChannelSpecifics,
      payload: payload,
    );
  }

  /// Обробка кліку по сповіщенню
  void _handleNotificationTap(RemoteMessage message) {
    if (kDebugMode) {
      print('📱 Notification tapped: ${message.data}');
    }
    
    final data = message.data;
    final type = data['type'] as String?;
    
    if (_context == null || !_context!.mounted) {
      if (kDebugMode) {
        print('⚠️ Context not available for navigation');
      }
      return;
    }
    
    final navigator = Navigator.of(_context!);
    
    // Обробка різних типів сповіщень
    if (type == 'ticket_created' || 
        type == 'ticket_updated' || 
        type == 'ticket_assigned' || 
        type == 'ticket_status_changed' ||
        type == 'ticket_comment') {
      final ticketId = data['ticketId'] as String?;
      if (ticketId != null) {
        navigator.pushNamed(
          '/ticket-details',
          arguments: {'id': ticketId},
        );
      } else {
        navigator.pushNamed('/tickets');
      }
    } else if (type == 'registration_request') {
      navigator.pushNamed('/users');
    } else {
      // Загальне сповіщення - показуємо через NotificationService
      NotificationService.instance.showNotification(
        _context,
        message.notification?.title ?? 'HelDesKM',
        message.notification?.body ?? '',
      );
    }
  }
  
  /// Отримати дані сповіщення для навігації
  Map<String, dynamic>? getNotificationData(RemoteMessage message) {
    return message.data;
  }

  /// Підписка на тему
  Future<void> subscribeToTopic(String topic) async {
    try {
      await _firebaseMessaging.subscribeToTopic(topic);
      if (kDebugMode) {
        print('📱 Subscribed to topic: $topic');
      }
    } catch (e) {
      if (kDebugMode) {
        print('❌ Error subscribing to topic: $e');
      }
    }
  }

  /// Відписка від теми
  Future<void> unsubscribeFromTopic(String topic) async {
    try {
      await _firebaseMessaging.unsubscribeFromTopic(topic);
      if (kDebugMode) {
        print('📱 Unsubscribed from topic: $topic');
      }
    } catch (e) {
      if (kDebugMode) {
        print('❌ Error unsubscribing from topic: $e');
      }
    }
  }
}

