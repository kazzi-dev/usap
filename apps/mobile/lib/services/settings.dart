import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Default server, baked in at build time:
///   flutter build apk --dart-define=SIGNAL_URL=https://192.168.1.10:4000
/// (scripts/build-mobile.mjs fills in this laptop's LAN IP automatically.)
const defaultSignalUrl = String.fromEnvironment('SIGNAL_URL', defaultValue: 'https://192.168.1.10:4000');

/// Saved preferences: name, language and server address.
class Settings {
  Settings._(this._prefs);

  static Future<Settings> load() async => Settings._(await SharedPreferences.getInstance());

  final SharedPreferences _prefs;

  String get name => _prefs.getString('name') ?? '';
  set name(String value) => _prefs.setString('name', value);

  /// Has the first-run intro been shown? (Bump the key to show it again after big changes.)
  bool get onboarded => _prefs.getBool('onboarded.v1') ?? false;
  set onboarded(bool value) => _prefs.setBool('onboarded.v1', value);

  String get language => _prefs.getString('lang') ?? 'en';
  set language(String value) => _prefs.setString('lang', value);

  String get signalUrl => _prefs.getString('signalUrl') ?? defaultSignalUrl;
  set signalUrl(String value) {
    _prefs.setString('signalUrl', value);
    DevCertificateOverrides.trustedHost = Uri.tryParse(value)?.host;
  }

  /// The web app's address on the same machine (port 3000 instead of 4000),
  /// used to build invite links the other person can open in a browser.
  String get webUrl {
    final uri = Uri.parse(signalUrl);
    return uri.replace(port: uri.port == 4000 ? 3000 : uri.port).origin;
  }
}

/// During development the server uses a self-signed HTTPS certificate
/// (npm run dev:https), which phones don't trust. In DEBUG builds only, accept
/// it for the one host the user configured. Release builds never do this.
class DevCertificateOverrides extends HttpOverrides {
  static String? trustedHost;

  static void install(String signalUrl) {
    if (!kDebugMode) return;
    trustedHost = Uri.tryParse(signalUrl)?.host;
    HttpOverrides.global = DevCertificateOverrides();
  }

  @override
  HttpClient createHttpClient(SecurityContext? context) {
    return super.createHttpClient(context)
      ..badCertificateCallback = (cert, host, port) => trustedHost != null && host == trustedHost;
  }
}
