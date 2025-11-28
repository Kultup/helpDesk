import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'notification_service.dart';

/// Обробка сповіщень, коли додаток на передньому плані
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  if (kDebugMode) {
    print('📱 Background message received: ${message.messageId}');
    print('Title: ${message.notification?.title}');
    print('Body: ${message.notification?.body}');
    print('Data: ${message.data}');
  }
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
      }

      // Показуємо локальне сповіщення
      _showLocalNotification(message);
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
      },
    );
  }

  /// Показ локального сповіщення
  Future<void> _showLocalNotification(RemoteMessage message) async {
    const AndroidNotificationDetails androidPlatformChannelSpecifics =
        AndroidNotificationDetails(
      'helDesKM_channel',
      'HelDesKM Notifications',
      channelDescription: 'Сповіщення від HelDesKM',
      importance: Importance.high,
      priority: Priority.high,
      showWhen: true,
    );

    const NotificationDetails platformChannelSpecifics = NotificationDetails(
      android: androidPlatformChannelSpecifics,
    );

    await _localNotifications.show(
      message.hashCode,
      message.notification?.title ?? 'HelDesKM',
      message.notification?.body ?? '',
      platformChannelSpecifics,
      payload: message.data.toString(),
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

