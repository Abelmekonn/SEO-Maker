import IORedis from "ioredis";

/**
 * Fixed-window rate limits in Redis, for endpoints that make outbound
 * requests on a user's behalf (Quick Search). Counted per user, so one
 * account cannot turn the server into a free fetch proxy.
 *
 * Fails open: with Redis down, the request is allowed and logged. Quick
 * Search is also bounded by its own timeouts and byte cap.
 */

let connection: IORedis | null = null;

function redis() {
  if (!connection) {
    connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6380", {
      maxRetriesPerRequest: 1,
      lazyConnect: false,
    });
    connection.on("error", () => undefined);
  }
  return connection;
}

export type Limit = { key: string; max: number; windowSeconds: number };

export type RateResult = { ok: true } | { ok: false; retryAfterSeconds: number };

export async function checkRateLimits(limits: Limit[]): Promise<RateResult> {
  try {
    for (const limit of limits) {
      const bucket = Math.floor(Date.now() / 1000 / limit.windowSeconds);
      const key = `seo-maker:rate:${limit.key}:${bucket}`;
      const count = await redis().incr(key);
      if (count === 1) await redis().expire(key, limit.windowSeconds);
      if (count > limit.max) {
        const elapsed = Math.floor(Date.now() / 1000) % limit.windowSeconds;
        return { ok: false, retryAfterSeconds: Math.max(1, limit.windowSeconds - elapsed) };
      }
    }
    return { ok: true };
  } catch (error) {
    console.warn("Rate limit check failed; allowing the request:", error);
    return { ok: true };
  }
}
