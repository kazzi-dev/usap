import type { LanguageCode, Subtitle, SubtitleErrorReason } from "@usap/shared";
import { config } from "./config.js";

export interface SegmentRequest {
  segmentId: string;
  speakerId: string;
  /** When the speech started (ms since epoch). */
  timestamp: number;
  wav: Uint8Array;
  /** What the speaker speaks (speech-to-text hint + translation source). */
  language: LanguageCode;
  /** What the listener reads. */
  targetLanguage: LanguageCode;
}

export type SegmentResult =
  | { ok: true; subtitle: Subtitle; audioSeconds: number; sttMs: number; translateMs: number }
  | { ok: false; reason: SubtitleErrorReason; detail: string };

/** Shape of POST /segments on the Python AI service (apps/ai/app/main.py). */
interface AiSegmentResponse extends Subtitle {
  audioSeconds: number;
  sttMs: number;
  translateMs: number;
}

/** Sends one speech segment to the AI service and returns the subtitle. */
export async function processSegment(req: SegmentRequest): Promise<SegmentResult> {
  const form = new FormData();
  form.append("audio", new Blob([req.wav], { type: "audio/wav" }), "segment.wav");
  form.append("segment_id", req.segmentId);
  form.append("speaker_id", req.speakerId);
  form.append("timestamp", String(Math.round(req.timestamp)));
  form.append("language", req.language);
  form.append("target_language", req.targetLanguage);

  let res: Response;
  try {
    res = await fetch(`${config.ai.url}/segments`, {
      method: "POST",
      body: form,
      headers: config.ai.token ? { "X-Internal-Token": config.ai.token } : {},
      // Local Whisper on a slow CPU can take a while; after this the subtitle is too late to matter.
      signal: AbortSignal.timeout(25_000),
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
  const { audioSeconds, sttMs, translateMs, ...subtitle } = body;
  return { ok: true, subtitle, audioSeconds, sttMs, translateMs };
}

export interface SummaryLine {
  speaker: string;
  text: string;
  lang: string | null;
}

export type SummaryResult = { ok: true; summaries: Record<string, string> } | { ok: false; detail: string };

/** Asks the AI service for an after-call summary (English + each listed language). */
export async function requestSummary(lines: SummaryLine[], languages: string[]): Promise<SummaryResult> {
  try {
    const res = await fetch(`${config.ai.url}/summaries`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.ai.token ? { "X-Internal-Token": config.ai.token } : {}),
      },
      body: JSON.stringify({ lines, languages }),
      signal: AbortSignal.timeout(120_000), // translating + summarizing a long call takes a while
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { detail?: string };
      return { ok: false, detail: body.detail ?? `AI service returned ${res.status}` };
    }
    const body = (await res.json()) as { summaries: Record<string, string> };
    return { ok: true, summaries: body.summaries };
  } catch (err) {
    return { ok: false, detail: `AI service unreachable: ${String(err)}` };
  }
}
