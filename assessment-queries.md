# Assessment Verification Queries

## PostgreSQL checks

### 1) Tenant isolation sanity
```sql
SELECT tenant_id, count(*) AS projects
FROM "Project"
GROUP BY tenant_id;
```

### 2) API keys are hashed (not raw)
```sql
SELECT id, tenant_id, key_hash, created_at
FROM "ApiKey"
ORDER BY created_at DESC
LIMIT 10;
```

### 3) Rotation overlap expiry (15 min window)
```sql
SELECT id, replaced_by_key_id, expires_at, created_at
FROM "ApiKey"
WHERE replaced_by_key_id IS NOT NULL
ORDER BY created_at DESC;
```

### 4) Audit append-only trigger is present
```sql
SELECT tgname, tgrelid::regclass AS table_name
FROM pg_trigger
WHERE tgname IN ('audit_no_update', 'audit_no_delete');
```

### 5) Audit chain stored per tenant
```sql
SELECT tenant_id, id, previous_hash, chain_hash, timestamp
FROM "AuditLog"
ORDER BY tenant_id, timestamp DESC
LIMIT 50;
```

### 6) Email delivery logs
```sql
SELECT tenant_id, recipient, template, status, attempt_count, message_id, preview_url, created_at
FROM "EmailDeliveryLog"
ORDER BY created_at DESC
LIMIT 50;
```

### 7) Rate limit breaches in billing period
```sql
SELECT tenant_id, tier, count(*) AS breach_count
FROM "RateLimitBreach"
WHERE created_at >= date_trunc('month', now())
GROUP BY tenant_id, tier
ORDER BY breach_count DESC;
```

## Redis checks

### 1) Global limiter keys
```bash
redis-cli KEYS "rl:*:global"
```

### 2) Endpoint limiter keys
```bash
redis-cli KEYS "rl:*:ep:*"
```

### 3) Burst limiter keys
```bash
redis-cli KEYS "rl:*:burst:*"
```

### 4) Queue overview
```bash
redis-cli KEYS "bull:*"
```
