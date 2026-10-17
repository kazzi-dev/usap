import 'dart:async';
import 'dart:typed_data';

/// Saves free-tier quota, same idea as the web app: Groq counts every request
/// (and bills each as at least 10 s of audio), so short bits like "Oo." are
/// held briefly and glued to the next segment.
class SegmentMerger {
  SegmentMerger(
    this.send, {
    this.sampleRate = 16000,
    this.minMs = 1000,
    this.waitMs = 1200,
    this.maxMs = 20000,
    this.gapMs = 200,
  });

  final void Function(Int16List samples) send;
  final int sampleRate;
  final int minMs;
  final int waitMs;
  final int maxMs;
  final int gapMs;

  Int16List? _pending;
  Timer? _timer;

  int _ms(int samples) => samples * 1000 ~/ sampleRate;

  void push(Int16List audio) {
    _timer?.cancel();
    var next = audio;
    final pending = _pending;
    if (pending != null) {
      final gap = Int16List(sampleRate * gapMs ~/ 1000);
      if (_ms(pending.length + gap.length + audio.length) <= maxMs) {
        next = Int16List(pending.length + gap.length + audio.length)
          ..setAll(0, pending)
          ..setAll(pending.length + gap.length, audio);
      } else {
        send(pending);
      }
      _pending = null;
    }

    if (_ms(next.length) >= minMs) {
      send(next);
    } else {
      _pending = next;
      _timer = Timer(Duration(milliseconds: waitMs), flush);
    }
  }

  void flush() {
    _timer?.cancel();
    final pending = _pending;
    _pending = null;
    if (pending != null) send(pending);
  }

  void dispose() {
    _timer?.cancel();
    _pending = null;
  }
}
