import { NextFunction, Request, Response } from "express";
import { redis } from "../lib/redis";
import { prisma } from "../lib/prisma";

export const responseTimeTracker = async (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on("finish", async () => {
    const duration = Date.now() - start;
    const now = Date.now();
    await redis.zadd("obs:resp-time", now, `${now}:${duration}`);
    await redis.zremrangebyscore("obs:resp-time", 0, now - 60_000);

    if (req.tenantId) {
      await prisma.requestMetric.create({
        data: {
          tenantId: req.tenantId,
          endpoint: `${req.method}:${req.route?.path ?? req.path}`,
          statusCode: res.statusCode
        }
      });
    }
  });
  next();
};

export const getAverageResponseTime = async () => {
  const members = await redis.zrange("obs:resp-time", 0, -1);
  if (members.length === 0) return 0;
  const durations = members.map((v) => Number(v.split(":")[1] ?? "0"));
  return durations.reduce((a, b) => a + b, 0) / durations.length;
};
