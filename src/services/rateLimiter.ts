import { redis } from "../lib/redis";

type Tier = "global" | "endpoint" | "burst";
type LimitResult = {
  allowed: boolean;
  tier: Tier;
  limit: number;
  count: number;
  resetSeconds: number;
};

const WINDOWS_MS = {
  global: 60_000,
  endpoint: 60_000,
  burst: 5_000
} as const;

const LIMITS = {
  global: 1000,
  endpoint: 100,
  burst: 50
} as const;

const keyFor = (tier: Tier, tenantId: string, endpoint: string, apiKeyId: string) => {
  if (tier === "global") return `rl:${tenantId}:global`;
  if (tier === "endpoint") return `rl:${tenantId}:ep:${endpoint}`;
  return `rl:${tenantId}:burst:${endpoint}:${apiKeyId}`;
};

const checkSlidingWindow = async (key: string, limit: number, windowMs: number, nowMs: number) => {
  const min = nowMs - windowMs;
  const tx = redis.multi();
  tx.zremrangebyscore(key, 0, min);
  tx.zadd(key, nowMs, `${nowMs}-${Math.random()}`);
  tx.zcard(key);
  tx.zrange(key, 0, 0, "WITHSCORES");
  tx.expire(key, Math.ceil(windowMs / 1000));
  const execResult = await tx.exec();
  if (!execResult) {
    return { allowed: false, count: limit + 1, resetSeconds: Math.ceil(windowMs / 1000) };
  }
  const [, , cardResult, oldestResult] = execResult;
  const currentCount = Number(cardResult?.[1] ?? 0);
  const oldest = oldestResult?.[1] as string[] | undefined;
  const oldestScore = oldest && oldest.length >= 2 ? Number(oldest[1]) : nowMs;
  const resetSeconds = Math.max(1, Math.ceil((oldestScore + windowMs - nowMs) / 1000));
  return {
    allowed: currentCount <= limit,
    count: currentCount,
    resetSeconds
  };
};

export const enforceRateLimit = async (params: {
  tenantId: string;
  endpoint: string;
  apiKeyId: string;
}) => {
  const now = Date.now();
  const checks: Array<{ tier: Tier; key: string; limit: number; windowMs: number }> = [
    { tier: "global", key: keyFor("global", params.tenantId, params.endpoint, params.apiKeyId), limit: LIMITS.global, windowMs: WINDOWS_MS.global },
    { tier: "endpoint", key: keyFor("endpoint", params.tenantId, params.endpoint, params.apiKeyId), limit: LIMITS.endpoint, windowMs: WINDOWS_MS.endpoint },
    { tier: "burst", key: keyFor("burst", params.tenantId, params.endpoint, params.apiKeyId), limit: LIMITS.burst, windowMs: WINDOWS_MS.burst }
  ];

  const results: LimitResult[] = [];
  for (const c of checks) {
    const state = await checkSlidingWindow(c.key, c.limit, c.windowMs, now);
    results.push({ ...state, tier: c.tier, limit: c.limit });
    if (!state.allowed) break;
  }
  return results;
};

export const globalUsageCount = async (tenantId: string) => {
  const min = Date.now() - WINDOWS_MS.global;
  const key = `rl:${tenantId}:global`;
  await redis.zremrangebyscore(key, 0, min);
  return redis.zcard(key);
};
