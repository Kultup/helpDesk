import 'package:flutter/material.dart';
import 'package:socket_io_client/socket_io_client.dart' as IO;
import '../config/app_config.dart';
import 'secure_storage.dart';
import 'notification_service.dart';
import 'firebase_messaging_service.dart';
import '../repositories/auth_repository.dart';
import '../utils/permissions.dart';

class SocketService {
  SocketService._internal();
  static final SocketService instance = SocketService._internal();

  IO.Socket? _socket;
  BuildContext? _context;
  AuthRepository? _authRepo;
  
  // Callbacks для оновлення UI
  Function(int)? onRegistrationCountUpdate;
  Function(Map<String, dynamic>)? onTicketNotification;
  Function(Map<String, dynamic>)? onRegistrationNotification;

  /// Встановлює контекст для показу сповіщень
  void setContext(BuildContext? context, AuthRepository? authRepo) {
    _context = context;
    _authRepo = authRepo;
  }

  Future<void> connect() async {
    final token = await SecureStorage.instance.readToken();
    final socketUrl = AppConfig.socketUrl;
    
    print('🔌 Socket connecting to: $socketUrl');
    
    _socket = IO.io(
      socketUrl,
      IO.OptionBuilder()
          .setTransports(['websocket'])
          .enableAutoConnect()
          .setExtraHeaders({
            if (token != null) 'Authorization': 'Bearer $token',
          })
          .build(),
    );

    _socket!.onConnect((_) {
      print('✅ Socket connected: ${_socket!.id}');
      
      // Перевіряємо, чи користувач адмін, і підключаємося до admin-room
      if (token != null && _authRepo != null) {
        if (Permissions.isAdmin(_authRepo!)) {
          print('👑 Joining admin-room');
          _socket!.emit('join-admin-room');
        }
        _socket!.emit('subscribe', {'type': 'user'});
      }
    });

    _socket!.onDisconnect((_) {
      print('❌ Socket disconnected');
    });

    _socket!.onError((error) {
      print('⚠️ Socket error: $error');
    });

    // Підписка на сповіщення про тікети
    _socket!.on('ticket-notification', (data) {
      print('🎫 Ticket notification received: $data');
      final notificationData = data as Map<String, dynamic>;
      
      // Викликаємо callback якщо встановлено
      if (onTicketNotification != null) {
        onTicketNotification!(notificationData);
      }
      
      // Показуємо системне сповіщення зі звуком (heads-up)
      final ticketData = notificationData['data'] as Map<String, dynamic>?;
      final type = notificationData['type'] as String?;
      
      String title = '🎫 Новий тікет';
      String body = 'Отримано новий тікет';
      
      if (ticketData != null) {
        final ticketTitle = ticketData['title'] as String? ?? 'Без назви';
        final ticketDescription = ticketData['description'] as String? ?? '';
        title = '🎫 Новий тікет: $ticketTitle';
        body = ticketDescription.isNotEmpty 
            ? ticketDescription 
            : 'Тікет створено';
      }
      
      // Показуємо системне сповіщення
      FirebaseMessagingService().showSystemNotification(
        title: title,
        body: body,
        data: {
          'type': type ?? 'ticket_created',
          'ticketId': ticketData?['_id']?.toString() ?? '',
          ...?ticketData,
        },
      );
      
      // Також показуємо SnackBar для швидкого доступу
      NotificationService.instance.showTicketNotification(_context, notificationData);
    });

    // Підписка на сповіщення про реєстрації
    _socket!.on('registration-notification', (data) {
      print('👤 Registration notification received: $data');
      try {
        final notificationData = data as Map<String, dynamic>;
        
        // Викликаємо callback якщо встановлено
        if (onRegistrationNotification != null) {
          onRegistrationNotification!(notificationData);
        }
        
        // Показуємо системне сповіщення зі звуком (heads-up)
        final registrationData = notificationData['data'] as Map<String, dynamic>?;
        final type = notificationData['type'] as String?;
        
        String title = '👤 Новий запит на реєстрацію';
        String body = 'Отримано новий запит на реєстрацію';
        
        if (registrationData != null) {
          final email = registrationData['email'] as String? ?? 'Невідомий email';
          final firstName = registrationData['firstName'] as String? ?? '';
          final lastName = registrationData['lastName'] as String? ?? '';
          if (firstName.isNotEmpty || lastName.isNotEmpty) {
            body = '$firstName $lastName ($email)';
          } else {
            body = email;
          }
        } else if (notificationData['message'] != null) {
          // Якщо дані в іншому форматі, використовуємо message
          body = notificationData['message'] as String;
        }
        
        print('📢 Showing system notification: $title - $body');
        
        // Показуємо системне сповіщення
        FirebaseMessagingService().showSystemNotification(
          title: title,
          body: body,
          data: {
            'type': type ?? 'registration_request',
            'userId': registrationData?['userId']?.toString() ?? 
                      registrationData?['_id']?.toString() ?? '',
            ...?registrationData,
          },
        );
        
        // Також показуємо SnackBar для швидкого доступу
        NotificationService.instance.showRegistrationNotification(_context, notificationData);
      } catch (e) {
        print('❌ Помилка обробки сповіщення про реєстрацію: $e');
        // Спробуємо показати базове сповіщення
        try {
          FirebaseMessagingService().showSystemNotification(
            title: '👤 Новий запит на реєстрацію',
            body: 'Отримано новий запит на реєстрацію',
            data: {'type': 'registration_request'},
          );
        } catch (e2) {
          print('❌ Помилка показу базового сповіщення: $e2');
        }
      }
    });

    // Підписка на оновлення кількості реєстрацій
    _socket!.on('registration-count-update', (data) {
      print('📊 Registration count update received: $data');
      final updateData = data as Map<String, dynamic>;
      
      // Отримуємо кількість з різних можливих форматів
      int? count;
      if (updateData['data'] is Map) {
        count = (updateData['data'] as Map)['count'] as int?;
      }
      count ??= updateData['count'] as int?;
      
      if (count != null) {
        // Викликаємо callback якщо встановлено
        if (onRegistrationCountUpdate != null) {
          onRegistrationCountUpdate!(count);
        }
      }
    });

    // Підписка на оновлення кількості тікетів
    _socket!.on('ticket-count-update', (data) {
      print('📊 Ticket count update received: $data');
      // Можна додати обробку оновлення кількості тікетів
    });

    // Старі події для сумісності
    _socket!.on('ticket:updated', (data) {
      print('Ticket updated: $data');
    });

    _socket!.on('ticket:created', (data) {
      print('Ticket created: $data');
    });

    _socket!.on('notification:new', (data) {
      print('New notification: $data');
    });
  }

  /// Перепідключення з оновленим контекстом
  Future<void> reconnect() async {
    await disconnect();
    await connect();
  }

  /// Відключення від сокету
  Future<void> disconnect() async {
    if (_socket != null) {
      _socket!.disconnect();
      _socket = null;
      print('🔌 Socket disconnected');
    }
  }

  IO.Socket? get socket => _socket;
}