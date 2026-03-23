import { NextFunction, Request, Response } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { requestContext } from "../lib/context";

declare module "express-serve-static-core" {
  interface Request {
    tenantId?: string;
    authUserId?: string;
    authRole?: "OWNER" | "MEMBER";
    authApiKeyId?: string;
  }
}

export const tenantAuth = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const raw = req.header("x-api-key");
    if (!raw) throw new AppError(401, "AUTH_REQUIRED", "Missing x-api-key header");

    const [prefix, id, secret] = raw.split("_");
    if (prefix !== "ak" || !id || !secret) throw new AppError(401, "INVALID_API_KEY", "Invalid API key format");

    const apiKey = await prisma.apiKey.findUnique({
      where: { id },
      include: { user: true }
    });
    if (!apiKey || !apiKey.isActive) throw new AppError(401, "INVALID_API_KEY", "Invalid API key");
    if (apiKey.expiresAt && apiKey.expiresAt.getTime() < Date.now()) {
      throw new AppError(401, "EXPIRED_API_KEY", "API key expired");
    }
    const ok = await bcrypt.compare(secret, apiKey.keyHash);
    if (!ok) throw new AppError(401, "INVALID_API_KEY", "Invalid API key");

    req.tenantId = apiKey.tenantId;
    req.authUserId = apiKey.userId;
    req.authRole = apiKey.user.role;
    req.authApiKeyId = apiKey.id;

    requestContext.run(
      {
        tenantId: apiKey.tenantId,
        userId: apiKey.userId,
        role: apiKey.user.role,
        apiKeyId: apiKey.id,
        ipAddress: req.ip
      },
      () => next()
    );
  } catch (error) {
    next(error);
  }
};

export const requireOwner = (req: Request, _res: Response, next: NextFunction) => {
  if (req.authRole !== "OWNER") return next(new AppError(403, "FORBIDDEN", "Owner role required"));
  return next();
};
