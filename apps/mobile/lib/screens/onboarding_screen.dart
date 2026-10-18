import 'dart:math';

import 'package:flutter/material.dart';

import '../models/protocol.dart';
import '../services/settings.dart';
import '../theme.dart';
import '../widgets/brand.dart';
import 'home_screen.dart';

const _greetings = {'en': 'Hello!', 'tl': 'Kumusta!', 'ceb': 'Maayong adlaw!', 'ja': 'こんにちは！'};

/// First-run intro: what Usap is, how it works, your language, privacy.
/// Swipe or tap Next; Skip ends it. With [replay], it closes back to where it
/// was opened from instead of going to the home screen.
class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key, required this.settings, this.replay = false});

  final Settings settings;
  final bool replay;

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _pages = PageController();
  int _page = 0;
  late String _language = widget.settings.language;

  static const _count = 4;
  bool get _last => _page == _count - 1;

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  void _finish() {
    widget.settings.onboarded = true;
    if (widget.replay) {
      Navigator.of(context).pop();
    } else {
      Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => HomeScreen(settings: widget.settings)));
    }
  }

  void _next() {
    if (_last) return _finish();
    _pages.nextPage(duration: const Duration(milliseconds: 380), curve: Curves.easeOutCubic);
  }

  void _pickLanguage(String code) {
    setState(() => _language = code);
    widget.settings.language = code;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: AuroraBackground(
        child: SafeArea(
          child: Column(
            children: [
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(onPressed: _finish, child: const Text('Skip', style: TextStyle(color: UsapColors.muted))),
              ),
              Expanded(
                child: PageView(
                  controller: _pages,
                  onPageChanged: (i) => setState(() => _page = i),
                  children: [
                    const _Page(
                      art: _WelcomeArt(),
                      title: 'Welcome to Usap',
                      highlight: 'Usap',
                      body: 'Video calls where everyone reads the conversation in their own language: '
                          'English, Tagalog, Bisaya or Japanese.',
                    ),
                    const _Page(
                      art: _SpeakArt(),
                      title: 'Just talk naturally',
                      body: "About a second after you pause, your words appear as subtitles on the other person's "
                          'screen, translated for them. You see what they say in your language.',
                    ),
                    _Page(
                      art: _LanguageArt(code: _language),
                      title: 'Which language do you speak?',
                      body: "You'll read subtitles in it too. You can change it anytime.",
                      extra: _LanguageGrid(selected: _language, onPick: _pickLanguage),
                    ),
                    const _Page(
                      art: _PrivacyArt(),
                      title: 'Private by design',
                      bullets: [
                        'Video goes directly between you and the other person.',
                        'The app asks before using your camera and microphone.',
                        'A transcript is saved only when someone is logged in, and everyone sees a '
                            '"Transcript saved" badge.',
                      ],
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 8, 24, 20),
                child: Row(
                  children: [
                    SizedBox(
                      width: 72,
                      child: _page == 0
                          ? null
                          : TextButton(
                              onPressed: () => _pages.previousPage(duration: const Duration(milliseconds: 380), curve: Curves.easeOutCubic),
                              child: const Text('Back', style: TextStyle(color: UsapColors.muted)),
                            ),
                    ),
                    Expanded(
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          for (var i = 0; i < _count; i++)
                            AnimatedContainer(
                              duration: const Duration(milliseconds: 300),
                              margin: const EdgeInsets.symmetric(horizontal: 3),
                              width: i == _page ? 22 : 7,
                              height: 7,
                              decoration: BoxDecoration(
                                color: i == _page ? UsapColors.sky : Colors.white24,
                                borderRadius: BorderRadius.circular(4),
                              ),
                            ),
                        ],
                      ),
                    ),
                    SizedBox(
                      width: 150,
                      child: GradientButton(label: _last ? 'Get started' : 'Next', onPressed: _next),
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

class _Page extends StatelessWidget {
  const _Page({required this.art, required this.title, this.highlight, this.body, this.bullets, this.extra});

  final Widget art;
  final String title;
  final String? highlight; // part of the title painted with the gradient
  final String? body;
  final List<String>? bullets;
  final Widget? extra;

  @override
  Widget build(BuildContext context) {
    const titleStyle = TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: Colors.white, height: 1.15);
    final h = highlight;
    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      children: [
        SizedBox(height: 260, child: Center(child: art)),
        const SizedBox(height: 8),
        if (h == null)
          Text(title, style: titleStyle)
        else
          Wrap(children: [
            Text(title.replaceAll(h, ''), style: titleStyle),
            GradientText(h, style: titleStyle),
          ]),
        if (body != null) ...[
          const SizedBox(height: 10),
          Text(body!, style: const TextStyle(fontSize: 16, height: 1.45, color: Color(0xFFCBD5E1))),
        ],
        for (final b in bullets ?? const <String>[])
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.check_circle, size: 20, color: Color(0xFF34D399)),
                const SizedBox(width: 10),
                Expanded(child: Text(b, style: const TextStyle(fontSize: 15, height: 1.4, color: Color(0xFFCBD5E1)))),
              ],
            ),
          ),
        if (extra != null) ...[const SizedBox(height: 16), extra!],
      ],
    );
  }
}

class _LanguageGrid extends StatelessWidget {
  const _LanguageGrid({required this.selected, required this.onPick});

  final String selected;
  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 10,
      crossAxisSpacing: 10,
      childAspectRatio: 2.3,
      children: [
        for (final language in languages)
          Semantics(
            selected: language.code == selected,
            button: true,
            child: GestureDetector(
              onTap: () => onPick(language.code),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: language.code == selected ? UsapColors.sky.withValues(alpha: 0.12) : UsapColors.ink800,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: language.code == selected ? UsapColors.sky : Colors.white12, width: 1.4),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(language.native, style: const TextStyle(fontWeight: FontWeight.w600, color: Colors.white)),
                    Text(_greetings[language.code]!, style: const TextStyle(fontSize: 13, color: UsapColors.muted)),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }
}

// ---------- Illustrations ----------

/// Repeating 0..1 animation, still when the phone asks for reduced motion.
mixin _Looping<T extends StatefulWidget> on State<T>, SingleTickerProviderStateMixin<T> {
  late final AnimationController loop = AnimationController(vsync: this, duration: const Duration(seconds: 3));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (reduceMotion(context)) {
      loop.stop();
    } else {
      loop.repeat();
    }
  }

  @override
  void dispose() {
    loop.dispose();
    super.dispose();
  }
}

class _WelcomeArt extends StatefulWidget {
  const _WelcomeArt();

  @override
  State<_WelcomeArt> createState() => _WelcomeArtState();
}

class _WelcomeArtState extends State<_WelcomeArt> with SingleTickerProviderStateMixin, _Looping {
  @override
  Widget build(BuildContext context) {
    const words = ['Hello', 'Kumusta', 'Maayo', 'こんにちは'];
    const spots = [Offset(-0.75, -0.6), Offset(0.7, -0.7), Offset(-0.7, 0.6), Offset(0.68, 0.55)];
    return AnimatedBuilder(
      animation: loop,
      builder: (context, _) {
        final t = loop.value;
        return Stack(
          alignment: Alignment.center,
          children: [
            for (final phase in [0.0, 0.5])
              Opacity(
                opacity: (1 - ((t + phase) % 1)) * 0.6,
                child: Container(
                  width: 110 + 120 * ((t + phase) % 1),
                  height: 110 + 120 * ((t + phase) % 1),
                  decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: UsapColors.sky, width: 2)),
                ),
              ),
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: UsapColors.ink900,
                borderRadius: BorderRadius.circular(28),
                border: Border.all(color: Colors.white12),
                boxShadow: [BoxShadow(color: UsapColors.violet.withValues(alpha: 0.3), blurRadius: 40)],
              ),
              child: const LogoMark(size: 64),
            ),
            for (var i = 0; i < words.length; i++)
              Align(
                alignment: Alignment(spots[i].dx, spots[i].dy + 0.06 * sin(2 * pi * t + i)),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: UsapColors.ink800,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: Colors.white12),
                  ),
                  child: Text(words[i], style: const TextStyle(color: Colors.white)),
                ),
              ),
          ],
        );
      },
    );
  }
}

class _SpeakArt extends StatefulWidget {
  const _SpeakArt();

  @override
  State<_SpeakArt> createState() => _SpeakArtState();
}

class _SpeakArtState extends State<_SpeakArt> with SingleTickerProviderStateMixin, _Looping {
  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: UsapColors.sky.withValues(alpha: 0.15),
                border: Border.all(color: UsapColors.sky.withValues(alpha: 0.4)),
              ),
              child: const Icon(Icons.mic_rounded, color: UsapColors.sky, size: 30),
            ),
            const SizedBox(height: 10),
            AnimatedBuilder(
              animation: loop,
              builder: (context, _) => Row(
                children: [
                  for (var i = 0; i < 5; i++)
                    Container(
                      margin: const EdgeInsets.symmetric(horizontal: 2),
                      width: 5,
                      height: 8 + 18 * (0.5 + 0.5 * sin(2 * pi * (loop.value * 2) + i * 0.9)),
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(colors: [UsapColors.sky, UsapColors.violet], begin: Alignment.bottomCenter, end: Alignment.topCenter),
                        borderRadius: BorderRadius.circular(3),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 12),
          child: Icon(Icons.arrow_forward_rounded, color: UsapColors.muted),
        ),
        Flexible(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _bubble('Kumusta ka? Kumain ka na ba?', UsapColors.ink700, const Color(0xFFCBD5E1), 13),
              const SizedBox(height: 8),
              _bubble('How are you? Have you eaten yet?', UsapColors.sky.withValues(alpha: 0.14), Colors.white, 15,
                  border: UsapColors.sky.withValues(alpha: 0.35)),
            ],
          ),
        ),
      ],
    );
  }

  Widget _bubble(String text, Color bg, Color fg, double size, {Color? border}) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(14),
          border: border != null ? Border.all(color: border) : null,
        ),
        child: Text(text, style: TextStyle(color: fg, fontSize: size, fontWeight: size > 14 ? FontWeight.w600 : FontWeight.w400)),
      );
}

class _LanguageArt extends StatelessWidget {
  const _LanguageArt({required this.code});

  final String code;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 350),
          transitionBuilder: (child, animation) => FadeTransition(
            opacity: animation,
            child: SlideTransition(position: Tween(begin: const Offset(0, 0.2), end: Offset.zero).animate(animation), child: child),
          ),
          child: Text(_greetings[code]!, key: ValueKey(code), style: const TextStyle(fontSize: 40, fontWeight: FontWeight.w700, color: Colors.white)),
        ),
        const SizedBox(height: 14),
        Wrap(
          spacing: 6,
          children: [
            for (final language in languages)
              AnimatedContainer(
                duration: const Duration(milliseconds: 250),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                decoration: BoxDecoration(
                  color: language.code == code ? UsapColors.sky : Colors.white10,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(language.native,
                    style: TextStyle(fontSize: 12, color: language.code == code ? UsapColors.ink950 : Colors.white70)),
              ),
          ],
        ),
      ],
    );
  }
}

class _PrivacyArt extends StatefulWidget {
  const _PrivacyArt();

  @override
  State<_PrivacyArt> createState() => _PrivacyArtState();
}

class _PrivacyArtState extends State<_PrivacyArt> with SingleTickerProviderStateMixin, _Looping {
  Widget _avatar(String letter, List<Color> colors) => Container(
        width: 58,
        height: 58,
        alignment: Alignment.center,
        decoration: BoxDecoration(shape: BoxShape.circle, gradient: LinearGradient(colors: colors)),
        child: Text(letter, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: UsapColors.ink950)),
      );

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: UsapColors.ink900,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFF34D399).withValues(alpha: 0.4)),
          ),
          child: const Icon(Icons.verified_user_outlined, color: Color(0xFF6EE7B7), size: 28),
        ),
        const SizedBox(height: 18),
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            _avatar('A', const [Color(0xFF38BDF8), Color(0xFF67E8F9)]),
            SizedBox(
              width: 120,
              height: 20,
              child: AnimatedBuilder(
                animation: loop,
                builder: (context, _) => CustomPaint(painter: _StreamPainter(loop.value)),
              ),
            ),
            _avatar('K', const [Color(0xFF8B5CF6), Color(0xFFE879F9)]),
          ],
        ),
      ],
    );
  }
}

/// A line between two people with little "packets" travelling across it.
class _StreamPainter extends CustomPainter {
  _StreamPainter(this.t);

  final double t;

  @override
  void paint(Canvas canvas, Size size) {
    final y = size.height / 2;
    canvas.drawLine(Offset(8, y), Offset(size.width - 8, y), Paint()
      ..color = Colors.white12
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round);
    for (final phase in [0.0, 0.33, 0.66]) {
      final x = 8 + (size.width - 16) * ((t + phase) % 1);
      canvas.drawCircle(Offset(x, y), 3.5, Paint()..color = Color.lerp(UsapColors.sky, UsapColors.violet, (t + phase) % 1)!);
    }
  }

  @override
  bool shouldRepaint(_StreamPainter old) => old.t != t;
}
