import 'package:flutter/material.dart';

import 'screens/home_screen.dart';
import 'screens/onboarding_screen.dart';
import 'services/settings.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final settings = await Settings.load();
  DevCertificateOverrides.install(settings.signalUrl);
  runApp(UsapApp(settings: settings));
}

class UsapApp extends StatefulWidget {
  const UsapApp({super.key, required this.settings});

  final Settings settings;

  @override
  State<UsapApp> createState() => _UsapAppState();
}

class _UsapAppState extends State<UsapApp> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    Settings.themeChanges.addListener(_rebuild);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    Settings.themeChanges.removeListener(_rebuild);
    super.dispose();
  }

  // The phone switched light/dark: follow it when the choice is "Auto".
  @override
  void didChangePlatformBrightness() => _rebuild();

  void _rebuild() => setState(() {});

  @override
  Widget build(BuildContext context) {
    final mode = widget.settings.themeMode;
    final phoneDark = WidgetsBinding.instance.platformDispatcher.platformBrightness == Brightness.dark;
    UsapColors.dark = mode == 'dark' || (mode == 'system' && phoneDark);
    return MaterialApp(
      // A new key rebuilds every screen with the new colors.
      key: ValueKey(UsapColors.dark),
      title: 'Usap',
      debugShowCheckedModeBanner: false,
      theme: usapTheme(),
      // First launch: the intro, which then continues to the home screen.
      home: widget.settings.onboarded
          ? HomeScreen(settings: widget.settings)
          : OnboardingScreen(settings: widget.settings),
    );
  }
}
