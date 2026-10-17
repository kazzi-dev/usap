import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

import '../services/call_session.dart';
import '../services/settings.dart';
import '../widgets/language_dropdown.dart';
import '../widgets/subtitle_overlay.dart';

class CallScreen extends StatefulWidget {
  const CallScreen({
    super.key,
    required this.settings,
    required this.roomId,
    required this.name,
    required this.language,
  });

  final Settings settings;
  final String roomId;
  final String name;
  final String language;

  @override
  State<CallScreen> createState() => _CallScreenState();
}

class _CallScreenState extends State<CallScreen> {
  late CallSession _session = _newSession(widget.language);

  CallSession _newSession(String language) {
    final session = CallSession(
      signalUrl: widget.settings.signalUrl,
      roomId: widget.roomId,
      name: widget.name,
      language: language,
    );
    session.start();
    return session;
  }

  @override
  void dispose() {
    _session.dispose(); // leaves the call and frees camera/mic
    super.dispose();
  }

  void _rejoin() {
    final language = _session.language; // keep the language used in the call
    _session.dispose();
    setState(() => _session = _newSession(language));
  }

  Future<void> _copyInvite() async {
    final link = '${widget.settings.webUrl}/room/${widget.roomId}';
    await Clipboard.setData(ClipboardData(text: link));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Invite link copied: $link')));
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _session,
      builder: (context, _) {
        final s = _session;
        return Scaffold(
          body: SafeArea(
            child: switch (s.status) {
              CallStatus.ended || CallStatus.roomFull || CallStatus.error => _CallOver(session: s, onRejoin: _rejoin),
              _ => _buildCall(s),
            },
          ),
        );
      },
    );
  }

  Widget _buildCall(CallSession s) {
    final message = _statusMessage(s);
    return Column(
      children: [
        // Header: room code, status, language, invite.
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 8, 4),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(widget.roomId, style: const TextStyle(fontFamily: 'monospace', color: Colors.white70)),
                    Text('${_statusLabel(s.status)} · Subtitles: ${_captionLabel(s)}',
                        style: const TextStyle(fontSize: 12, color: Colors.white54)),
                  ],
                ),
              ),
              LanguageDropdown(
                value: s.language,
                compact: true,
                onChanged: (code) {
                  widget.settings.language = code;
                  s.setLanguage(code);
                },
              ),
              IconButton(onPressed: _copyInvite, icon: const Icon(Icons.link), tooltip: 'Copy invite link'),
            ],
          ),
        ),
        if (s.error != null || (s.status != CallStatus.starting && !s.signalConnected))
          _Banner(text: s.error ?? 'Lost connection to the server. Reconnecting…', color: Colors.amber.shade900),
        if (s.notice != null) _Banner(text: s.notice!, color: Colors.white12),

        // Video area: the other person full size, me in a small corner tile.
        Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Container(color: const Color(0xFF262626)),
                  if (s.status == CallStatus.connected && (s.remote?.media.video ?? false) && s.hasRemoteVideo)
                    RTCVideoView(s.remoteRenderer, objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover)
                  else if (s.remote != null)
                    _Avatar(name: s.remote!.name),
                  if (message != null)
                    // Leaves room on the right for the self-view tile.
                    Positioned(top: 16, left: 16, right: 124, child: Center(child: _Pill(text: message))),
                  Positioned(
                    top: 12,
                    right: 12,
                    width: 100,
                    height: 140,
                    child: Container(
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(12),
                        // Green outline while voice detection hears you.
                        border: Border.all(color: s.localSpeaking ? Colors.greenAccent : Colors.white24, width: 2),
                      ),
                      clipBehavior: Clip.antiAlias,
                      child: s.localMedia.video
                          ? RTCVideoView(s.localRenderer,
                              mirror: true, objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover)
                          : _Avatar(name: widget.name, small: true),
                    ),
                  ),
                  Positioned(left: 8, right: 8, bottom: 8, child: SubtitleOverlay(lines: s.subtitles)),
                ],
              ),
            ),
          ),
        ),

        // Controls.
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              _RoundButton(
                icon: s.localMedia.audio ? Icons.mic : Icons.mic_off,
                active: s.localMedia.audio,
                tooltip: s.localMedia.audio ? 'Mute' : 'Unmute',
                onPressed: s.toggleAudio,
              ),
              _RoundButton(
                icon: s.localMedia.video ? Icons.videocam : Icons.videocam_off,
                active: s.localMedia.video,
                tooltip: s.localMedia.video ? 'Camera off' : 'Camera on',
                onPressed: s.toggleVideo,
              ),
              _RoundButton(
                icon: Icons.cameraswitch,
                active: true,
                tooltip: 'Switch camera',
                onPressed: s.localMedia.video ? s.switchCamera : null,
              ),
              _RoundButton(
                icon: s.captionsEnabled ? Icons.closed_caption : Icons.closed_caption_off,
                active: s.captionsEnabled,
                tooltip: 'Subtitles for your speech',
                onPressed: s.toggleCaptions,
              ),
              _RoundButton(
                icon: Icons.call_end,
                active: true,
                color: Colors.red,
                tooltip: 'End call',
                onPressed: s.end,
              ),
            ],
          ),
        ),
      ],
    );
  }

  static String? _statusMessage(CallSession s) {
    final other = s.remote?.name ?? 'the other person';
    return switch (s.status) {
      CallStatus.starting => 'Starting camera and joining…',
      CallStatus.waiting => 'Waiting for someone to join. Share the invite link.',
      CallStatus.connecting => 'Connecting to $other…',
      CallStatus.reconnecting => s.remote?.signalConnected == false
          ? '$other lost their connection. Waiting for them…'
          : 'Connection interrupted. Reconnecting…',
      _ => null,
    };
  }

  static String _statusLabel(CallStatus status) => switch (status) {
        CallStatus.connected => 'Connected',
        CallStatus.connecting => 'Connecting',
        CallStatus.reconnecting => 'Reconnecting',
        CallStatus.waiting => 'Waiting',
        _ => 'Starting',
      };

  static String _captionLabel(CallSession s) => switch (s.captionStatus) {
        CaptionStatus.on => s.localSpeaking ? 'hearing you…' : 'listening',
        CaptionStatus.starting => 'starting',
        CaptionStatus.unavailable => 'unavailable',
        CaptionStatus.off => 'off',
      };
}

class _CallOver extends StatelessWidget {
  const _CallOver({required this.session, required this.onRejoin});

  final CallSession session;
  final VoidCallback onRejoin;

  @override
  Widget build(BuildContext context) {
    final (title, detail) = switch (session.status) {
      CallStatus.roomFull => ('This call is full', 'Usap calls are 1-on-1 and two people are already in this room.'),
      CallStatus.error => ('Something went wrong', session.error),
      _ => ('You left the call', null),
    };
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(title, style: Theme.of(context).textTheme.headlineSmall),
            if (detail != null) ...[
              const SizedBox(height: 8),
              Text(detail, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white60)),
            ],
            const SizedBox(height: 24),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                FilledButton(onPressed: onRejoin, child: Text(session.status == CallStatus.ended ? 'Rejoin' : 'Try again')),
                const SizedBox(width: 12),
                OutlinedButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Home')),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner({required this.text, required this.color});

  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        margin: const EdgeInsets.fromLTRB(12, 0, 12, 8),
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(8)),
        child: Text(text, style: const TextStyle(fontSize: 13)),
      );
}

class _Pill extends StatelessWidget {
  const _Pill({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.7), borderRadius: BorderRadius.circular(999)),
        child: Text(text, textAlign: TextAlign.center, style: const TextStyle(fontSize: 13)),
      );
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.name, this.small = false});

  final String name;
  final bool small;

  @override
  Widget build(BuildContext context) {
    final initial = name.trim().isEmpty ? '?' : name.trim()[0].toUpperCase();
    return Container(
      color: const Color(0xFF262626),
      alignment: Alignment.center,
      child: CircleAvatar(
        radius: small ? 22 : 40,
        backgroundColor: const Color(0xFF525252),
        child: Text(initial, style: TextStyle(fontSize: small ? 18 : 32, color: Colors.white)),
      ),
    );
  }
}

class _RoundButton extends StatelessWidget {
  const _RoundButton({
    required this.icon,
    required this.active,
    required this.tooltip,
    required this.onPressed,
    this.color,
  });

  final IconData icon;
  final bool active;
  final String tooltip;
  final VoidCallback? onPressed;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final background = color ?? (active ? const Color(0xFF262626) : Colors.white);
    final foreground = color != null || active ? Colors.white : Colors.black;
    return IconButton.filled(
      onPressed: onPressed,
      tooltip: tooltip,
      icon: Icon(icon),
      iconSize: 26,
      style: IconButton.styleFrom(
        backgroundColor: background,
        foregroundColor: foreground,
        minimumSize: const Size(56, 56),
      ),
    );
  }
}
