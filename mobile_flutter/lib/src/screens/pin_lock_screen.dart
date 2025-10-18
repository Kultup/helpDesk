import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../services/secure_storage.dart';

class PinLockScreen extends StatefulWidget {
  final VoidCallback onUnlocked;
  const PinLockScreen({super.key, required this.onUnlocked});

  @override
  State<PinLockScreen> createState() => _PinLockScreenState();
}

class _PinLockScreenState extends State<PinLockScreen> {
  final TextEditingController _pinCtrl = TextEditingController();
  String? _expectedPin;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadPin();
  }

  Future<void> _loadPin() async {
    final pin = await SecureStorage.instance.readPinCode();
    if (!mounted) return;
    setState(() {
      _expectedPin = pin;
      _loading = false;
    });
  }

  @override
  void dispose() {
    _pinCtrl.dispose();
    super.dispose();
  }

  void _submit() {
    final entered = _pinCtrl.text.trim();
    final re = RegExp(r'^[0-9]{4}$');
    if (!re.hasMatch(entered)) {
      setState(() {
        _error = 'Пін-код має бути 4 цифри';
      });
      return;
    }
    if (entered == (_expectedPin ?? '')) {
      widget.onUnlocked();
    } else {
      setState(() {
        _error = 'Невірний пін-код';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return WillPopScope(
      onWillPop: () async => false,
      child: Scaffold(
        backgroundColor: AppTheme.backgroundColor,
        body: Center(
          child: _loading
              ? const CircularProgressIndicator()
              : Padding(
                  padding: const EdgeInsets.all(24),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 360),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.lock, size: 48, color: AppTheme.primaryColor),
                        const SizedBox(height: 12),
                        const Text(
                          'Захист PIN-кодом',
                          style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
                        ),
                        const SizedBox(height: 8),
                        TextField(
                          controller: _pinCtrl,
                          autofocus: true,
                          obscureText: true,
                          keyboardType: TextInputType.number,
                          maxLength: 4,
                          decoration: InputDecoration(
                            labelText: 'Введіть пін-код',
                            counterText: '',
                            errorText: _error,
                          ),
                          onChanged: (_) {
                            if (_error != null) setState(() => _error = null);
                          },
                        ),
                        const SizedBox(height: 8),
                        SizedBox(
                          width: double.infinity,
                          child: FilledButton(
                            onPressed: _submit,
                            child: const Text('Розблокувати'),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
        ),
      ),
    );
  }
}