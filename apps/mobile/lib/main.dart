import 'package:flutter/material.dart';

import 'screens/home_screen.dart';
import 'services/settings.dart';

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
      // Dark, like the web app and most video-call apps.
      theme: ThemeData(
        brightness: Brightness.dark,
        colorSchemeSeed: const Color(0xFF0284C7), // sky-600, the web app's accent
        scaffoldBackgroundColor: const Color(0xFF0A0A0A),
        useMaterial3: true,
      ),
      home: HomeScreen(settings: settings),
    );
  }
}
