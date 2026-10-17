/**
 * The Socket.IO "contract" between the browser (apps/web) and the signaling
 * server (apps/signal). Both sides import these types, so if one side changes
 * an event's shape, the other side stops compiling instead of breaking at runtime.
 *
 * This file is type-only (.d.ts): nothing here exists at runtime.
 */

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

/** Events the browser sends to the server. */
export interface ClientToServerEvents {
  "join-room": (req: JoinRequest, ack: (res: JoinResponse) => void) => void;
  /** Forward a WebRTC offer/answer/ICE candidate to another peer in the room. */
  signal: (msg: { to: string; payload: SignalPayload }) => void;
  "media-state": (media: MediaState) => void;
  "leave-room": () => void;
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
}

/** Response of GET /ice-servers on the signaling server. */
export interface IceServersResponse {
  iceServers: IceServer[];
}
