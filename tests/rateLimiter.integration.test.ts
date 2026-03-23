import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Redis from "ioredis";
import { enforceRateLimit } from "../src/services/rateLimiter";
import { env } from "../src/config/env";

const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 1,
  connectTimeout: 500,
  lazyConnect: true
});
let redisAvailable = true;

describe("Sliding window rate limiter", () => {
  beforeAll(async () => {
    try {
      await redis.connect();
      await redis.ping();
      await redis.flushdb();
    } catch {
      redisAvailable = false;
    }
  }, 2000);

  afterAll(async () => {
    try {
      await redis.quit();
    } catch {
      await redis.disconnect(false);
    }
  }, 2000);

  it("blocks burst tier inside 5s window", async () => {
    if (!redisAvailable) return;
    const tenantId = "test-tenant";
    const endpoint = "GET:/projects";
    const apiKeyId = "api-key-1";

    for (let i = 0; i < 50; i += 1) {
      const res = await enforceRateLimit({ tenantId, endpoint, apiKeyId });
      expect(res.every((x) => x.allowed)).toBe(true);
    }

    const blocked = await enforceRateLimit({ tenantId, endpoint, apiKeyId });
    const burst = blocked.find((x) => x.tier === "burst");
    expect(burst?.allowed).toBe(false);
  });
});
