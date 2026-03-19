/**
 * Simple in-memory rate limiter for sensitive command endpoints.
 * Limits requests per identifier (user/session) within a sliding window.
 */

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 30; // per minute per user

const store = new Map<string, number[]>();

function prune(old: number[], now: number): number[] {
  return old.filter((t) => now - t < WINDOW_MS);
}

export function rateLimit(
  identifier: string,
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  let timestamps = store.get(identifier) ?? [];
  timestamps = prune(timestamps, now);

  if (timestamps.length >= MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }

  timestamps.push(now);
  store.set(identifier, timestamps);
  return { allowed: true, remaining: MAX_REQUESTS - timestamps.length };
}

export function rateLimitMiddleware(req: any, res: any, next: any) {
  const session = (req as any).serverSession;
  const identifier = session?.userId ?? req.ip ?? "anonymous";
  const { allowed, remaining } = rateLimit(identifier);
  res.setHeader("X-RateLimit-Remaining", String(remaining));
  if (!allowed) {
    return res.status(429).json({
      success: false,
      error: "Too many requests. Please wait before sending more commands.",
    });
  }
  next();
}

const LOGIN_WINDOW_MS = 60_000;
const LOGIN_MAX_ATTEMPTS = 5;
const loginStore = new Map<string, number[]>();

export function rateLimitLogin(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  let timestamps = loginStore.get(ip) ?? [];
  timestamps = timestamps.filter((t) => now - t < LOGIN_WINDOW_MS);

  if (timestamps.length >= LOGIN_MAX_ATTEMPTS) {
    return { allowed: false, remaining: 0 };
  }

  timestamps.push(now);
  loginStore.set(ip, timestamps);
  return { allowed: true, remaining: LOGIN_MAX_ATTEMPTS - timestamps.length };
}

export function rateLimitLoginMiddleware(req: any, res: any, next: any) {
  const ip = req.ip ?? req.socket?.remoteAddress ?? "unknown";
  const { allowed, remaining } = rateLimitLogin(ip);
  res.setHeader("X-RateLimit-Remaining", String(remaining));
  if (!allowed) {
    return res.status(429).json({
      success: false,
      error: "Too many login attempts. Please try again in a minute.",
    });
  }
  next();
}
