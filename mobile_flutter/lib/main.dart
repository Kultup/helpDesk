import 'package:flutter/material.dart';
import 'package:provider/provider.dart';


import 'src/config/app_config.dart';
import 'src/repositories/auth_repository.dart';
import 'src/screens/login_screen.dart';
import 'src/screens/dashboard_screen.dart';
import 'src/screens/tickets_list_screen.dart';
import 'src/screens/placeholder_screen.dart';
import 'src/theme/app_theme.dart';
import 'src/screens/categories_screen.dart';
import 'src/screens/ticket_details_screen.dart';
import 'src/screens/settings_screen.dart';
import 'src/screens/pin_lock_screen.dart';
import 'src/services/secure_storage.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await AppConfig.ensureConfigured();

  runApp(const HelpdeskApp());
}

class HelpdeskApp extends StatelessWidget {
  const HelpdeskApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthRepository()),
      ],
      child: Consumer<AuthRepository>(
        builder: (context, auth, _) {
          return MaterialApp(
            title: 'HelpDesk Mobile',
            debugShowCheckedModeBanner: false,
            theme: AppTheme.lightTheme,
            home: const AuthWrapper(),
            routes: {
              '/login': (_) => const LoginScreen(),
              '/dashboard': (_) => const DashboardScreen(),
              '/tickets': (_) => const TicketsListScreen(),
              '/ticket-details': (context) {
                final args = ModalRoute.of(context)!.settings.arguments as Map<String, dynamic>?;
                final id = args?['id'] as String?;
                return TicketDetailsScreen(ticketId: id ?? '');
              },
              '/settings': (_) => const SettingsScreen(),
              '/categories': (context) => const CategoriesScreen(),
              '/templates': (context) => const PlaceholderScreen(
                title: 'Шаблони',
                route: '/templates',
                icon: Icons.description,
                description: 'Шаблони для створення заявок',
              ),
              '/calendar': (context) => const PlaceholderScreen(
                title: 'Календар',
                route: '/calendar',
                icon: Icons.calendar_today,
                description: 'Календар подій та завдань',
              ),
              '/analytics': (context) => const PlaceholderScreen(
                title: 'Аналітика',
                route: '/analytics',
                icon: Icons.analytics,
                description: 'Звіти та аналітика системи',
              ),
              '/active-directory': (context) => const PlaceholderScreen(
                title: 'Active Directory',
                route: '/active-directory',
                icon: Icons.account_tree,
                description: 'Інтеграція з Active Directory',
              ),
              '/system-logs': (context) => const PlaceholderScreen(
                title: 'Системні логи',
                route: '/system-logs',
                icon: Icons.list_alt,
                description: 'Перегляд системних логів',
              ),
              '/cities': (context) => const PlaceholderScreen(
                title: 'Міста',
                route: '/cities',
                icon: Icons.location_city,
                description: 'Управління містами',
              ),
              '/positions': (context) => const PlaceholderScreen(
                title: 'Посади',
                route: '/positions',
                icon: Icons.work,
                description: 'Управління посадами співробітників',
              ),
              '/institutions': (context) => const PlaceholderScreen(
                title: 'Установи',
                route: '/institutions',
                icon: Icons.business,
                description: 'Управління установами',
              ),
              '/users': (context) => const PlaceholderScreen(
                title: 'Користувачі',
                route: '/users',
                icon: Icons.people,
                description: 'Управління користувачами системи',
              ),
              '/pending-registrations': (context) => const PlaceholderScreen(
                title: 'Очікують реєстрації',
                route: '/pending-registrations',
                icon: Icons.pending_actions,
                description: 'Заявки на реєстрацію користувачів',
              ),
              '/notifications': (context) => const PlaceholderScreen(
                title: 'Швидкі сповіщення',
                route: '/notifications',
                icon: Icons.notifications,
                description: 'Управління сповіщеннями',
              ),
            },
          );
        },
      ),
    );
  }
}

class AuthWrapper extends StatefulWidget {
  const AuthWrapper({super.key});

  @override
  State<AuthWrapper> createState() => _AuthWrapperState();
}

class _AuthWrapperState extends State<AuthWrapper> {
  bool _isChecking = true;
  bool _needsPinGate = false;
  bool _pinGateDone = false;

  @override
  void initState() {
    super.initState();
    _checkAuthStatus();
  }

  Future<void> _checkAuthStatus() async {
    final auth = context.read<AuthRepository>();
    
    await auth.checkAuthStatus();

    // Перевіряємо PIN-гейт незалежно від авторизації
    final pinEnabled = await SecureStorage.instance.readPinEnabled();
    final pin = await SecureStorage.instance.readPinCode();
    final needsPin = pinEnabled && (pin != null && pin.isNotEmpty);

    if (auth.isAuthenticated) {
      setState(() {
        _isChecking = false;
        _needsPinGate = needsPin;
      });
      return;
    }
    
    // Якщо токена немає, спробуємо автоматичний вхід
    final success = await auth.tryAutoLogin();
    
    setState(() {
      _isChecking = false;
      _needsPinGate = needsPin;
    });
    
    if (success && mounted) {
      // Авторизація пройшла, екран визначиться в build()
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isChecking) {
      return const Scaffold(
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              CircularProgressIndicator(),
              SizedBox(height: 16),
              Text('Перевірка авторизації...'),
            ],
          ),
        ),
      );
    }

    if (_needsPinGate && !_pinGateDone) {
      return PinLockScreen(
        onUnlocked: () {
          setState(() {
            _pinGateDone = true;
          });
        },
      );
    }

    final auth = context.watch<AuthRepository>();
    
    if (auth.isAuthenticated) {
      return const DashboardScreen();
    } else {
      return const LoginScreen();
    }
  }
}