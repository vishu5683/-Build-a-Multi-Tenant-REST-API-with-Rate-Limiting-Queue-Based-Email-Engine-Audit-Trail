# Velozity Global Solutions - Technical Assessment

This repository contains a production-oriented multi-tenant REST API built for a B2B SaaS platform.

## Tech Stack

- Runtime: `Node.js` with `TypeScript`
- Framework: `Express`
- Database: `PostgreSQL` with `Prisma`
- Cache and queue backend: `Redis`
- Queue engine: `BullMQ`
- Email transport: `Nodemailer` (Ethereal test account)
- Testing: `Vitest`

## Why Express and BullMQ

- `Express` provides lightweight, explicit middleware composition for authentication, tenant scoping, observability, and consistent error handling.
- `BullMQ` is Redis-backed, supports retries with exponential backoff, and allows dead-letter-style handling for failed jobs with good operational visibility.

## Core Requirements Covered

### 1) Multi-Tenant API and Scoped Authentication

- Tenant is resolved from `x-api-key` on every request.
- API keys are stored as hashes (`bcrypt`), and raw keys are shown only when generated.
- Tenant isolation is enforced at query level using `AsyncLocalStorage` + Prisma query extensions in `src/lib/prisma.ts`.
- Roles are supported per tenant: `OWNER` and `MEMBER`.
- API key rotation is owner-only, with the previous key remaining valid for exactly 15 minutes.

### 2) Intelligent Rate Limiting (Sliding Window)

- Redis sorted sets are used for sliding-window counters (not fixed window).
- Three tiers are enforced:
  - Global: `1000 req / minute / tenant`
  - Endpoint: `100 req / minute / tenant+endpoint`
  - Burst: `50 req / 5 seconds / tenant+endpoint+api key`
- Every response includes:
  - `X-RateLimit-Limit`
  - `X-RateLimit-Remaining`
  - `X-RateLimit-Reset`
- Exceeded limits return structured `429` payload with tier, limit, current count, and reset seconds.

### 3) Queue-Based Transactional Email Engine

- All outgoing emails are queued; no synchronous email dispatch in route handlers.
- Triggers implemented:
  - User invited to tenant
  - API key rotated
  - Global usage crosses 80% threshold (throttled to one warning per tenant per hour)
- Jobs include retry with exponential backoff (`max 3 attempts`).
- Failed terminal jobs are added to dead-letter queue.
- Delivery events are stored in `EmailDeliveryLog` with status and attempts.
- Email templates are separated from sending logic in `src/services/emailTemplates.ts`.

### 4) Tamper-Evident Audit Trail

- All state-changing operations generate audit entries.
- Each entry stores:
  - previous value and new value
  - actor user
  - API key id
  - IP address
  - timestamp
  - `previousHash` and `chainHash`
- `chainHash` is computed with SHA-256 over entry payload + previous hash.
- `GET /audit/verify` recomputes chain and returns integrity status and first broken entry id.
- Audit table is append-only through PostgreSQL trigger:
  - `prisma/migrations/0001_append_only_audit/migration.sql`

### 5) Health and Observability

- `GET /internal/health` returns:
  - API status
  - database status
  - Redis status
  - queue depth (pending + failed queue size)
  - average response time over the last 60 seconds
- `GET /internal/metrics` returns per-tenant billing-period usage:
  - total requests
  - requests by endpoint
  - rate-limit breach count
  - email delivery success rate
- Internal routes are protected by `x-internal-api-key`.

## API Documentation and Assets

- OpenAPI spec: `openapi.yaml`
- Postman collection: `Velozity-Assessment.postman_collection.json`
- Verification queries (PostgreSQL + Redis): `assessment-queries.md`

## Project Structure (Important Files)

- App bootstrap: `src/app.ts`, `src/server.ts`
- Tenant auth and roles: `src/middleware/auth.ts`
- Rate limiter: `src/middleware/rateLimit.ts`, `src/services/rateLimiter.ts`
- Tenant isolation enforcement: `src/lib/prisma.ts`
- Audit chain logic: `src/services/auditService.ts`, `src/routes/audit.ts`
- Queue and worker: `src/queue/queues.ts`, `src/queue/emailWorker.ts`
- Internal observability routes: `src/routes/internal.ts`
- Seed script: `prisma/seed.ts`

## Local Setup

1. Copy environment template:
   - `copy .env.example .env` (Windows)
2. Start infrastructure:
   - `docker compose up -d`
3. Install dependencies:
   - `npm install`
4. Generate Prisma client:
   - `npm run prisma:generate`
5. Push schema to database:
   - `npm run prisma:push`
6. Apply append-only audit trigger:
   - `psql postgresql://postgres:postgres@localhost:5432/velo_assessment -f prisma/migrations/0001_append_only_audit/migration.sql`
7. Seed data:
   - `npm run seed`
8. Start API:
   - `npm run dev`

## Environment Variables

Use `.env.example` as reference:

- `PORT`
- `DATABASE_URL`
- `REDIS_URL`
- `INTERNAL_API_KEY`
- `EMAIL_FROM`

## Seed Data

The seed script creates:

- 2 tenants
- 3 users per tenant (1 owner + 2 members)
- API keys for seeded users (printed once in console)
- At least 10 valid chained audit records per tenant
- Pre-populated request metric rows for rate-limit and metrics testing

## Error Response Contract

All errors follow:

```json
{
  "error": {
    "code": "SOME_CODE",
    "message": "Human readable message",
    "details": {}
  }
}
```

## Test Coverage

- `tests/rateLimiter.integration.test.ts`
  - validates sliding-window limiter behavior on burst tier
- `tests/auditVerify.integration.test.ts`
  - validates tamper detection logic in audit-chain verification

Run tests:

- `npm test`

## Architectural Notes

- Tenant isolation is enforced beyond middleware by automatically scoping tenant-bound models in Prisma query extensions.
- Unsafe tenant-scoped direct operations (`findUnique`, `update`, `delete`, `upsert`) are blocked in request context to prevent accidental cross-tenant leaks.
- Sliding window uses Redis sorted sets with timestamp pruning and exact reset calculation based on oldest live event.
- Queue-backed email flow keeps route handlers non-blocking and improves reliability through retries and DLQ capture.

## Known Limitations

- Endpoint-level rate limit values are currently static constants and can be moved to tenant-specific configuration storage.
- Full end-to-end tests with live PostgreSQL and Redis in CI are not yet configured.
- Key token structure assumes `ak_<keyId>_<secret>` for efficient lookup before hash verification.

## Explanation (Assessment Field, 150-250 Words)

The hardest problem in this project was implementing tenant isolation in a way that is provable at query level rather than relying only on route middleware checks. I solved this by combining AsyncLocalStorage request context with Prisma query extensions. Once a request is authenticated through API key resolution, tenant context is attached and tenant-scoped models are automatically constrained at query time. I also blocked unsafe operations for tenant-scoped models in context to reduce accidental leaks from future code changes.

For rate limiting, I used Redis sorted sets to implement a true sliding window. This avoids fixed-window boundary problems and gives deterministic behavior when requests arrive near window edges. The limiter enforces three tiers and returns clear 429 metadata and standard rate-limit headers.

For tamper-evident audit logging, each write event stores a hash chain (`previousHash` + `chainHash`) per tenant, and `/audit/verify` recomputes the chain to detect and locate tampering. If I had more time, I would add tenant-configurable rate limits and a full containerized end-to-end CI suite with concurrency and chaos testing.
