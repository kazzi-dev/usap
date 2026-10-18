import 'dart:async';

import 'package:flutter/material.dart';

import '../theme.dart';

class _DemoLine {
  const _DemoLine(
    this.speaker,
    this.speakerLang,
    this.text,
    this.listener,
    this.listenerLang,
    this.translated,
    this.colors,
  );

  final String speaker;
  final String speakerLang;
  final String text;
  final String listener;
  final String listenerLang;
  final String translated;
  final List<Color> colors;
}

// Same conversation as the web demo (apps/web/src/components/landing/SubtitleDemo.tsx).
const _lines = [
  _DemoLine('Ana', 'Tagalog', 'Kumusta ka? Kumain ka na ba?', 'Ken', '日本語', '元気？もうご飯食べた？', [
    UsapColors.hanko,
    UsapColors.hanko,
  ]),
  _DemoLine('Ken', '日本語', 'うん、さっき食べたよ！', 'Ana', 'Tagalog', 'Oo, kumain na ako kanina!', [
    UsapColors.text,
    UsapColors.text,
  ]),
  _DemoLine(
    'Mika',
    'Bisaya',
    'Maayong buntag! Asa ka padulong?',
    'Sam',
    'English',
    'Good morning! Where are you going?',
    [UsapColors.text, UsapColors.text],
  ),
  _DemoLine('Sam', 'English', 'To the library. Want to come?', 'Mika', 'Bisaya', 'Sa library. Gusto ka mouban?', [
    UsapColors.hanko,
    UsapColors.hanko,
  ]),
];

/// A small fake call that shows what Usap does: each line is typed out in the
/// speaker's language, then the translation appears for the listener.
class SubtitleDemo extends StatefulWidget {
  const SubtitleDemo({super.key});

  @override
  State<SubtitleDemo> createState() => _SubtitleDemoState();
}

class _SubtitleDemoState extends State<SubtitleDemo> {
  int _index = 0;
  int _typed = 0;
  Timer? _timer;

  _DemoLine get _line => _lines[_index];
  bool get _done => _typed >= _line.text.characters.length;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _schedule();
  }

  void _schedule() {
    _timer?.cancel();
    final slow = reduceMotion(context);
    if (slow && !_done) {
      _typed = _line.text.characters.length; // no typing animation
    }
    _timer = Timer(_done ? Duration(milliseconds: slow ? 5000 : 2600) : const Duration(milliseconds: 40), () {
      if (!mounted) return;
      setState(() {
        if (_done) {
          _index = (_index + 1) % _lines.length;
          _typed = 0;
        } else {
          _typed++;
        }
      });
      _schedule();
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final line = _line;
    final partner = _lines[_index.isEven ? _index + 1 : _index - 1];
    return Container(
      decoration: BoxDecoration(
        color: UsapColors.ink900.withValues(alpha: 0.85),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Colors.black.withValues(alpha: 0.08)),
      ),
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 7,
                height: 7,
                decoration: const BoxDecoration(color: UsapColors.hanko, shape: BoxShape.circle),
              ),
              const SizedBox(width: 6),
              const Text('Live demo', style: TextStyle(fontSize: 12, color: UsapColors.muted)),
            ],
          ),
          const SizedBox(height: 10),
          SizedBox(
            height: 108,
            child: Row(
              children: [
                Expanded(
                  child: _Tile(person: line, active: true, speaking: !_done),
                ),
                const SizedBox(width: 10),
                Expanded(child: _Tile(person: partner, active: false, speaking: false)),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Text.rich(
            TextSpan(
              children: [
                TextSpan(
                  text: '${line.speaker}: ',
                  style: const TextStyle(fontWeight: FontWeight.w600, color: UsapColors.muted),
                ),
                TextSpan(text: line.text.characters.take(_typed).toString()),
              ],
            ),
            style: const TextStyle(fontSize: 13, color: Color(0xFF404040)),
          ),
          const SizedBox(height: 8),
          AnimatedOpacity(
            opacity: _done ? 1 : 0,
            duration: const Duration(milliseconds: 400),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
              decoration: BoxDecoration(
                color: UsapColors.sky.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: UsapColors.sky.withValues(alpha: 0.25)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${line.listener.toUpperCase()} READS · ${line.listenerLang.toUpperCase()}',
                    style: TextStyle(fontSize: 10, letterSpacing: 0.8, color: UsapColors.sky.withValues(alpha: 0.85)),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    line.translated,
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: UsapColors.text),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({required this.person, required this.active, required this.speaking});

  final _DemoLine person;
  final bool active;
  final bool speaking;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [UsapColors.ink700, UsapColors.ink800],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: active ? UsapColors.sky.withValues(alpha: 0.6) : Colors.transparent, width: 1.5),
      ),
      child: Stack(
        children: [
          Center(
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 300),
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: LinearGradient(colors: person.colors),
                boxShadow: speaking
                    ? [BoxShadow(color: person.colors.first.withValues(alpha: 0.55), blurRadius: 18, spreadRadius: 3)]
                    : [],
              ),
              alignment: Alignment.center,
              child: Text(
                person.speaker[0],
                style: const TextStyle(fontWeight: FontWeight.w700, color: Colors.white, fontSize: 17),
              ),
            ),
          ),
          Positioned(
            left: 6,
            bottom: 6,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.4),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                '${person.speaker} · ${person.speakerLang}',
                style: const TextStyle(fontSize: 10, color: Colors.black54),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
