# Deploying Usap for free

Three parts go online:

| Part | Where | Why there |
| ---- | ----- | --------- |
| Web app (`apps/web`) | **Vercel** (Hobby, free) | Built for Next.js, global CDN, HTTPS included |
| Signal server (`apps/signal`) + AI service (`apps/ai`) + Postgres | **Oracle Cloud Always Free** VM (Ampere A1, up to 4 CPU / 24 GB RAM) | Socket.IO needs a long-running server, and NLLB + faster-whisper need several GB of RAM. Free hosts that sleep or cap RAM can't run them. |
| TURN relay | **Metered** free plan | Lets calls connect through strict networks (mobile data, offices) |

```
Browser ──HTTPS──▶ Vercel (Next.js)
   │
   └──WSS──▶ api.your-domain ── Caddy (auto HTTPS) ──▶ signal :4000 ──▶ ai :8000 (localhost only)
                                                         └──▶ Postgres :5432 (localhost only)
```

Only Caddy (ports 80 and 443) is public. The AI service and Postgres listen on
localhost only.

## 1. Oracle VM (signal + AI + database)

1. Create an Always Free account at cloud.oracle.com. Then create an instance:
   **Ubuntu 24.04**, shape **VM.Standard.A1.Flex** with 4 OCPU and 24 GB RAM.
   Download its SSH key.
2. In the instance's **VCN → Security List**, add ingress rules for TCP **80**
   and **443** from `0.0.0.0/0`. Ubuntu on Oracle also blocks these ports in
   iptables, so open them on the VM too:
   ```bash
   sudo iptables -I INPUT 6 -p tcp -m multiport --dports 80,443 -j ACCEPT && sudo netfilter-persistent save
   ```
3. Point a domain at the VM's public IP, for example `api.example.com` with an
   A record. Free alternative: `<ip>.sslip.io` works without owning a domain.
4. Install the tools:
   ```bash
   sudo apt update && sudo apt install -y git python3-venv python3-pip docker.io caddy
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
   sudo usermod -aG docker $USER && newgrp docker
   ```
5. Get the code and configure it:
   ```bash
   git clone <your repo> usap && cd usap
   cp .env.example .env && nano .env
   ```
   Set at least these values:
   - `CORS_ORIGINS=https://<your-app>.vercel.app`
   - `TRUST_PROXY=true`
   - `AI_SERVICE_TOKEN=<long random string>`, for example from `openssl rand -hex 32`
   - `GROQ_API_KEY`
   - `METERED_APP_NAME` and `METERED_API_KEY`
   - `POSTGRES_PASSWORD=<strong password>`, plus a matching `DATABASE_URL`
6. Build and start everything:
   ```bash
   npm ci && npm run setup:ai && npm run setup:models   # Python venv + NLLB model (~600 MB)
   npm run db:up                                         # Postgres in Docker
   npm run build -w apps/signal
   ```
7. Keep the services running with systemd. Create
   `/etc/systemd/system/usap-signal.service`:
   ```ini
   [Unit]
   After=network.target docker.service
   [Service]
   WorkingDirectory=/home/ubuntu/usap/apps/signal
   EnvironmentFile=/home/ubuntu/usap/.env
   ExecStart=/usr/bin/node dist/index.js
   Restart=always
   User=ubuntu
   [Install]
   WantedBy=multi-user.target
   ```
   Then create `usap-ai.service` the same way, with
   `WorkingDirectory=/home/ubuntu/usap` and
   `ExecStart=/usr/bin/node scripts/run-ai.mjs`. Enable both:
   ```bash
   sudo systemctl daemon-reload && sudo systemctl enable --now usap-signal usap-ai
   ```
8. Set up HTTPS. Put this in `/etc/caddy/Caddyfile` (Caddy gets the certificate
   itself):
   ```
   api.example.com {
     reverse_proxy 127.0.0.1:4000
   }
   ```
   Then run `sudo systemctl reload caddy`. Check that it works:
   `curl https://api.example.com/health`.

## 2. Vercel (web app)

1. Push the repo to GitHub, then go to vercel.com → **Add New Project** →
   import it.
2. Set **Root Directory** to `apps/web`. Vercel detects Next.js and fills in the
   build settings.
3. Add the environment variable `NEXT_PUBLIC_SIGNAL_URL=https://api.example.com`.
4. Deploy. Then put the Vercel URL into `CORS_ORIGINS` on the VM and run
   `sudo systemctl restart usap-signal`.

## 3. Android app

Build it against the public server:
```bash
cd apps/mobile && flutter build apk --release --dart-define=SIGNAL_URL=https://api.example.com
```
The APK is at `build/app/outputs/flutter-apk/app-release.apk`. Share it
directly, or attach it to a GitHub release.

## 4. Before going public

- [ ] Rotate the Metered TURN credentials that were used during development.
- [ ] Use a strong, unique `POSTGRES_PASSWORD` and a long random `AI_SERVICE_TOKEN`.
- [ ] Make sure `.env` was never committed: `git log --all -- .env` should print nothing.
- [ ] Set `CORS_ORIGINS` to the Vercel URL only.
- [ ] Update with `git pull && npm ci && npm run build -w apps/signal && sudo systemctl restart usap-signal usap-ai`.

## Cost

$0. Oracle Always Free, Vercel Hobby, Groq free tier and the Metered free plan
are all free. Groq has rate limits, and the AI service stays under them on its
own; when a limit is reached, speech-to-text falls back to the local
faster-whisper model on the VM.
