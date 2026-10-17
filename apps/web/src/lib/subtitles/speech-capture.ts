import type { MicVAD } from "@ricky0123/vad-web";
import { SegmentMerger } from "./segment-merger";
import { encodeWav, samplesToMs } from "./wav";

export interface SpeechCaptureEvents {
  /** A finished piece of speech, ready to upload. */
  onSegment: (wav: ArrayBuffer, durationMs: number) => void;
  /** True while the person is talking (drives the "listening" indicator). */
  onSpeaking: (speaking: boolean) => void;
}

/**
 * Listens to OUR OWN microphone and cuts it into speech segments with
 * voice activity detection (VAD), so silence is never uploaded.
 *
 * It uses a clone of the mic track, separate from the one sent over WebRTC:
 * the call audio and the subtitle audio don't interfere with each other.
 *
 * The VAD is Silero, a ~2 MB neural network that runs in the browser
 * (WebAssembly) and scores each ~32 ms frame for "is this speech?".
 */
export class SpeechCapture {
  private vad: MicVAD | null = null;
  private readonly merger: SegmentMerger;
  private destroyed = false;

  constructor(
    private readonly getMicTrack: () => MediaStreamTrack | null,
    /** Created during the Join click so the browser lets it run (see CallSession.start). */
    private readonly audioContext: AudioContext | null,
    private readonly events: SpeechCaptureEvents,
  ) {
    this.merger = new SegmentMerger((audio) => {
      this.events.onSegment(encodeWav(audio), Math.round(samplesToMs(audio.length)));
    });
  }

  async start(): Promise<void> {
    // Loaded on demand: the VAD library only works in the browser and is fairly big.
    const { MicVAD } = await import("@ricky0123/vad-web");
    if (this.destroyed) return;

    const cloneMicStream = async () => {
      const track = this.getMicTrack();
      if (!track) throw new Error("No microphone track");
      const clone = track.clone();
      clone.enabled = true;
      return new MediaStream([clone]);
    };

    this.vad = await MicVAD.new({
      model: "v5",
      // Files copied to public/vad by scripts/copy-vad-assets.mjs.
      baseAssetPath: "/vad/",
      onnxWASMBasePath: "/vad/",
      audioContext: this.audioContext ?? undefined,
      getStream: cloneMicStream,
      resumeStream: cloneMicStream,
      pauseStream: async (stream) => stream.getTracks().forEach((t) => t.stop()),
      // Tuned for conversation: end a segment after 0.5 s of silence (the
      // default 1.4 s feels slow for subtitles), keep 0.3 s before the speech
      // so the first syllable isn't cut, ignore blips under 0.25 s.
      positiveSpeechThreshold: 0.5,
      negativeSpeechThreshold: 0.35,
      redemptionMs: 500,
      preSpeechPadMs: 300,
      minSpeechMs: 250,
      submitUserSpeechOnPause: true,
      onSpeechStart: () => this.events.onSpeaking(true),
      onVADMisfire: () => this.events.onSpeaking(false),
      onSpeechEnd: (audio) => {
        this.events.onSpeaking(false);
        console.info(`[subtitles] heard ${Math.round(samplesToMs(audio.length))} ms of speech`);
        this.merger.push(audio);
      },
      startOnLoad: true,
    });
    if (this.destroyed) await this.vad.destroy();
    console.info(`[subtitles] voice detection ready (audio: ${this.audioContext?.state ?? "own context"})`);
  }

  /** Stop listening (mic muted). Anything already said is still sent. */
  async pause(): Promise<void> {
    await this.vad?.pause();
    this.merger.flush();
    this.events.onSpeaking(false);
  }

  async resume(): Promise<void> {
    await this.vad?.start();
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
    this.merger.dispose();
    const vad = this.vad;
    this.vad = null;
    await vad?.destroy();
  }
}
