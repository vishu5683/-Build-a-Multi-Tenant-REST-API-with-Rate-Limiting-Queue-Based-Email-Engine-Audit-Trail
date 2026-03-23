import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  INTERNAL_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().email()
});

export const env = envSchema.parse(process.env);
