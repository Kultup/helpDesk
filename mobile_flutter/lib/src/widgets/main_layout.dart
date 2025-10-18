import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../repositories/auth_repository.dart';
import 'bottom_navigation_bar.dart';

class MainLayout extends StatefulWidget {
  final Widget child;
  final String currentRoute;

  const MainLayout({
    super.key,
    required this.child,
    required this.currentRoute,
  });

  @override
  State<MainLayout> createState() => _MainLayoutState();
}

class _MainLayoutState extends State<MainLayout> {
  void _onNavigationItemTapped(String route) async {
    if (route == '/logout') {
      // Очистка сесії
      await context.read<AuthRepository>().logout();
      // Перенаправлення на екран авторизації та очищення стеку навігації
      if (mounted) {
        Navigator.of(context).pushNamedAndRemoveUntil('/login', (r) => false);
      }
      return;
    }

    if (route != widget.currentRoute) {
      Navigator.of(context).pushReplacementNamed(route);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: widget.child,
      ),
      bottomNavigationBar: CustomBottomNavigationBar(
        onItemTapped: _onNavigationItemTapped,
        currentRoute: widget.currentRoute,
      ),
    );
  }
}