import { describe, expect, it, vi } from "vitest";
import { verifyAuditChain } from "../src/services/auditService";

vi.mock("../src/lib/prisma", () => ({
  prisma: {
    auditLog: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "1",
          tenantId: "t1",
          actorUserId: "u1",
          apiKeyId: "k1",
          action: "A",
          resourceType: "project",
          resourceId: "p1",
          previousData: null,
          newData: { ok: 1 },
          ipAddress: "127.0.0.1",
          timestamp: new Date("2026-01-01T00:00:00.000Z"),
          previousHash: null,
          chainHash: "63dbd94fba7de3300e4008d32afdd0e64c47bd3573871f7624058bc3635474e1"
        },
        {
          id: "2",
          tenantId: "t1",
          actorUserId: "u1",
          apiKeyId: "k1",
          action: "B",
          resourceType: "project",
          resourceId: "p2",
          previousData: null,
          newData: { ok: 2 },
          ipAddress: "127.0.0.1",
          timestamp: new Date("2026-01-01T00:01:00.000Z"),
          previousHash: "63dbd94fba7de3300e4008d32afdd0e64c47bd3573871f7624058bc3635474e1",
          chainHash: "BROKEN"
        }
      ])
    }
  }
}));

describe("Audit chain verification", () => {
  it("returns broken entry id for tampered chain", async () => {
    const result = await verifyAuditChain("t1");
    expect(result.intact).toBe(false);
    expect(result.brokenEntryId).toBe("1");
  });
});
