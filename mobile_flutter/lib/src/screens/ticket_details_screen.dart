import 'package:flutter/material.dart';
import 'package:dio/dio.dart';

import '../services/api_client.dart';
import '../theme/app_theme.dart';
import '../widgets/main_layout.dart';

class TicketDetailsScreen extends StatefulWidget {
  final String ticketId;
  const TicketDetailsScreen({super.key, required this.ticketId});

  @override
  State<TicketDetailsScreen> createState() => _TicketDetailsScreenState();
}

class _TicketDetailsScreenState extends State<TicketDetailsScreen> {
  Map<String, dynamic>? _ticket;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _fetchDetails();
  }

  Future<void> _fetchDetails() async {
    if (widget.ticketId.isEmpty) {
      setState(() {
        _loading = false;
        _error = 'Не передано ідентифікатор тікета';
      });
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final Response res = await ApiClient.instance.dio.get('/tickets/${widget.ticketId}');
      final data = res.data as Map<String, dynamic>;
      final ticket = (data['data'] ?? data) as Map<String, dynamic>;
      if (!mounted) return;
      setState(() {
        _ticket = ticket;
        _loading = false;
      });
    } on DioException catch (e) {
      final msg = e.response?.data is Map
          ? (e.response?.data['message']?.toString() ?? e.message)
          : e.message;
      if (!mounted) return;
      setState(() {
        _error = msg ?? 'Помилка мережі';
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  String _getStatusText(String? status) {
    switch ((status ?? '').toLowerCase()) {
      case 'open':
      case 'new':
        return 'Відкрита';
      case 'in_progress':
      case 'processing':
        return 'В роботі';
      case 'resolved':
      case 'done':
        return 'Вирішена';
      case 'closed':
        return 'Закрита';
      default:
        return status ?? 'Невідомо';
    }
  }

  String _getPriorityText(String? priority) {
    switch ((priority ?? '').toLowerCase()) {
      case 'low':
        return 'Низький';
      case 'medium':
      case 'normal':
        return 'Середній';
      case 'high':
        return 'Високий';
      case 'urgent':
      case 'critical':
        return 'Критичний';
      default:
        return priority ?? '—';
    }
  }

  String _formatDate(String? iso) {
    if (iso == null || iso.isEmpty) return '—';
    try {
      final dt = DateTime.parse(iso).toLocal();
      final now = DateTime.now();
      final diff = now.difference(dt);
      if (diff.inMinutes < 1) return 'щойно';
      if (diff.inMinutes < 60) return '${diff.inMinutes} хв тому';
      if (diff.inHours < 24) return '${diff.inHours} год тому';
      if (diff.inDays < 7) return '${diff.inDays} дн тому';
      return '${dt.day.toString().padLeft(2, '0')}.${dt.month.toString().padLeft(2, '0')}.${dt.year}';
    } catch (_) {
      return iso;
    }
  }

  Widget _buildChip({required Color color, required String text, IconData? icon}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withOpacity(0.4), width: 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 14, color: color),
            const SizedBox(width: 6),
          ],
          Text(
            text,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: color,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildInfoRow(String label, String value, {IconData? icon}) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 18, color: theme.colorScheme.outline),
            const SizedBox(width: 10),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.outline,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  value.isEmpty ? '—' : value,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                    color: theme.colorScheme.onSurface,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final body = _loading
        ? const Center(child: CircularProgressIndicator())
        : _error != null
            ? Center(
                child: Padding(
                  padding: const EdgeInsets.all(24.0),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.error_outline, size: 42, color: theme.colorScheme.error),
                      const SizedBox(height: 12),
                      Text(
                        _error!,
                        textAlign: TextAlign.center,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: theme.colorScheme.error,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 16),
                      FilledButton.icon(
                        onPressed: _fetchDetails,
                        icon: const Icon(Icons.refresh),
                        label: const Text('Спробувати ще раз'),
                      ),
                    ],
                  ),
                ),
              )
            : RefreshIndicator(
                onRefresh: _fetchDetails,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
                  children: [
                    if (_ticket != null) ...[
                      _buildHeader(theme, _ticket!),
                      const SizedBox(height: 12),
                      _buildDescription(theme, _ticket!),
                      const SizedBox(height: 12),
                      _buildDetails(theme, _ticket!),
                      const SizedBox(height: 12),
                      _buildTags(theme, _ticket!),
                      const SizedBox(height: 24),
                    ],
                  ],
                ),
              );

    return MainLayout(
      currentRoute: '/tickets',
      child: Scaffold(
        appBar: AppBar(
          title: Text(
            _ticket != null
                ? (_ticket!['title']?.toString() ?? 'Заявка')
                : 'Заявка',
          ),
        ),
        body: body,
      ),
    );
  }

  Widget _buildHeader(ThemeData theme, Map<String, dynamic> t) {
    final status = (t['status'] ?? '').toString();
    final priority = (t['priority'] ?? '').toString();

    return Card(
      elevation: 0,
      color: theme.colorScheme.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              t['title']?.toString() ?? 'Без назви',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _buildChip(
                  color: AppTheme.getStatusColor(status),
                  text: _getStatusText(status),
                  icon: Icons.flag_rounded,
                ),
                if (priority.isNotEmpty)
                  _buildChip(
                    color: AppTheme.getPriorityColor(priority),
                    text: _getPriorityText(priority),
                    icon: Icons.priority_high_rounded,
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDescription(ThemeData theme, Map<String, dynamic> t) {
    final description = t['description']?.toString() ?? '';
    if (description.isEmpty) return const SizedBox.shrink();

    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Опис',
              style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            Text(
              description,
              style: theme.textTheme.bodyMedium,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDetails(ThemeData theme, Map<String, dynamic> t) {
    final dynamic createdByRaw = t['createdBy'];
    final Map<String, dynamic>? createdBy = createdByRaw is Map
        ? Map<String, dynamic>.from(createdByRaw as Map)
        : null;

    final dynamic assignedToRaw = t['assignedTo'] ?? t['assignee'];
    final Map<String, dynamic>? assignedTo = assignedToRaw is Map
        ? Map<String, dynamic>.from(assignedToRaw as Map)
        : null;

    final dynamic cityRaw = t['city'];
    final Map<String, dynamic>? city = cityRaw is Map
        ? Map<String, dynamic>.from(cityRaw as Map)
        : null;

    final dynamic categoryRaw = t['category'];
    final Map<String, dynamic>? category = categoryRaw is Map
        ? Map<String, dynamic>.from(categoryRaw as Map)
        : null;

    String fullName(dynamic u) {
      if (u == null) return '—';
      if (u is Map) {
        final first = (u['firstName'] ?? u['name'] ?? '').toString();
        final last = (u['lastName'] ?? u['surname'] ?? '').toString();
        final res = ('$first $last').trim();
        return res.isEmpty ? (u['email']?.toString() ?? '—') : res;
      }
      return u.toString();
    }

    final String categoryText = category?['name']?.toString() ??
        (t['category']?.toString() ?? '—');
    final String cityText = city?['name']?.toString() ??
        (t['city']?.toString() ?? '—');

    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Деталі',
              style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            _buildInfoRow('Категорія', categoryText, icon: Icons.category_rounded),
            _buildInfoRow('Місто', cityText, icon: Icons.location_on_outlined),
            _buildInfoRow('Автор', fullName(createdBy ?? createdByRaw), icon: Icons.person_outline),
            _buildInfoRow('Виконавець', fullName(assignedTo ?? assignedToRaw), icon: Icons.engineering_outlined),
            _buildInfoRow('Створено', _formatDate(t['createdAt']?.toString())),
            _buildInfoRow('Оновлено', _formatDate(t['updatedAt']?.toString())),
            if (t['dueDate'] != null)
              _buildInfoRow('Дедлайн', _formatDate(t['dueDate']?.toString()), icon: Icons.event_outlined),
          ],
        ),
      ),
    );
  }

  Widget _buildTags(ThemeData theme, Map<String, dynamic> t) {
    final tags = (t['tags'] as List?)?.cast<dynamic>().map((e) => e.toString()).toList() ?? const <String>[];
    if (tags.isEmpty) return const SizedBox.shrink();

    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Теги',
              style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: tags
                  .map((t) => Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: theme.colorScheme.primary.withOpacity(0.08),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          t,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.primary,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ))
                  .toList(),
            ),
          ],
        ),
      ),
    );
  }
}