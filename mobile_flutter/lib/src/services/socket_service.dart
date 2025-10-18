import 'package:socket_io_client/socket_io_client.dart' as IO;
import '../config/app_config.dart';
import 'secure_storage.dart';

class SocketService {
  SocketService._internal();
  static final SocketService instance = SocketService._internal();

  IO.Socket? _socket;

  Future<void> connect() async {
    final token = await SecureStorage.instance.readToken();
    _socket = IO.io(
      AppConfig.socketUrl,
      IO.OptionBuilder()
          .setTransports(['websocket'])
          .enableAutoConnect()
          .setExtraHeaders({
            if (token != null) 'Authorization': 'Bearer $token',
          })
          .build(),
    );

    _socket!.onConnect((_) {
      // TODO: subscribe to specific rooms if needed
    });

    _socket!.onDisconnect((_) {});
  }

  IO.Socket? get socket => _socket;
}