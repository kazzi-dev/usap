import 'package:flutter/material.dart';

import '../services/settings.dart';
import '../util/ids.dart';
import '../widgets/language_dropdown.dart';
import 'call_screen.dart';

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
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => CallScreen(
        settings: settings,
        roomId: roomId,
        name: settings.name.isEmpty ? 'Guest' : settings.name,
        language: _language,
      ),
    ));
  }

  void _join() {
    final roomId = parseRoomInput(_room.text);
    setState(() => _roomError = roomId == null ? 'Paste an invite link or a code like abc-defg-hij' : null);
    if (roomId != null) _open(roomId);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            const SizedBox(height: 24),
            Text('Usap', style: Theme.of(context).textTheme.displaySmall?.copyWith(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            const Text('Video calls with live translated subtitles.', style: TextStyle(color: Colors.white60)),
            const SizedBox(height: 32),
            TextField(
              controller: _name,
              maxLength: 40,
              decoration: const InputDecoration(labelText: 'Your name', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 8),
            const Text('Language you speak (subtitles will be shown in it too)',
                style: TextStyle(color: Colors.white70)),
            LanguageDropdown(value: _language, onChanged: (code) => setState(() => _language = code)),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: () => _open(createRoomId()),
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
              child: const Text('Start a new call'),
            ),
            const SizedBox(height: 24),
            TextField(
              controller: _room,
              decoration: InputDecoration(
                labelText: 'Invite link or room code',
                border: const OutlineInputBorder(),
                errorText: _roomError,
                suffixIcon: IconButton(icon: const Icon(Icons.login), onPressed: _join, tooltip: 'Join'),
              ),
              onSubmitted: (_) => _join(),
            ),
            const SizedBox(height: 32),
            ExpansionTile(
              title: const Text('Server'),
              subtitle: Text(_server.text, style: const TextStyle(color: Colors.white54)),
              tilePadding: EdgeInsets.zero,
              children: [
                TextField(
                  controller: _server,
                  keyboardType: TextInputType.url,
                  decoration: const InputDecoration(
                    labelText: 'Signaling server URL',
                    helperText: 'Your laptop running npm run dev:https, e.g. https://192.168.1.10:4000',
                    border: OutlineInputBorder(),
                  ),
                  onChanged: (_) => setState(() {}),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
