import 'package:dio/dio.dart';

import '../services/api_client.dart';
import '../models/category.dart';
import '../models/category_stats.dart';

class CategoryRepository {
  Future<List<Category>> getCategories({bool includeInactive = true}) async {
    final Response res = await ApiClient.instance.dio.get(
      '/categories',
      queryParameters: includeInactive ? {'includeInactive': 'true'} : null,
    );
    final data = res.data as Map<String, dynamic>;
    final list = (data['data'] ?? []) as List<dynamic>;
    return list.map((e) => Category.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<CategoryStats>> getCategoryStats() async {
    final Response res = await ApiClient.instance.dio.get('/categories/stats/usage');
    final data = res.data as Map<String, dynamic>;
    final list = (data['data'] ?? []) as List<dynamic>;
    return list.map((e) => CategoryStats.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Category> createCategory({
    required String name,
    String? description,
    String? color,
    String? icon,
    int? sortOrder,
  }) async {
    final Response res = await ApiClient.instance.dio.post(
      '/categories',
      data: {
        'name': name,
        if (description != null && description.isNotEmpty) 'description': description,
        if (color != null && color.isNotEmpty) 'color': color,
        if (icon != null && icon.isNotEmpty) 'icon': icon,
        if (sortOrder != null) 'sortOrder': sortOrder,
      },
    );
    final data = res.data as Map<String, dynamic>;
    final json = data['data'] as Map<String, dynamic>;
    return Category.fromJson(json);
  }
}