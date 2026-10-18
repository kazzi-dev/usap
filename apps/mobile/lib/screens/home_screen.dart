import 'package:flutter/material.dart';

import '../services/settings.dart';
import '../theme.dart';
import '../util/ids.dart';
import '../widgets/brand.dart';
import '../widgets/language_dropdown.dart';
import '../widgets/subtitle_demo.dart';
import 'call_screen.dart';
import 'onboarding_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.settings});

  final Settings settings;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late final _name = TextEditingController(text: widget.settings.name);
  late final _server = TextEditingController(text: widget.settings.signalUrl);
  final _room = TextEditingController();
  late String _language = widget.settings.language;
  String? _roomError;

  @override
  void dispose() {
    _name.dispose();
    _server.dispose();
    _room.dispose();
    super.dispose();
  }

  void _open(String roomId) {
    final settings = widget.settings
      ..name = _name.text.trim()
      ..language = _language
      ..signalUrl = _server.text.trim().replaceAll(RegExp(r'/$'), '');
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => CallScreen(
          settings: settings,
          roomId: roomId,
          name: settings.name.isEmpty ? 'Guest' : settings.name,
          language: _language,
        ),
      ),
    );
  }

  void _join() {
    final roomId = parseRoomInput(_room.text);
    setState(() => _roomError = roomId == null ? 'Paste an invite link or a code like abc-defg-hij' : null);
    if (roomId == null) return;
    // An invite link can tell us which server the call is on (e.g. a public
    // npm run share link), so the user doesn't have to change it by hand.
    final server = signalUrlFromInvite(_room.text);
    if (server != null && server != _server.text.trim()) {
      setState(() => _server.text = server);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Using the server from the link: $server')));
    }
    _open(roomId);
  }

  /// Settings sheet: the server address, and the intro again.
  void _openSettings() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: UsapColors.ink900,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (sheetContext) => Padding(
        padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + MediaQuery.viewInsetsOf(sheetContext).bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Settings',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: UsapColors.text),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _server,
              keyboardType: TextInputType.url,
              decoration: const InputDecoration(
                labelText: 'Server',
                helperText: 'Set automatically when you paste an invite link.',
              ),
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 8),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.auto_awesome, color: UsapColors.sky),
              title: const Text('Replay the intro'),
              onTap: () {
                Navigator.of(sheetContext).pop();
                Navigator.of(context)
                    .push(MaterialPageRoute(builder: (_) => OnboardingScreen(settings: widget.settings, replay: true)));
              },
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: AuroraBackground(
        child: SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
            children: [
              Row(
                children: [
                  const Logo(),
                  const Spacer(),
                  IconButton(
                    onPressed: _openSettings,
                    tooltip: 'Settings',
                    icon: const Icon(Icons.tune_rounded, color: UsapColors.muted),
                  ),
                ],
              ),
              const SizedBox(height: 22),
              const Text(
                'Talk to anyone.',
                style: TextStyle(fontSize: 34, fontWeight: FontWeight.w700, color: UsapColors.text, height: 1.1),
              ),
              const GradientText(
                'Read them in your language.',
                style: TextStyle(fontSize: 34, fontWeight: FontWeight.w700, height: 1.1),
              ),
              const SizedBox(height: 12),
              const Text(
                'Live subtitles, translated for each person, in English, Tagalog, Bisaya and Japanese.',
                style: TextStyle(fontSize: 15, height: 1.4, color: Color(0xFF404040)),
              ),
              const SizedBox(height: 20),
              const SubtitleDemo(),
              const SizedBox(height: 16),

              // Start / join card
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: UsapColors.ink900.withValues(alpha: 0.85),
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(color: Colors.black.withValues(alpha: 0.08)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    TextField(
                      controller: _name,
                      maxLength: 40,
                      textCapitalization: TextCapitalization.words,
                      decoration: const InputDecoration(
                        labelText: 'Your name',
                        counterText: '',
                        prefixIcon: Icon(Icons.person_outline),
                      ),
                    ),
                    const SizedBox(height: 10),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                      decoration: BoxDecoration(
                        color: UsapColors.ink800,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: Colors.black.withValues(alpha: 0.1)),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.translate_rounded, color: UsapColors.muted, size: 22),
                          const SizedBox(width: 12),
                          const Text('I speak', style: TextStyle(color: UsapColors.muted)),
                          const Spacer(),
                          LanguageDropdown(
                            value: _language,
                            compact: true,
                            onChanged: (code) => setState(() => _language = code),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    GradientButton(
                      label: 'Start a new call',
                      icon: Icons.arrow_forward_rounded,
                      onPressed: () => _open(createRoomId()),
                    ),
                    const SizedBox(height: 16),
                    const Row(
                      children: [
                        Expanded(child: Divider(color: Colors.black12)),
                        Padding(
                          padding: EdgeInsets.symmetric(horizontal: 10),
                          child: Text('or join with a link', style: TextStyle(fontSize: 12, color: UsapColors.muted)),
                        ),
                        Expanded(child: Divider(color: Colors.black12)),
                      ],
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _room,
                      decoration: InputDecoration(
                        hintText: 'Invite link or room code',
                        errorText: _roomError,
                        prefixIcon: const Icon(Icons.link_rounded),
                        suffixIcon: IconButton(
                          icon: const Icon(Icons.login_rounded),
                          onPressed: _join,
                          tooltip: 'Join',
                        ),
                      ),
                      onSubmitted: (_) => _join(),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
