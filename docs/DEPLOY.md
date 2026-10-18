# Deploying Usap for free (no credit card)

| Part | Where | Notes |
| ---- | ----- | ----- |
| Web app (`apps/web`) | **Vercel** Hobby | Next.js hosting, HTTPS included |
| Signal server + AI service | **Hugging Face Spaces** (Docker, free CPU: 2 vCPU / 16 GB RAM) | One container runs both. 16 GB is enough for Whisper and NLLB. |
| Database | **Neon** Postgres free plan | The container's disk is wiped on restart, so data lives here |
| TURN relay | **Metered** free plan | Lets calls connect through strict networks |

```
Browser ──HTTPS──▶ Vercel (Next.js)
   └──WSS──▶ <user>-<space>.hf.space :7860 signal ──▶ 127.0.0.1:8000 AI (private)
                                            └──▶ Neon Postgres
```

None of these services ask for a card.

## 1. Database (Neon)

1. Sign up at neon.tech and create a project.
2. Copy the **connection string** (`postgresql://...?sslmode=require`).
   The signal server creates its tables itself on first start.

## 2. Backend (Hugging Face Space)

1. Sign up at huggingface.co. Go to **New Space**, pick the **Docker** SDK and
   the **Blank** template, then set:
   - Hardware: **CPU basic (free)**
   - Visibility: **Public**. A private Space can't be reached by browsers
     without a Hugging Face token.
2. Open the Space's **Settings → Variables and secrets** and add these
   **secrets**:
   - `DATABASE_URL`: the Neon connection string
   - `GROQ_API_KEY`
   - `AI_SERVICE_TOKEN`: any long random string
   - `METERED_APP_NAME` and `METERED_API_KEY`, or `TURN_URLS`, `TURN_USERNAME` and `TURN_CREDENTIAL`
   - `CORS_ORIGINS`: your Vercel URL. Add it after step 3; leave it empty until then.
   - Optional: `GROQ_LLM_MODEL` and `GROQ_STT_MODEL`, if you changed them from the defaults.
3. Create an access token at huggingface.co → **Settings → Access Tokens** with
   **Write** permission. Then deploy from this repo:
   ```bash
   npm run deploy:api -- <hf-username>/<space-name>
   ```
   When git asks for a password, paste the token. The script uploads only what
   the container needs; it never sends `.env`. The first build takes about
   10–15 minutes, because it converts the translation model.
4. Check that it works by opening `https://<hf-username>-<space-name>.hf.space/health`.

A free Space sleeps after 48 hours without visitors. The first visit after
that wakes it in about a minute.

## 3. Website (Vercel)

```bash
cd apps/web
npx vercel login
npx vercel link            # create a new project; keep the defaults
npx vercel env add NEXT_PUBLIC_SIGNAL_URL production   # paste https://<user>-<space>.hf.space
npx vercel --prod
```

On Windows PowerShell, use `npx.cmd` instead of `npx`.

Then put the Vercel URL (for example `https://usap.vercel.app`) into the
Space's `CORS_ORIGINS` secret. The Space restarts on its own.

## 4. Android app

```bash
cd apps/mobile && flutter build apk --release --dart-define=SIGNAL_URL=https://<user>-<space>.hf.space
```

The app is saved at `build/app/outputs/flutter-apk/app-release.apk`.

## Before going public

- [ ] Rotate the Metered TURN credentials that were used during development.
- [ ] Make sure `.env` was never committed: `git log --all -- .env` should print nothing.
- [ ] Set `CORS_ORIGINS` to the Vercel URL only.

## Updating

Run `npm run deploy:api -- <user>/<space>` again for the backend, and
`npx vercel --prod` in `apps/web` for the website.

## Cost

$0. The Groq free tier has rate limits, and the AI service stays under them on
its own; when a limit is reached, speech-to-text falls back to the local
Whisper model inside the container.
