import express from "express";
import pinoHttp from "pino-http";
import { AppError, formatError } from "./lib/errors";
import { tenantAuth } from "./middleware/auth";
import { rateLimitMiddleware } from "./middleware/rateLimit";
import { responseTimeTracker } from "./middleware/observability";
import { projectRouter } from "./routes/projects";
import { tenantRouter } from "./routes/tenant";
import { auditRouter } from "./routes/audit";
import { internalRouter } from "./routes/internal";

export const app = express();

app.use(express.json());
app.use(pinoHttp());
app.use(responseTimeTracker);

app.use("/internal", internalRouter);

app.use(tenantAuth);
app.use(rateLimitMiddleware);
app.use("/projects", projectRouter);
app.use("/tenant", tenantRouter);
app.use("/audit", auditRouter);

app.use((_req, _res, next) => next(new AppError(404, "NOT_FOUND", "Route not found")));

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof AppError) return res.status(error.statusCode).json(formatError(error));
  if (error instanceof Error) return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: error.message } });
  return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unknown error" } });
});
