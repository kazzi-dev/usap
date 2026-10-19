# Usap

**Video calls where each person reads the other in their own language.**
Two people join a call from a browser or the Android app. Each picks a
language: English, Tagalog, Cebuano (Bisaya) or Japanese. While they talk,
speech is transcribed and translated into live subtitles. After the call, both
get a saved transcript and an AI summary.

*Usap* means "to talk" in Filipino. It costs **$0** to run: WebRTC, Groq's
free tier, open-source models running locally, and free hosting.

## Why I built this

My friends and I don't all share a first language. Some of us speak
English, some Japanese, some Tagalog or Bisaya, and our group calls kept
running into the same wall: someone would get lost, we'd stop to translate,
and the conversation would lose its flow. Messenger, Instagram calls and
Discord are great for talking, but none of them can show you what the other
person is saying in *your* language while they're saying it.

So I built Usap: a video call app where everyone speaks their own language
and reads everyone else in theirs, as live subtitles. The goal is simple: to
remove the language barrier between friends, so we can talk instead of
translating.

## Try it

**Live demo:** https://laptop-ldfbt695.tail476b07.ts.net

The live demo runs **on my own laptop**, shared through a Tailscale Funnel
link, so it's only online while the laptop is on. I planned to host it on
Oracle Cloud's Always Free tier, but Oracle's card verification kept failing
for my card. Free hosts that skip card checks only offer about 512 MB of
memory, which is too little for the translation model. The project is ready
for a real server, though: [docs/DEPLOY.md](docs/DEPLOY.md) covers Vercel plus
a Docker container, and moving there is a configuration change, not a
rewrite.

## Highlights

- **Real-time pipeline across 3 runtimes.** The browser detects speech (Silero
  VAD, WASM). The Node signal server routes each speech segment. The Python AI
  service transcribes it (Whisper) and translates it (NLLB-200), and the
  subtitle reaches the other person in about a second.
- **Peer-to-peer video.** Audio and video flow directly between the two
  devices over WebRTC. The server never sees the video. It handles
  [perfect negotiation](https://developer.mozilla.org/docs/Web/API/WebRTC_API/Perfect_negotiation),
  ICE restarts after network changes, and a TURN relay fallback for strict
  networks. Built-in diagnostics explain why a call can't connect.
- **Stays free under load.** A token-bucket limiter keeps every Groq call
  inside the free-tier limits (requests per minute and per day, audio
  seconds). When a limit is reached, speech-to-text switches to a local
  faster-whisper model, so subtitles never stop.
- **Translation runs on your own server.** Meta's NLLB-200 model is converted
  to CTranslate2 int8 and runs on the server's CPU. It covers Cebuano, which
  most free translation APIs don't.
- **Two clients, one protocol.** The Next.js web app and the Flutter Android
  app join the same calls, with shared typed message contracts (`packages/shared`).
- **Accounts and history.** Passwords are hashed with scrypt, and sessions use
  hashed bearer tokens. Transcripts are stored in Postgres (Drizzle ORM), and
  an LLM writes summaries after each call.
- **Polish.** First-run onboarding, light and dark mode, reduced-motion
  support, a mobile-first layout, and friendly error and 404 pages.

| Layer | Tech |
| ----- | ---- |
| Web | Next.js 16, React 19, TypeScript, Tailwind CSS v4 |
| Mobile | Flutter (Android), flutter_webrtc |
| Realtime | WebRTC, Socket.IO, Metered TURN |
| Backend | Node 22, Express 5, Zod, Drizzle ORM, Postgres / PGlite |
| AI | Python, FastAPI, Groq Whisper large-v3-turbo, faster-whisper, NLLB-200 (CTranslate2), Groq LLM |
| Tests | node:test (rooms, auth, transcripts, helpers), pytest (rate limiter, translator), flutter test (VAD) |
| Hosting | Self-hosted on my laptop via Tailscale Funnel today; Docker + Vercel ready ([deploy guide](docs/DEPLOY.md)) |

| Stage | What | Status |
| ----- | ---- | ------ |
| 1 | 1-on-1 browser video call (rooms, toggles, reconnect) | ✅ |
| 2 | Live same-language subtitles (VAD, Groq Whisper, rate limiter, local fallback) | ✅ |
| 3 | Translation (NLLB-200) with per-user language | ✅ |
| 4 | Flutter app joining the same calls | ✅ |
| 5 | Postgres transcripts, AI summary, call history, auth | ✅ |
| 6 | Tests, error states, onboarding, theming, deployment guide | ✅ |

## Architecture

```mermaid
flowchart LR
    subgraph A[Browser A]
      UI_A[Call UI] --- VAD_A[VAD<br/>Silero in WASM]
    end
    B[Browser or<br/>Android app]
    S[Signal server<br/>Node + Socket.IO]
    AI[AI service<br/>Python + FastAPI]
    G[(Groq Whisper<br/>free tier)]
    L[(faster-whisper<br/>local CPU)]
    N[(NLLB-200<br/>local CPU, int8)]
    DB[(Postgres)]
    LLM[(Groq LLM<br/>summaries)]

    A <== "WebRTC audio + video (peer-to-peer)" ==> B
    A <-- "signaling + speech segments (WAV)" --> S
    B <-- "signaling + subtitles" --> S
    S -- "POST /segments" --> AI
    AI -- "within rate limit" --> G
    AI -. "limit hit / Groq down" .-> L
    AI -- "translate to listener's language" --> N
    S -- "users, calls, transcripts" --> DB
    AI -- "after the call" --> LLM
```

- **Signal server** (`apps/signal`): the backend. Manages rooms, forwards
  WebRTC setup messages and speech segments, broadcasts subtitles, and serves
  the REST API (accounts, call history) backed by Postgres. It never sees the video.
- **Web app** (`apps/web`): the call UI. Audio/video go directly between the
  two browsers (or via a TURN relay when a direct path is blocked).
- **AI service** (`apps/ai`): speech-to-text, then translation. Listens only on
  `127.0.0.1`, so only the signal server can reach it and the Groq key never
  leaves the server.

## Repo layout

```
usap/
  apps/web        Next.js + TypeScript + Tailwind call UI
  apps/signal     Node + TypeScript + Socket.IO signaling server
  apps/ai         Python + FastAPI speech-to-text + translation service
  apps/mobile     Flutter Android app (joins the same calls as the web app)
  packages/shared Type-only "contract" for the Socket.IO events (used by web + signal)
  scripts/        setup/run helpers (dev certificate, Python venv, VAD assets)
  .env.example    Every setting, no secrets
```

## Setup

Requirements: **Node 22+** and **Python 3.12**. For the Android app: **Flutter 3.x** and Android Studio (for the Android SDK).

```bash
npm install
npm run setup:ai          # creates apps/ai/.venv and installs Python packages
npm run setup:models      # one time: downloads + converts the NLLB translation model
cp .env.example .env      # then put your GROQ_API_KEY in .env
npm run db:up             # Postgres in Docker (needs Docker Desktop running)
```

Get a free Groq key at https://console.groq.com → **API Keys** (no credit card).
Without a key everything still works, just slower: every segment uses the local model.

Downloads, once: the local Whisper model (~500 MB, on first start) and Meta's
NLLB model (~2.5 GB, during `setup:models`, converted to a ~600 MB int8 model in
`apps/ai/models/`). `setup:models` also installs PyTorch, which is only used for
that conversion.

> **Windows "Smart App Control" note:** the first time Python loads a freshly
> installed library, Windows may block it ("An Application Control policy has
> blocked this file"). It checks the file online and usually allows it on the
> next start. Run the command again.

> **Editing Python code?** Restart `npm run dev` afterwards. The AI service
> doesn't auto-reload: on Windows the old process can keep serving stale code.

### Run on one computer (two tabs)

```bash
npm run dev
```

Starts the signal server (:4000), the web app (:3000) and the AI service (:8000).
Open http://localhost:3000, click **Start a new call**, enter a name, join. Copy
the invite link into a second tab and join again. Use headphones or mute one
tab, otherwise the two tabs echo each other.

**Test subtitles without talking:** add `?fakeMic=/dev/sample-speech.wav` to a
room link (dev mode only). That tab "speaks" the sample file on a loop.

### Run across devices on the same Wi-Fi (laptop + phone)

Browsers only allow the camera on `https://` pages (or `localhost`), so a phone
opening `http://192.168.x.x:3000` would be blocked. Use HTTPS mode:

```bash
npm run dev:https
```

This creates a self-signed certificate in `certs/` (git-ignored) for localhost and
your laptop's LAN IPs. On the phone:

1. Open `https://<laptop-ip>:4000/health`, accept the certificate warning
   (Advanced → Proceed). You should see `{"ok":true,...}`.
2. Open `https://<laptop-ip>:3000`, accept the warning again, and join the call.

If Windows asks whether to allow Node.js on private networks, click **Allow**.

### Share with someone outside your network (`npm run share`)

```bash
npm run share
```

Prints a public link like `https://some-words.trycloudflare.com` to send to
anyone. They open it in a browser; no install, no certificate warnings.

```
friend ─https─▶ Cloudflare ─tunnel─▶ cloudflared ─▶ share proxy :8800 ─┬─ /api, /socket.io ─▶ signal :4200
                                                                     └─ everything else ─▶ website :3200
```

- Needs [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
  (`winget install -e --id Cloudflare.cloudflared`). Free "quick tunnels" need no account.
- A quick tunnel forwards to ONE local address, so `scripts/share.mjs` runs a small
  reverse proxy (plain Node, WebSockets included) in front of both servers, and builds
  the website in "same-origin" mode (`NEXT_PUBLIC_SIGNAL_URL=same-origin`).
- The AI service is never exposed; only the signal server talks to it.
- Run it **instead of** `npm run dev` (they share the local database). Your laptop must
  stay on. Anyone with the link can use it (and your Groq quota), so stop with Ctrl+C
  when done; the link changes every time. `--no-build` reuses the last build.
- Without TURN, calls between two home Wi-Fi networks usually connect; mobile data
  (carrier NAT) often needs the TURN relay below.
- **Diagnosing "no video":** each client reports how its video connected, and the
  signal server logs it: `video connected via lan | internet | relay`, or
  `video slow` / `failed` with whether a TURN relay was available. When video
  can't connect after 15 s, both people see an explanation (subtitles keep working).
- **Testing TURN from one network:** add `?relay=1` to a room link. That browser then
  sends media only through the TURN relay, proving the relay works.
- The Android app accepts these share links too: paste the invite link and it switches
  to that server automatically.

### TURN (optional, for calls across different networks)

STUN alone is enough on the same Wi-Fi. For calls across strict NATs/mobile
data, create a free [Metered](https://www.metered.ca/stun-turn) account and put
`METERED_APP_NAME` + `METERED_API_KEY` (or static `TURN_*` values) in `.env`. The
signal server hands these to browsers at runtime via `GET /ice-servers`.

## Android app (apps/mobile)

A Flutter app that speaks exactly the same Socket.IO protocol as the web app,
so a phone-app user and a browser user can call each other.

**Build and install** (Android phone with USB debugging on, connected by USB):

```bash
npm run dev:https                      # the servers, in one terminal
npm run build:mobile -- --install      # builds the APK and installs it on the phone
```

`build:mobile` bakes this laptop's Wi-Fi address in as the default server
(`https://<laptop-ip>:4000`). It can be changed on the app's home screen under
**Server**. The APK is at `apps/mobile/build/app/outputs/flutter-apk/app-debug.apk`
if you'd rather copy it to the phone yourself.

How it differs from the web app:

| | Web | Android app |
| --- | --- | --- |
| WebRTC | Browser API | `flutter_webrtc` (same libwebrtc underneath) |
| Voice detection | Silero neural net (WASM) | Energy-based VAD in pure Dart (`lib/speech/energy_vad.dart`) |
| Mic capture for subtitles | Cloned mic track | `record` package, "voice communication" source (shared with WebRTC, echo-cancelled) |
| Dev HTTPS certificate | Accept the warning once | Debug builds trust it, for the configured server host only |
| Extras | | Speakerphone on, screen kept awake, front/back camera switch |

The energy VAD compares each 30 ms frame's loudness (RMS) with a running
estimate of the background noise. It needs no model and almost no CPU; loud
non-speech sounds can slip through, and Whisper's no-speech filter on the
server catches most of those.

Signaling messages are processed strictly in order (a Future chain), because
`flutter_webrtc` calls cross into native code asynchronously and an ICE
candidate must never be applied before its offer.

Tests: `npm run test:mobile` (VAD, segment merging, WAV encoding, link parsing).

The app joins calls as a guest (no login screen yet). It shows the "Transcript saved"
badge when a logged-in web user in the call is saving it.

## Accounts, transcripts and summaries

- **Accounts:** email + password. Passwords are hashed with **scrypt** (Node's
  built-in, memory-hard). Logging in creates a random 256-bit **session token**;
  the database stores only its SHA-256, and logging out deletes the session, so
  tokens are revocable (unlike a plain JWT). Login and sign-up are rate-limited
  per IP. Wrong email and wrong password give the same error, so the form can't
  be used to discover who has an account.
- **Guests can still call** by link. A transcript is saved only when 2 people
  are in the call and **at least one is logged in**, and **both see a "Transcript
  saved" badge**: nobody is recorded without knowing.
- **Summary:** when the last person leaves, the transcript is translated to
  English with NLLB, summarized by Groq's free LLM (`openai/gpt-oss-20b`, with
  its own rate limiter), and the summary is translated back into each
  participant's language. The prompt tells the model to use names (or
  "they") and never guess gender. Failed summaries can be retried from the page.
- **History:** `/history` lists your calls; each call page shows the summary
  (one tab per language) and the full transcript with timestamps, original and
  translation. Calls are private: other users get a 404, the same answer as
  for a call that doesn't exist.

**Database:** Postgres with **Drizzle ORM**. Tables are defined in TypeScript
(`apps/signal/src/db/schema.ts`); `npm run db:generate -w apps/signal` writes
SQL migrations (`apps/signal/drizzle/`), which run automatically on startup.
Without `DATABASE_URL`, the server uses **PGlite**, real Postgres compiled to
WebAssembly, so the app also runs (and tests run) without Docker.

| Endpoint | |
| --- | --- |
| `POST /api/auth/signup`, `/login`, `/logout` | Accounts (token in `Authorization: Bearer`) |
| `GET /api/me` | Current user |
| `GET /api/calls` | Your calls, newest first |
| `GET /api/calls/:id` | One call: participants, transcript, summary |
| `POST /api/calls/:id/summary` | Retry the summary |

## How a call connects

1. **Join.** Each browser connects to the signal server and sends `join-room`.
   Rooms hold at most 2 people.
2. **Offer/answer.** The newcomer creates an `RTCPeerConnection` and sends an
   *offer*; the other side replies with an *answer*. The server just forwards them.
3. **ICE.** Both sides discover possible network paths (local IP, public IP via
   STUN, relay via TURN) and trickle them to each other as *ICE candidates*.
4. **Media flows peer-to-peer.** From here on the server is not involved.

### Reconnect handling

| Problem | What happens |
| ------- | ------------ |
| Signal socket drops (Wi-Fi blip) | Socket.IO reconnects and rejoins with the same `clientId`. The server kept the slot for 30 s, so the call is untouched (media is peer-to-peer). |
| Media path breaks (switched networks) | `connectionState` → `disconnected`/`failed` triggers an **ICE restart**: new network paths without ending the call. |
| Page reload | The old page tells the server it left (`pagehide`). If that message is lost, the server frees the "ghost" slot when the new page joins. |
| Both sides send an offer at once | **Perfect negotiation**: the "polite" peer backs off and accepts the other's offer. |

## How subtitles work

```
mic ─clone─▶ VAD (browser) ─▶ merge short bits ─▶ WAV ─▶ signal server ─▶ AI service ─▶ subtitle to both people
```

1. **Separate capture.** Each browser clones its own mic track. The clone feeds
   the subtitle pipeline; the original goes over WebRTC. Muting stops both.
2. **Voice activity detection.** [Silero VAD](https://github.com/ricky0123/vad)
   (a 2 MB neural net running in WebAssembly) marks each ~32 ms frame as speech or
   not. A segment ends after 0.5 s of silence, so silence is never uploaded.
3. **Merging.** Segments under 1 s wait up to 1.2 s to be joined with the next one.
   Fewer requests means less free-tier quota used.
4. **Upload.** The segment is encoded as a 16 kHz mono WAV and sent as a binary
   Socket.IO message. Only sent when someone else is in the call.
5. **Speech-to-text.** The AI service tries **Groq** (`whisper-large-v3-turbo`)
   first. If the rate limiter says no, or Groq fails, it uses **faster-whisper**
   locally. Every segment is logged with the engine, timing and reason:
   ```
   segment=f9ae194b-2 engine=groq audio=2.4s took=342ms lang=en text='...'
   segment=f9ae194b-9 engine=local (fallback: free-tier limit reached) audio=5.3s took=2157ms ...
   ```
6. **Broadcast.** The signal server sends `{ speakerId, originalText,
   translatedText, lang, timestamp, engine }` to everyone in the room. The
   speaker sees their own line too (smaller, as confirmation).

### Staying inside Groq's free tier

A **token bucket** per limit (requests/minute, requests/day, audio-seconds/hour,
audio-seconds/day) lives in [`apps/ai/app/rate_limiter.py`](apps/ai/app/rate_limiter.py).
A request is sent to Groq only if every bucket has room; otherwise it goes to
the local model. Groq bills each request as at least 10 s of audio, which the
limiter accounts for. If Groq still answers `429`, the service pauses Groq for
the `Retry-After` time. Current remaining quota: `GET http://127.0.0.1:8000/health`.

Typical latency: ~0.5 s of silence detection + 0.3 to 0.7 s on Groq, so a
subtitle appears about 1 s after you stop talking (2 to 3 s with the local model).

## How translation works

Each person picks **the language they speak** (English, Tagalog, Cebuano or
Japanese) before joining, and can change it during the call. Subtitles are
always shown in your own language.

1. The speaker's language is used as a **hint for Whisper**, which makes
   transcription more accurate than letting Whisper guess.
2. The signal server knows the listener's language and asks the AI service to
   translate into it with **NLLB-200** (Meta's "No Language Left Behind" model,
   distilled 600M version), running locally through **CTranslate2**.
3. The listener sees the translation (big) with the original underneath (small);
   the speaker sees what they said plus what the other person is reading.

Details that matter:

- **int8 quantization.** Meta's weights are converted once to 8-bit integers
  (`apps/ai/app/prepare_models.py`): 4x smaller and several times faster on a
  CPU, with nearly the same quality. A translation takes ~0.2 to 0.5 s.
- **One sentence at a time.** NLLB was trained on single sentences and silently
  drops sentences when given several at once, so text is split into sentences
  and translated as one batch.
- **Cache.** The last 512 translations are kept in memory; repeated short phrases
  ("Salamat", "Okay") cost nothing.
- **Cebuano.** Whisper has no Cebuano model. For Cebuano speakers it runs in
  Tagalog mode (closest language it knows: same spelling, many shared words)
  with a short Cebuano example as a prompt, which pulls the spelling toward
  Bisaya. NLLB itself does support Cebuano (`ceb_Latn`).
- **Fallback.** If translation fails, the listener still gets the original text.

Text-only translation endpoint, handy for testing:
```bash
curl -X POST http://127.0.0.1:8000/translate -H "Content-Type: application/json" -d "{\"text\":\"Kumusta ka?\",\"source\":\"tl\",\"target\":\"en\"}"
```

### Known limitations

- A subtitle appears when the speaker *pauses*; a long sentence without a
  pause shows up all at once at the end.
- Cebuano speech-to-text is a workaround (see above) and is the weakest link.
  A dedicated model such as Meta's MMS (which supports Cebuano) could replace it.
- Translation quality: NLLB is good with full sentences but can misread short,
  informal fragments and occasionally adds words (e.g. a polite closing in
  Japanese). Mixed Taglish works reasonably well.
- NLLB-200 is licensed **CC-BY-NC 4.0** (non-commercial), fine for a portfolio
  project; a commercial product would need a different translation model.
- Rate-limit counters are in memory, so restarting the AI service resets them
  (Groq's own `429` responses still protect you).

## Scripts

| Command | What it does |
| ------- | ------------ |
| `npm run setup:ai` | Create the Python venv and install AI packages |
| `npm run setup:models` | Download + convert the NLLB translation model (one time) |
| `npm run dev` | Signal (:4000) + web (:3000) + AI (:8000) over HTTP |
| `npm run dev:https` | Same, over HTTPS for LAN/phone testing |
| `npm run db:up` / `db:down` | Start / stop Postgres in Docker |
| `npm test` | All Node tests (signal + web) |
| `npm run test:signal` | Backend tests (auth, recording rules, privacy) on in-memory Postgres |
| `npm run test:ai` | Python unit tests (rate limiter, languages, sentence splitting) |
| `npm run build:mobile` | Build the Android debug APK (`-- --install` to install over USB) |
| `npm run test:mobile` | Flutter unit tests |
| `npm run typecheck` | TypeScript checks for web + signal |
| `npm run lint` | ESLint for the web app |
| `npm run build` | Production build of web + signal |
