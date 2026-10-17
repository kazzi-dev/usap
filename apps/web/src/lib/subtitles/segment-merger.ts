import { samplesToMs, VAD_SAMPLE_RATE } from "./wav";

export interface SegmentMergerOptions {
  /** Segments shorter than this wait to be merged with the next one. */
  minMs: number;
  /** How long a short segment waits for a follow-up before being sent alone. */
  waitMs: number;
  /** Never merge into a segment longer than this. */
  maxMs: number;
  /** Silence inserted between merged segments, so words don't run together. */
  gapMs: number;
}

const DEFAULTS: SegmentMergerOptions = { minMs: 1_000, waitMs: 1_200, maxMs: 20_000, gapMs: 200 };

/**
 * Saves free-tier quota. Every Groq request counts against a requests-per-
 * minute limit and is billed as at least 10 s of audio, so "Oo." + "Sige." +
 * "Tara." as three requests costs 3x what one request with all three costs.
 * Short segments are held briefly and glued to the next one.
 */
export class SegmentMerger {
  private readonly options: SegmentMergerOptions;
  private pending: Float32Array | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly send: (audio: Float32Array) => void,
    options: Partial<SegmentMergerOptions> = {},
  ) {
    this.options = { ...DEFAULTS, ...options };
  }

  push(audio: Float32Array): void {
    this.clearTimer();
    let next = audio;
    if (this.pending) {
      const gap = new Float32Array(Math.round((this.options.gapMs / 1000) * VAD_SAMPLE_RATE));
      if (samplesToMs(this.pending.length + gap.length + audio.length) <= this.options.maxMs) {
        next = concat(this.pending, gap, audio);
      } else {
        this.send(this.pending); // too long together: send separately
      }
      this.pending = null;
    }

    if (samplesToMs(next.length) >= this.options.minMs) {
      this.send(next);
    } else {
      this.pending = next;
      this.timer = setTimeout(() => this.flush(), this.options.waitMs);
    }
  }

  /** Send whatever is waiting right now (e.g. when the mic is muted). */
  flush(): void {
    this.clearTimer();
    if (this.pending) this.send(this.pending);
    this.pending = null;
  }

  dispose(): void {
    this.clearTimer();
    this.pending = null;
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

function concat(...parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
