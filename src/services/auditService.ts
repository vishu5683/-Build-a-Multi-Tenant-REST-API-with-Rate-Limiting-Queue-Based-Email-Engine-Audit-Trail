import crypto from "node:crypto";
import { prisma } from "../lib/prisma";
import { requestContext } from "../lib/context";
import { AppError } from "../lib/errors";

const hashEntry = (payload: object, previousHash: string | null) =>
  crypto.createHash("sha256").update(JSON.stringify(payload) + (previousHash ?? "")).digest("hex");

export const writeAuditLog = async (input: {
  action: string;
  resourceType: string;
  resourceId: string;
  previousData?: unknown;
  newData?: unknown;
}) => {
  const ctx = requestContext.get();
  if (!ctx) throw new AppError(500, "AUDIT_CONTEXT_MISSING", "Request context missing for audit");

  const previous = await prisma.auditLog.findFirst({
    where: { tenantId: ctx.tenantId },
    orderBy: { timestamp: "desc" }
  });

  const payload = {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    apiKeyId: ctx.apiKeyId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    previousData: input.previousData ?? null,
    newData: input.newData ?? null,
    ipAddress: ctx.ipAddress ?? null,
    timestamp: new Date().toISOString()
  };

  const chainHash = hashEntry(payload, previous?.chainHash ?? null);

  return prisma.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      apiKeyId: ctx.apiKeyId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      previousData: input.previousData as never,
      newData: input.newData as never,
      ipAddress: ctx.ipAddress,
      previousHash: previous?.chainHash ?? null,
      chainHash
    }
  });
};

export const verifyAuditChain = async (tenantId: string) => {
  const logs = await prisma.auditLog.findMany({
    where: { tenantId },
    orderBy: { timestamp: "asc" }
  });

  let prevHash: string | null = null;
  for (const entry of logs) {
    const payload = {
      tenantId: entry.tenantId,
      actorUserId: entry.actorUserId,
      apiKeyId: entry.apiKeyId,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      previousData: entry.previousData,
      newData: entry.newData,
      ipAddress: entry.ipAddress,
      timestamp: entry.timestamp.toISOString()
    };
    const recomputed = hashEntry(payload, prevHash);
    if (entry.previousHash !== prevHash || entry.chainHash !== recomputed) {
      return { intact: false, brokenEntryId: entry.id };
    }
    prevHash = entry.chainHash;
  }
  return { intact: true, brokenEntryId: null as string | null };
};
