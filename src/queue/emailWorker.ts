import nodemailer from "nodemailer";
import { Worker } from "bullmq";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { deadLetterQueue } from "./queues";
import { emailTemplates, EmailTemplateName } from "../services/emailTemplates";

type EmailJobPayload = {
  tenantId: string;
  recipient: string;
  templateName: EmailTemplateName;
  templateData: Record<string, unknown>;
  logId: string;
};

const transporterPromise = nodemailer.createTestAccount().then((account) =>
  nodemailer.createTransport({
    host: account.smtp.host,
    port: account.smtp.port,
    secure: account.smtp.secure,
    auth: { user: account.user, pass: account.pass }
  })
);

export const emailWorker = new Worker<EmailJobPayload>(
  "email-jobs",
  async (job) => {
    const templateFactory = emailTemplates[job.data.templateName];
    const template = templateFactory(job.data.templateData as never);
    const transporter = await transporterPromise;

    const info = await transporter.sendMail({
      from: env.EMAIL_FROM,
      to: job.data.recipient,
      subject: template.subject,
      text: template.body
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    await prisma.emailDeliveryLog.update({
      where: { id: job.data.logId },
      data: {
        status: "SENT",
        attemptCount: job.attemptsMade + 1,
        messageId: info.messageId,
        previewUrl: previewUrl || null
      }
    });
  },
  { connection: { url: env.REDIS_URL } }
);

emailWorker.on("failed", async (job, error) => {
  if (!job) return;
  const exhausted = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
  await prisma.emailDeliveryLog.update({
    where: { id: job.data.logId },
    data: { status: exhausted ? "FAILED" : "PENDING", attemptCount: job.attemptsMade + 1, lastError: error.message }
  });
  if (exhausted) {
    await deadLetterQueue.add("failed-email", { ...job.data, reason: error.message });
  }
});
