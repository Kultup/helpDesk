import 'dart:io';
import 'package:device_info_plus/device_info_plus.dart';

class AppConfig {
  static String? _apiBaseUrl;
  static String? _socketUrl;
  static bool _isConfigured = false;

  static String get apiBaseUrl {
    if (!_isConfigured) {
      throw StateError('AppConfig not configured. Call ensureConfigured() first.');
    }
    return _apiBaseUrl!;
  }

  static String get socketUrl {
    if (!_isConfigured) {
      throw StateError('AppConfig not configured. Call ensureConfigured() first.');
    }
    return _socketUrl!;
  }

  static Future<void> ensureConfigured() async {
    if (_isConfigured) return; // Prevent double initialization

    // Read from dart-define or fallbacks
    const api = String.fromEnvironment('API_BASE_URL');
    const socket = String.fromEnvironment('SOCKET_URL');

    _apiBaseUrl = api.isNotEmpty ? api : 'http://127.0.0.1:5000/api';
    _socketUrl = socket.isNotEmpty ? socket : 'http://127.0.0.1:5000';

    // On Android emulator, translate localhost to 10.0.2.2
    if (Platform.isAndroid) {
      final deviceInfo = DeviceInfoPlugin();
      final androidInfo = await deviceInfo.androidInfo;
      final isEmulator = !(androidInfo.isPhysicalDevice ?? true);
      if (isEmulator) {
        _apiBaseUrl = _apiBaseUrl!
            .replaceAll('localhost', '10.0.2.2')
            .replaceAll('127.0.0.1', '10.0.2.2');
        _socketUrl = _socketUrl!
            .replaceAll('localhost', '10.0.2.2')
            .replaceAll('127.0.0.1', '10.0.2.2');
      }
    }

    _isConfigured = true;
  }
}