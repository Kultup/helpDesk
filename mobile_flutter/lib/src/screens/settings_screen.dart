import 'package:flutter/material.dart';
import '../widgets/main_layout.dart';
import '../theme/app_theme.dart';
import '../services/secure_storage.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool _pinEnabled = false;
  bool _hasPin = false;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadPinSettings();
  }

  Future<void> _loadPinSettings() async {
    final enabled = await SecureStorage.instance.readPinEnabled();
    final pin = await SecureStorage.instance.readPinCode();
    if (!mounted) return;
    setState(() {
      _pinEnabled = enabled;
      _hasPin = (pin != null && pin.isNotEmpty);
      _loading = false;
    });
  }

  Future<void> _togglePin(bool value) async {
    if (value) {
      // enabling
      if (!_hasPin) {
        final ok = await _showSetPinDialog();
        if (!ok) return;
      }
      await SecureStorage.instance.writePinEnabled(true);
      if (!mounted) return;
      setState(() {
        _pinEnabled = true;
        _hasPin = true;
      });
    } else {
      await SecureStorage.instance.writePinEnabled(false);
      if (!mounted) return;
      setState(() {
        _pinEnabled = false;
      });
    }
  }

  Future<bool> _showSetPinDialog() async {
    final newPin = await _promptPin();
    if (newPin == null) return false;
    await SecureStorage.instance.writePinCode(newPin);
    await SecureStorage.instance.writePinEnabled(true);
    return true;
  }

  Future<String?> _promptPin() async {
    String pin1 = '';
    String pin2 = '';
    return await showDialog<String>(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: const Text('Встановити пін-код'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                autofocus: true,
                obscureText: true,
                keyboardType: TextInputType.number,
                maxLength: 4,
                decoration: const InputDecoration(
                  labelText: 'Новий пін-код (4 цифри)',
                  counterText: '',
                ),
                onChanged: (v) => pin1 = v.trim(),
              ),
              const SizedBox(height: 8),
              TextField(
                obscureText: true,
                keyboardType: TextInputType.number,
                maxLength: 4,
                decoration: const InputDecoration(
                  labelText: 'Підтвердіть пін-код',
                  counterText: '',
                ),
                onChanged: (v) => pin2 = v.trim(),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(null),
              child: const Text('Скасувати'),
            ),
            FilledButton(
              onPressed: () {
                final re = RegExp(r'^[0-9]{4}$');
                if (!re.hasMatch(pin1) || !re.hasMatch(pin2) || pin1 != pin2) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Пін-код має бути 4 цифри та співпадати')),
                  );
                  return;
                }
                Navigator.of(ctx).pop(pin1);
              },
              child: const Text('Зберегти'),
            ),
          ],
        );
      },
    );
  }

  Future<void> _changePin() async {
    final ok = await _showSetPinDialog();
    if (ok) {
      if (!mounted) return;
      setState(() {
        _hasPin = true;
        _pinEnabled = true;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Пін-код оновлено')),
      );
    }
  }

  Future<void> _clearPin() async {
    await SecureStorage.instance.clearPin();
    if (!mounted) return;
    setState(() {
      _hasPin = false;
      _pinEnabled = false;
    });
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Пін-код видалено')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return MainLayout(
      currentRoute: '/settings',
      child: Scaffold(
        backgroundColor: AppTheme.backgroundColor,
        appBar: AppBar(
          title: const Text('Налаштування'),
          backgroundColor: Colors.transparent,
          elevation: 0,
        ),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Text(
                    'Безпека',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  Card(
                    elevation: 0,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    child: Column(
                      children: [
                        SwitchListTile(
                          title: const Text('Увімкнути пін-код'),
                          subtitle: const Text('Запитувати пін-код при вході в застосунок'),
                          value: _pinEnabled,
                          onChanged: (val) => _togglePin(val),
                        ),
                        ListTile(
                          title: const Text('Змінити пін-код'),
                          subtitle: Text(_hasPin ? 'Поточний пін-код встановлено' : 'Пін-код не встановлено'),
                          trailing: const Icon(Icons.arrow_forward_ios, size: 16),
                          onTap: _changePin,
                        ),
                        if (_hasPin)
                          ListTile(
                            title: const Text('Видалити пін-код'),
                            leading: const Icon(Icons.delete_outline),
                            onTap: _clearPin,
                          ),
                      ],
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}