import 'package:flutter/material.dart';

import '../repositories/category_repository.dart';
import '../models/category.dart';
import '../models/category_stats.dart';
import '../theme/app_theme.dart';
import '../widgets/bottom_navigation_bar.dart';

class CategoriesScreen extends StatefulWidget {
  const CategoriesScreen({super.key});

  @override
  State<CategoriesScreen> createState() => _CategoriesScreenState();
}

class _CategoriesScreenState extends State<CategoriesScreen> {
  final CategoryRepository _repo = CategoryRepository();
  bool _loading = true;
  String? _error;
  List<Category> _categories = [];
  List<CategoryStats> _stats = [];
  bool _showInactive = true;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final categories = await _repo.getCategories(includeInactive: true);
      final stats = await _repo.getCategoryStats();
      setState(() {
        _categories = categories;
        _stats = stats;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  CategoryStats _statsFor(String categoryId) {
    return _stats.firstWhere(
      (s) => s.categoryId == categoryId,
      orElse: () => CategoryStats(
        categoryId: categoryId,
        totalTickets: 0,
        openTickets: 0,
        resolvedTickets: 0,
      ),
    );
  }

  void _onNavTap(String route) {
    if (ModalRoute.of(context)?.settings.name == route) return;
    Navigator.of(context).pushReplacementNamed(route);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final filtered = _showInactive
        ? _categories
        : _categories.where((c) => c.isActive).toList();

    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      appBar: AppBar(
        title: const Text('Категорії'),
        backgroundColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        actions: [
          Row(
            children: [
              const Text('Показати неактивні'),
              Switch(
                value: _showInactive,
                onChanged: (v) => setState(() => _showInactive = v),
              ),
            ],
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Оновити',
            onPressed: _loadData,
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Text(
                      _error!,
                      style: theme.textTheme.bodyMedium?.copyWith(color: AppTheme.errorColor),
                      textAlign: TextAlign.center,
                    ),
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _loadData,
                  child: ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
                    itemCount: filtered.length + 1,
                    itemBuilder: (context, index) {
                      if (index == 0) {
                        return _buildHeaderStats(theme);
                      }
                      final category = filtered[index - 1];
                      final stats = _statsFor(category.id);
                      return _buildCategoryCard(theme, category, stats);
                    },
                  ),
                ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openCreateCategory,
        icon: const Icon(Icons.add),
        label: const Text('Додати категорію'),
      ),
      bottomNavigationBar: CustomBottomNavigationBar(
        currentRoute: '/categories',
        onItemTapped: _onNavTap,
      ),
    );
  }

  Widget _buildHeaderStats(ThemeData theme) {
    final total = _categories.length;
    final totalTickets = _stats.fold<int>(0, (sum, s) => sum + s.totalTickets);
    final openTickets = _stats.fold<int>(0, (sum, s) => sum + s.openTickets);

    return Padding(
      padding: const EdgeInsets.only(bottom: 12.0),
      child: Row(
        children: [
          _statBox(theme, 'Категорій', total.toString(), AppTheme.primaryColor),
          const SizedBox(width: 12),
          _statBox(theme, 'Заявок', totalTickets.toString(), Colors.blue),
          const SizedBox(width: 12),
          _statBox(theme, 'Відкритих', openTickets.toString(), Colors.orange),
        ],
      ),
    );
  }

  Widget _statBox(ThemeData theme, String label, String value, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 12),
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: theme.colorScheme.outline.withOpacity(0.15)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurface.withOpacity(0.6))),
            const SizedBox(height: 6),
            Text(value, style: theme.textTheme.titleMedium?.copyWith(color: color, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }

  Widget _buildCategoryCard(ThemeData theme, Category category, CategoryStats stats) {
    Color parsedColor;
    try {
      parsedColor = _parseHexColor(category.color);
    } catch (_) {
      parsedColor = AppTheme.primaryColor;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: theme.colorScheme.outline.withOpacity(0.15)),
        boxShadow: [
          BoxShadow(
            color: theme.colorScheme.shadow.withOpacity(0.05),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(12.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(
                    color: parsedColor.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: parsedColor.withOpacity(0.4)),
                  ),
                  child: Icon(Icons.tag, size: 18, color: parsedColor),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              category.name,
                              style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          if (!category.isActive)
                            Container(
                              padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 8),
                              decoration: BoxDecoration(
                                color: theme.colorScheme.errorContainer,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text(
                                'Неактивна',
                                style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onErrorContainer),
                              ),
                            ),
                        ],
                      ),
                      if (category.description != null && category.description!.isNotEmpty)
                        Text(
                          category.description!,
                          style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurface.withOpacity(0.7)),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                _chip(theme, 'Заявок', stats.totalTickets.toString()),
                const SizedBox(width: 8),
                _chip(theme, 'Відкритих', stats.openTickets.toString()),
                const SizedBox(width: 8),
                _chip(theme, 'Закритих', stats.resolvedTickets.toString()),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _chip(ThemeData theme, String label, String value) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 10),
      decoration: BoxDecoration(
        color: theme.colorScheme.primary.withOpacity(0.08),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: theme.colorScheme.primary.withOpacity(0.2)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurface.withOpacity(0.7))),
          const SizedBox(width: 6),
          Text(value, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.primary, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }

  Future<void> _openCreateCategory() async {
    final nameCtrl = TextEditingController();
    final descCtrl = TextEditingController();
    final colorCtrl = TextEditingController(text: '#3B82F6');
    final iconCtrl = TextEditingController();
    final sortCtrl = TextEditingController();
    bool saving = false;

    final created = await showModalBottomSheet<Category?>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setModalState) {
            return SafeArea(
              child: Padding(
                padding: EdgeInsets.only(
                  bottom: MediaQuery.of(ctx).viewInsets.bottom,
                  left: 16,
                  right: 16,
                  top: 12,
                ),
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Expanded(
                            child: Text(
                              'Нова категорія',
                              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                            ),
                          ),
                          IconButton(
                            icon: const Icon(Icons.close),
                            onPressed: () => Navigator.of(ctx).pop(),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        controller: nameCtrl,
                        textInputAction: TextInputAction.next,
                        decoration: const InputDecoration(
                          labelText: 'Назва *',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: descCtrl,
                        maxLines: 3,
                        decoration: const InputDecoration(
                          labelText: 'Опис',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: colorCtrl,
                              textInputAction: TextInputAction.next,
                              decoration: const InputDecoration(
                                labelText: 'Колір (hex, напр. #3B82F6)',
                                border: OutlineInputBorder(),
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: TextField(
                              controller: iconCtrl,
                              textInputAction: TextInputAction.next,
                              decoration: const InputDecoration(
                                labelText: 'Іконка (назва)',
                                border: OutlineInputBorder(),
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: sortCtrl,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Порядок сортування',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          TextButton(
                            onPressed: saving ? null : () => Navigator.of(ctx).pop(),
                            child: const Text('Скасувати'),
                          ),
                          const Spacer(),
                          ElevatedButton.icon(
                            icon: saving
                                ? const SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(strokeWidth: 2),
                                  )
                                : const Icon(Icons.check),
                            label: Text(saving ? 'Створення…' : 'Створити'),
                            onPressed: saving
                                ? null
                                : () async {
                                    final name = nameCtrl.text.trim();
                                    if (name.isEmpty) {
                                      if (!mounted) return;
                                      ScaffoldMessenger.of(context).showSnackBar(
                                        const SnackBar(content: Text('Вкажіть назву категорії')),
                                      );
                                      return;
                                    }
                                    setModalState(() => saving = true);
                                    try {
                                      String? color = colorCtrl.text.trim();
                                      color = color.isEmpty ? null : color;
                                      final icon = iconCtrl.text.trim().isEmpty ? null : iconCtrl.text.trim();
                                      final sortStr = sortCtrl.text.trim();
                                      final int? sortOrder = sortStr.isEmpty ? null : int.tryParse(sortStr);

                                      final created = await _repo.createCategory(
                                        name: name,
                                        description: descCtrl.text.trim().isEmpty ? null : descCtrl.text.trim(),
                                        color: color,
                                        icon: icon,
                                        sortOrder: sortOrder,
                                      );
                                      if (context.mounted) {
                                        Navigator.of(ctx).pop(created);
                                      }
                                    } catch (e) {
                                      if (!mounted) return;
                                      ScaffoldMessenger.of(context).showSnackBar(
                                        SnackBar(content: Text('Помилка створення: ${e.toString()}')),
                                      );
                                    } finally {
                                      setModalState(() => saving = false);
                                    }
                                  },
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );

    if (created != null) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Категорію створено')),
      );
      await _loadData();
    }
  }

  Color _parseHexColor(String hex) {
    String cleaned = hex.replaceAll('#', '');
    if (cleaned.length == 6) {
      cleaned = 'FF$cleaned';
    }
    final intColor = int.parse(cleaned, radix: 16);
    return Color(intColor);
  }
}