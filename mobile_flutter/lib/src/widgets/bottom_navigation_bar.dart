import 'package:flutter/material.dart';

class CustomBottomNavigationBar extends StatefulWidget {
  final Function(String) onItemTapped;
  final String currentRoute;

  const CustomBottomNavigationBar({
    super.key,
    required this.onItemTapped,
    required this.currentRoute,
  });

  @override
  State<CustomBottomNavigationBar> createState() => _CustomBottomNavigationBarState();
}

class _CustomBottomNavigationBarState extends State<CustomBottomNavigationBar>
    with SingleTickerProviderStateMixin {
  late ScrollController _scrollController;
  late AnimationController _animationController;
  late Animation<double> _fadeAnimation;

  final List<NavigationItem> _navigationItems = [
    NavigationItem(
      icon: Icons.dashboard,
      label: 'Дашборд',
      route: '/dashboard',
    ),
    NavigationItem(
      icon: Icons.confirmation_number,
      label: 'Заявки',
      route: '/tickets',
    ),
    NavigationItem(
      icon: Icons.category,
      label: 'Категорії',
      route: '/categories',
    ),
    NavigationItem(
      icon: Icons.analytics,
      label: 'Аналітика',
      route: '/analytics',
    ),
    NavigationItem(
      icon: Icons.people,
      label: 'Користувачі',
      route: '/users',
    ),
    NavigationItem(
      icon: Icons.location_city,
      label: 'Міста',
      route: '/cities',
    ),
    NavigationItem(
      icon: Icons.work,
      label: 'Посади',
      route: '/positions',
    ),
    NavigationItem(
      icon: Icons.business,
      label: 'Заклади',
      route: '/institutions',
    ),
    NavigationItem(
      icon: Icons.notifications,
      label: 'Сповіщення',
      route: '/notifications',
    ),
    NavigationItem(
      icon: Icons.settings,
      label: 'Налаштування',
      route: '/settings',
    ),
    NavigationItem(
      icon: Icons.logout,
      label: 'Вийти',
      route: '/logout',
    ),
  ];

  @override
  void initState() {
    super.initState();
    _scrollController = ScrollController();
    _animationController = AnimationController(
      duration: const Duration(milliseconds: 300),
      vsync: this,
    );
    _fadeAnimation = Tween<double>(
      begin: 0.0,
      end: 1.0,
    ).animate(CurvedAnimation(
      parent: _animationController,
      curve: Curves.easeInOut,
    ));
    _animationController.forward();
  }

  @override
  void dispose() {
    _scrollController.dispose();
    _animationController.dispose();
    super.dispose();
  }

  void _scrollToActiveItem() {
    final activeIndex = _navigationItems.indexWhere(
      (item) => item.route == widget.currentRoute,
    );
    
    if (activeIndex != -1) {
      const itemWidth = 92.0; // Збільшено, щоб врахувати більші елементи
      final screenWidth = MediaQuery.of(context).size.width;
      final targetOffset = (activeIndex * itemWidth) - (screenWidth / 2) + (itemWidth / 2);
      
      _scrollController.animateTo(
        targetOffset.clamp(0.0, _scrollController.position.maxScrollExtent),
        duration: const Duration(milliseconds: 500),
        curve: Curves.easeInOutCubic,
      );
    }
  }

  @override
  void didUpdateWidget(CustomBottomNavigationBar oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.currentRoute != widget.currentRoute) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _scrollToActiveItem();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final screenWidth = MediaQuery.of(context).size.width;
    final screenHeight = MediaQuery.of(context).size.height;
    final isSmallScreen = screenWidth < 600;
    final isVerySmallScreen = screenWidth < 400;
    
    // Динамічно розраховуємо висоту залежно від розміру екрану
    double navigationHeight;
    if (isVerySmallScreen) {
      navigationHeight = 100; // було 88
    } else if (isSmallScreen) {
      navigationHeight = 108; // було 93
    } else {
      navigationHeight = 116; // було 98
    }

    return FadeTransition(
      opacity: _fadeAnimation,
      child: Container(
        height: navigationHeight,
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          boxShadow: [
            BoxShadow(
              color: theme.colorScheme.shadow.withOpacity(0.1),
              blurRadius: 10,
              offset: const Offset(0, -2),
            ),
          ],
          border: Border(
            top: BorderSide(
              color: theme.colorScheme.outline.withOpacity(0.2),
              width: 1,
            ),
          ),
        ),
        child: SafeArea(
          child: Padding(
            padding: EdgeInsets.symmetric(
              horizontal: isVerySmallScreen ? 4 : (isSmallScreen ? 6 : 10),
              vertical: isVerySmallScreen ? 10 : (isSmallScreen ? 12 : 14),
            ),
            child: SingleChildScrollView(
              controller: _scrollController,
              scrollDirection: Axis.horizontal,
              physics: const BouncingScrollPhysics(),
              child: Row(
                children: _navigationItems.map((item) {
                  final isActive = item.route == widget.currentRoute;
                  return _buildNavigationItem(
                    item,
                    isActive,
                    isSmallScreen,
                    isVerySmallScreen,
                    theme,
                  );
                }).toList(),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildNavigationItem(
    NavigationItem item,
    bool isActive,
    bool isSmallScreen,
    bool isVerySmallScreen,
    ThemeData theme,
  ) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      curve: Curves.easeInOut,
      margin: EdgeInsets.symmetric(
        horizontal: isVerySmallScreen ? 2 : (isSmallScreen ? 4 : 6),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () => widget.onItemTapped(item.route),
          borderRadius: BorderRadius.circular(12),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            curve: Curves.easeInOut,
            padding: EdgeInsets.symmetric(
              horizontal: isVerySmallScreen ? 8 : (isSmallScreen ? 10 : 14),
              vertical: isVerySmallScreen ? 10 : (isSmallScreen ? 12 : 14),
            ),
            decoration: BoxDecoration(
              color: isActive
                  ? theme.colorScheme.primary.withOpacity(0.1)
                  : Colors.transparent,
              borderRadius: BorderRadius.circular(12),
              border: isActive
                  ? Border.all(
                      color: theme.colorScheme.primary.withOpacity(0.3),
                      width: 1,
                    )
                  : null,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                AnimatedScale(
                  scale: isActive ? 1.1 : 1.0,
                  duration: const Duration(milliseconds: 200),
                  child: Icon(
                    item.icon,
                    size: isVerySmallScreen ? 22 : (isSmallScreen ? 24 : 26),
                    color: isActive
                        ? theme.colorScheme.primary
                        : theme.colorScheme.onSurface.withOpacity(0.6),
                  ),
                ),
                if (!isVerySmallScreen) ...[
                  SizedBox(height: isSmallScreen ? 2 : 3),
                  AnimatedDefaultTextStyle(
                    duration: const Duration(milliseconds: 200),
                    style: TextStyle(
                      fontSize: isSmallScreen ? 10 : 11,
                      fontWeight: isActive ? FontWeight.w600 : FontWeight.w500,
                      color: isActive
                          ? theme.colorScheme.primary
                          : theme.colorScheme.onSurface.withOpacity(0.6),
                    ),
                    child: Text(
                      item.label,
                      textAlign: TextAlign.center,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class NavigationItem {
  final IconData icon;
  final String label;
  final String route;

  NavigationItem({
    required this.icon,
    required this.label,
    required this.route,
  });
}