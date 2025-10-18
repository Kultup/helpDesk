import 'package:flutter/material.dart';

class AppTheme {
  // Кольори
  static const Color primaryColor = Color(0xFF2563EB); // Синій
  static const Color secondaryColor = Color(0xFF10B981); // Зелений
  static const Color errorColor = Color(0xFFEF4444); // Червоний
  static const Color warningColor = Color(0xFFF59E0B); // Жовтий
  static const Color surfaceColor = Color(0xFFF8FAFC); // Світло-сірий
  static const Color cardColor = Color(0xFFFFFFFF); // Білий
  static const Color textPrimaryColor = Color(0xFF1F2937); // Темно-сірий
  static const Color textSecondaryColor = Color(0xFF6B7280); // Сірий
  static const Color backgroundColor = Color(0xFFF8FAFC); // Світло-сірий фон

  // Градієнти
  static const LinearGradient primaryGradient = LinearGradient(
    colors: [Color(0xFF3B82F6), Color(0xFF1D4ED8)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const LinearGradient successGradient = LinearGradient(
    colors: [Color(0xFF10B981), Color(0xFF059669)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  // Світла тема
  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: primaryColor,
        brightness: Brightness.light,
        primary: primaryColor,
        secondary: secondaryColor,
        error: errorColor,
        surface: surfaceColor,
      ),
      
      // AppBar тема
      appBarTheme: const AppBarTheme(
        backgroundColor: primaryColor,
        foregroundColor: Colors.white,
        elevation: 0,
        centerTitle: true,
        titleTextStyle: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w600,
          color: Colors.white,
        ),
      ),

      // Card тема
      cardTheme: CardThemeData(
        color: cardColor,
        elevation: 2,
        shadowColor: Colors.black.withOpacity(0.1),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),

      // ElevatedButton тема
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: primaryColor,
          foregroundColor: Colors.white,
          elevation: 2,
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
          ),
          textStyle: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),

      // TextFormField тема
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.grey.shade50,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: BorderSide(color: Colors.grey.shade300),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: BorderSide(color: Colors.grey.shade300),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: primaryColor, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: errorColor),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        labelStyle: const TextStyle(color: textSecondaryColor),
      ),

      // ListTile тема
      listTileTheme: const ListTileThemeData(
        contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        titleTextStyle: TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w500,
          color: textPrimaryColor,
        ),
        subtitleTextStyle: TextStyle(
          fontSize: 14,
          color: textSecondaryColor,
        ),
      ),

      // Текстові стилі
      textTheme: const TextTheme(
        headlineLarge: TextStyle(
          fontSize: 32,
          fontWeight: FontWeight.bold,
          color: textPrimaryColor,
        ),
        headlineMedium: TextStyle(
          fontSize: 28,
          fontWeight: FontWeight.bold,
          color: textPrimaryColor,
        ),
        headlineSmall: TextStyle(
          fontSize: 24,
          fontWeight: FontWeight.w600,
          color: textPrimaryColor,
        ),
        titleLarge: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w600,
          color: textPrimaryColor,
        ),
        titleMedium: TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.w500,
          color: textPrimaryColor,
        ),
        bodyLarge: TextStyle(
          fontSize: 16,
          color: textPrimaryColor,
        ),
        bodyMedium: TextStyle(
          fontSize: 14,
          color: textPrimaryColor,
        ),
        bodySmall: TextStyle(
          fontSize: 12,
          color: textSecondaryColor,
        ),
      ),
    );
  }

  // Допоміжні методи для статусів тікетів
  static Color getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'open':
      case 'відкритий':
        return const Color(0xFF3B82F6); // Синій
      case 'in_progress':
      case 'в_роботі':
        return const Color(0xFFF59E0B); // Жовтий
      case 'resolved':
      case 'вирішений':
        return const Color(0xFF10B981); // Зелений
      case 'closed':
      case 'закритий':
        return const Color(0xFF6B7280); // Сірий
      default:
        return const Color(0xFF6B7280);
    }
  }

  static Color getPriorityColor(String priority) {
    switch (priority.toLowerCase()) {
      case 'low':
      case 'низький':
        return const Color(0xFF10B981); // Зелений
      case 'medium':
      case 'середній':
        return const Color(0xFFF59E0B); // Жовтий
      case 'high':
      case 'високий':
        return const Color(0xFFEF4444); // Червоний
      case 'urgent':
      case 'терміновий':
        return const Color(0xFF7C2D12); // Темно-червоний
      default:
        return const Color(0xFF6B7280);
    }
  }
}