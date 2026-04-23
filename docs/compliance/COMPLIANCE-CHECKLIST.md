# Checklist Compliance — FridAI

**Ultimo aggiornamento:** 2026-04-23
**Branch:** ottimizzazione

---

## GDPR (Reg. UE 2016/679)

- [x] Privacy policy — `src/app/privacy/page.tsx`
- [x] Cookie consent banner — `src/components/cookie-consent.tsx` integrato in `layout.tsx`
- [x] Data export Art. 15/20 — `src/app/api/gdpr/export/route.ts`
- [x] Data deletion Art. 17 (diritto all'oblio) — `src/app/api/gdpr/delete/route.ts`
- [x] PII encryption AES-256-GCM — `src/lib/encryption.ts`, toggle via `PII_ENCRYPTION_ENABLED`
- [x] PII redaction su chiamate LLM — `src/lib/pii-redact.ts` (sempre attivo, obbligatorio)
- [x] Audit logging (DB + fallback file) — `src/lib/audit.ts`
- [x] Consent logging — integrato nel cookie consent
- [x] Data retention policy con cleanup automatico — `src/app/api/cron/retention-cleanup/route.ts`
- [x] Campi PII dichiarati — `src/lib/pii-fields.ts`
- [ ] DPA con sub-processor firmati (OpenRouter, Vercel, Sentry, Upstash)
- [ ] DPO designato (obbligatorio se trattamento su larga scala)
- [ ] Registro dei trattamenti Art. 30 (documento formale)
- [ ] DPIA per trattamenti ad alto rischio (AI su dati personali)

## NIS2 (Direttiva UE 2022/2555)

- [x] Incident Response Plan — `docs/NIS2-INCIDENT-RESPONSE.md`
- [x] Business Continuity Plan con RPO/RTO — `docs/NIS2-BUSINESS-CONTINUITY.md`
- [x] Timeline notifica 72h a CSIRT (Art. 23) — documentata in IRP
- [x] Backup automatico DB giornaliero — `src/app/api/cron/backup-db/route.ts`, cron Vercel `0 2 * * *`
- [x] Rate limiting (in-memory + Upstash Redis) — `src/lib/rate-limit.ts`
- [x] MFA/TOTP — `src/lib/totp.ts`, API setup/verify/validate in `src/app/api/auth/mfa/`
- [x] CSP con nonce — `src/middleware.ts`
- [x] Autenticazione timing-safe sui cron — `timingSafeEqual` in route cron
- [x] Docker resource limits (CPU/mem) — `docker-compose.yml`
- [x] Structured logging — `src/lib/logger.ts`
- [x] Error monitoring (Sentry) — `src/instrumentation.ts`, `src/lib/sentry.ts`
- [ ] Vulnerability scanning periodico (pen-test / SAST)
- [ ] Supply chain security (SBOM, dipendenze firmate)
- [ ] Formazione sicurezza per il personale

## AI Act (Reg. UE 2024/1689)

- [x] AI decision audit log (Art. 12) — `src/lib/ai-audit.ts`, log JSONL per ogni decisione AI
- [x] PII redaction prima di invio a LLM — `src/lib/pii-redact.ts`
- [x] Tracciamento modello, token, durata per ogni chiamata AI — campi in `AiDecisionLog`
- [x] Input/output summary (PII-redacted) per auditabilita — `inputSummary`/`outputSummary`
- [x] Multi-tenancy: isolamento dati per companyId — middleware + Prisma filters
- [ ] Trasparenza: notifica utente che interagisce con AI (Art. 52)
- [ ] Documentazione tecnica del sistema AI (Art. 11)
- [ ] Valutazione del rischio AI (classificazione high-risk vs limited-risk)
- [ ] Supervisione umana (human-in-the-loop) documentata

## Sicurezza Applicativa

- [x] SQL injection guard — `src/lib/pipeline-sql-executor.ts`, query parametrizzate
- [x] Input validation sulle API — rate limiting + auth check su tutte le route
- [x] Auth middleware su tutte le route protette — `src/middleware.ts`
- [x] Session JWT con multi-tenant scoping — `src/lib/auth.ts`
- [x] Secrets mai hardcoded — `.env.template` con variabili vuote
- [x] CRON_SECRET per endpoint cron — timing-safe comparison
- [x] Encryption key separata (ENCRYPTION_KEY) — env var, 32-byte base64
- [x] Standalone output per Docker — `next.config.ts` con `output: 'standalone'`
- [x] Remediation plan documentato — `docs/REMEDIATION_PLAN.md`
- [x] TypeScript strict (no ignoreBuildErrors) — `next.config.ts`
- [x] ESLint enforced in build — `next.config.ts`
- [ ] HTTPS enforced (gestito da Vercel/reverse proxy)
- [ ] Secret rotation automatica
- [ ] WAF (Web Application Firewall)

## Infrastruttura e Deploy

- [x] Vercel cron jobs configurati — `vercel.json`
- [x] Database backup giornaliero 02:00 UTC — cron `/api/cron/backup-db`
- [x] Retention cleanup settimanale dom 03:00 UTC — cron `/api/cron/retention-cleanup`
- [x] Docker Compose con resource limits — `docker-compose.yml`
- [x] Production deploy docs — `docs/PRODUCTION_DEPLOY.md`
- [ ] CI/CD pipeline con security checks automatici
- [ ] Staging environment separato
- [ ] Monitoring uptime (health check endpoint)
