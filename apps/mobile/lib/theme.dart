import 'package:flutter/material.dart';

/// Usap brand: "ink and hanko". White paper, black ink, one seal-red accent;
/// the same values as the web app (apps/web/src/app/globals.css). In dark
/// mode the paper and ink swap. The old names are kept so screens didn't need
/// rewriting.
class UsapColors {
  /// Set by UsapApp from the user's choice (or the phone's setting).
  static bool dark = false;

  static Color _pick(int light, int dark_) => Color(dark ? dark_ : light);

  static Color get ink950 => _pick(0xFFFFFFFF, 0xFF0A0A0A); // page background
  static Color get ink900 => _pick(0xFFFFFFFF, 0xFF141414); // cards
  static Color get ink800 => _pick(0xFFF5F5F4, 0xFF1F1F1F); // inputs, tiles
  static Color get ink700 => _pick(0xFFE7E5E4, 0xFF2E2E2E); // borders, quiet fills
  static Color get hanko => _pick(0xFFD93A2B, 0xFFEF5444); // the one accent
  static Color get sky => hanko;
  static Color get violet => text;
  static Color get pink => text;
  static Color get text => _pick(0xFF111111, 0xFFF5F5F5);
  static Color get muted => _pick(0xFF737373, 0xFFA3A3A3);
  static Color get line => _pick(0x1F000000, 0x29FFFFFF); // hairlines, dividers

  /// Flat fills (kept as "gradients" of one color for older call sites).
  static LinearGradient get brandGradient => LinearGradient(colors: [text, text]);
  static LinearGradient get textGradient => LinearGradient(colors: [hanko, hanko]);
}

OutlineInputBorder _border(Color color, [double width = 1]) => OutlineInputBorder(
  borderRadius: BorderRadius.circular(14),
  borderSide: BorderSide(color: color, width: width),
);

ThemeData usapTheme() {
  final brightness = UsapColors.dark ? Brightness.dark : Brightness.light;
  final base = ThemeData(
    brightness: brightness,
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: UsapColors.text,
      brightness: brightness,
      primary: UsapColors.text,
      onPrimary: UsapColors.ink950,
      secondary: UsapColors.hanko,
      surface: UsapColors.ink950,
    ),
    scaffoldBackgroundColor: UsapColors.ink950,
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
  colorScheme: ColorScheme.fromSeed(
    seedColor: const Color(0xFFD93A2B),
    brightness: Brightness.dark,
    primary: Colors.white,
  ),
  scaffoldBackgroundColor: Colors.black,
);

/// True when the user asked the phone for less motion (Accessibility settings).
bool reduceMotion(BuildContext context) => MediaQuery.maybeDisableAnimationsOf(context) ?? false;
