import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { writeAuditLog } from "../services/auditService";

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional()
});

export const projectRouter = Router();

projectRouter.get("/", async (_req, res) => {
  const projects = await prisma.project.findMany({ orderBy: { createdAt: "desc" } });
  res.json({ data: projects });
});

projectRouter.post("/", async (req, res, next) => {
  try {
    if (!req.tenantId || !req.authUserId) throw new AppError(500, "AUTH_CONTEXT_MISSING", "Missing auth context");
    const input = createSchema.parse(req.body);
    const created = await prisma.project.create({
      data: {
        tenantId: req.tenantId,
        createdById: req.authUserId,
        name: input.name,
        description: input.description
      }
    });
    await writeAuditLog({
      action: "PROJECT_CREATED",
      resourceType: "project",
      resourceId: created.id,
      newData: created
    });
    res.status(201).json({ data: created });
  } catch (error) {
    next(error);
  }
});
