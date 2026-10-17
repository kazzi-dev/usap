import 'dart:async';

import 'package:flutter/material.dart';

import '../models/protocol.dart';

/// The last few subtitle lines over the video, like TV captions (same design
/// as the web app): the other person's line big and in MY language with what
/// they actually said underneath; my own line small, plus what they read.
class SubtitleOverlay extends StatefulWidget {
  const SubtitleOverlay({super.key, required this.lines});

  final List<SubtitleLine> lines;

  @override
  State<SubtitleOverlay> createState() => _SubtitleOverlayState();
}

class _SubtitleOverlayState extends State<SubtitleOverlay> {
  static const _visibleFor = Duration(seconds: 8);
  static const _maxLines = 3;
  late final Timer _ticker;

  @override
  void initState() {
    super.initState();
    // Rebuild every second so old lines disappear even when nobody talks.
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) => setState(() {}));
  }

  @override
  void dispose() {
    _ticker.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final visible = widget.lines.where((l) => now.difference(l.receivedAt) < _visibleFor).toList();
    final shown = visible.length > _maxLines ? visible.sublist(visible.length - _maxLines) : visible;

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [for (final line in shown) _SubtitleBubble(line: line)],
    );
  }
}

class _SubtitleBubble extends StatelessWidget {
  const _SubtitleBubble({required this.line});

  final SubtitleLine line;

  @override
  Widget build(BuildContext context) {
    final s = line.subtitle;
    final small = TextStyle(color: Colors.white.withValues(alpha: 0.6), fontSize: 12);
    return Container(
      margin: const EdgeInsets.only(top: 4),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: line.isOwn ? 0.45 : 0.75),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: line.isOwn
            ? [
                Text.rich(TextSpan(children: [
                  const TextSpan(text: 'You: ', style: TextStyle(fontWeight: FontWeight.bold, color: Colors.white54)),
                  TextSpan(text: s.originalText),
                ]), style: const TextStyle(color: Colors.white70, fontSize: 13)),
                if (s.wasTranslated)
                  Text('They read (${languageByCode(s.targetLang)?.label ?? s.targetLang}): ${s.translatedText}',
                      style: small),
              ]
            : [
                Text.rich(TextSpan(children: [
                  TextSpan(
                    text: '${line.speakerName}: ',
                    style: const TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF7DD3FC)),
                  ),
                  TextSpan(text: s.translatedText),
                ]), style: const TextStyle(color: Colors.white, fontSize: 17)),
                if (s.wasTranslated) Text('${languageByCode(s.lang)?.label ?? s.lang}: ${s.originalText}', style: small),
              ],
      ),
    );
  }
}
