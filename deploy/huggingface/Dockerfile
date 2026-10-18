# Usap backend for a Hugging Face Docker Space (free CPU: 2 vCPU, 16 GB RAM).
# One container runs both servers:
#   - signal server (Node, Socket.IO + REST) on the public port 7860
#   - AI service (Python, Whisper + NLLB) on 127.0.0.1:8000, private
# Secrets (GROQ_API_KEY, DATABASE_URL, ...) are set in the Space's settings,
# never baked into the image.
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
 && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

# Spaces run as user 1000.
RUN useradd -m -u 1000 user
WORKDIR /app
COPY --chown=user . .
USER user
ENV PATH="/home/user/.local/bin:$PATH" \
    HF_HOME=/home/user/.cache/huggingface

# AI service + one-time NLLB conversion (torch/transformers only for the
# conversion, then removed). Whisper weights download on first use.
RUN pip install --no-cache-dir --user -r apps/ai/requirements.txt \
 && pip install --no-cache-dir --user -r apps/ai/requirements-convert.txt \
 && cd apps/ai && python -m app.prepare_models \
 && pip uninstall -y torch transformers && rm -rf /home/user/.cache/huggingface

# Signal server.
RUN npm ci --workspace apps/signal --include-workspace-root=false \
 && npm run build -w apps/signal

ENV SIGNAL_PORT=7860 AI_PORT=8000 TRUST_PROXY=true NODE_ENV=production
EXPOSE 7860
CMD ["sh", "-c", "cd apps/ai && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 & cd apps/signal && exec node dist/index.js"]
