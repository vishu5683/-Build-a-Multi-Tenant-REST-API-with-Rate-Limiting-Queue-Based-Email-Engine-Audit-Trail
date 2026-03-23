import { PrismaClient } from "@prisma/client";
import { requestContext } from "./context";
import { AppError } from "./errors";

const tenantScopedModels = new Set([
  "Project",
  "AuditLog",
  "EmailDeliveryLog",
  "RequestMetric",
  "RateLimitBreach",
  "User",
  "ApiKey"
]);

const withTenantWhere = (existing: any, tenantId: string) => ({
  ...(existing ?? {}),
  tenantId
});

const enforceTenantData = (data: any, tenantId: string) => {
  if (!data) return { tenantId };
  if (data.tenantId && data.tenantId !== tenantId) {
    throw new AppError(403, "TENANT_SCOPE_VIOLATION", "Cross-tenant write blocked");
  }
  return { ...data, tenantId };
};

const prismaBase = new PrismaClient();

export const prisma = prismaBase.$extends({
  query: {
    $allModels: {
      async findMany({ model, args, query }: { model: string; args: any; query: (args: any) => Promise<any> }) {
        const ctx = requestContext.get();
        if (ctx && tenantScopedModels.has(model)) {
          args.where = withTenantWhere(args.where, ctx.tenantId);
        }
        return query(args);
      },
      async findFirst({ model, args, query }: { model: string; args: any; query: (args: any) => Promise<any> }) {
        const ctx = requestContext.get();
        if (ctx && tenantScopedModels.has(model)) {
          args.where = withTenantWhere(args.where, ctx.tenantId);
        }
        return query(args);
      },
      async findUnique({ model, args, query }: { model: string; args: any; query: (args: any) => Promise<any> }) {
        const ctx = requestContext.get();
        if (ctx && tenantScopedModels.has(model)) {
          throw new AppError(
            500,
            "UNSAFE_QUERY_BLOCKED",
            `findUnique is blocked for tenant-scoped model ${model}; use findFirst/findMany`
          );
        }
        return query(args);
      },
      async create({ model, args, query }: { model: string; args: any; query: (args: any) => Promise<any> }) {
        const ctx = requestContext.get();
        if (ctx && tenantScopedModels.has(model)) {
          args.data = enforceTenantData(args.data, ctx.tenantId);
        }
        return query(args);
      },
      async createMany({ model, args, query }: { model: string; args: any; query: (args: any) => Promise<any> }) {
        const ctx = requestContext.get();
        if (ctx && tenantScopedModels.has(model)) {
          if (Array.isArray(args.data)) {
            args.data = args.data.map((d: any) => enforceTenantData(d, ctx.tenantId));
          } else {
            args.data = enforceTenantData(args.data, ctx.tenantId);
          }
        }
        return query(args);
      },
      async update({ model, args, query }: { model: string; args: any; query: (args: any) => Promise<any> }) {
        const ctx = requestContext.get();
        if (ctx && tenantScopedModels.has(model)) {
          throw new AppError(
            500,
            "UNSAFE_QUERY_BLOCKED",
            `update is blocked for tenant-scoped model ${model}; use updateMany with tenant scope`
          );
        }
        return query(args);
      },
      async updateMany({ model, args, query }: { model: string; args: any; query: (args: any) => Promise<any> }) {
        const ctx = requestContext.get();
        if (ctx && tenantScopedModels.has(model)) {
          args.where = withTenantWhere(args.where, ctx.tenantId);
          if (args.data) args.data = enforceTenantData(args.data, ctx.tenantId);
        }
        return query(args);
      },
      async delete({ model, args, query }: { model: string; args: any; query: (args: any) => Promise<any> }) {
        const ctx = requestContext.get();
        if (ctx && tenantScopedModels.has(model)) {
          throw new AppError(
            500,
            "UNSAFE_QUERY_BLOCKED",
            `delete is blocked for tenant-scoped model ${model}; use deleteMany with tenant scope`
          );
        }
        return query(args);
      },
      async deleteMany({ model, args, query }: { model: string; args: any; query: (args: any) => Promise<any> }) {
        const ctx = requestContext.get();
        if (ctx && tenantScopedModels.has(model)) {
          args.where = withTenantWhere(args.where, ctx.tenantId);
        }
        return query(args);
      },
      async upsert({ model, args, query }: { model: string; args: any; query: (args: any) => Promise<any> }) {
        const ctx = requestContext.get();
        if (ctx && tenantScopedModels.has(model)) {
          throw new AppError(
            500,
            "UNSAFE_QUERY_BLOCKED",
            `upsert is blocked for tenant-scoped model ${model}; use scoped create/updateMany flow`
          );
        }
        return query(args);
      }
    }
  }
});
