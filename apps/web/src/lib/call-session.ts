import type { MediaState, PeerInfo, SignalPayload } from "@usap/shared";
import { io } from "socket.io-client";
import { randomId } from "./ids";
import { fetchIceServers, getSignalUrl, type SignalSocket } from "./signal";

/*
 * CallSession owns everything about one 1-on-1 call:
 *   - the local camera/microphone (MediaStream)
 *   - the Socket.IO connection to the signaling server
 *   - the RTCPeerConnection that carries audio/video directly between browsers
 *
 * It is a plain class, not a React hook: WebRTC is an imperative, event-driven
 * API, and keeping it out of React avoids stale closures and double effects.
 * React subscribes to it with useSyncExternalStore (see use-call-session.ts).
 *
 * Connection flow:
 *   1. Newcomer joins the room and sees the other person in the join reply.
 *   2. Newcomer creates a peer connection and sends an OFFER via the server.
 *   3. The other side creates its peer connection from that offer and sends an ANSWER.
 *   4. Both trickle ICE candidates (possible network paths) through the server.
 *   5. Media flows peer-to-peer. The server is no longer involved, which is why
 *      a brief server outage does not drop an ongoing call.
 */

export type CallStatus =
  | "idle" // not started yet
  | "starting" // getting camera/mic, joining the room
  | "waiting" // in the room alone
  | "connecting" // the other person is here, WebRTC is negotiating
  | "connected"
  | "reconnecting" // was connected, network trouble, trying to recover
  | "room-full"
  | "ended"
  | "error";

export interface RemotePeer extends PeerInfo {
  /** False while the other person's connection to the signaling server is down. */
  signalConnected: boolean;
}

export interface CallState {
  status: CallStatus;
  /** Blocking problem (shown instead of the call, or as a banner while retrying). */
  error: string | null;
  /** Non-blocking info, e.g. "Ana left the call". */
  notice: string | null;
  signalConnected: boolean;
  localStream: MediaStream | null;
  localMedia: MediaState;
  remote: RemotePeer | null;
  remoteStream: MediaStream | null;
}

type Kind = "audio" | "video";

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};
const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  facingMode: "user",
};

/** How long to wait in "disconnected" before forcing an ICE restart. */
const ICE_DISCONNECT_GRACE_MS = 4_000;

function describeMediaError(err: unknown, what: string): string {
  const name = err instanceof DOMException ? err.name : "";
  switch (name) {
    case "NotAllowedError":
      return `Permission to use your ${what} was denied. Allow it in the browser's site settings and try again.`;
    case "NotFoundError":
      return `No ${what} found on this device.`;
    case "NotReadableError":
      return `Your ${what} is being used by another app.`;
    default:
      return `Couldn't access your ${what}.`;
  }
}

export class CallSession {
  /** Identifies this browser page. Stays the same across socket reconnects. */
  readonly clientId = randomId();

  private state: CallState = {
    status: "idle",
    error: null,
    notice: null,
    signalConnected: false,
    localStream: null,
    localMedia: { audio: false, video: false },
    remote: null,
    remoteStream: null,
  };
  private readonly listeners = new Set<() => void>();

  private readonly localStream = new MediaStream();
  private socket: SignalSocket | null = null;
  private iceServers: RTCIceServer[] = [];
  private joined = false;
  private ended = false;
  private togglingVideo = false;

  // Peer connection + "perfect negotiation" bookkeeping (see handleSignal).
  private pc: RTCPeerConnection | null = null;
  private connectionId: string | null = null;
  private makingOffer = false;
  private ignoreOffer = false;
  private hasConnectedToPeer = false;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly roomId: string,
    private readonly name: string,
  ) {}

  // ---------- Store interface for React ----------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): CallState => this.state;

  private set(patch: Partial<CallState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  // ---------- Public actions ----------

  async start(): Promise<void> {
    if (this.state.status !== "idle") return;
    this.set({ status: "starting" });

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      this.set({
        status: "error",
        error:
          "Camera and microphone only work on secure pages. Open the app on http://localhost, " +
          "or over https:// when using another device (see README: npm run dev:https).",
      });
      return;
    }

    await this.acquireInitialMedia();
    if (this.ended) return;

    const signalUrl = getSignalUrl();
    this.iceServers = await fetchIceServers(signalUrl);
    if (this.ended) return;

    window.addEventListener("pagehide", this.onPageHide);
    this.connectSignal(signalUrl);
  }

  async toggleAudio(): Promise<void> {
    const track = this.localTrack("audio");
    if (track) {
      // Muting just stops sending sound; the mic stays open so unmuting is instant.
      track.enabled = !track.enabled;
      this.setLocalMedia({ audio: track.enabled });
      return;
    }
    const newTrack = await this.acquireTrack("audio");
    if (newTrack) await this.useLocalTrack(newTrack);
  }

  async toggleVideo(): Promise<void> {
    if (this.togglingVideo) return;
    this.togglingVideo = true;
    try {
      const track = this.localTrack("video");
      if (track) {
        // Turning the camera off fully releases it (the camera light goes out).
        track.stop();
        this.localStream.removeTrack(track);
        await this.replaceSenderTrack("video", null);
        this.setLocalMedia({ video: false });
      } else {
        const newTrack = await this.acquireTrack("video");
        if (newTrack) await this.useLocalTrack(newTrack);
      }
    } finally {
      this.togglingVideo = false;
    }
  }

  /** Leave the call and release the camera/mic. */
  end(): void {
    if (this.ended) return;
    this.teardown();
    this.set({ status: "ended" });
  }

  private teardown() {
    this.ended = true;
    window.removeEventListener("pagehide", this.onPageHide);
    if (this.socket) {
      this.socket.emit("leave-room");
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.closePeerConnection();
    for (const track of this.localStream.getTracks()) track.stop();
    this.set({
      signalConnected: false,
      localStream: null,
      remote: null,
      remoteStream: null,
    });
  }

  // ---------- Local media ----------

  private localTrack(kind: Kind): MediaStreamTrack | null {
    return this.localStream.getTracks().find((t) => t.kind === kind) ?? null;
  }

  private async acquireInitialMedia() {
    const gum = (c: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(c);
    let stream: MediaStream | null = null;
    let notice: string | null = null;
    try {
      stream = await gum({ audio: AUDIO_CONSTRAINTS, video: VIDEO_CONSTRAINTS });
    } catch (bothErr) {
      // Fall back to whichever device works, so a missing webcam doesn't block the call.
      try {
        stream = await gum({ audio: AUDIO_CONSTRAINTS });
        notice = describeMediaError(bothErr, "camera");
      } catch {
        try {
          stream = await gum({ video: VIDEO_CONSTRAINTS });
          notice = describeMediaError(bothErr, "microphone");
        } catch {
          notice = `${describeMediaError(bothErr, "camera and microphone")} You can still see and hear the other person.`;
        }
      }
    }
    if (this.ended) {
      stream?.getTracks().forEach((t) => t.stop());
      return;
    }
    stream?.getTracks().forEach((t) => this.localStream.addTrack(t));
    this.set({ notice });
    this.setLocalMedia({ audio: !!this.localTrack("audio"), video: !!this.localTrack("video") });
  }

  private async acquireTrack(kind: Kind): Promise<MediaStreamTrack | null> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        kind === "audio" ? { audio: AUDIO_CONSTRAINTS } : { video: VIDEO_CONSTRAINTS },
      );
      const track = stream.getTracks()[0] ?? null;
      if (this.ended) track?.stop();
      return this.ended ? null : track;
    } catch (err) {
      this.set({ notice: describeMediaError(err, kind === "audio" ? "microphone" : "camera") });
      return null;
    }
  }

  private async useLocalTrack(track: MediaStreamTrack) {
    this.localStream.addTrack(track);
    await this.replaceSenderTrack(track.kind as Kind, track);
    this.setLocalMedia(track.kind === "audio" ? { audio: true } : { video: true });
  }

  /**
   * Swap what we send on the existing audio/video channel. replaceTrack does
   * not need a new offer/answer round, so toggling the camera is instant.
   */
  private async replaceSenderTrack(kind: Kind, track: MediaStreamTrack | null) {
    const transceiver = this.pc?.getTransceivers().find((t) => t.receiver.track.kind === kind);
    if (transceiver) await transceiver.sender.replaceTrack(track);
  }

  private setLocalMedia(patch: Partial<MediaState>) {
    const localMedia = { ...this.state.localMedia, ...patch };
    // A new MediaStream object makes React re-render the preview.
    const preview = new MediaStream(this.localStream.getVideoTracks());
    this.set({ localMedia, localStream: preview });
    if (this.joined) this.socket?.emit("media-state", localMedia);
  }

  // ---------- Signaling (Socket.IO) ----------

  private connectSignal(url: string) {
    // Socket.IO reconnects automatically with backoff when the connection drops.
    const socket: SignalSocket = io(url, { reconnectionDelayMax: 5_000 });
    this.socket = socket;

    socket.on("connect", () => {
      this.set({ signalConnected: true, error: null });
      void this.joinRoom();
    });

    socket.on("disconnect", () => {
      this.set({ signalConnected: false });
      this.updateStatus();
    });

    socket.on("connect_error", () => {
      if (!this.joined) {
        this.set({
          error:
            `Can't reach the signaling server at ${url}. Is it running? ` +
            `On https, open ${url}/health once and accept the certificate.`,
        });
      }
    });

    socket.on("peer-joined", (peer) => {
      // A fresh participant: drop any old connection and wait for their offer.
      this.closePeerConnection();
      this.hasConnectedToPeer = false;
      this.set({ remote: { ...peer, signalConnected: true }, remoteStream: null, notice: null });
      this.updateStatus();
    });

    socket.on("peer-left", ({ clientId }) => {
      const remote = this.state.remote;
      if (!remote || remote.clientId !== clientId) return;
      this.closePeerConnection();
      this.hasConnectedToPeer = false;
      this.set({ remote: null, remoteStream: null, notice: `${remote.name} left the call.` });
      this.updateStatus();
    });

    socket.on("peer-disconnected", ({ clientId }) => this.patchRemote(clientId, { signalConnected: false }));

    socket.on("peer-reconnected", ({ clientId }) => {
      this.patchRemote(clientId, { signalConnected: true });
      // Messages we sent while they were offline were lost; re-sync if needed.
      this.recoverIfNeeded();
    });

    socket.on("media-state", ({ clientId, media }) => this.patchRemote(clientId, { media }));

    socket.on("signal", ({ from, payload }) => void this.handleSignal(from, payload));
  }

  private async joinRoom() {
    const socket = this.socket;
    if (!socket) return;
    let res;
    try {
      res = await socket.timeout(8_000).emitWithAck("join-room", {
        roomId: this.roomId,
        clientId: this.clientId,
        name: this.name,
        media: this.state.localMedia,
      });
    } catch {
      // No reply in time: reconnect, which triggers another join attempt.
      socket.disconnect().connect();
      return;
    }
    if (this.ended || socket !== this.socket) return;

    if (!res.ok) {
      if (res.error === "room-full") {
        this.teardown();
        this.set({ status: "room-full" });
      } else {
        this.set({ status: "error", error: "The server rejected this room link." });
      }
      return;
    }

    this.joined = true;
    const peer = res.peers[0] ?? null;

    if (!peer) {
      // Alone in the room (first to arrive, or the other person left while we were offline).
      if (this.state.remote) {
        this.closePeerConnection();
        this.set({ remote: null, remoteStream: null });
      }
      this.updateStatus();
      return;
    }

    const samePeer = this.state.remote?.clientId === peer.clientId && this.pc !== null;
    this.set({ remote: { ...peer, signalConnected: true } });

    if (res.resumed && samePeer) {
      // Our socket blipped but the call may still be fine (media is peer-to-peer).
      this.recoverIfNeeded();
    } else {
      // We are the newcomer: we start the connection by sending the offer.
      this.hasConnectedToPeer = false;
      this.startPeerConnection();
    }
    this.updateStatus();
  }

  private sendSignal(payload: Omit<SignalPayload, "connectionId">) {
    const to = this.state.remote?.clientId;
    // Don't let Socket.IO buffer messages while offline: they would be sent
    // before we rejoin the room and get dropped. We re-sync on reconnect instead.
    if (!to || !this.connectionId || !this.socket?.connected) return;
    this.socket.emit("signal", { to, payload: { ...payload, connectionId: this.connectionId } });
  }

  private patchRemote(clientId: string, patch: Partial<RemotePeer>) {
    const remote = this.state.remote;
    if (!remote || remote.clientId !== clientId) return;
    this.set({ remote: { ...remote, ...patch } });
  }

  private onPageHide = () => {
    // Best effort: tell the server right away so the other person isn't left waiting.
    this.socket?.emit("leave-room");
  };

  // ---------- WebRTC ----------

  /**
   * In "perfect negotiation" each side has a role: if both send an offer at the
   * same moment, the polite peer backs down and accepts the other's offer, and
   * the impolite peer ignores the incoming one. Comparing ids gives both
   * browsers the same answer without talking to each other.
   */
  private get polite(): boolean {
    return this.clientId > (this.state.remote?.clientId ?? "");
  }

  /** Offerer side: create the connection and our audio + video channels. */
  private startPeerConnection() {
    const pc = this.createPeerConnection(randomId());
    // Always create both channels, even with the camera off, so turning it on
    // later is a simple replaceTrack (no renegotiation).
    for (const kind of ["audio", "video"] as const) {
      pc.addTransceiver(this.localTrack(kind) ?? kind, { direction: "sendrecv" });
    }
    // Adding transceivers fires "negotiationneeded", which sends the offer.
  }

  private createPeerConnection(connectionId: string): RTCPeerConnection {
    this.closePeerConnection();
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.pc = pc;
    this.connectionId = connectionId;
    this.makingOffer = false;
    this.ignoreOffer = false;
    this.set({ remoteStream: null });

    pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer = true;
        await pc.setLocalDescription(); // creates the right offer automatically
        if (this.pc === pc && pc.localDescription) this.sendSignal({ description: pc.localDescription.toJSON() });
      } catch (err) {
        console.warn("[webrtc] negotiation failed", err);
      } finally {
        this.makingOffer = false;
      }
    };

    pc.onicecandidate = ({ candidate }) => {
      if (this.pc === pc && candidate) this.sendSignal({ candidate: candidate.toJSON() });
    };

    pc.ontrack = () => {
      if (this.pc !== pc) return;
      this.set({ remoteStream: new MediaStream(pc.getReceivers().map((r) => r.track)) });
    };

    pc.onconnectionstatechange = () => this.onConnectionStateChange(pc);

    return pc;
  }

  private async handleSignal(from: string, payload: SignalPayload) {
    if (!this.state.remote || from !== this.state.remote.clientId) return;
    const { connectionId, description, candidate } = payload;

    if (connectionId !== this.connectionId) {
      // A message for a different peer connection than ours.
      if (description?.type !== "offer") return; // leftover from an old connection, ignore
      if (this.pc?.signalingState === "have-local-offer" && !this.polite) return; // both started at once; ours wins
      // The other side started a new connection (first call, or after a reload): follow it.
      this.hasConnectedToPeer = false;
      this.createPeerConnection(connectionId);
    }

    const pc = this.pc;
    if (!pc) return;
    try {
      if (description) {
        const offerCollision = description.type === "offer" && (this.makingOffer || pc.signalingState !== "stable");
        this.ignoreOffer = !this.polite && offerCollision;
        if (this.ignoreOffer) return;

        // On the polite side this implicitly rolls back our own pending offer.
        await pc.setRemoteDescription(description);
        if (description.type === "offer") {
          this.attachLocalTracks(pc);
          await pc.setLocalDescription(); // creates the answer
          if (this.pc === pc && pc.localDescription) this.sendSignal({ description: pc.localDescription.toJSON() });
        }
      } else if (candidate) {
        try {
          await pc.addIceCandidate(candidate);
        } catch (err) {
          if (!this.ignoreOffer) console.warn("[webrtc] bad ICE candidate", err);
        }
      }
    } catch (err) {
      console.warn("[webrtc] failed to handle signal", err);
    }
  }

  /**
   * Answerer side: the offer created receive-only channels on our end. Turn
   * them into send-and-receive and plug in our camera/mic.
   */
  private attachLocalTracks(pc: RTCPeerConnection) {
    for (const transceiver of pc.getTransceivers()) {
      const kind = transceiver.receiver.track.kind as Kind;
      if (transceiver.direction !== "sendrecv") transceiver.direction = "sendrecv";
      const track = this.localTrack(kind);
      if (transceiver.sender.track !== track) void transceiver.sender.replaceTrack(track);
    }
  }

  private onConnectionStateChange(pc: RTCPeerConnection) {
    if (pc !== this.pc) return;
    if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
    this.disconnectTimer = null;

    switch (pc.connectionState) {
      case "connected":
        this.hasConnectedToPeer = true;
        break;
      case "disconnected":
        // Often recovers by itself (e.g. Wi-Fi hiccup). If not, find a new network path.
        this.disconnectTimer = setTimeout(() => {
          if (this.pc === pc && pc.connectionState === "disconnected") this.restartIce();
        }, ICE_DISCONNECT_GRACE_MS);
        break;
      case "failed":
        this.restartIce();
        break;
    }
    this.updateStatus();
  }

  /**
   * ICE restart: gather fresh network paths (e.g. phone switched from Wi-Fi to
   * mobile data) without tearing down the call. It triggers a new offer.
   */
  private restartIce() {
    const pc = this.pc;
    if (!pc || !this.socket?.connected) return; // retried by recoverIfNeeded() after reconnecting
    pc.restartIce();
  }

  /** Called after a signaling reconnect: resend whatever may have been lost. */
  private recoverIfNeeded() {
    const pc = this.pc;
    if (!pc || pc.connectionState === "connected") return;
    if (pc.signalingState === "have-local-offer" && pc.localDescription) {
      // Our offer may have been sent while the other side was offline.
      this.sendSignal({ description: pc.localDescription.toJSON() });
    } else if (pc.signalingState === "stable") {
      this.restartIce();
    }
  }

  private closePeerConnection() {
    if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
    this.disconnectTimer = null;
    if (this.pc) {
      this.pc.onnegotiationneeded = null;
      this.pc.onicecandidate = null;
      this.pc.ontrack = null;
      this.pc.onconnectionstatechange = null;
      this.pc.close();
    }
    this.pc = null;
    this.connectionId = null;
  }

  /** Works out the user-facing status from the current connection facts. */
  private updateStatus() {
    const current = this.state.status;
    if (current === "idle" || current === "room-full" || current === "ended" || current === "error") return;

    let status: CallStatus;
    if (!this.joined) status = "starting";
    else if (!this.state.remote) status = "waiting";
    else if (this.pc?.connectionState === "connected") status = "connected";
    else status = this.hasConnectedToPeer ? "reconnecting" : "connecting";

    if (status !== current) this.set({ status });
  }
}
