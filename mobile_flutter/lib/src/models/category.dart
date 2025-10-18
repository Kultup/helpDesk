class Category {
  final String id;
  final String name;
  final String? description;
  final String color;
  final String? icon;
  final int? sortOrder;
  final bool isActive;

  Category({
    required this.id,
    required this.name,
    this.description,
    required this.color,
    this.icon,
    this.sortOrder,
    required this.isActive,
  });

  factory Category.fromJson(Map<String, dynamic> json) {
    return Category(
      id: (json['_id'] ?? json['id'] ?? '').toString(),
      name: (json['name'] ?? '').toString(),
      description: json['description']?.toString(),
      color: (json['color'] ?? '#4F46E5').toString(),
      icon: json['icon']?.toString(),
      sortOrder: json['sortOrder'] is int ? json['sortOrder'] as int : int.tryParse('${json['sortOrder']}'),
      isActive: json['isActive'] == true || json['isActive'] == 'true',
    );
  }
}