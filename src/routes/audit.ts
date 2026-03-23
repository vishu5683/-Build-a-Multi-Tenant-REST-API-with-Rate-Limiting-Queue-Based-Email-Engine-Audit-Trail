import { Router } from "express";
import { prisma } from "../lib/prisma";
import { verifyAuditChain } from "../services/auditService";
import { AppError } from "../lib/errors";

export const auditRouter = Router();

auditRouter.get("/verify", async (req, res, next) => {
  try {
    if (!req.tenantId) throw new AppError(500, "AUTH_CONTEXT_MISSING", "Missing tenant context");
    const result = await verifyAuditChain(req.tenantId);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

auditRouter.get("/", async (req, res, next) => {
  try {
    if (!req.tenantId) throw new AppError(500, "AUTH_CONTEXT_MISSING", "Missing tenant context");
    const { userId, action, resourceType, startDate, endDate, cursor, limit = "20" } = req.query;
    const take = Math.min(Number(limit), 100);
    const rows = await prisma.auditLog.findMany({
      where: {
        tenantId: req.tenantId,
        actorUserId: typeof userId === "string" ? userId : undefined,
        action: typeof action === "string" ? action : undefined,
        resourceType: typeof resourceType === "string" ? resourceType : undefined,
        timestamp: {
          gte: typeof startDate === "string" ? new Date(startDate) : undefined,
          lte: typeof endDate === "string" ? new Date(endDate) : undefined
        }
      },
      orderBy: { timestamp: "desc" },
      take: take + 1,
      ...(typeof cursor === "string" ? { cursor: { id: cursor }, skip: 1 } : {})
    });
    const hasNext = rows.length > take;
    const data = hasNext ? rows.slice(0, take) : rows;
    res.json({ data, nextCursor: hasNext ? data[data.length - 1]?.id : null });
  } catch (error) {
    next(error);
  }
});
