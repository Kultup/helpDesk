import 'dart:io' show Platform;
import 'dart:math';

import 'package:device_info_plus/device_info_plus.dart';
import 'package:package_info_plus/package_info_plus.dart';

import 'secure_storage.dart';

class DeviceInfoService {
  DeviceInfoService._();

  static Future<Map<String, dynamic>> getDevicePayload({String? fcmToken}) async {
    final package = await PackageInfo.fromPlatform();
    final appVersion = '${package.version}+${package.buildNumber}';

    String platform = 'unknown';
    String? manufacturer;
    String? model;
    String? osVersion;
    int? sdkInt;

    final plugin = DeviceInfoPlugin();

    if (Platform.isAndroid) {
      final info = await plugin.androidInfo;
      platform = 'android';
      manufacturer = info.manufacturer;
      model = info.model;
      osVersion = info.version.release;
      sdkInt = info.version.sdkInt;
    } else if (Platform.isIOS) {
      final info = await plugin.iosInfo;
      platform = 'ios';
      manufacturer = 'Apple';
      model = info.model;
      osVersion = info.systemVersion;
      sdkInt = null;
    }

    // Prefer a persisted deviceId; generate once if absent.
    String? deviceId = await SecureStorage.instance.readDeviceId();
    if (deviceId == null || deviceId.isEmpty) {
      deviceId = _generatePseudoId(platform: platform, model: model, manufacturer: manufacturer);
      await SecureStorage.instance.writeDeviceId(deviceId);
    }

    return {
      'deviceId': deviceId,
      'platform': platform,
      'manufacturer': manufacturer,
      'model': model,
      'osVersion': osVersion,
      'sdkInt': sdkInt,
      'appVersion': appVersion,
      'pushToken': fcmToken,
      'label': null,
    };
  }

  static String _generatePseudoId({String? platform, String? model, String? manufacturer}) {
    final rand = Random();
    final stamp = DateTime.now().millisecondsSinceEpoch;
    final core = '${platform ?? 'na'}-${manufacturer ?? 'na'}-${model ?? 'na'}-$stamp-${rand.nextInt(1 << 32)}';
    // Simple hex hash
    int hash = 0;
    for (var i = 0; i < core.length; i++) {
      hash = 0x1fffffff & (hash + core.codeUnitAt(i));
      hash = 0x1fffffff & (hash + ((0x0007ffff & hash) << 10));
      hash ^= (hash >> 6);
    }
    hash = 0x1fffffff & (hash + ((0x03ffffff & hash) << 3));
    hash ^= (hash >> 11);
    hash = 0x1fffffff & (hash + ((0x00003fff & hash) << 15));
    return hash.toRadixString(16);
  }
}