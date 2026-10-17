import type { RequestHandler } from "express";

interface Bucket {
  tokens: number;
  updatedAt: number;
}

/**
 * Per-IP token bucket (same idea as the Groq limiter in the AI service).
 * Slows down password guessing: by default 10 attempts, refilling 10 per minute.
 * In memory: fine for one server; several servers would share it via Redis.
 */
export function rateLimitByIp(capacity = 10, perMinute = 10): RequestHandler {
  const buckets = new Map<string, Bucket>();
  const refillPerMs = perMinute / 60_000;

  // Forget idle IPs so the map can't grow forever.
  setInterval(() => {
    const cutoff = Date.now() - 10 * 60_000;
    for (const [ip, b] of buckets) if (b.updatedAt < cutoff) buckets.delete(ip);
  }, 60_000).unref();

  return (req, res, next) => {
    const ip = req.ip ?? "unknown";
    const now = Date.now();
    const b = buckets.get(ip) ?? { tokens: capacity, updatedAt: now };
    b.tokens = Math.min(capacity, b.tokens + (now - b.updatedAt) * refillPerMs);
    b.updatedAt = now;
    buckets.set(ip, b);
    if (b.tokens < 1) {
      res.setHeader("Retry-After", Math.ceil((1 - b.tokens) / refillPerMs / 1000));
      res.status(429).json({ error: "Too many attempts. Wait a minute and try again." });
      return;
    }
    b.tokens -= 1;
    next();
  };
}
