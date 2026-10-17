"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { CamIcon, CamOffIcon, LinkIcon, MicIcon, MicOffIcon, PhoneOffIcon } from "@/components/icons";
import { VideoTile } from "@/components/VideoTile";
import { CallSession, type CallState } from "@/lib/call-session";
import { loadDisplayName, saveDisplayName } from "@/lib/display-name";
import { useCallState } from "@/lib/use-call-session";

const noopSubscribe = () => () => {};

export function RoomClient() {
  const { roomId } = useParams<{ roomId: string }>();
  const [session, setSession] = useState<CallSession | null>(null);
  const state = useCallState(session);

  // Read the saved name without a hydration mismatch (server renders "").
  const storedName = useSyncExternalStore(noopSubscribe, loadDisplayName, () => "");
  const [typedName, setTypedName] = useState<string | null>(null);
  const name = typedName ?? storedName;

  // Leaving the page (or switching rooms) ends the call and frees the camera.
  useEffect(() => () => session?.end(), [session]);

  const join = () => {
    const displayName = name.trim() || "Guest";
    saveDisplayName(displayName);
    const next = new CallSession(roomId, displayName);
    setSession(next);
    void next.start();
  };

  if (!session || state.status === "idle") {
    return <PreJoin roomId={roomId} name={name} onNameChange={setTypedName} onJoin={join} />;
  }
  if (state.status === "ended" || state.status === "room-full" || state.status === "error") {
    return <CallOver state={state} onRejoin={join} />;
  }
  return <InCall roomId={roomId} name={name.trim() || "Guest"} state={state} session={session} />;
}

// ---------- Screens ----------

function PreJoin(props: { roomId: string; name: string; onNameChange: (v: string) => void; onJoin: () => void }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-neutral-950 px-4 text-white">
      <form
        className="w-full max-w-sm"
        onSubmit={(e) => {
          e.preventDefault();
          props.onJoin();
        }}
      >
        <p className="text-sm text-neutral-400">Joining room</p>
        <h1 className="font-mono text-2xl">{props.roomId}</h1>
        <label className="mt-6 block text-sm text-neutral-300" htmlFor="name">
          Your name
        </label>
        <input
          id="name"
          value={props.name}
          onChange={(e) => props.onNameChange(e.target.value)}
          maxLength={40}
          placeholder="e.g. Ana"
          autoFocus
          className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-3 outline-none focus:border-sky-500"
        />
        <button type="submit" className="mt-4 w-full rounded-lg bg-sky-600 px-4 py-3 font-medium hover:bg-sky-500">
          Join call
        </button>
        <p className="mt-3 text-xs text-neutral-500">Your browser will ask for camera and microphone access.</p>
      </form>
    </main>
  );
}

function CallOver({ state, onRejoin }: { state: CallState; onRejoin: () => void }) {
  const title =
    state.status === "room-full"
      ? "This call is full"
      : state.status === "error"
        ? "Something went wrong"
        : "You left the call";
  const detail =
    state.status === "room-full"
      ? "Usap calls are 1-on-1 and two people are already in this room."
      : state.status === "error"
        ? state.error
        : null;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-neutral-950 px-4 text-center text-white">
      <div className="max-w-md">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {detail && <p className="mt-2 text-neutral-400">{detail}</p>}
        <div className="mt-6 flex justify-center gap-3">
          <button type="button" onClick={onRejoin} className="rounded-lg bg-sky-600 px-4 py-2 font-medium hover:bg-sky-500">
            {state.status === "ended" ? "Rejoin" : "Try again"}
          </button>
          <Link href="/" className="rounded-lg bg-neutral-800 px-4 py-2 font-medium hover:bg-neutral-700">
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}

function statusMessage(state: CallState): string | null {
  const other = state.remote?.name ?? "the other person";
  switch (state.status) {
    case "starting":
      return "Starting camera and joining…";
    case "waiting":
      return "Waiting for someone to join. Share the invite link.";
    case "connecting":
      return `Connecting to ${other}…`;
    case "reconnecting":
      return state.remote?.signalConnected === false
        ? `${other} lost their connection. Waiting for them to come back…`
        : "Connection interrupted. Reconnecting…";
    default:
      return null;
  }
}

function InCall({ roomId, name, state, session }: { roomId: string; name: string; state: CallState; session: CallSession }) {
  const [copied, setCopied] = useState(false);
  const message = statusMessage(state);
  const remoteVideoOn = state.status === "connected" && !!state.remote?.media.video;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      window.prompt("Copy this invite link:", window.location.href);
    }
  };

  return (
    <main className="flex h-dvh flex-col bg-neutral-950 text-white">
      <header className="flex items-center justify-between gap-2 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-sm text-neutral-300">{roomId}</p>
          <StatusPill status={state.status} />
        </div>
        <button
          type="button"
          onClick={copyLink}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700"
        >
          <LinkIcon />
          {copied ? "Copied!" : "Copy invite link"}
        </button>
      </header>

      {(state.error || (state.status !== "starting" && !state.signalConnected)) && (
        <div role="status" className="mx-4 mb-2 rounded-lg bg-amber-900/60 px-3 py-2 text-sm text-amber-100">
          {state.error ?? "Lost connection to the server. Reconnecting… (an ongoing call keeps working)"}
        </div>
      )}
      {state.notice && (
        <div role="status" className="mx-4 mb-2 rounded-lg bg-neutral-800 px-3 py-2 text-sm text-neutral-200">
          {state.notice}
        </div>
      )}

      <section className="relative mx-4 flex-1 overflow-hidden rounded-2xl">
        <VideoTile
          stream={state.remoteStream}
          showVideo={remoteVideoOn}
          name={state.remote?.name ?? ""}
          className="relative h-full w-full"
        >
          {message && (
            <div className="absolute inset-x-0 top-6 flex justify-center px-4">
              <p className="rounded-full bg-black/70 px-4 py-2 text-center text-sm">{message}</p>
            </div>
          )}
          {state.remote && !state.remote.media.audio && state.status === "connected" && (
            <span className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5" title="Muted">
              <MicOffIcon className="size-4" />
            </span>
          )}
        </VideoTile>

        <VideoTile
          stream={state.localStream}
          showVideo={state.localMedia.video}
          name={name}
          isLocal
          className="absolute bottom-3 right-3 aspect-[3/4] w-28 rounded-xl border border-neutral-700 shadow-lg sm:aspect-video sm:w-56"
        />
      </section>

      <footer className="flex items-center justify-center gap-4 px-4 py-4">
        <ControlButton
          label={state.localMedia.audio ? "Mute microphone" : "Unmute microphone"}
          active={state.localMedia.audio}
          onClick={() => void session.toggleAudio()}
        >
          {state.localMedia.audio ? <MicIcon /> : <MicOffIcon />}
        </ControlButton>
        <ControlButton
          label={state.localMedia.video ? "Turn camera off" : "Turn camera on"}
          active={state.localMedia.video}
          onClick={() => void session.toggleVideo()}
        >
          {state.localMedia.video ? <CamIcon /> : <CamOffIcon />}
        </ControlButton>
        <button
          type="button"
          onClick={() => session.end()}
          aria-label="End call"
          title="End call"
          className="flex size-14 items-center justify-center rounded-full bg-red-600 hover:bg-red-500"
        >
          <PhoneOffIcon />
        </button>
      </footer>
    </main>
  );
}

function ControlButton(props: { label: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-label={props.label}
      aria-pressed={!props.active}
      title={props.label}
      className={`flex size-14 items-center justify-center rounded-full ${
        props.active ? "bg-neutral-800 hover:bg-neutral-700" : "bg-white text-neutral-900 hover:bg-neutral-200"
      }`}
    >
      {props.children}
    </button>
  );
}

function StatusPill({ status }: { status: CallState["status"] }) {
  const styles: Partial<Record<CallState["status"], [string, string]>> = {
    starting: ["bg-neutral-500", "Starting"],
    waiting: ["bg-neutral-500", "Waiting"],
    connecting: ["bg-amber-400", "Connecting"],
    connected: ["bg-emerald-500", "Connected"],
    reconnecting: ["bg-amber-400", "Reconnecting"],
  };
  const [dot, label] = styles[status] ?? ["bg-neutral-500", status];
  return (
    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-neutral-400">
      <span className={`size-2 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
