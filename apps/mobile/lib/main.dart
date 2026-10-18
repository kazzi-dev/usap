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

class UsapApp extends StatelessWidget {
  const UsapApp({super.key, required this.settings});

  final Settings settings;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Usap',
      debugShowCheckedModeBanner: false,
      theme: usapTheme(),
      // First launch: the intro, which then continues to the home screen.
      home: settings.onboarded ? HomeScreen(settings: settings) : OnboardingScreen(settings: settings),
    );
  }
}
