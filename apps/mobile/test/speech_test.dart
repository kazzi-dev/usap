import 'dart:math';
import 'dart:typed_data';

import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:usap_mobile/speech/energy_vad.dart';
import 'package:usap_mobile/speech/segment_merger.dart';
import 'package:usap_mobile/speech/wav.dart';
import 'package:usap_mobile/util/ids.dart';

const rate = 16000;

/// Quiet background hiss.
Int16List noise(int ms, {double level = 0.002, int seed = 1}) {
  final random = Random(seed);
  return Int16List.fromList(
    List.generate(rate * ms ~/ 1000, (_) => ((random.nextDouble() * 2 - 1) * level * 32767).round()),
  );
}

/// A loud tone, standing in for a voice.
Int16List tone(int ms, {double level = 0.3}) => Int16List.fromList(
      List.generate(rate * ms ~/ 1000, (i) => (sin(2 * pi * 220 * i / rate) * level * 32767).round()),
    );

void main() {
  group('EnergyVad', () {
    late List<Int16List> segments;
    late List<bool> speaking;
    late EnergyVad vad;

    setUp(() {
      segments = [];
      speaking = [];
      vad = EnergyVad(onSegment: segments.add, onSpeaking: speaking.add);
    });

    test('silence produces no segments', () {
      vad.addSamples(noise(3000));
      expect(segments, isEmpty);
      expect(speaking, isEmpty);
    });

    test('speech between silence becomes one segment with padding', () {
      vad.addSamples(noise(1000));
      vad.addSamples(tone(1200));
      vad.addSamples(noise(1000, seed: 2));
      expect(speaking, [true, false]);
      expect(segments, hasLength(1));
      final ms = segments.single.length * 1000 ~/ rate;
      // 1.2 s of speech + up to 0.3 s padding before + 0.5 s of quiet after.
      expect(ms, inInclusiveRange(1600, 2100));
    });

    test('a short click is ignored', () {
      vad.addSamples(noise(1000));
      vad.addSamples(tone(120));
      vad.addSamples(noise(1000, seed: 2));
      expect(segments, isEmpty);
    });

    test('a long monologue is cut at the maximum segment length', () {
      vad.addSamples(noise(500));
      vad.addSamples(tone(20000));
      expect(segments, isNotEmpty);
      expect(segments.first.length * 1000 ~/ rate, lessThanOrEqualTo(15000));
    });

    test('flush ends speech in progress (mic muted mid-sentence)', () {
      vad.addSamples(noise(500));
      vad.addSamples(tone(800));
      vad.flush();
      expect(segments, hasLength(1));
      expect(speaking.last, isFalse);
    });
  });

  group('SegmentMerger', () {
    test('long segments are sent right away', () {
      final sent = <Int16List>[];
      SegmentMerger(sent.add).push(tone(1500));
      expect(sent, hasLength(1));
    });

    test('short segments are merged with the next one', () {
      fakeAsync((async) {
        final sent = <Int16List>[];
        final merger = SegmentMerger(sent.add);
        merger.push(tone(400));
        expect(sent, isEmpty);
        merger.push(tone(400));
        // 400 + 200 ms gap + 400 = 1000 ms -> long enough, sent as one.
        expect(sent, hasLength(1));
        expect(sent.single.length, rate * 1000 ~/ 1000);
      });
    });

    test('a lone short segment is sent after waiting', () {
      fakeAsync((async) {
        final sent = <Int16List>[];
        SegmentMerger(sent.add).push(tone(400));
        async.elapse(const Duration(milliseconds: 1300));
        expect(sent, hasLength(1));
      });
    });
  });

  test('encodeWav writes a valid 16 kHz mono header', () {
    final wav = encodeWav(Int16List.fromList([0, 1000, -1000]));
    final view = ByteData.sublistView(wav);
    expect(String.fromCharCodes(wav.sublist(0, 4)), 'RIFF');
    expect(String.fromCharCodes(wav.sublist(8, 12)), 'WAVE');
    expect(view.getUint16(22, Endian.little), 1); // mono
    expect(view.getUint32(24, Endian.little), 16000);
    expect(view.getUint32(40, Endian.little), 6); // 3 samples * 2 bytes
    expect(pcmBytesToSamples(wav.sublist(44)), [0, 1000, -1000]);
  });

  test('signalUrlFromInvite finds the server for share and dev links', () {
    expect(signalUrlFromInvite('https://some-words.trycloudflare.com/room/abc-defg-hij'),
        'https://some-words.trycloudflare.com');
    expect(signalUrlFromInvite('https://192.168.254.116:3001/room/abc-defg-hij'), 'https://192.168.254.116:4000');
    expect(signalUrlFromInvite('abc-defg-hij'), isNull, reason: 'a bare code keeps the configured server');
    expect(signalUrlFromInvite('https://usap.example.com/room/abc-defg-hij'), isNull);
  });

  test('parseRoomInput accepts links and codes', () {
    expect(parseRoomInput('https://192.168.1.10:3000/room/abc-defg-hij'), 'abc-defg-hij');
    expect(parseRoomInput('  ABC-defg-hij '), 'abc-defg-hij');
    expect(parseRoomInput('not a room!'), isNull);
    expect(createRoomId(), matches(RegExp(r'^[a-z]{3}-[a-z]{4}-[a-z]{3}$')));
  });
}
