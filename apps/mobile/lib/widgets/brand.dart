import 'dart:math';

import 'package:flutter/material.dart';

import '../theme.dart';

/// The Usap mark: two overlapping speech bubbles, drawn to match the web
/// app's SVG (a 40x40 design scaled to [size]).
class LogoMark extends StatelessWidget {
  const LogoMark({super.key, this.size = 36});

  final double size;

  @override
  Widget build(BuildContext context) =>
      SizedBox.square(dimension: size, child: CustomPaint(painter: _LogoPainter()));
}

class _LogoPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 40);

    // Back bubble ("the other person"): light, with its tail bottom-right.
    final back = Path()
      ..addRRect(RRect.fromLTRBR(10, 15, 37, 33, const Radius.circular(6)))
      ..moveTo(30, 32)
      ..lineTo(30, 37.5)
      ..lineTo(24.5, 32)
      ..close();
    canvas.drawPath(back, Paint()..color = const Color(0xFFDBEAFE).withValues(alpha: 0.92));

    // Front bubble: brand gradient, tail bottom-left.
    final front = Path()
      ..addRRect(RRect.fromLTRBR(3, 3, 29, 22, const Radius.circular(6)))
      ..moveTo(15, 21)
      ..lineTo(9, 26.5)
      ..lineTo(9, 21)
      ..close();
    canvas.drawPath(
      front,
      Paint()..shader = const LinearGradient(colors: [UsapColors.sky, UsapColors.violet]).createShader(const Rect.fromLTWH(3, 3, 26, 24)),
    );

    final dot = Paint()..color = Colors.white;
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
  Widget build(BuildContext context) => const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          LogoMark(),
          SizedBox(width: 8),
          Text('Usap', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: Colors.white)),
        ],
      );
}

/// Text painted with the brand gradient.
class GradientText extends StatelessWidget {
  const GradientText(this.text, {super.key, required this.style});

  final String text;
  final TextStyle style;

  @override
  Widget build(BuildContext context) => ShaderMask(
        blendMode: BlendMode.srcIn,
        shaderCallback: (bounds) => UsapColors.textGradient.createShader(bounds),
        child: Text(text, style: style),
      );
}

/// Full-width button filled with the brand gradient.
class GradientButton extends StatelessWidget {
  const GradientButton({super.key, required this.label, required this.onPressed, this.icon});

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: UsapColors.brandGradient,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [BoxShadow(color: UsapColors.violet.withValues(alpha: 0.35), blurRadius: 24, offset: const Offset(0, 8))],
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
                Text(label, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Colors.white)),
                if (icon != null) ...[const SizedBox(width: 8), Icon(icon, size: 20, color: Colors.white)],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Soft colored glows drifting slowly behind a screen (still when the phone
/// asks for reduced motion).
class AuroraBackground extends StatefulWidget {
  const AuroraBackground({super.key, required this.child});

  final Widget child;

  @override
  State<AuroraBackground> createState() => _AuroraBackgroundState();
}

class _AuroraBackgroundState extends State<AuroraBackground> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(vsync: this, duration: const Duration(seconds: 14));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (reduceMotion(context)) {
      _controller.stop();
    } else if (!_controller.isAnimating) {
      _controller.repeat();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Widget _glow(Color color, double size) => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(colors: [color.withValues(alpha: 0.28), color.withValues(alpha: 0)]),
        ),
      );

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        const Positioned.fill(child: ColoredBox(color: UsapColors.ink950)),
        AnimatedBuilder(
          animation: _controller,
          builder: (context, _) {
            final t = _controller.value * 2 * pi;
            return Stack(
              children: [
                Positioned(left: -140 + 30 * sin(t), top: -120 + 25 * cos(t), child: _glow(UsapColors.sky, 420)),
                Positioned(right: -160 + 30 * cos(t), top: 140 + 30 * sin(t), child: _glow(UsapColors.violet, 420)),
                Positioned(left: 40 + 20 * sin(t + 1), bottom: -180, child: _glow(UsapColors.pink, 360)),
              ],
            );
          },
        ),
        Positioned.fill(child: widget.child),
      ],
    );
  }
}
