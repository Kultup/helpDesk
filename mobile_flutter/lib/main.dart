import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:provider/provider.dart';


import 'src/config/app_config.dart';
import 'src/repositories/auth_repository.dart';
import 'src/screens/login_screen.dart';
import 'src/screens/dashboard_screen.dart';
import 'src/screens/tickets_list_screen.dart';
import 'src/screens/placeholder_screen.dart';
import 'src/theme/app_theme.dart';
import 'src/screens/ticket_details_screen.dart';
import 'src/screens/settings_screen.dart';
import 'src/screens/pin_lock_screen.dart';
import 'src/screens/create_ticket_screen.dart';
import 'src/screens/analytics_screen.dart';
import 'src/screens/users_screen.dart';
import 'src/screens/cities_screen.dart';
import 'src/screens/positions_screen.dart';
import 'src/screens/institutions_screen.dart';
import 'src/screens/notifications_screen.dart';
import 'src/screens/register_screen.dart';
import 'src/services/secure_storage.dart';
import 'src/services/socket_service.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'src/services/firebase_messaging_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await AppConfig.ensureConfigured();

  // Ініціалізація Firebase
  try {
    await Firebase.initializeApp();
    // Налаштовуємо background handler для сповіщень
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
    // Ініціалізуємо сервіс сповіщень
    await FirebaseMessagingService().initialize();
  } catch (e) {
    debugPrint('❌ Error initializing Firebase: $e');
  }

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
            title: 'HelDesKM',
            debugShowCheckedModeBanner: false,
            theme: AppTheme.lightTheme,
            localizationsDelegates: const [
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
              GlobalCupertinoLocalizations.delegate,
            ],
            supportedLocales: const [
              Locale('uk', 'UA'),
              Locale('en', 'US'),
              Locale('pl', 'PL'),
            ],
            locale: const Locale('uk', 'UA'),
            home: const AuthWrapper(),
                routes: {
                  '/login': (_) => const LoginScreen(),
                  '/register': (_) => const RegisterScreen(),
                  '/dashboard': (_) => const DashboardScreen(),
              '/tickets': (_) => const TicketsListScreen(),
              '/ticket-details': (context) {
                final args = ModalRoute.of(context)!.settings.arguments as Map<String, dynamic>?;
                final id = args?['id'] as String?;
                return TicketDetailsScreen(ticketId: id ?? '');
              },
              '/create-ticket': (_) => const CreateTicketScreen(),
              '/settings': (_) => const SettingsScreen(),
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
              '/analytics': (context) => const AnalyticsScreen(),
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
              '/cities': (context) => const CitiesScreen(),
              '/positions': (context) => const PositionsScreen(),
              '/institutions': (context) => const InstitutionsScreen(),
              '/users': (context) => const UsersScreen(),
              '/pending-registrations': (context) => const PlaceholderScreen(
                title: 'Очікують реєстрації',
                route: '/pending-registrations',
                icon: Icons.pending_actions,
                description: 'Заявки на реєстрацію користувачів',
              ),
              '/notifications': (context) => const NotificationsScreen(),
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

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Оновлюємо контекст для SocketService та FirebaseMessagingService
    final auth = context.read<AuthRepository>();
    FirebaseMessagingService().setContext(context);
    if (auth.isAuthenticated) {
      SocketService.instance.setContext(context, auth);
    }
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