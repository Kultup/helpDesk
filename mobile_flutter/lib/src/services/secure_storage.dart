import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SecureStorage {
  SecureStorage._internal();
  static final SecureStorage instance = SecureStorage._internal();

  final _storage = const FlutterSecureStorage();

  Future<void> writeToken(String token) async {
    await _storage.write(key: 'jwt_token', value: token);
  }

  Future<String?> readToken() async {
    return await _storage.read(key: 'jwt_token');
  }

  // New: persist a stable device identifier per install
  Future<void> writeDeviceId(String id) async {
    await _storage.write(key: 'device_id', value: id);
  }

  Future<String?> readDeviceId() async {
    return await _storage.read(key: 'device_id');
  }

  Future<void> writeCredentials(String email, String password) async {
    await _storage.write(key: 'saved_email', value: email);
    await _storage.write(key: 'saved_password', value: password);
  }

  Future<Map<String, String?>> readCredentials() async {
    final email = await _storage.read(key: 'saved_email');
    final password = await _storage.read(key: 'saved_password');
    return {'email': email, 'password': password};
  }

  Future<void> writeRememberMe(bool remember) async {
    await _storage.write(key: 'remember_me', value: remember.toString());
  }

  Future<bool> readRememberMe() async {
    final value = await _storage.read(key: 'remember_me');
    return value == 'true';
  }

  // --- PIN code storage ---
  Future<void> writePinCode(String pin) async {
    await _storage.write(key: 'pin_code', value: pin);
  }

  Future<String?> readPinCode() async {
    return await _storage.read(key: 'pin_code');
  }

  Future<void> writePinEnabled(bool enabled) async {
    await _storage.write(key: 'pin_enabled', value: enabled.toString());
  }

  Future<bool> readPinEnabled() async {
    final value = await _storage.read(key: 'pin_enabled');
    return value == 'true';
  }

  Future<void> clearPin() async {
    await _storage.delete(key: 'pin_code');
    await _storage.delete(key: 'pin_enabled');
  }

  Future<void> clearCredentials() async {
    await _storage.delete(key: 'saved_email');
    await _storage.delete(key: 'saved_password');
    await _storage.delete(key: 'remember_me');
  }

  Future<void> clear() async {
    await _storage.deleteAll();
  }
}