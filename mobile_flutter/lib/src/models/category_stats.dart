class CategoryStats {
  final String categoryId;
  final int totalTickets;
  final int openTickets;
  final int resolvedTickets;

  CategoryStats({
    required this.categoryId,
    required this.totalTickets,
    required this.openTickets,
    required this.resolvedTickets,
  });

  factory CategoryStats.fromJson(Map<String, dynamic> json) {
    int parseInt(dynamic v) {
      if (v is int) return v;
      return int.tryParse('$v') ?? 0;
    }

    return CategoryStats(
      categoryId: (json['categoryId'] ?? json['category'] ?? '').toString(),
      totalTickets: parseInt(json['totalTickets']),
      openTickets: parseInt(json['openTickets']),
      resolvedTickets: parseInt(json['resolvedTickets']),
    );
  }
}