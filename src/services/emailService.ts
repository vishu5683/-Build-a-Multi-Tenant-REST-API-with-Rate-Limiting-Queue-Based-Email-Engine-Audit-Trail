import { prisma } from "../lib/prisma";
import { emailQueue } from "../queue/queues";
import { EmailTemplateName } from "./emailTemplates";

export const enqueueEmail = async (input: {
  tenantId: string;
  recipient: string;
  templateName: EmailTemplateName;
  templateData: Record<string, unknown>;
}) => {
  const log = await prisma.emailDeliveryLog.create({
    data: {
      tenantId: input.tenantId,
      recipient: input.recipient,
      template: input.templateName,
      status: "PENDING"
    }
  });

  await emailQueue.add(
    "transactional-email",
    {
      tenantId: input.tenantId,
      recipient: input.recipient,
      templateName: input.templateName,
      templateData: input.templateData,
      logId: log.id
    },
    {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: 1000,
      removeOnFail: 1000
    }
  );

  return log.id;
};
