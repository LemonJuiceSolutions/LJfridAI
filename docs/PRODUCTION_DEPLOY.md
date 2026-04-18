# FridAI — Production Deployment Guide

Deterministic checklist. Follow top-to-bottom, do not skip steps.

## 0. Prerequisites

- Linux host with Docker + Docker Compose (24.0+) **or** Node 20.9+ with Postgres 15+ and Python 3.11+.
- DNS A record pointing at the host.
- TLS termination in front of Next.js (Caddy / nginx / Cloudflare).
- Upstash Redis account (free tier fine) for distributed rate limiting.

## 1. Generate all secrets

Run on the target host (never commit these):

```bash
# 7 independent 32-byte base64 secrets
for name in NEXTAUTH_SECRET ENCRYPTION_KEY CRON_SECRET INTERNAL_QUERY_TOKEN MCP_INTERNAL_SECRET SCHEDULER_INTERNAL_SECRET PYTHON_BACKEND_TOKEN; do
  echo "$name=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"
done
```

Paste the output into `.env.production`. Use `.env.production.template` as the scaffold.

`PYTHON_BACKEND_TOKEN` must be identical on both the Next.js and Python
containers — the Flask app uses it to authenticate every inbound call
(X-Internal-Token header). Mismatches cause every Python call to 401 with
no user-visible hint; cross-check both services after deploy.

## 2. Database

```bash
# Create DB and dedicated user
sudo -u postgres psql <<SQL
CREATE USER fridai WITH PASSWORD '<strong-password>';
CREATE DATABASE fridai OWNER fridai;
GRANT ALL PRIVILEGES ON DATABASE fridai TO fridai;
SQL

# From the app host:
DATABASE_URL=... npx prisma migrate deploy
```

Back up the DB daily. Retention cron (`/api/cron/retention-cleanup`) enforces
GDPR retention windows but does not replace backups.

## 3. Backfill encryption (one-time)

If importing existing data with plaintext API keys or PII:

```bash
# DOUBLE-CHECK the DB is backed up first.
DATABASE_URL=... ENCRYPTION_KEY=... npx tsx scripts/backfill-pii-encryption.ts
```

Then flip `PII_ENCRYPTION_ENABLED=true`.

## 4. Build

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npx prisma generate
```

Any failure = stop. Do not deploy a build with failing tests.

## 5. Boot

```bash
# Next.js
NODE_ENV=production npm start &

# Scheduler service (separate process)
cd scheduler-service && NODE_ENV=production npm start &

# Python backend (separate process, bound to 127.0.0.1 only)
cd python-backend && PYTHON_BACKEND_HOST=127.0.0.1 python app.py &
```

`src/lib/env.ts` throws on boot if any required secret is missing. Read the
stdout of the Next.js process — if it booted past "Environment validation
failed", secrets are correct.

## 6. Post-boot verification

```bash
# 1. Health
curl https://your-domain/api/health    # expect 200

# 2. Unauth → 401
curl -i https://your-domain/api/trees  # expect 401

# 3. Rate limit on register
for i in {1..7}; do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST https://your-domain/api/auth/register -H 'Content-Type: application/json' -d '{}'
done
# Expect: last 2 return 429

# 4. GDPR export (with session cookie)
curl -H "Cookie: next-auth.session-token=..." https://your-domain/api/gdpr/export -o export.json
jq '.profile.email' export.json   # expect your email
```

## 7. Monitoring

- Enable structured logging: `src/lib/logger.ts` writes JSON to stdout. Ship to
  Loki / Datadog / CloudWatch.
- Watch `auditLog` table: `gdpr.delete` and `gdpr.export` events.
- Alert on `[mcp-tool] MCP_INTERNAL_SECRET not configured` — means a deploy
  shipped without the secret.

## 8. Rotation

| Secret | Rotate every |
|---|---|
| `NEXTAUTH_SECRET` | 180d (invalidates all sessions) |
| `ENCRYPTION_KEY` | Not routinely — rotating requires re-encrypting all rows. |
| `CRON_SECRET` | 90d |
| `INTERNAL_QUERY_TOKEN` | 90d |
| `MCP_INTERNAL_SECRET` | 90d |
| `SCHEDULER_INTERNAL_SECRET` | 90d |
| DB password | 180d |

## 9. Known limitations (accepted for v1)

- `xlsx` pkg has GHSA-4r6h-8v6p-xvw6 (proto pollution) + ReDoS. No upstream
  fix. Input comes from authenticated company-scoped users, not public. Plan:
  migrate to `exceljs` in a follow-up release.
- `nodemailer <=8.0.4` SMTP header injection (via @auth/core). Mitigated by
  SMTP config in `src/lib/mail.ts` not taking unsanitized user input into
  `envelope.size` or transport name.
- File size limit: 14 files exceed 500 LOC internal policy
  (`src/components/rule-sage/edit-node-dialog/index.tsx` is 6119). Refactor
  tracked separately; does not block prod.

## 10. Rollback

```bash
# 1. stop new version
docker compose stop app scheduler
# 2. restore DB
docker exec rulesage-db psql -U postgres -d rulesagedb < backups/<date>/db-dump.sql
# 3. checkout previous tag
git checkout <previous-tag>
# 4. rebuild + boot
npm ci && npm run build && npm start
```
