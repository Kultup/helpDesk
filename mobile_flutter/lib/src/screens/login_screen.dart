import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../repositories/auth_repository.dart';
import '../theme/app_theme.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  bool _rememberMe = false;

  @override
  void initState() {
    super.initState();
    _loadSavedCredentials();
  }

  Future<void> _loadSavedCredentials() async {
    final auth = context.read<AuthRepository>();
    final credentials = await auth.getSavedCredentials();
    final rememberMe = await auth.getRememberMeStatus();
    
    if (mounted) {
      setState(() {
        _emailCtrl.text = credentials['email'] ?? '';
        _passwordCtrl.text = credentials['password'] ?? '';
        _rememberMe = rememberMe;
      });
    }
  }

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    final auth = context.read<AuthRepository>();
    final ok = await auth.login(
      _emailCtrl.text.trim(), 
      _passwordCtrl.text.trim(),
      rememberMe: _rememberMe,
    );
    if (ok && mounted) {
      Navigator.of(context).pushReplacementNamed('/dashboard');
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthRepository>();
    final screenWidth = MediaQuery.of(context).size.width;
    final screenHeight = MediaQuery.of(context).size.height;
    final isSmallScreen = screenWidth < 600;
    final isVerySmallScreen = screenWidth < 400;
    final isShortScreen = screenHeight < 700;
    
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: AppTheme.primaryGradient,
        ),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: EdgeInsets.all(isVerySmallScreen ? 16 : 24),
              child: ConstrainedBox(
                constraints: BoxConstraints(
                  maxWidth: isSmallScreen ? double.infinity : 400,
                ),
                child: Card(
                  elevation: 8,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Padding(
                    padding: EdgeInsets.all(isVerySmallScreen ? 20 : 32),
                    child: Form(
                      key: _formKey,
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          // Логотип/Іконка
                          Container(
                            width: isVerySmallScreen ? 60 : 80,
                            height: isVerySmallScreen ? 60 : 80,
                            decoration: BoxDecoration(
                              color: AppTheme.primaryColor.withOpacity(0.1),
                              borderRadius: BorderRadius.circular(isVerySmallScreen ? 30 : 40),
                            ),
                            child: Icon(
                              Icons.support_agent,
                              size: isVerySmallScreen ? 30 : 40,
                              color: AppTheme.primaryColor,
                            ),
                          ),
                          SizedBox(height: isShortScreen ? 16 : 24),
                          
                          // Заголовок
                          Text(
                            'HelpDesk',
                            style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                              color: AppTheme.primaryColor,
                              fontWeight: FontWeight.bold,
                              fontSize: isVerySmallScreen ? 24 : null,
                            ),
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'Увійдіть до системи',
                            style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                              color: AppTheme.textSecondaryColor,
                              fontSize: isVerySmallScreen ? 14 : null,
                            ),
                            textAlign: TextAlign.center,
                          ),
                          SizedBox(height: isShortScreen ? 20 : 32),
                        
                          // Поле Email
                          TextFormField(
                            controller: _emailCtrl,
                            decoration: InputDecoration(
                              labelText: 'Email',
                              prefixIcon: const Icon(Icons.email_outlined),
                              contentPadding: EdgeInsets.symmetric(
                                horizontal: 16,
                                vertical: isVerySmallScreen ? 12 : 16,
                              ),
                            ),
                            keyboardType: TextInputType.emailAddress,
                            validator: (v) => (v == null || v.isEmpty) ? 'Вкажіть email' : null,
                          ),
                          SizedBox(height: isShortScreen ? 12 : 16),
                          
                          // Поле Пароль
                          TextFormField(
                            controller: _passwordCtrl,
                            decoration: InputDecoration(
                              labelText: 'Пароль',
                              prefixIcon: const Icon(Icons.lock_outlined),
                              contentPadding: EdgeInsets.symmetric(
                                horizontal: 16,
                                vertical: isVerySmallScreen ? 12 : 16,
                              ),
                            ),
                            obscureText: true,
                            validator: (v) => (v == null || v.isEmpty) ? 'Вкажіть пароль' : null,
                          ),
                          SizedBox(height: isShortScreen ? 12 : 16),
                        
                          // Чекбокс "Запам'ятати мене"
                          Row(
                            children: [
                              SizedBox(
                                width: 24,
                                height: 24,
                                child: Checkbox(
                                  value: _rememberMe,
                                  onChanged: (value) {
                                    setState(() {
                                      _rememberMe = value ?? false;
                                    });
                                  },
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: GestureDetector(
                                  onTap: () {
                                    setState(() {
                                      _rememberMe = !_rememberMe;
                                    });
                                  },
                                  child: Text(
                                    'Запам\'ятати мене',
                                    style: TextStyle(
                                      color: AppTheme.textSecondaryColor,
                                      fontSize: isVerySmallScreen ? 13 : 14,
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                          SizedBox(height: isShortScreen ? 16 : 24),
                          
                          // Кнопка входу
                          SizedBox(
                            height: isVerySmallScreen ? 44 : 48,
                            child: ElevatedButton(
                              onPressed: auth.loading ? null : _submit,
                              child: auth.loading 
                                  ? const SizedBox(
                                      width: 20,
                                      height: 20,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                        valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                                      ),
                                    )
                                  : Text(
                                      'Увійти',
                                      style: TextStyle(
                                        fontSize: isVerySmallScreen ? 14 : 16,
                                      ),
                                    ),
                            ),
                          ),
                        
                          // Повідомлення про помилку
                          if (auth.error != null) ...[
                            SizedBox(height: isShortScreen ? 12 : 16),
                            Container(
                              padding: EdgeInsets.all(isVerySmallScreen ? 10 : 12),
                              decoration: BoxDecoration(
                                color: AppTheme.errorColor.withOpacity(0.1),
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(
                                  color: AppTheme.errorColor.withOpacity(0.3),
                                ),
                              ),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Icon(
                                    Icons.error_outline,
                                    color: AppTheme.errorColor,
                                    size: isVerySmallScreen ? 18 : 20,
                                  ),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Text(
                                      auth.error!,
                                      style: TextStyle(
                                        color: AppTheme.errorColor,
                                        fontSize: isVerySmallScreen ? 13 : 14,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}