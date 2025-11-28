import 'package:flutter/foundation.dart';
import 'package:dio/dio.dart';

import '../services/api_client.dart';
import '../services/secure_storage.dart';
import '../services/device_info_service.dart';
import '../services/socket_service.dart';
import '../services/firebase_messaging_service.dart';

class AuthRepository extends ChangeNotifier {
  bool _loading = false;
  String? _error;
  Map<String, dynamic>? _user;
  bool _isAuthenticated = false;

  bool get loading => _loading;
  String? get error => _error;
  Map<String, dynamic>? get user => _user;
  bool get isAuthenticated => _isAuthenticated;

  AuthRepository() {
    ApiClient.instance.init();
    _checkAuthStatus();
  }

  Future<void> _checkAuthStatus() async {
    final token = await SecureStorage.instance.readToken();
    if (token != null) {
      _isAuthenticated = true;
      
      // Спочатку намагаємося завантажити інформацію про користувача з SecureStorage
      // (яка була збережена після логіну)
      final savedUser = await SecureStorage.instance.readUser();
      if (savedUser != null) {
        _user = savedUser;
        notifyListeners();
      } else {
        // Якщо немає збережених даних, завантажуємо з API
        await _loadUserInfo();
      }
    }
  }

  Future<void> _loadUserInfo() async {
    try {
      final Response res = await ApiClient.instance.dio.get('/auth/me');
      final data = res.data as Map<String, dynamic>;
      final userData = data['data'] as Map<String, dynamic>?;
      if (userData != null) {
        _user = userData;
        // Зберігаємо інформацію про користувача для подальшого використання
        await SecureStorage.instance.writeUser(userData);
      }
    } catch (e) {
      if (kDebugMode) {
        print('⚠️ Failed to load user info: $e');
      }
      // Якщо не вдалося завантажити, залишаємо _user = null
    }
  }

  Future<void> checkAuthStatus() async {
    await _checkAuthStatus();
  }

  // Публічний метод для завантаження інформації про користувача
  Future<void> loadUserInfo() async {
    await _loadUserInfo();
    notifyListeners();
  }

  Future<bool> login(String login, String password, {bool rememberMe = false}) async {
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      // Отримуємо FCM токен
      final fcmToken = FirebaseMessagingService().fcmToken;
      final device = await DeviceInfoService.getDevicePayload(fcmToken: fcmToken);
      final Response res = await ApiClient.instance.dio.post('/auth/login', data: {
        'login': login,
        'password': password,
        'device': device,
      });
      final data = res.data as Map<String, dynamic>;
      
      // Backend повертає структуру: { success: true, data: { token: "...", user: {...} } }
      final responseData = data['data'] as Map<String, dynamic>?;
      if (responseData == null) {
        throw Exception('Invalid auth response: data missing');
      }
      
      final token = responseData['token'] as String?;
      final user = responseData['user'] as Map<String, dynamic>?;
      if (token == null) {
        throw Exception('Invalid auth response: token missing');
      }
      
      await SecureStorage.instance.writeToken(token);
      
      // Зберігаємо інформацію про користувача (включно з роллю) для перевірки прав
      if (user != null) {
        await SecureStorage.instance.writeUser(user);
      }
      
      // Зберігаємо облікові дані якщо користувач вибрав "Запам'ятати мене"
      if (rememberMe) {
        await SecureStorage.instance.writeCredentials(login, password);
        await SecureStorage.instance.writeRememberMe(true);
      } else {
        await SecureStorage.instance.clearCredentials();
      }
      
      _user = user;
      _isAuthenticated = true;
      _loading = false;
      notifyListeners();
      
      // Підключаємо Socket.IO після успішного входу
      try {
        // Встановлюємо authRepo для SocketService
        SocketService.instance.setContext(null, this);
        await SocketService.instance.connect();
      } catch (e) {
        if (kDebugMode) {
          print('Failed to connect socket: $e');
        }
      }
      
      return true;
    } catch (e) {
      if (e is DioException) {
        final status = e.response?.statusCode;
        final backendMessage = (e.response?.data is Map<String, dynamic>)
            ? (e.response?.data['message'] as String?)
            : null;
        // Узагальнене дружнє повідомлення
        String message = backendMessage ?? e.message ?? 'Помилка авторизації';
        if (e.type == DioExceptionType.connectionError || e.type == DioExceptionType.connectionTimeout) {
          message = 'Немає з’єднання з сервером. Перевірте мережу і API_BASE_URL.';
        } else if (status == 401) {
          message = backendMessage ?? 'Невірні облікові дані.';
        } else if (status == 404) {
          message = 'Маршрут /auth/login не знайдено. Перевірте базовий URL.';
        }
        _error = message;
      } else {
        _error = e.toString();
      }
      _loading = false;
      notifyListeners();
      return false;
    }
  }

  Future<bool> register({
    required String email,
    required String password,
    required String firstName,
    required String lastName,
    required String position,
    required String department,
    required String city,
    String? phone,
    String? telegramId,
    String? institution,
  }) async {
    _loading = true;
    _error = null;
    notifyListeners();
    
    try {
      final requestData = <String, dynamic>{
        'email': email.toLowerCase().trim(),
        'password': password,
        'firstName': firstName.trim(),
        'lastName': lastName.trim(),
        'position': position,
        'department': department.trim(),
        'city': city,
        if (phone != null && phone.isNotEmpty) 'phone': phone.trim(),
        if (telegramId != null && telegramId.isNotEmpty) 'telegramId': telegramId.trim(),
        if (institution != null && institution.isNotEmpty) 'institution': institution,
      };
      
      if (kDebugMode) {
        print('📝 Register request data: $requestData');
        print('📝 Institution value: $institution');
      }
      
      final Response res = await ApiClient.instance.dio.post('/auth/register', data: requestData);
      
      final data = res.data as Map<String, dynamic>;
      
      if (data['success'] == true) {
        _loading = false;
        _error = null;
        notifyListeners();
        return true;
      } else {
        _error = data['message'] ?? 'Помилка реєстрації';
        _loading = false;
        notifyListeners();
        return false;
      }
    } catch (e) {
      if (e is DioException) {
        final status = e.response?.statusCode;
        final backendMessage = (e.response?.data is Map<String, dynamic>)
            ? (e.response?.data['message'] as String?)
            : null;
        String message = backendMessage ?? e.message ?? 'Помилка реєстрації';
        if (e.type == DioExceptionType.connectionError || e.type == DioExceptionType.connectionTimeout) {
          message = 'Немає з\'єднання з сервером. Перевірте мережу.';
        } else if (status == 400) {
          message = backendMessage ?? 'Невірні дані для реєстрації.';
        } else if (status == 409) {
          message = backendMessage ?? 'Користувач з таким email вже існує.';
        }
        _error = message;
      } else {
        _error = e.toString();
      }
      _loading = false;
      notifyListeners();
      return false;
    }
  }

  Future<bool> tryAutoLogin() async {
    final token = await SecureStorage.instance.readToken();
    if (token == null) return false;

    final rememberMe = await SecureStorage.instance.readRememberMe();
    if (!rememberMe) return false;

    final credentials = await SecureStorage.instance.readCredentials();
    final savedLogin = credentials['login'];
    final password = credentials['password'];

    if (savedLogin != null && password != null) {
      return await login(savedLogin, password, rememberMe: true);
    }

    // Якщо є токен але немає збережених облікових даних, завантажуємо інформацію про користувача
    _isAuthenticated = true;
    
    // Спочатку намагаємося завантажити з SecureStorage
    final savedUser = await SecureStorage.instance.readUser();
    if (savedUser != null) {
      _user = savedUser;
    } else {
      // Якщо немає збережених даних, завантажуємо з API
      await _loadUserInfo();
    }
    
    notifyListeners();
    return true;
  }

  Future<Map<String, String?>> getSavedCredentials() async {
    return await SecureStorage.instance.readCredentials();
  }

  Future<bool> getRememberMeStatus() async {
    return await SecureStorage.instance.readRememberMe();
  }

  Future<void> logout() async {
    // Відключаємо Socket.IO перед виходом
    try {
      SocketService.instance.socket?.disconnect();
    } catch (e) {
      if (kDebugMode) {
        print('Failed to disconnect socket: $e');
      }
    }
    
    await SecureStorage.instance.clear();
    await SecureStorage.instance.clearUser(); // Видаляємо інформацію про користувача
    _user = null;
    _isAuthenticated = false;
    notifyListeners();
  }
}