import 'dart:math';
import 'dart:typed_data';

/// Voice activity detection by loudness.
///
/// The web app uses Silero, a small neural network. Here we use something
/// much simpler that needs no model: split audio into 30 ms frames, measure
/// each frame's loudness (RMS), and compare it with a running estimate of the
/// background noise. "Clearly louder than the background" = speech.
///
/// Weaker than a neural VAD (loud noises count as speech), but it costs almost
/// nothing on the phone's CPU. Whisper's no-speech filter on the server catches
/// most false alarms.
class EnergyVad {
  EnergyVad({
    required this.onSegment,
    required this.onSpeaking,
    this.sampleRate = 16000,
    this.frameMs = 30,
    this.speechRatio = 3.0, // speech must be ~10 dB louder than the noise floor
    this.minLevel = 0.01, // ...and never quieter than this (RMS, 0..1)
    this.startFrames = 3, // ~90 ms of speech before we say "speaking"
    this.redemptionMs = 500, // end the segment after 0.5 s of quiet
    this.preSpeechPadMs = 300, // keep 0.3 s before speech so the first syllable isn't cut
    this.minSpeechMs = 250, // ignore blips shorter than this
    this.maxSegmentMs = 15000, // cut very long monologues so subtitles keep flowing
  });

  final void Function(Int16List samples) onSegment;
  final void Function(bool speaking) onSpeaking;
  final int sampleRate;
  final int frameMs;
  final double speechRatio;
  final double minLevel;
  final int startFrames;
  final int redemptionMs;
  final int preSpeechPadMs;
  final int minSpeechMs;
  final int maxSegmentMs;

  int get frameSamples => sampleRate * frameMs ~/ 1000;

  double _noiseFloor = 0.005;
  bool _speaking = false;
  int _loudRun = 0; // consecutive loud frames (before speech starts)
  int _quietRun = 0; // consecutive quiet frames (during speech)
  int _speechFrames = 0;
  final _pending = <int>[]; // samples not yet forming a full frame
  final _preSpeech = <Int16List>[]; // recent frames kept as padding
  final _segment = <Int16List>[];

  /// Feed raw audio as it arrives (any chunk size).
  void addSamples(Int16List samples) {
    _pending.addAll(samples);
    final size = frameSamples;
    var offset = 0;
    while (_pending.length - offset >= size) {
      _processFrame(Int16List.fromList(_pending.sublist(offset, offset + size)));
      offset += size;
    }
    _pending.removeRange(0, offset);
  }

  /// Ends any speech in progress right away (e.g. the mic was muted).
  void flush() {
    if (_speaking) _endSegment();
    _pending.clear();
    _preSpeech.clear();
  }

  static double rms(Int16List frame) {
    if (frame.isEmpty) return 0;
    var sum = 0.0;
    for (final s in frame) {
      final v = s / 32768.0;
      sum += v * v;
    }
    return sqrt(sum / frame.length);
  }

  void _processFrame(Int16List frame) {
    final level = rms(frame);
    final isLoud = level > max(_noiseFloor * speechRatio, minLevel);

    if (!_speaking) {
      // Learn the background level only while nobody is talking. Moves up
      // slowly (so speech doesn't become "background") and down quickly.
      final rate = level < _noiseFloor ? 0.2 : 0.02;
      _noiseFloor = max(0.001, _noiseFloor + (level - _noiseFloor) * rate);

      _preSpeech.add(frame);
      final maxPad = (preSpeechPadMs / frameMs).ceil() + startFrames;
      while (_preSpeech.length > maxPad) {
        _preSpeech.removeAt(0);
      }

      _loudRun = isLoud ? _loudRun + 1 : 0;
      if (_loudRun >= startFrames) {
        _speaking = true;
        _quietRun = 0;
        _speechFrames = _loudRun;
        _segment
          ..clear()
          ..addAll(_preSpeech);
        _preSpeech.clear();
        onSpeaking(true);
      }
      return;
    }

    _segment.add(frame);
    if (isLoud) {
      _quietRun = 0;
      _speechFrames++;
    } else {
      _quietRun++;
    }
    final segmentMs = _segment.length * frameMs;
    if (_quietRun * frameMs >= redemptionMs || segmentMs >= maxSegmentMs) {
      _endSegment();
    }
  }

  void _endSegment() {
    _speaking = false;
    _loudRun = 0;
    onSpeaking(false);
    if (_speechFrames * frameMs >= minSpeechMs) {
      final total = _segment.fold<int>(0, (n, f) => n + f.length);
      final out = Int16List(total);
      var offset = 0;
      for (final f in _segment) {
        out.setAll(offset, f);
        offset += f.length;
      }
      onSegment(out);
    }
    _segment.clear();
    _speechFrames = 0;
  }
}
