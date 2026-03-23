import crypto from "node:crypto";
import bcrypt from "bcrypt";
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

const createApiKey = async (tenantId: string, userId: string) => {
  const secret = crypto.randomBytes(24).toString("hex");
  const hash = await bcrypt.hash(secret, 12);
  const key = await prisma.apiKey.create({
    data: {
      tenantId,
      userId,
      keyPrefix: `seed_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      keyHash: hash
    }
  });
  return { raw: `ak_${key.id}_${secret}`, key };
};

const main = async () => {
  await prisma.rateLimitBreach.deleteMany();
  await prisma.requestMetric.deleteMany();
  await prisma.emailDeliveryLog.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.project.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();

  for (const tenantName of ["Tenant Alpha", "Tenant Beta"]) {
    const tenant = await prisma.tenant.create({ data: { name: tenantName } });
    const users = await Promise.all([
      prisma.user.create({ data: { tenantId: tenant.id, email: `owner@${tenantName.replace(" ", "").toLowerCase()}.com`, name: `${tenantName} Owner`, role: Role.OWNER } }),
      prisma.user.create({ data: { tenantId: tenant.id, email: `member1@${tenantName.replace(" ", "").toLowerCase()}.com`, name: `${tenantName} Member 1`, role: Role.MEMBER } }),
      prisma.user.create({ data: { tenantId: tenant.id, email: `member2@${tenantName.replace(" ", "").toLowerCase()}.com`, name: `${tenantName} Member 2`, role: Role.MEMBER } })
    ]);

    // eslint-disable-next-line no-console
    console.log(`\n${tenant.name}:`);
    for (const user of users) {
      const created = await createApiKey(tenant.id, user.id);
      // eslint-disable-next-line no-console
      console.log(`  ${user.role} ${user.email} -> ${created.raw}`);
    }

    let previousHash: string | null = null;
    for (let i = 0; i < 10; i += 1) {
      const payload = {
        tenantId: tenant.id,
        actorUserId: users[0].id,
        apiKeyId: null,
        action: "SEEDED_EVENT",
        resourceType: "seed",
        resourceId: `seed-${i}`,
        previousData: null,
        newData: { iteration: i },
        ipAddress: "127.0.0.1",
        timestamp: new Date(Date.now() - (10 - i) * 60_000).toISOString()
      };
      const chainHash: string = crypto
        .createHash("sha256")
        .update(JSON.stringify(payload) + (previousHash ?? ""))
        .digest("hex");
      await prisma.auditLog.create({
        data: {
          tenantId: tenant.id,
          actorUserId: users[0].id,
          action: payload.action,
          resourceType: payload.resourceType,
          resourceId: payload.resourceId,
          newData: payload.newData as never,
          ipAddress: payload.ipAddress,
          previousHash,
          chainHash,
          timestamp: new Date(payload.timestamp)
        }
      });
      previousHash = chainHash;
    }

    for (let i = 0; i < 850; i += 1) {
      await prisma.requestMetric.create({
        data: { tenantId: tenant.id, endpoint: "GET:/projects", statusCode: i % 20 === 0 ? 429 : 200 }
      });
    }
  }
};

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
