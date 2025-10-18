import 'package:flutter/foundation.dart';
import 'package:dio/dio.dart';

import '../services/api_client.dart';
import '../services/secure_storage.dart';
import '../services/device_info_service.dart';

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
      // Тут можна додати перевірку валідності токена
      notifyListeners();
    }
  }

  Future<void> checkAuthStatus() async {
    await _checkAuthStatus();
  }

  Future<bool> login(String email, String password, {bool rememberMe = false}) async {
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      final device = await DeviceInfoService.getDevicePayload();
      final Response res = await ApiClient.instance.dio.post('/auth/login', data: {
        'email': email,
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
      
      // Зберігаємо облікові дані якщо користувач вибрав "Запам'ятати мене"
      if (rememberMe) {
        await SecureStorage.instance.writeCredentials(email, password);
        await SecureStorage.instance.writeRememberMe(true);
      } else {
        await SecureStorage.instance.clearCredentials();
      }
      
      _user = user;
      _isAuthenticated = true;
      _loading = false;
      notifyListeners();
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

  Future<bool> tryAutoLogin() async {
    final token = await SecureStorage.instance.readToken();
    if (token == null) return false;

    final rememberMe = await SecureStorage.instance.readRememberMe();
    if (!rememberMe) return false;

    final credentials = await SecureStorage.instance.readCredentials();
    final email = credentials['email'];
    final password = credentials['password'];

    if (email != null && password != null) {
      return await login(email, password, rememberMe: true);
    }

    // Якщо є токен але немає збережених облікових даних, просто встановлюємо статус
    _isAuthenticated = true;
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
    await SecureStorage.instance.clear();
    _user = null;
    _isAuthenticated = false;
    notifyListeners();
  }
}