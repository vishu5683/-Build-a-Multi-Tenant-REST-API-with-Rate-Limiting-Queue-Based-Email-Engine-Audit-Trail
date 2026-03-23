import { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { enqueueEmail } from "../services/emailService";
import { enforceRateLimit, globalUsageCount } from "../services/rateLimiter";
import { redis } from "../lib/redis";

export const rateLimitMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.tenantId || !req.authApiKeyId) throw new AppError(500, "AUTH_CONTEXT_MISSING", "Missing auth context");

    const endpoint = `${req.method}:${req.route?.path ?? req.path}`;
    const results = await enforceRateLimit({
      tenantId: req.tenantId,
      endpoint,
      apiKeyId: req.authApiKeyId
    });

    const global = results.find((r) => r.tier === "global");
    if (global) {
      res.setHeader("X-RateLimit-Limit", global.limit.toString());
      res.setHeader("X-RateLimit-Remaining", Math.max(0, global.limit - global.count).toString());
      res.setHeader("X-RateLimit-Reset", global.resetSeconds.toString());

      if (global.count >= Math.floor(global.limit * 0.8)) {
        const lock = `rl-warning:${req.tenantId}`;
        const wasSet = await redis.set(lock, "1", "EX", 3600, "NX");
        if (wasSet) {
          const owner = await prisma.user.findFirst({ where: { role: "OWNER" } });
          const tenant = await prisma.tenant.findUnique({ where: { id: req.tenantId } });
          if (owner && tenant) {
            await enqueueEmail({
              tenantId: req.tenantId,
              recipient: owner.email,
              templateName: "rateLimitThresholdWarning",
              templateData: { tenantName: tenant.name, usage: global.count, limit: global.limit }
            });
          }
        }
      }
    }

    const blocked = results.find((r) => !r.allowed);
    if (blocked) {
      await prisma.rateLimitBreach.create({ data: { tenantId: req.tenantId, tier: blocked.tier } });
      throw new AppError(429, "RATE_LIMIT_EXCEEDED", "Rate limit exceeded", {
        tier: blocked.tier,
        limit: blocked.limit,
        currentCount: blocked.count,
        resetSeconds: blocked.resetSeconds
      });
    }

    return next();
  } catch (error) {
    return next(error);
  }
};
