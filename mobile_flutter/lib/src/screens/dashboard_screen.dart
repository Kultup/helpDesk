import 'package:flutter/material.dart';
import 'package:dio/dio.dart';

import '../services/api_client.dart';
import '../theme/app_theme.dart';
import '../widgets/main_layout.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  Map<String, dynamic>? _stats;
  List<dynamic> _recentTickets = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadDashboardData();
  }

  Future<void> _loadDashboardData() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      // Завантажуємо статистику та останні тікети
      final statsResponse = await ApiClient.instance.dio.get('/tickets/stats');
      final ticketsResponse = await ApiClient.instance.dio.get('/tickets', 
        queryParameters: {
          'page': 1,
          'limit': 5,
          'sortBy': 'createdAt',
          'sortOrder': 'desc',
        }
      );

      setState(() {
        _stats = statsResponse.data['data'] ?? {};
        _recentTickets = (ticketsResponse.data['data'] as List<dynamic>? ?? []);
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
        // Фейкові дані для демонстрації
        _stats = {
          'total': 42,
          'open': 15,
          'in_progress': 12,
          'resolved': 10,
          'closed': 5,
        };
        _recentTickets = [
          {
            'id': '1',
            'title': 'Проблема з входом в систему',
            'status': 'open',
            'priority': 'high',
            'createdAt': '2024-01-15T10:30:00Z',
          },
          {
            'id': '2',
            'title': 'Повільна робота додатку',
            'status': 'in_progress',
            'priority': 'medium',
            'createdAt': '2024-01-15T09:15:00Z',
          },
          {
            'id': '3',
            'title': 'Помилка при збереженні файлу',
            'status': 'resolved',
            'priority': 'low',
            'createdAt': '2024-01-15T08:45:00Z',
          },
        ];
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return MainLayout(
      currentRoute: '/dashboard',
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Дашборд'),
          actions: [
            IconButton(
              icon: const Icon(Icons.refresh),
              onPressed: _loadDashboardData,
            ),
          ],
        ),
        body: RefreshIndicator(
          onRefresh: _loadDashboardData,
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 50), // Збільшуємо нижній padding до 50
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Привітання
                      _buildWelcomeCard(),
                      const SizedBox(height: 16),
                      
                      // Статистика
                      _buildStatsSection(),
                      const SizedBox(height: 24),
                      
                      // Останні тікети
                      _buildRecentTicketsSection(),
                      const SizedBox(height: 24),
                      
                      // Швидкі дії
                      _buildQuickActionsSection(),
                    ],
                  ),
                ),
        ),
      ),
    );
  }

  Widget _buildWelcomeCard() {
    return RepaintBoundary(
      child: Card(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        clipBehavior: Clip.antiAlias,
        elevation: 6,
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(20),
          decoration: const BoxDecoration(
            gradient: AppTheme.primaryGradient,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Вітаємо в HelpDesk!',
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                  letterSpacing: 0.5,
                ),
                overflow: TextOverflow.ellipsis,
                maxLines: 1,
              ),
              const SizedBox(height: 8),
              Text(
                'Сьогодні ${DateTime.now().day}.${DateTime.now().month}.${DateTime.now().year}',
                style: const TextStyle(
                  fontSize: 16,
                  color: Colors.white70,
                  letterSpacing: 0.3,
                ),
                overflow: TextOverflow.ellipsis,
                maxLines: 1,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildStatsSection() {
    if (_stats == null) return const SizedBox.shrink();

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Статистика тікетів',
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 12),
        LayoutBuilder(
          builder: (context, constraints) {
            return GridView.count(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisCount: 2,
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 1.5,
              children: [
                _buildStatCard(
                  'Всього',
                  _stats!['total']?.toString() ?? '0',
                  Icons.confirmation_number,
                  AppTheme.primaryColor,
                ),
                _buildStatCard(
                  'Відкриті',
                  _stats!['open']?.toString() ?? '0',
                  Icons.fiber_new,
                  AppTheme.getStatusColor('open'),
                ),
                _buildStatCard(
                  'В роботі',
                  _stats!['in_progress']?.toString() ?? '0',
                  Icons.work,
                  AppTheme.getStatusColor('in_progress'),
                ),
                 _buildStatCard(
                   'Вирішені',
                   _stats!['resolved']?.toString() ?? '0',
                   Icons.check_circle,
                   AppTheme.getStatusColor('resolved'),
                 ),
               ],
             );
           },
         ),
       ],
     );
   }

  Widget _buildStatCard(String title, String value, IconData icon, Color color) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 24, color: color),
            const SizedBox(height: 4),
            Text(
              value,
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
            Text(
              title,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(fontSize: 11),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRecentTicketsSection() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'Останні тікети',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            TextButton(
              onPressed: () => Navigator.of(context).pushNamed('/tickets'),
              child: const Text('Переглянути всі'),
            ),
          ],
        ),
        const SizedBox(height: 12),
        if (_recentTickets.isEmpty)
          const Card(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Text('Немає тікетів'),
            ),
          )
        else
          ..._recentTickets.map((ticket) => _buildTicketCard(ticket)),
      ],
    );
  }

  Widget _buildTicketCard(Map<String, dynamic> ticket) {
    final status = ticket['status'] ?? 'unknown';
    final priority = ticket['priority'] ?? 'medium';
    
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Container(
          width: 12,
          height: 12,
          decoration: BoxDecoration(
            color: AppTheme.getStatusColor(status),
            shape: BoxShape.circle,
          ),
        ),
        title: Text(
          ticket['title'] ?? 'Без назви',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        subtitle: Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: AppTheme.getPriorityColor(priority).withOpacity(0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                priority,
                style: TextStyle(
                  fontSize: 12,
                  color: AppTheme.getPriorityColor(priority),
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
            const SizedBox(width: 8),
            Text(
              status,
              style: TextStyle(
                fontSize: 12,
                color: AppTheme.getStatusColor(status),
              ),
            ),
          ],
        ),
        trailing: const Icon(Icons.arrow_forward_ios, size: 16),
        onTap: () {
          final id = (ticket['_id'] ?? ticket['id'])?.toString();
          if (id != null && id.isNotEmpty) {
            Navigator.of(context).pushNamed('/ticket-details', arguments: {'id': id});
          }
        },
      ),
    );
  }

  Widget _buildQuickActionsSection() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Швидкі дії',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: _buildActionCard(
                'Створити тікет',
                Icons.add_circle_outline,
                AppTheme.primaryColor,
                () {
                  // TODO: Відкрити форму створення тікету
                },
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _buildActionCard(
                'Мої тікети',
                Icons.person_outline,
                AppTheme.secondaryColor,
                () => Navigator.of(context).pushNamed('/tickets'),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildActionCard(String title, IconData icon, Color color, VoidCallback onTap) {
    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(12), // Зменшено з 16 до 12
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 28, color: color), // Зменшено з 32 до 28
              const SizedBox(height: 6), // Зменшено з 8 до 6
              Text(
                title,
                style: TextStyle(
                  fontWeight: FontWeight.w500,
                  color: color,
                  fontSize: 13, // Додано менший розмір шрифту
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}