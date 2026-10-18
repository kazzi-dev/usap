import 'package:flutter/material.dart';

import '../theme.dart';

/// The Usap mark: two overlapping speech bubbles, drawn to match the web
/// app's SVG (a 40x40 design scaled to [size]).
class LogoMark extends StatelessWidget {
  const LogoMark({super.key, this.size = 36});

  final double size;

  @override
  Widget build(BuildContext context) => SizedBox.square(
    dimension: size,
    child: CustomPaint(painter: _LogoPainter()),
  );
}

class _LogoPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 40);

    // Back bubble ("the other person"): seal red, with its tail bottom-right.
    final back = Path()
      ..addRRect(RRect.fromLTRBR(10, 15, 37, 33, const Radius.circular(6)))
      ..moveTo(30, 32)
      ..lineTo(30, 37.5)
      ..lineTo(24.5, 32)
      ..close();
    canvas.drawPath(back, Paint()..color = UsapColors.hanko);

    // Front bubble: ink black, tail bottom-left.
    final front = Path()
      ..addRRect(RRect.fromLTRBR(3, 3, 29, 22, const Radius.circular(6)))
      ..moveTo(15, 21)
      ..lineTo(9, 26.5)
      ..lineTo(9, 21)
      ..close();
    canvas.drawPath(front, Paint()..color = UsapColors.text);

    final dot = Paint()..color = UsapColors.ink950;
    for (final x in [11.0, 16.0, 21.0]) {
      canvas.drawCircle(Offset(x, 12.5), 1.6, dot);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// Logo mark + "Usap" wordmark.
class Logo extends StatelessWidget {
  const Logo({super.key});

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      LogoMark(),
      SizedBox(width: 8),
      Text(
        'Usap',
        style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: UsapColors.text),
      ),
    ],
  );
}

/// Highlighted text, in the seal-red accent (flat, no gradient).
class GradientText extends StatelessWidget {
  const GradientText(this.text, {super.key, required this.style});

  final String text;
  final TextStyle style;

  @override
  Widget build(BuildContext context) => Text(text, style: style.copyWith(color: UsapColors.hanko));
}

/// Full-width solid black button.
class GradientButton extends StatelessWidget {
  const GradientButton({super.key, required this.label, required this.onPressed, this.icon});

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: onPressed == null ? UsapColors.muted : UsapColors.text,
        borderRadius: BorderRadius.circular(18),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: onPressed,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 17, horizontal: 20),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  label,
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: UsapColors.ink950),
                ),
                if (icon != null) ...[const SizedBox(width: 8), Icon(icon, size: 20, color: UsapColors.ink950)],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Plain white page background (the flat "ink and hanko" look has no glows).
class AuroraBackground extends StatelessWidget {
  const AuroraBackground({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) => ColoredBox(color: UsapColors.ink950, child: child);
}
