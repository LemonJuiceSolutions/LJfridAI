# FridAI — SaaS Remediation Plan

**Created**: 2026-04-18
**Branch at time of drafting**: `AGENT2.0`
**Current overall readiness**: 6.4/10 (beta). Target after plan: 8.5/10 (GA multi-tenant).
**Estimated effort**: 15–20 engineer-days, split across 5 phases.

This document is an **execution plan**, not a change. No code has been modified.
Each task below is self-contained: a dedicated agent/engineer should take one task at a
time, read the referenced files, implement, run the verification steps, commit, and move on.

Legend:
- `src/...:NNN` — file and line reference
- **Blocker**: must be done before GA
- **Cost**: S (<2h), M (2–8h), L (1–3d), XL (>3d)

---

## Phase 1 — Security Critical (Blockers)

Target: close exploitable auth/data-exposure holes. All tasks here are **Blocker**.

### 1.1 Remove `_bypassAuth` / `companyId: 'system-override'`

**Files affected** (grep confirmed 2026-04-18):
- [src/app/actions/sql.ts](../src/app/actions/sql.ts):17, 26, 33, 43, 66, 75, 242, 404, 456, 1074, 1083, 1090, 1148, 1209, 1279, 1316
- [src/app/actions/connectors.ts](../src/app/actions/connectors.ts):633, 644, 649, 910, 1064
- [src/lib/scheduler/scheduler-service.ts](../src/lib/scheduler/scheduler-service.ts):789, 1880
- [src/lib/scheduler/scheduler-actions.ts](../src/lib/scheduler/scheduler-actions.ts):100, 127, 272, 312, 375

**Problem**: Scheduler passes `_bypassAuth: true` so inner actions resolve to
`{ id: 'system-scheduler', companyId: 'system-override' }`. Prisma queries then use
`companyId: undefined`, which in Prisma means **no filter** → cross-tenant read/write.

**Fix design**:
1. Introduce a new type `SystemActor = { kind: 'scheduler' | 'mcp' | 'worker'; companyId: string; scheduleId?: string; pipelineId?: string }` in `src/lib/auth/system-actor.ts` (new file).
2. Every scheduler call must carry a **concrete `companyId`** resolved from the
   `Schedule` / `Pipeline` row before the call. Never `undefined`, never `'system-override'`.
3. Replace `_bypassAuth: boolean` parameter with `actor?: SystemActor`. If `actor` is
   present, skip `getSession()` but **use `actor.companyId` verbatim** in Prisma `where`.
4. Add a runtime assertion: `if (!actor?.companyId) throw new Error('SystemActor missing companyId')`.
5. Delete every `user.companyId !== 'system-override' ? user.companyId : undefined`
   conditional — it becomes just `user.companyId`.

**Verification**:
- Unit test: calling `executeSql({ query }, { kind: 'scheduler', companyId: 'COMPANY_A' })`
  must only return rows with `companyId: 'COMPANY_A'`.
- Integration test: two companies each with their own `Schedule` — run both, assert no
  cross-contamination in `QueryExecution` / `AgentConversation` tables.
- `grep -r "system-override" src/` must return **zero matches** after fix.

**Cost**: L (1–2 days). **Blocker.**

---

### 1.2 API token auth for Python backend

**Files affected**:
- [python-backend/app.py](../python-backend/app.py) (1813 lines) — no `Authorization` header validation today (grep returned 0 matches for `X-Internal-Token|INTERNAL_QUERY_TOKEN|Authorization`).
- [src/lib/env.ts](../src/lib/env.ts) — add `PYTHON_BACKEND_TOKEN`.
- [src/lib/python-client.ts](../src/lib/python-client.ts) (or equivalent caller) — attach header.

**Fix design**:
1. Add Flask `@before_request` hook that rejects any request without
   `X-Internal-Token == os.environ['PYTHON_BACKEND_TOKEN']`. Allow `/health` without token.
2. Use `hmac.compare_digest` for constant-time comparison.
3. Generate token via `openssl rand -hex 32`; inject via docker-compose and Kubernetes secret.
4. Every Next.js → Python fetch must set `X-Internal-Token` from `env.PYTHON_BACKEND_TOKEN`.
5. Add test `python-backend/tests/test_auth.py` using Flask test client.

**Verification**:
- `curl http://localhost:5005/execute-code` without header → 401.
- With correct header → 200.
- Missing env var at boot → fail-fast with clear error.

**Cost**: M. **Blocker.**

---

### 1.3 Automatic PII redaction middleware

**Current state**: `src/lib/pii-redact.ts` exists. Manually called from 8 files (`super-agent-flow.ts`, `sql-agent-flow.ts`, `generate-decision-tree.ts`, `extract-variables.ts`, `diagnose-problem.ts`, `openrouter-utils.ts`, `detai.ts`). **Easy to forget.**

**Fix design**:
1. Wrap **every** outbound LLM request through a single gateway: `src/lib/ai/gateway.ts`.
   All Genkit + AI SDK calls go through `aiGateway.complete(...)` / `aiGateway.stream(...)`.
2. Inside the gateway, apply `redactPII` automatically before sending; attach redacted-field
   map in conversation metadata so the response can re-hydrate if appropriate.
3. Deprecate direct imports of `genkit` / `generateText` outside `src/lib/ai/`. Add ESLint
   `no-restricted-imports` rule to enforce.
4. Migrate the 8 call sites one by one.

**Verification**:
- Unit test: feed prompt with SSN/email/IBAN → gateway must strip before outbound call (mock fetch).
- Integration test with MSW intercepting OpenAI/OpenRouter traffic, asserting no raw PII in payloads.
- ESLint rule passes / build green.

**Cost**: L. **Blocker.**

---

### 1.4 Audit log for scheduler + Python execution

**Problem**: `scheduler_debug.log` is file-only; Python exec has zero audit trail.

**Fix design**:
1. Add Prisma model `AuditLog`:
   ```prisma
   model AuditLog {
     id          String   @id @default(cuid())
     companyId   String
     actorType   String   // 'user' | 'scheduler' | 'mcp' | 'python'
     actorId     String
     action      String   // 'sql.execute' | 'python.run' | 'schedule.fire'
     resourceId  String?
     payload     Json?
     ok          Boolean
     errorMsg    String?
     durationMs  Int?
     createdAt   DateTime @default(now())
     @@index([companyId, createdAt])
     @@index([action, createdAt])
   }
   ```
2. Helper `src/lib/audit.ts` with `audit.log({...})`. Called at start/end of every
   scheduler run, every Python `/execute-code`, every SQL write.
3. Retention: 180 days default, configurable per-company.
4. Expose read API `GET /api/audit?from=&to=&action=` (admin-scoped).

**Verification**:
- Run one scheduled job → 2 audit rows (start, end).
- Unauthorized user hitting audit API → 403.
- Company A admin cannot see Company B audit rows.

**Cost**: M. **Blocker.**

---

## Phase 2 — Cost & Observability

### 2.1 Token budget per-company (AI metering)

**Goal**: prevent runaway OpenAI / OpenRouter / Gemini spend.

**Design**:
1. New Prisma model `TokenLedger` (companyId, model, inputTokens, outputTokens, costUsd, at).
2. AI gateway (from 1.3) records tokens after each call. For streaming: sum from final usage chunk.
3. Monthly budget on `Company`: `tokenBudgetUsd Decimal?`. If consumed > budget → `402 Payment Required` on next AI call, banner in UI.
4. Admin dashboard: `src/app/settings/usage/page.tsx` — chart + per-user breakdown.
5. Alerts at 50/80/100 % via email (Resend) or webhook.

**Verification**:
- Seed company with $1 budget, 1 cent per call → 101st call rejected.
- Usage page shows accurate totals after 10 calls.

**Cost**: L.

---

### 2.2 Sentry error tracking

**Design**:
1. `npm i @sentry/nextjs` + `@sentry/profiling-node`.
2. Run `npx @sentry/wizard -i nextjs` once; commit generated config (`sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`).
3. Enable: Release tracking via git SHA, Performance tracing (sample rate 0.1 in prod), Session replay (0.01 sample).
4. Scrub PII in `beforeSend` hook (reuse `redactPII`).
5. Python backend: `sentry-sdk[flask]` with `FlaskIntegration`, same DSN.
6. Env: `SENTRY_DSN`, `SENTRY_ENVIRONMENT`. Add to `src/lib/env.ts`.

**Verification**:
- Throw in a test route → event appears in Sentry within 30s.
- Check that `Authorization`, `password`, `token` are scrubbed.

**Cost**: M.

---

### 2.3 Structured logging (Pino)

**Current**: `console.log` + `scheduler_debug.log` file.

**Design**:
1. `npm i pino pino-pretty`.
2. Create `src/lib/log.ts` exporting `logger` with fields `{ requestId, companyId, userId, actor }`.
3. Next.js: attach request-scoped logger via `AsyncLocalStorage` in middleware. Route handlers use `log.info(...)`.
4. Scheduler: logger bound with `scheduleId`, `runId`. Replace `scheduler_debug.log` writer with stdout.
5. Python: switch to `structlog` with JSON renderer.
6. Ship logs via the Docker logging driver (JSON) to Loki / Grafana Cloud / Datadog.

**Verification**:
- `docker logs web` shows JSON lines with `requestId` correlating across middleware + route + action.
- No more `console.log` in `src/app/actions/`.

**Cost**: M.

---

### 2.4 Per-model AI rate limit

**Design**:
1. Extend `src/lib/rate-limit.ts` with keyed limiter: `ai:${companyId}:${model}`.
2. Limits config table `ai_limits` (model, rpm, tpm, concurrent).
3. Enforced inside AI gateway (from 1.3) before call.
4. On hit: queue up to 10s (Redis or in-memory BullMQ), else 429.

**Verification**:
- Stress script running 100 parallel calls with limit 10/min → 90 are rejected or queued.

**Cost**: M.

---

## Phase 3 — Testing & CI

### 3.1 Multi-tenant integration tests

**Goal**: prove `companyId` isolation end-to-end.

**Design**:
1. Set up Vitest + `@testcontainers/postgresql` for ephemeral Postgres per test file.
2. Fixture: seed 2 companies × 2 users × 5 trees + schedules.
3. Test matrix:
   - User in company A calling every action/route — must never see company B rows.
   - Scheduler with actor(companyId=A) → never touches B rows.
   - MCP tools (`create_tree`, `get_tree`, `query_tree`) — same isolation.
4. Cover at minimum the top-50 server actions (list in `src/app/actions/**`).
5. Add `test:integration` script. Target 30+ tests.

**Verification**:
- `npm run test:integration` green locally and in CI.
- Coverage report shows `actions/` files > 70% covered.

**Cost**: XL (3d).

---

### 3.2 E2E critical path

**Tool**: Playwright.

**Scenarios**:
1. Register → login → create tree from NL → query tree → logout.
2. Create connector → run SQL agent → save dashboard widget.
3. Create pipeline with SQL + Python node → schedule → verify execution + audit log.
4. Admin invites user → user activates → only sees their company data.

**Setup**:
- `playwright.config.ts` with `webServer` running `npm run dev` and `docker-compose up python postgres`.
- Headless in CI, headed locally.

**Cost**: L (2d).

---

### 3.3 Complete CI pipeline

**Current** `.github/workflows/ci.yml`: minimal.

**New pipeline**:
```yaml
jobs:
  lint:       runs-on: ubuntu-latest; steps: npm ci + npm run lint
  typecheck:  npm run typecheck
  unit:       npm run test
  integration: docker-compose up -d postgres; npm run test:integration
  e2e:        npx playwright test
  build:      npm run build
  security:   npm audit --audit-level=high; gitleaks; semgrep
  docker:     docker build -f Dockerfile .
```
- Matrix: Node 20, 22.
- Required checks on `main` branch: all green.
- Cache node_modules + Playwright browsers.

**Cost**: M.

---

## Phase 4 — Architecture

### 4.1 Split `scheduler-service.ts` (2464 lines)

**Target modules** inside `src/lib/scheduler/`:
- `runner/run-sql.ts` — SQL task runner
- `runner/run-python.ts` — Python task runner
- `runner/run-pipeline.ts` — pipeline topology runner
- `env/env-resolver.ts` — SharePoint/connector env vars
- `store/schedule-store.ts` — Prisma queries
- `lock/distributed-lock.ts` — new (see 4.5)
- `service.ts` — thin coordinator (< 300 lines)

**Strategy**: Incremental. Extract one runner at a time; keep old file as re-export
shim until all callers migrated; delete shim last.

**Verification**: Integration tests from 3.1 pass unchanged.

**Cost**: L.

---

### 4.2 Split `lead-generator-flow.ts` (3346 lines)

**Symptom**: single file holds prompt templates + data fetching + scoring + Prisma writes + email send.

**Target**:
- `src/ai/flows/lead-generator/prompts.ts`
- `src/ai/flows/lead-generator/fetch.ts`
- `src/ai/flows/lead-generator/score.ts`
- `src/ai/flows/lead-generator/persist.ts`
- `src/ai/flows/lead-generator/notify.ts`
- `src/ai/flows/lead-generator/index.ts` — orchestrator (< 200 lines)

**Strategy**: Write characterization tests first (snapshot on real fixture), then split, keep tests green.

**Cost**: L.

---

### 4.3 Split `html-style-utils.ts` (2542 lines)

**Target**:
- `src/lib/html/iframe-polyfill.ts`
- `src/lib/html/style-presets.ts`
- `src/lib/html/sanitize.ts`
- `src/lib/html/save-to-db-bridge.ts`

**Cost**: M.

---

### 4.4 Domain layer extraction

**Goal**: move business logic from `src/app/actions/` into `src/domain/<context>/` following DDD.

**Contexts** (initial cut):
- `domain/trees/` — decision tree aggregate
- `domain/agents/` — conversation + turn aggregate
- `domain/connectors/` — connector aggregate + encryption
- `domain/scheduling/` — schedule + run aggregate
- `domain/billing/` — token ledger + budget

**Structure per context**:
```
domain/<context>/
  model.ts        # entities, value objects
  service.ts      # domain logic (pure)
  repository.ts   # Prisma access
  index.ts        # public API
```

**Action files** become thin orchestration (auth + domain call + error mapping).

**Cost**: XL (3–5d). Not a blocker — do after Phase 1–3.

---

### 4.5 Distributed lock for scheduler

**Problem**: multi-instance deploy will run the same cron twice.

**Options**:
- **Postgres advisory lock** — cheapest, already have Postgres. `SELECT pg_try_advisory_lock(hashtext('sched:' || $1))`.
- **Redis + Redlock** if Redis already present.

**Design**:
- `src/lib/scheduler/lock/distributed-lock.ts` with `acquire(key, ttl)` / `release(key)`.
- Wrap each `Schedule` run: `acquire('sched:' + scheduleId)` → skip if busy → release in finally.
- TTL = max run duration + buffer (e.g. 30min).

**Cost**: M.

---

## Phase 5 — Deployment

### 5.1 Secrets manager

**Target**: Doppler or HashiCorp Vault or Vercel env.

**Design**:
- Dev: `.env` + direnv.
- Staging/Prod: Doppler CLI bakes secrets into container env at boot.
- Remove any `.env.production` from repo. `git-secrets` pre-commit hook.
- CI: secrets pulled via service token.

**Cost**: S.

---

### 5.2 Kubernetes manifests

**Artifacts**:
- `deploy/k8s/web-deployment.yaml` — Next.js, 2 replicas, HPA 2–10 on 70% CPU.
- `deploy/k8s/python-deployment.yaml` — Flask, 1 replica (keep small until scale known).
- `deploy/k8s/scheduler-statefulset.yaml` — 1 replica + distributed lock (4.5).
- `deploy/k8s/postgres-statefulset.yaml` — or use managed (RDS / Neon).
- `deploy/k8s/ingress.yaml` — TLS via cert-manager.
- `deploy/k8s/secret.yaml` (SealedSecrets or external-secrets).
- `Chart.yaml` + Helm templates optional.

**Cost**: L.

---

### 5.3 Backup / restore

**Design**:
- Nightly `pg_dump` via Kubernetes `CronJob` → S3 bucket with 30-day retention + quarterly cold.
- Point-in-time recovery (PITR) if using managed Postgres.
- Runbook in `docs/RUNBOOKS/backup-restore.md` with tested restore procedure.
- `npm run db:restore` script for local DR drill.

**Cost**: M.

---

### 5.4 OpenTelemetry APM

**Design**:
1. `npm i @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node`.
2. `src/instrumentation.node.ts` already exists — wire OTel SDK there with OTLP exporter.
3. Traces: HTTP, Prisma, Genkit, AI SDK, Flask (via Python OTel).
4. Backend: Grafana Tempo / Honeycomb / Jaeger.
5. Metrics: Prometheus scrape from `/metrics` (Next.js via `@opentelemetry/exporter-prometheus`).
6. Correlate with Sentry via `trace_id`.

**Cost**: L.

---

## Execution Order (recommended)

```
Day 1–3   : Phase 1 (all 4 tasks) — security blockers
Day 4     : Phase 2.2 (Sentry), 2.3 (Pino) — observability before scaling changes
Day 5–7   : Phase 3.1, 3.3 (integration + CI) — safety net before refactor
Day 8–9   : Phase 2.1 (token budget), 2.4 (rate limit), 4.5 (distributed lock)
Day 10–12 : Phase 4.1, 4.2, 4.3 (split monoliths) — now safe thanks to tests
Day 13    : Phase 3.2 (E2E)
Day 14–15 : Phase 5.1, 5.3 (secrets, backup)
Day 16–18 : Phase 4.4 (domain layer)
Day 19–20 : Phase 5.2 (K8s), 5.4 (OTel)
```

---

## Pre-flight checklist (before starting Phase 1)

- [ ] Merge or stash the 15 uncommitted files in `AGENT2.0` branch
- [ ] Cut new branch per phase: `hardening/phase-1-security`, etc.
- [ ] Full DB backup of production before any migration
- [ ] Feature flag `HARDENING_MODE` to toggle new gateway/actor paths during rollout
- [ ] Staging environment parity with prod (same migrations, same secrets layout)

## Exit criteria (GA-ready)

- All Phase 1 tasks merged and deployed to staging for ≥ 7 days with no critical incidents.
- Integration test suite > 70 % coverage on `src/app/actions/`.
- Sentry error rate < 0.5 % of requests for 7 consecutive days.
- P95 latency < 2s on top 5 routes.
- Runbooks in `docs/RUNBOOKS/` for: on-call, backup-restore, incident response, secret rotation.
- Overall readiness reassessment ≥ 8.5/10.
