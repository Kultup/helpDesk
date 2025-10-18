import 'package:flutter/material.dart';
import 'package:dio/dio.dart';

import '../services/api_client.dart';
import '../theme/app_theme.dart';
import '../widgets/main_layout.dart';

class TicketsListScreen extends StatefulWidget {
  const TicketsListScreen({super.key});

  @override
  State<TicketsListScreen> createState() => _TicketsListScreenState();
}

class _TicketsListScreenState extends State<TicketsListScreen> {
  List<dynamic> _tickets = [];
  bool _loading = true;
  String? _error;
  String _selectedFilter = 'all';

  @override
  void initState() {
    super.initState();
    _fetchTickets();
  }

  Future<void> _fetchTickets() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final Response res = await ApiClient.instance.dio.get('/tickets', queryParameters: {
        'page': 1,
        'limit': 20,
        'sortBy': 'createdAt',
        'sortOrder': 'desc',
      });
      final data = res.data as Map<String, dynamic>;
      setState(() {
        _tickets = (data['data'] as List<dynamic>? ?? []);
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  List<dynamic> get _filteredTickets {
    if (_selectedFilter == 'all') return _tickets;
    return _tickets.where((ticket) => ticket['status'] == _selectedFilter).toList();
  }

  void _setFilter(String filter) {
    setState(() {
      _selectedFilter = filter;
    });
  }

  Widget _buildFilterChip(String label, bool isSelected, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? AppTheme.primaryColor : Colors.grey.shade100,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isSelected ? AppTheme.primaryColor : Colors.grey.shade300,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: isSelected ? Colors.white : AppTheme.textSecondaryColor,
            fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return MainLayout(
      currentRoute: '/tickets',
      child: Scaffold(
        backgroundColor: AppTheme.backgroundColor,
        appBar: AppBar(
          title: const Text('Заявки'),
          backgroundColor: Colors.transparent,
          elevation: 0,
          actions: [
            IconButton(
              icon: const Icon(Icons.add),
              onPressed: () {
                // TODO: Додати створення нової заявки
              },
            ),
          ],
        ),
        body: Column(
          children: [
            // Фільтри
            Container(
              padding: const EdgeInsets.all(16),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    _buildFilterChip('Всі', _selectedFilter == 'all', () => _setFilter('all')),
                    const SizedBox(width: 8),
                    _buildFilterChip('Відкриті', _selectedFilter == 'open', () => _setFilter('open')),
                    const SizedBox(width: 8),
                    _buildFilterChip('В роботі', _selectedFilter == 'in_progress', () => _setFilter('in_progress')),
                    const SizedBox(width: 8),
                    _buildFilterChip('Закриті', _selectedFilter == 'closed', () => _setFilter('closed')),
                  ],
                ),
              ),
            ),
            // Список заявок
            Expanded(
              child: RefreshIndicator(
                onRefresh: _fetchTickets,
                child: _loading
                    ? const Center(child: CircularProgressIndicator())
                    : _error != null
                        ? _buildErrorWidget()
                        : _filteredTickets.isEmpty
                            ? _buildEmptyWidget()
                            : _buildTicketsList(),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFilterChips() {
    final filters = [
      {'key': 'all', 'label': 'Всі', 'count': _tickets.length},
      {'key': 'open', 'label': 'Відкриті', 'count': _tickets.where((t) => t['status'] == 'open').length},
      {'key': 'in_progress', 'label': 'В роботі', 'count': _tickets.where((t) => t['status'] == 'in_progress').length},
      {'key': 'resolved', 'label': 'Вирішені', 'count': _tickets.where((t) => t['status'] == 'resolved').length},
    ];

    return Container(
      height: 60,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: filters.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final filter = filters[index];
          final isSelected = _selectedFilter == filter['key'];
          
          return FilterChip(
            label: Text('${filter['label']} (${filter['count']})'),
            selected: isSelected,
            onSelected: (selected) {
              setState(() {
                _selectedFilter = filter['key'] as String;
              });
            },
            backgroundColor: Colors.grey.shade100,
            selectedColor: AppTheme.primaryColor.withOpacity(0.2),
            checkmarkColor: AppTheme.primaryColor,
            labelStyle: TextStyle(
              color: isSelected ? AppTheme.primaryColor : AppTheme.textSecondaryColor,
              fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
            ),
          );
        },
      ),
    );
  }

  Widget _buildTicketsList() {
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: _filteredTickets.length,
      separatorBuilder: (_, __) => const SizedBox(height: 12),
      itemBuilder: (context, index) {
        final ticket = _filteredTickets[index] as Map<String, dynamic>;
        return _buildTicketCard(ticket);
      },
    );
  }

  Widget _buildTicketCard(Map<String, dynamic> ticket) {
    final title = ticket['title'] ?? 'Без назви';
    final status = ticket['status'] ?? 'unknown';
    final priority = ticket['priority'] ?? 'medium';
    final createdAt = ticket['createdAt'] ?? '';
    final assignee = ticket['assignee']?['name'] ?? 'Не призначено';

    return Card(
      elevation: 2,
      child: InkWell(
        onTap: () {
              final id = (ticket['_id'] ?? ticket['id'])?.toString();
              if (id != null && id.isNotEmpty) {
                Navigator.of(context).pushNamed('/ticket-details', arguments: {'id': id});
              }
            },
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Заголовок та статус
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      title,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: 8),
                  _buildStatusChip(status),
                ],
              ),
              const SizedBox(height: 12),
              
              // Пріоритет та виконавець
              Row(
                children: [
                  _buildPriorityChip(priority),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Row(
                      children: [
                        const Icon(
                          Icons.person_outline,
                          size: 16,
                          color: AppTheme.textSecondaryColor,
                        ),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Text(
                            assignee,
                            style: Theme.of(context).textTheme.bodySmall,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              
              // Дата створення
              Row(
                children: [
                  const Icon(
                    Icons.access_time,
                    size: 16,
                    color: AppTheme.textSecondaryColor,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    _formatDate(createdAt),
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  const Spacer(),
                  const Icon(
                    Icons.arrow_forward_ios,
                    size: 16,
                    color: AppTheme.textSecondaryColor,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildStatusChip(String status) {
    final color = AppTheme.getStatusColor(status);
    final statusText = _getStatusText(status);
    
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Text(
        statusText,
        style: TextStyle(
          fontSize: 12,
          color: color,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  Widget _buildPriorityChip(String priority) {
    final color = AppTheme.getPriorityColor(priority);
    final priorityText = _getPriorityText(priority);
    
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 4),
          Text(
            priorityText,
            style: TextStyle(
              fontSize: 12,
              color: color,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildErrorWidget() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(
              Icons.error_outline,
              size: 64,
              color: AppTheme.errorColor,
            ),
            const SizedBox(height: 16),
            Text(
              'Помилка завантаження',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 8),
            Text(
              _error!,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: AppTheme.textSecondaryColor,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _fetchTickets,
              child: const Text('Спробувати знову'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmptyWidget() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(
              Icons.inbox_outlined,
              size: 64,
              color: AppTheme.textSecondaryColor,
            ),
            const SizedBox(height: 16),
            Text(
              'Немає тікетів',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 8),
            Text(
              'Тікети з\'являться тут після створення',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: AppTheme.textSecondaryColor,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  void _showFilterDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Фільтрувати тікети'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              title: const Text('Всі тікети'),
              leading: Radio<String>(
                value: 'all',
                groupValue: _selectedFilter,
                onChanged: (value) {
                  setState(() => _selectedFilter = value!);
                  Navigator.pop(context);
                },
              ),
            ),
            ListTile(
              title: const Text('Відкриті'),
              leading: Radio<String>(
                value: 'open',
                groupValue: _selectedFilter,
                onChanged: (value) {
                  setState(() => _selectedFilter = value!);
                  Navigator.pop(context);
                },
              ),
            ),
            ListTile(
              title: const Text('В роботі'),
              leading: Radio<String>(
                value: 'in_progress',
                groupValue: _selectedFilter,
                onChanged: (value) {
                  setState(() => _selectedFilter = value!);
                  Navigator.pop(context);
                },
              ),
            ),
            ListTile(
              title: const Text('Вирішені'),
              leading: Radio<String>(
                value: 'resolved',
                groupValue: _selectedFilter,
                onChanged: (value) {
                  setState(() => _selectedFilter = value!);
                  Navigator.pop(context);
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _getStatusText(String status) {
    switch (status.toLowerCase()) {
      case 'open':
        return 'Відкритий';
      case 'in_progress':
        return 'В роботі';
      case 'resolved':
        return 'Вирішений';
      case 'closed':
        return 'Закритий';
      default:
        return status;
    }
  }

  String _getPriorityText(String priority) {
    switch (priority.toLowerCase()) {
      case 'low':
        return 'Низький';
      case 'medium':
        return 'Середній';
      case 'high':
        return 'Високий';
      case 'urgent':
        return 'Терміновий';
      default:
        return priority;
    }
  }

  String _formatDate(String dateStr) {
    if (dateStr.isEmpty) return 'Невідомо';
    try {
      final date = DateTime.parse(dateStr);
      final now = DateTime.now();
      final difference = now.difference(date);
      
      if (difference.inDays > 0) {
        return '${difference.inDays} дн. тому';
      } else if (difference.inHours > 0) {
        return '${difference.inHours} год. тому';
      } else if (difference.inMinutes > 0) {
        return '${difference.inMinutes} хв. тому';
      } else {
        return 'Щойно';
      }
    } catch (e) {
      return dateStr;
    }
  }
}