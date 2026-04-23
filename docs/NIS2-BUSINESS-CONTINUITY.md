# NIS2 Business Continuity Plan

**Owner:** CTO | **Last reviewed:** 2026-04-23 | **Next review:** 2026-10-23

---

## 1. RPO / RTO Targets

| System | RPO (max data loss) | RTO (max downtime) | Tier |
|--------|--------------------|--------------------|------|
| PostgreSQL database | 1 hour | 4 hours | Critical |
| Application (Next.js on Vercel) | 0 (immutable deploys) | 30 minutes | Critical |
| File storage (uploads) | 24 hours | 4 hours | High |
| Git repository (GitHub) | 0 (distributed) | 1 hour | Critical |
| Secrets (env vars, API keys) | 24 hours | 2 hours | Critical |
| Python backend | 0 (immutable deploys) | 2 hours | High |
| Monitoring / logging | 7 days | 8 hours | Medium |

---

## 2. Backup Strategy

### 2.1 Database (PostgreSQL)

| Item | Configuration |
|------|--------------|
| **Method** | Automated daily `pg_dump` + continuous WAL archiving |
| **Frequency** | Full backup: daily at 02:00 UTC. WAL: continuous |
| **Retention** | 30 daily + 12 monthly + 1 yearly |
| **Storage** | Encrypted at rest (AES-256) in separate cloud region |
| **Verification** | Weekly automated restore test to staging |
| **Responsible** | DevOps / Database admin |

### 2.2 Application Code

| Item | Configuration |
|------|--------------|
| **Method** | Git (GitHub) with branch protection on `main` |
| **Mirror** | Secondary remote (e.g., GitLab or Bitbucket) synced daily |
| **Deployment artifacts** | Vercel retains all deployments; instant rollback available |
| **Responsible** | Engineering team |

### 2.3 Secrets and Configuration

| Item | Configuration |
|------|--------------|
| **Method** | Environment variables stored in Vercel project settings |
| **Backup** | Encrypted export to password manager vault (1Password / Bitwarden) |
| **Rotation schedule** | Every 90 days, or immediately after any incident |
| **Responsible** | Security Lead |

### 2.4 File Uploads

| Item | Configuration |
|------|--------------|
| **Method** | Cloud object storage with versioning enabled |
| **Replication** | Cross-region replication to secondary bucket |
| **Retention** | 90-day version history |
| **Responsible** | DevOps |

---

## 3. Recovery Procedures

### 3.1 Database Recovery

```bash
# 1. Identify the target recovery point
pg_restore --list <backup_file> | head -20

# 2. Create a fresh database
createdb fridai_restored

# 3. Restore from backup
pg_restore --dbname=fridai_restored --verbose <backup_file>

# 4. For point-in-time recovery (using WAL)
# Configure recovery.conf with target timestamp
restore_command = 'cp /wal_archive/%f %p'
recovery_target_time = '2026-04-23 10:00:00 UTC'

# 5. Verify data integrity
psql fridai_restored -c "SELECT count(*) FROM \"Tree\";"
psql fridai_restored -c "SELECT count(*) FROM \"User\";"

# 6. Swap connection string in Vercel env vars
```

### 3.2 Application Recovery

| Scenario | Action | Time |
|----------|--------|------|
| Bad deployment | Rollback via Vercel dashboard (Deployments > Promote previous) | < 5 min |
| Vercel outage | Deploy to backup provider (Docker image, `npm run build && npm start`) | < 30 min |
| GitHub outage | Push from local clones or mirror remote | < 15 min |
| Corrupted dependencies | Delete `node_modules`, `npm ci` from lockfile | < 10 min |

### 3.3 Secrets Recovery

1. Retrieve encrypted backup from password manager vault.
2. Re-import environment variables into Vercel project settings.
3. Rotate any secrets that may have been compromised.
4. Redeploy application to pick up new values.

---

## 4. Failover Plan

### 4.1 Primary Infrastructure: Vercel + Managed PostgreSQL

| Component | Primary | Failover | Switch Method |
|-----------|---------|----------|---------------|
| Frontend/API | Vercel (auto-scaling) | Docker on cloud VM | DNS update (Cloudflare) |
| Database | Managed PostgreSQL (primary region) | Read replica (secondary region) | Promote replica, update `DATABASE_URL` |
| DNS | Cloudflare | Registrar DNS | Manual update at registrar |
| Secrets | Vercel env vars | Password manager vault | Manual re-import |

### 4.2 Failover Decision Criteria

| Condition | Action |
|-----------|--------|
| Vercel down > 30 min | Activate Docker failover |
| DB primary unreachable > 15 min | Promote read replica |
| DNS provider down > 1 hr | Switch to registrar DNS |
| Region-wide cloud outage | Activate cross-region replica |

### 4.3 Failover Execution Checklist

- [ ] Confirm primary is truly unavailable (not a local network issue)
- [ ] Notify team in `#incident` channel
- [ ] Activate failover per table above
- [ ] Verify failover system is serving traffic correctly
- [ ] Monitor error rates for 30 minutes post-failover
- [ ] Document timeline in incident log
- [ ] Plan failback once primary recovers

---

## 5. Annual Testing Schedule

| Quarter | Test | Scope | Owner |
|---------|------|-------|-------|
| **Q1 (Jan)** | Full DR drill | Database restore + app failover to backup provider | CTO + DevOps |
| **Q2 (Apr)** | Backup verification | Restore latest DB backup to staging, validate data integrity | Database admin |
| **Q3 (Jul)** | Tabletop exercise | Walk through P1 incident scenario with all roles | Security Lead |
| **Q4 (Oct)** | Secrets rotation + recovery test | Rotate all secrets, verify app recovers cleanly | Security Lead |

### Test Success Criteria

| Metric | Target |
|--------|--------|
| DB restore completes within RTO | < 4 hours |
| App failover completes within RTO | < 30 minutes |
| Data loss within RPO | < 1 hour |
| All team members reachable | Within 15 minutes |
| NIS2 notification draft ready | Within 24 hours (simulated) |

### After Each Test

1. Document results (pass/fail, actual RTO/RPO achieved).
2. File action items for any gaps.
3. Update this plan if procedures changed.
4. Report results to leadership.

---

## Appendix: Key Contacts

| Role | Contact | Backup |
|------|---------|--------|
| CTO | (fill in) | (fill in) |
| Security Lead | (fill in) | (fill in) |
| Database Admin | (fill in) | (fill in) |
| Vercel Support | https://vercel.com/support | -- |
| Cloud Provider Support | (fill in) | -- |
| ACN (Italian CSIRT) | https://www.acn.gov.it | -- |
