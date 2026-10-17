/**
 * The Socket.IO "contract" between the browser (apps/web) and the signaling
 * server (apps/signal). Both sides import these types, so if one side changes
 * an event's shape, the other side stops compiling instead of breaking at runtime.
 *
 * This file is type-only (.d.ts): nothing here exists at runtime.
 */

/**
 * Languages Usap supports: English, Tagalog, Cebuano (Bisaya), Japanese.
 * The AI service maps these to Whisper and NLLB codes (apps/ai/app/languages.py).
 */
export type LanguageCode = "en" | "tl" | "ceb" | "ja";

/** Whether a participant's mic / camera are currently on. */
export interface MediaState {
  audio: boolean;
  video: boolean;
}

export interface PeerInfo {
  /** Stable id for this participant for the lifetime of their page (survives socket reconnects). */
  clientId: string;
  name: string;
  media: MediaState;
  /** The language this person speaks AND wants to read subtitles in. */
  lang: LanguageCode;
}

/*
 * Minimal copies of the browser WebRTC types, so the Node server can compile
 * without the DOM type library. They are structurally compatible with
 * RTCSessionDescriptionInit / RTCIceCandidateInit / RTCIceServer.
 */
export interface SessionDescription {
  type: "offer" | "answer" | "pranswer" | "rollback";
  sdp?: string;
}
export interface IceCandidate {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/**
 * Opaque WebRTC negotiation payload. The server never looks inside it,
 * it only forwards it to the other peer.
 */
export interface SignalPayload {
  /**
   * Id of the peer connection this message belongs to. Chosen by whoever sends
   * the first offer and adopted by the answerer. Lets each side drop stale
   * messages from an older connection (e.g. after a page reload).
   */
  connectionId: string;
  description?: SessionDescription;
  candidate?: IceCandidate | null;
}

export interface JoinRequest {
  roomId: string;
  clientId: string;
  name: string;
  media: MediaState;
  lang: LanguageCode;
}

export type JoinResponse =
  | {
      ok: true;
      /** Everyone already in the room (at most one other person in a 1-on-1 call). */
      peers: PeerInfo[];
      /** True if this was a socket reconnect and our room slot was still reserved. */
      resumed: boolean;
    }
  | { ok: false; error: "room-full" | "invalid-request" };

/** One chunk of speech, cut by voice activity detection in the speaker's browser. */
export interface AudioSegment {
  /** Increases by one per segment from the same speaker. */
  seq: number;
  /** Length of the speech. The server uses its own clock for timestamps, so
   *  devices with wrong clocks can't mess up the subtitle order. */
  durationMs: number;
  /** 16 kHz mono 16-bit WAV file. Socket.IO sends it as binary, not JSON. */
  audio: ArrayBuffer | Uint8Array;
}

/** A finished subtitle line, sent to everyone in the room (the speaker included). */
export interface Subtitle {
  segmentId: string;
  speakerId: string;
  originalText: string;
  /** originalText translated into the listener's language (same text if both speak the same language). */
  translatedText: string;
  /** Language of originalText (the speaker's chosen language). */
  lang: LanguageCode | null;
  /** Language of translatedText. Equals `lang` when no translation was needed or possible. */
  targetLang: LanguageCode | null;
  /** When the speech started (ms since epoch). */
  timestamp: number;
  /** Which speech-to-text engine produced it. */
  engine: "groq" | "local";
}

export type SubtitleErrorReason = "ai-unavailable" | "busy" | "invalid-audio";

/** Events the browser sends to the server. */
export interface ClientToServerEvents {
  "join-room": (req: JoinRequest, ack: (res: JoinResponse) => void) => void;
  /** Forward a WebRTC offer/answer/ICE candidate to another peer in the room. */
  signal: (msg: { to: string; payload: SignalPayload }) => void;
  "media-state": (media: MediaState) => void;
  "leave-room": () => void;
  "audio-segment": (segment: AudioSegment) => void;
  /** Change my language mid-call. */
  "set-language": (lang: LanguageCode) => void;
}

/** Events the server sends to the browser. */
export interface ServerToClientEvents {
  /** A new participant joined (or rejoined after their old slot expired). */
  "peer-joined": (peer: PeerInfo) => void;
  /** The other participant left on purpose, or their reconnect grace period ran out. */
  "peer-left": (msg: { clientId: string }) => void;
  /** The other participant's signaling socket dropped; they may come back within the grace period. */
  "peer-disconnected": (msg: { clientId: string }) => void;
  /** The other participant's signaling socket came back. */
  "peer-reconnected": (msg: { clientId: string }) => void;
  signal: (msg: { from: string; payload: SignalPayload }) => void;
  "media-state": (msg: { clientId: string; media: MediaState }) => void;
  "language-changed": (msg: { clientId: string; lang: LanguageCode }) => void;
  subtitle: (subtitle: Subtitle) => void;
  /** Sent only to the speaker when one of their segments could not be transcribed. */
  "subtitle-error": (msg: { seq: number; reason: SubtitleErrorReason }) => void;
}

/** Response of GET /ice-servers on the signaling server. */
export interface IceServersResponse {
  iceServers: IceServer[];
}
