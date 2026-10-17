"use client";

import { useSyncExternalStore } from "react";
import type { CallSession, CallState } from "./call-session";

const IDLE: CallState = {
  status: "idle",
  error: null,
  notice: null,
  signalConnected: false,
  localStream: null,
  localMedia: { audio: false, video: false },
  remote: null,
  remoteStream: null,
  subtitles: [],
  captions: { enabled: true, status: "off" },
  localSpeaking: false,
  language: "en",
  recording: { recording: false, callId: null },
};
const noopSubscribe = () => () => {};
const getIdle = () => IDLE;

/**
 * Re-renders the component whenever the CallSession's state changes.
 * useSyncExternalStore is React's built-in way to read from a store that
 * lives outside React.
 */
export function useCallState(session: CallSession | null): CallState {
  return useSyncExternalStore(
    session?.subscribe ?? noopSubscribe,
    session?.getState ?? getIdle,
    getIdle,
  );
}
