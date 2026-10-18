import 'package:flutter/material.dart';

/// Usap brand: "ink and hanko". White paper, black ink, one seal-red accent;
/// the same values as the web app (apps/web/src/app/globals.css). The old
/// names are kept so screens didn't need rewriting.
class UsapColors {
  static const ink950 = Color(0xFFFFFFFF); // page background
  static const ink900 = Color(0xFFFFFFFF); // cards
  static const ink800 = Color(0xFFF5F5F4); // inputs, tiles
  static const ink700 = Color(0xFFE7E5E4); // borders, quiet fills
  static const hanko = Color(0xFFD93A2B); // the one accent
  static const sky = hanko;
  static const violet = Color(0xFF111111);
  static const pink = Color(0xFF111111);
  static const text = Color(0xFF111111);
  static const muted = Color(0xFF737373);

  /// Flat fills (kept as "gradients" of one color for older call sites).
  static const brandGradient = LinearGradient(colors: [text, text]);
  static const textGradient = LinearGradient(colors: [hanko, hanko]);
}

OutlineInputBorder _border(Color color, [double width = 1]) => OutlineInputBorder(
  borderRadius: BorderRadius.circular(14),
  borderSide: BorderSide(color: color, width: width),
);

ThemeData usapTheme() {
  final base = ThemeData(
    brightness: Brightness.light,
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: UsapColors.text,
      brightness: Brightness.light,
      primary: UsapColors.text,
      secondary: UsapColors.hanko,
      surface: Colors.white,
    ),
    scaffoldBackgroundColor: Colors.white,
  );
  return base.copyWith(
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: UsapColors.ink800,
      border: _border(UsapColors.ink700),
      enabledBorder: _border(UsapColors.ink700),
      focusedBorder: _border(UsapColors.text, 1.5),
    ),
    textTheme: base.textTheme.apply(bodyColor: UsapColors.text, displayColor: UsapColors.text),
  );
}

/// The in-call screen keeps a dark look, like most video apps.
ThemeData usapCallTheme() => ThemeData(
  brightness: Brightness.dark,
  useMaterial3: true,
  colorScheme: ColorScheme.fromSeed(seedColor: UsapColors.hanko, brightness: Brightness.dark, primary: Colors.white),
  scaffoldBackgroundColor: Colors.black,
);

/// True when the user asked the phone for less motion (Accessibility settings).
bool reduceMotion(BuildContext context) => MediaQuery.maybeDisableAnimationsOf(context) ?? false;
