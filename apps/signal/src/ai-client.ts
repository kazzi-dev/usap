import type { Subtitle, SubtitleErrorReason } from "@usap/shared";
import { config } from "./config.js";

export interface SegmentRequest {
  segmentId: string;
  speakerId: string;
  /** When the speech started (ms since epoch). */
  timestamp: number;
  wav: Uint8Array;
}

export type SegmentResult =
  | { ok: true; subtitle: Subtitle; audioSeconds: number; processingMs: number }
  | { ok: false; reason: SubtitleErrorReason; detail: string };

/** Shape of POST /segments on the Python AI service (apps/ai/app/main.py). */
interface AiSegmentResponse extends Subtitle {
  audioSeconds: number;
  processingMs: number;
}

/** Sends one speech segment to the AI service and returns the subtitle. */
export async function processSegment(req: SegmentRequest): Promise<SegmentResult> {
  const form = new FormData();
  form.append("audio", new Blob([req.wav], { type: "audio/wav" }), "segment.wav");
  form.append("segment_id", req.segmentId);
  form.append("speaker_id", req.speakerId);
  form.append("timestamp", String(Math.round(req.timestamp)));

  let res: Response;
  try {
    res = await fetch(`${config.ai.url}/segments`, {
      method: "POST",
      body: form,
      headers: config.ai.token ? { "X-Internal-Token": config.ai.token } : {},
      // Local Whisper on a slow CPU can take a while; after this the subtitle is too late to matter.
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    return { ok: false, reason: "ai-unavailable", detail: String(err) };
  }

  if (!res.ok) {
    const detail = `${res.status} ${await res.text().catch(() => "")}`.slice(0, 300);
    const reason: SubtitleErrorReason = res.status === 400 || res.status === 413 ? "invalid-audio" : res.status === 503 ? "busy" : "ai-unavailable";
    return { ok: false, reason, detail };
  }

  const body = (await res.json()) as AiSegmentResponse;
  const { audioSeconds, processingMs, ...subtitle } = body;
  return { ok: true, subtitle, audioSeconds, processingMs };
}
