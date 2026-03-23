import { AsyncLocalStorage } from "node:async_hooks";

export type RequestContext = {
  tenantId: string;
  userId: string;
  role: "OWNER" | "MEMBER";
  apiKeyId: string;
  ipAddress?: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

export const requestContext = {
  run<T>(ctx: RequestContext, fn: () => T) {
    return storage.run(ctx, fn);
  },
  get() {
    return storage.getStore();
  }
};
