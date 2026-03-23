import crypto from "node:crypto";
import { Router } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { requireOwner } from "../middleware/auth";
import { enqueueEmail } from "../services/emailService";
import { writeAuditLog } from "../services/auditService";

export const tenantRouter = Router();

const inviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(["OWNER", "MEMBER"]).default("MEMBER")
});

tenantRouter.post("/invite", requireOwner, async (req, res, next) => {
  try {
    if (!req.tenantId) throw new AppError(500, "AUTH_CONTEXT_MISSING", "Missing tenant context");
    const payload = inviteSchema.parse(req.body);
    const user = await prisma.user.create({
      data: {
        tenantId: req.tenantId,
        email: payload.email,
        name: payload.name,
        role: payload.role
      }
    });
    const tenant = await prisma.tenant.findUnique({ where: { id: req.tenantId } });
    if (tenant) {
      await enqueueEmail({
        tenantId: req.tenantId,
        recipient: user.email,
        templateName: "userInvited",
        templateData: { tenantName: tenant.name, inviteeName: user.name }
      });
    }
    await writeAuditLog({
      action: "USER_INVITED",
      resourceType: "user",
      resourceId: user.id,
      newData: user
    });
    res.status(201).json({ data: user });
  } catch (error) {
    next(error);
  }
});

tenantRouter.post("/api-keys/rotate", requireOwner, async (req, res, next) => {
  try {
    if (!req.authApiKeyId || !req.tenantId || !req.authUserId) {
      throw new AppError(500, "AUTH_CONTEXT_MISSING", "Missing auth context");
    }
    const current = await prisma.apiKey.findUnique({ where: { id: req.authApiKeyId } });
    if (!current) throw new AppError(404, "API_KEY_NOT_FOUND", "Current key not found");

    const secret = crypto.randomBytes(24).toString("hex");
    const hash = await bcrypt.hash(secret, 12);
    const fresh = await prisma.apiKey.create({
      data: {
        tenantId: req.tenantId,
        userId: req.authUserId,
        keyPrefix: `ak_${Date.now()}`,
        keyHash: hash,
        isActive: true
      }
    });

    const overlapValidUntil = new Date(Date.now() + 15 * 60_000);
    await prisma.apiKey.update({
      where: { id: current.id },
      data: { expiresAt: overlapValidUntil, replacedByKeyId: fresh.id }
    });

    const owner = await prisma.user.findFirst({ where: { id: req.authUserId } });
    if (owner) {
      await enqueueEmail({
        tenantId: req.tenantId,
        recipient: owner.email,
        templateName: "apiKeyRotated",
        templateData: { ownerName: owner.name }
      });
    }

    await writeAuditLog({
      action: "API_KEY_ROTATED",
      resourceType: "api_key",
      resourceId: fresh.id,
      previousData: { replacedKeyId: current.id },
      newData: { newKeyId: fresh.id }
    });

    res.status(201).json({
      data: {
        apiKey: `ak_${fresh.id}_${secret}`,
        overlapValidUntil: overlapValidUntil.toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});
