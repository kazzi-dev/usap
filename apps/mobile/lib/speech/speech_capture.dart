import 'dart:async';
import 'dart:typed_data';

import 'package:record/record.dart';

import 'energy_vad.dart';
import 'segment_merger.dart';
import 'wav.dart';

/// Records OUR OWN microphone for subtitles, separately from the WebRTC call
/// audio, and turns it into speech segments (WAV files).
///
/// Uses the "voice communication" audio source, the same one WebRTC uses, so
/// Android (10+) lets both read the microphone at the same time and applies
/// echo cancellation (the other person's voice from the speaker isn't
/// transcribed as ours).
class SpeechCapture {
  SpeechCapture({required this.onSegment, required this.onSpeaking}) {
    _merger = SegmentMerger((samples) => onSegment(encodeWav(samples), samples.length * 1000 ~/ 16000));
    _vad = EnergyVad(onSegment: _merger.push, onSpeaking: onSpeaking);
  }

  final void Function(Uint8List wav, int durationMs) onSegment;
  final void Function(bool speaking) onSpeaking;

  final _recorder = AudioRecorder();
  late final SegmentMerger _merger;
  late final EnergyVad _vad;
  StreamSubscription<Uint8List>? _subscription;
  bool _paused = false;

  Future<void> start() async {
    if (!await _recorder.hasPermission()) {
      throw StateError('Microphone permission denied');
    }
    final stream = await _recorder.startStream(const RecordConfig(
      encoder: AudioEncoder.pcm16bits,
      sampleRate: 16000,
      numChannels: 1,
      echoCancel: true,
      noiseSuppress: true,
      autoGain: true,
      androidConfig: AndroidRecordConfig(audioSource: AndroidAudioSource.voiceCommunication),
    ));
    _subscription = stream.listen((bytes) {
      if (!_paused) _vad.addSamples(pcmBytesToSamples(bytes));
    });
  }

  /// Mic muted: stop listening, but still send what was already said.
  void pause() {
    _paused = true;
    _vad.flush();
    _merger.flush();
  }

  void resume() => _paused = false;

  Future<void> dispose() async {
    _merger.dispose();
    await _subscription?.cancel();
    await _recorder.stop();
    await _recorder.dispose();
  }
}
