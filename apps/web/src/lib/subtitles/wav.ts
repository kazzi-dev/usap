export const VAD_SAMPLE_RATE = 16_000;

/**
 * Wraps raw samples in a WAV file (16-bit PCM, mono). WAV is just a 44-byte
 * header followed by the samples, so it's cheap to build in the browser, and
 * both Groq and the local Whisper accept it directly.
 */
export function encodeWav(samples: Float32Array, sampleRate = VAD_SAMPLE_RATE): ArrayBuffer {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // size of the fmt chunk
  view.setUint16(20, 1, true); // format 1 = PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // bytes per second
  view.setUint16(32, bytesPerSample, true); // bytes per frame
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  // Float [-1, 1] -> signed 16-bit integer.
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * bytesPerSample, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

export const samplesToMs = (samples: number, sampleRate = VAD_SAMPLE_RATE) => (samples / sampleRate) * 1000;
