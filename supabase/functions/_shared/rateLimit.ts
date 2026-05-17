interface RateLimitOptions {
  windowMs: number;
  max: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const RATE_BUCKETS = new Map<string, Bucket>();

const nowMs = () => Date.now();

const cleanup = (currentTs: number) => {
  for (const [key, value] of RATE_BUCKETS.entries()) {
    if (value.resetAt <= currentTs) {
      RATE_BUCKETS.delete(key);
    }
  }
};

export const getClientIp = (req: Request) => {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    return xff.split(",")[0]?.trim() || "unknown";
  }

  return req.headers.get("x-real-ip") ?? req.headers.get("cf-connecting-ip") ?? "unknown";
};

export const checkRateLimit = (key: string, options: RateLimitOptions) => {
  const ts = nowMs();
  cleanup(ts);

  const existing = RATE_BUCKETS.get(key);
  if (!existing || existing.resetAt <= ts) {
    RATE_BUCKETS.set(key, {
      count: 1,
      resetAt: ts + options.windowMs
    });

    return { allowed: true, retryAfterSec: 0 };
  }

  if (existing.count >= options.max) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - ts) / 1000))
    };
  }

  existing.count += 1;
  RATE_BUCKETS.set(key, existing);

  return { allowed: true, retryAfterSec: 0 };
};
