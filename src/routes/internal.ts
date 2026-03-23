import { Router } from "express";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { emailQueue, deadLetterQueue } from "../queue/queues";
import { getAverageResponseTime } from "../middleware/observability";

export const internalRouter = Router();

internalRouter.use((req, res, next) => {
  const key = req.header("x-internal-api-key");
  if (key !== env.INTERNAL_API_KEY) {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Invalid internal API key" } });
  }
  return next();
});

internalRouter.get("/health", async (_req, res) => {
  const [db, redisPing, waiting, failed, avgRespMs] = await Promise.all([
    prisma.$queryRaw`SELECT 1`,
    redis.ping(),
    emailQueue.getWaitingCount(),
    deadLetterQueue.getWaitingCount(),
    getAverageResponseTime()
  ]);
  res.json({
    data: {
      api: "ok",
      db: Array.isArray(db) ? "ok" : "unknown",
      redis: redisPing === "PONG" ? "ok" : "down",
      queueDepth: { pending: waiting, failed },
      avgResponseMsLast60s: Number(avgRespMs.toFixed(2))
    }
  });
});

internalRouter.get("/metrics", async (req, res) => {
  const tenantId = req.query.tenantId as string | undefined;
  if (!tenantId) {
    return res.status(400).json({ error: { code: "TENANT_REQUIRED", message: "tenantId query is required" } });
  }

  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [totalRequests, endpointBreakdown, breaches, emailTotal, emailSent] = await Promise.all([
    prisma.requestMetric.count({ where: { tenantId, createdAt: { gte: start } } }),
    prisma.requestMetric.groupBy({
      by: ["endpoint"],
      where: { tenantId, createdAt: { gte: start } },
      _count: { _all: true }
    }),
    prisma.rateLimitBreach.count({ where: { tenantId, createdAt: { gte: start } } }),
    prisma.emailDeliveryLog.count({ where: { tenantId, createdAt: { gte: start } } }),
    prisma.emailDeliveryLog.count({ where: { tenantId, createdAt: { gte: start }, status: "SENT" } })
  ]);

  return res.json({
    data: {
      billingPeriodStart: start.toISOString(),
      totalRequests,
      requestsByEndpoint: endpointBreakdown.map((x: { endpoint: string; _count: { _all: number } }) => ({
        endpoint: x.endpoint,
        count: x._count._all
      })),
      rateLimitBreachCount: breaches,
      emailDeliverySuccessRate: emailTotal === 0 ? 0 : Number(((emailSent / emailTotal) * 100).toFixed(2))
    }
  });
});
