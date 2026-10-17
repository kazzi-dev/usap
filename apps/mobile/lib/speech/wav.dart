import 'dart:typed_data';

/// Wraps 16-bit mono samples in a WAV file: a 44-byte header + the samples.
/// Same format the web app sends (16 kHz, mono, 16-bit PCM).
Uint8List encodeWav(Int16List samples, {int sampleRate = 16000}) {
  const bytesPerSample = 2;
  final dataSize = samples.length * bytesPerSample;
  final bytes = ByteData(44 + dataSize);

  void ascii(int offset, String text) {
    for (var i = 0; i < text.length; i++) {
      bytes.setUint8(offset + i, text.codeUnitAt(i));
    }
  }

  ascii(0, 'RIFF');
  bytes.setUint32(4, 36 + dataSize, Endian.little);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  bytes.setUint32(16, 16, Endian.little); // fmt chunk size
  bytes.setUint16(20, 1, Endian.little); // PCM
  bytes.setUint16(22, 1, Endian.little); // mono
  bytes.setUint32(24, sampleRate, Endian.little);
  bytes.setUint32(28, sampleRate * bytesPerSample, Endian.little);
  bytes.setUint16(32, bytesPerSample, Endian.little);
  bytes.setUint16(34, 16, Endian.little); // bits per sample
  ascii(36, 'data');
  bytes.setUint32(40, dataSize, Endian.little);
  for (var i = 0; i < samples.length; i++) {
    bytes.setInt16(44 + i * bytesPerSample, samples[i], Endian.little);
  }
  return bytes.buffer.asUint8List();
}

/// Little-endian PCM bytes (what the recorder streams) -> 16-bit samples.
Int16List pcmBytesToSamples(Uint8List bytes) {
  final view = ByteData.sublistView(bytes);
  final out = Int16List(bytes.length ~/ 2);
  for (var i = 0; i < out.length; i++) {
    out[i] = view.getInt16(i * 2, Endian.little);
  }
  return out;
}
