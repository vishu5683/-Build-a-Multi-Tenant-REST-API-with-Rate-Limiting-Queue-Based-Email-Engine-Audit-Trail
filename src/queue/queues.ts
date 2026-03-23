import { Queue } from "bullmq";
import { env } from "../config/env";

export const emailQueue = new Queue("email-jobs", { connection: { url: env.REDIS_URL } });
export const deadLetterQueue = new Queue("email-dlq", { connection: { url: env.REDIS_URL } });
