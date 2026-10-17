import { requestSummary } from "../ai-client.js";
import type { CallStore } from "./call-store.js";

/**
 * Summarizes a finished call and stores the result (or why it failed).
 * Never throws: a failed summary is shown on the call page with a Retry button.
 */
export async function summarizeCall(store: CallStore, callId: string, log: (...args: unknown[]) => void) {
  const { lines, participants } = await store.summaryInput(callId);
  if (lines.length === 0) {
    await store.setSummary(callId, { status: "skipped", error: "Nothing was said in this call." });
    return;
  }
  await store.setSummary(callId, { status: "pending" });
  const languages = [...new Set(participants.map((p) => p.lang))];
  const result = await requestSummary(
    lines.map((l) => ({ speaker: l.speakerName, text: l.originalText, lang: l.lang })),
    languages,
  );
  if (result.ok) {
    await store.setSummary(callId, { status: "ready", summary: result.summaries });
    log(`[call ${callId}] summary ready (${Object.keys(result.summaries).join(", ")})`);
  } else {
    await store.setSummary(callId, { status: "failed", error: result.detail });
    log(`[call ${callId}] summary failed: ${result.detail}`);
  }
}
