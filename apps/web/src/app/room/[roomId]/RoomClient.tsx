"use client";

import Link from "next/link";
import type { LanguageCode } from "@usap/shared";
import { useParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { CamIcon, CamOffIcon, LinkIcon, MicIcon, MicOffIcon, PhoneOffIcon } from "@/components/icons";
import { LanguageSelect } from "@/components/LanguageSelect";
import { SubtitleOverlay } from "@/components/SubtitleOverlay";
import { VideoTile } from "@/components/VideoTile";
import { CallSession, type CallState } from "@/lib/call-session";
import { loadDisplayName, loadLanguage, saveDisplayName, saveLanguage } from "@/lib/preferences";
import { useSession } from "@/lib/session";
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
  const storedLanguage = useSyncExternalStore(noopSubscribe, loadLanguage, () => "en" as const);
  const [pickedLanguage, setPickedLanguage] = useState<LanguageCode | null>(null);
  const language = pickedLanguage ?? storedLanguage;

  // Leaving the page (or switching rooms) ends the call and frees the camera.
  useEffect(() => () => session?.end(), [session]);

  const join = () => {
    // "Rejoin" keeps the name and language of the call you just left, rather
    // than re-reading saved preferences (another tab may have changed them).
    const previous = session && session.getState().status !== "idle" ? session : null;
    const displayName = previous?.name ?? (name.trim() || "Guest");
    const lang = previous?.getState().language ?? language;
    saveDisplayName(displayName);
    saveLanguage(lang);
    const next = new CallSession(roomId, displayName, lang);
    setSession(next);
    void next.start();
  };

  if (!session || state.status === "idle") {
    return (
      <PreJoin
        roomId={roomId}
        name={name}
        onNameChange={setTypedName}
        language={language}
        onLanguageChange={setPickedLanguage}
        onJoin={join}
      />
    );
  }
  if (state.status === "ended" || state.status === "room-full" || state.status === "error") {
    return <CallOver state={state} onRejoin={join} />;
  }
  return <InCall roomId={roomId} name={name.trim() || "Guest"} state={state} session={session} />;
}

// ---------- Screens ----------

function PreJoin(props: {
  roomId: string;
  name: string;
  onNameChange: (v: string) => void;
  language: LanguageCode;
  onLanguageChange: (lang: LanguageCode) => void;
  onJoin: () => void;
}) {
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
        <label className="mt-4 block text-sm text-neutral-300" htmlFor="language">
          Language you speak (subtitles will be shown in it too)
        </label>
        <LanguageSelect
          id="language"
          value={props.language}
          onChange={props.onLanguageChange}
          className="mt-1 w-full px-3 py-3"
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
  const session = useSession();
  const savedCallId = state.status === "ended" ? state.recording.callId : null;
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
        {savedCallId && (
          <p className="mt-2 text-neutral-400">
            {session ? (
              <>
                The transcript was saved.{" "}
                <Link href={`/history/${savedCallId}`} className="text-sky-400 hover:underline">
                  View transcript and summary
                </Link>
              </>
            ) : (
              "The transcript was saved to the other person's account."
            )}
          </p>
        )}
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
          <div className="flex items-center gap-3">
            <StatusPill status={state.status} />
            <span className="mt-0.5 text-xs text-neutral-400">
              {state.recording.recording && (
                <span className="flex items-center gap-1 text-red-300" title="This call's transcript is being saved to a logged-in participant's history">
                  <span className="size-2 rounded-full bg-red-500" /> Transcript saved
                </span>
              )}
              Subtitles:{" "}
              {state.captions.status === "on"
                ? state.localSpeaking
                  ? "hearing you…"
                  : "listening"
                : state.captions.status}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <LanguageSelect
            value={state.language}
            onChange={(lang) => {
              saveLanguage(lang);
              session.setLanguage(lang);
            }}
            className="max-w-28 px-2 py-2 text-sm sm:max-w-none"
          />
          <button
            type="button"
            onClick={copyLink}
            aria-label="Copy invite link"
            className="flex items-center gap-2 rounded-lg bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700"
          >
            <LinkIcon />
            <span className="hidden sm:inline">{copied ? "Copied!" : "Copy invite link"}</span>
            <span className="sm:hidden">{copied ? "Copied" : "Invite"}</span>
          </button>
        </div>
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
          <SubtitleOverlay lines={state.subtitles} />
        </VideoTile>

        <VideoTile
          stream={state.localStream}
          showVideo={state.localMedia.video}
          name={name}
          isLocal
          className={`absolute bottom-3 right-3 aspect-[3/4] w-28 rounded-xl border shadow-lg transition-colors sm:aspect-video sm:w-56 ${
            // Green outline while voice detection hears you: shows subtitles are picking you up.
            state.localSpeaking ? "border-emerald-400 ring-2 ring-emerald-400" : "border-neutral-700"
          }`}
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
        <ControlButton
          label={captionsLabel(state.captions.status)}
          active={state.captions.enabled}
          onClick={() => session.toggleCaptions()}
        >
          <span className={`text-sm font-bold ${state.captions.status === "unavailable" ? "line-through" : ""}`}>CC</span>
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

function captionsLabel(status: CallState["captions"]["status"]): string {
  switch (status) {
    case "on":
      return "Subtitles for your speech are on. Click to turn off";
    case "starting":
      return "Starting subtitles…";
    case "unavailable":
      return "Subtitles unavailable (no microphone or voice detection failed)";
    case "off":
      return "Subtitles for your speech are off. Click to turn on";
  }
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
