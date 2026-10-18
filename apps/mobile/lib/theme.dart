import 'package:flutter/material.dart';

/// Usap brand colors, the same as the web app (apps/web/src/app/globals.css).
class UsapColors {
  static const ink950 = Color(0xFF060A14);
  static const ink900 = Color(0xFF0A1020);
  static const ink800 = Color(0xFF111A2F);
  static const ink700 = Color(0xFF1B2642);
  static const sky = Color(0xFF38BDF8);
  static const violet = Color(0xFF8B5CF6);
  static const pink = Color(0xFFF0ABFC);
  static const text = Color(0xFFE8ECF5);
  static const muted = Color(0xFF94A3B8);

  /// The accent gradient used for buttons and highlighted text.
  static const brandGradient = LinearGradient(colors: [Color(0xFF0EA5E9), violet]);
  static const textGradient = LinearGradient(colors: [sky, violet, pink]);
}

ThemeData usapTheme() {
  final base = ThemeData(
    brightness: Brightness.dark,
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: UsapColors.sky,
      brightness: Brightness.dark,
      surface: UsapColors.ink900,
    ),
    scaffoldBackgroundColor: UsapColors.ink950,
  );
  return base.copyWith(
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: UsapColors.ink800,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.1)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.1)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: UsapColors.sky, width: 1.5),
      ),
    ),
    textTheme: base.textTheme.apply(bodyColor: UsapColors.text, displayColor: Colors.white),
  );
}

/// True when the user asked the phone for less motion (Accessibility settings).
bool reduceMotion(BuildContext context) => MediaQuery.maybeDisableAnimationsOf(context) ?? false;
