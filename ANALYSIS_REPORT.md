# ANALYSIS REPORT — FridAI / LikeAiSaid
**Data analisi:** 2026-04-12
**Analista:** Claude Code (Sonnet 4.6)
**Branch:** AGENT2.0

---

## 1. Executive Summary

LikeAiSaid è un Business Rules Engine SaaS con architettura Next.js 15 + PostgreSQL (Prisma) + Flask/Python backend. Il codice ha una base solida (multi-tenancy via `companyId`, ORM parametrizzato, Docker non-root) ma presenta **problemi critici di sicurezza che bloccano qualsiasi go-live enterprise**: segreti reali nel repository, endpoint API privi di autenticazione accessibili da internet, e dipendenze con 4 vulnerabilità critiche note.

**Readiness Score Enterprise: 2.5/10**

Stripe, VPN WireGuard e GDPR compliance sono completamente assenti. L'hardening di base della sicurezza deve precedere qualsiasi altra roadmap.

---

## 2. Scheda Tecnica

| Voce | Dettaglio |
|------|-----------|
| Framework | Next.js 15.3.3 (App Router, Turbopack) |
| Database | PostgreSQL via Prisma ORM 5.22 |
| Auth | NextAuth.js v4 + bcryptjs |
| AI | Genkit 1.x (Gemini), Vercel AI SDK v6, Claude CLI, OpenRouter |
| UI | shadcn/ui + Radix + Tailwind + XYFlow + Recharts |
| Python backend | Flask (porta 5005) + Pandas + Plotly |
| Deploy | Docker multi-stage + docker-compose + standalone Next.js |
| Test | Nessun file di test rilevato |
| CI/CD | Nessuno |
| Monitoring | Nessuno |
| Migrations | Prisma Migrate (6 migration applicate) |

---

## 3. Scorecard

| Area | Voto | Note |
|------|------|------|
| Sicurezza | 2/5 | Segreti esposti, endpoint non autenticati, 4 CVE critici |
| Multi-tenancy / Isolamento | 3/5 | companyId su tutti i modelli, ma leak nel node-script |
| GDPR Compliance | 1/5 | Assente: nessun export, nessun diritto all'oblio, nessun audit trail |
| Performance | 3/5 | Indici DB presenti, nessun caching Redis, paginazione assente |
| Stabilità | 2/5 | Nessun health check, nessun error tracking, retry parziale |
| Stripe Integration | 0/5 | Non presente |
| VPN / Networking | 0/5 | Non presente |
| Deploy Readiness | 3/5 | Docker buono, credenziali DB deboli, no CI/CD |
| Qualità Codice | 3/5 | TS errors ignorati nel build, ESLint ignorato |
| Testing | 0/5 | Nessun test |

---

## 4. Findings

### 🔴 CRITICI

---

#### C-01 — Segreti reali nel file `.env` (che esiste sul disco di sviluppo)

**File:** `.env` (righe 5, 37, 40, 42, 49)

Il file `.env` contiene credenziali operative reali:
- `GEMINI_API_KEY=AIzaSyD4YyTuiZr1gK2Fr50dEQ-Iafk48gbmJ8s` ← API key Google AI reale
- `RESEND_API_KEY=re_VzfQdEER_...` ← API key email reale
- `NEXTAUTH_SECRET=q40r6buwvK...` ← secret JWT reale
- `DATABASE_URL=postgresql://postgres:postgres@...` ← credenziali DB deboli

Il `.gitignore` ha `.env*`, quindi non dovrebbe essere tracciato. Ma la presenza di queste chiavi nel repository locale con password banale (`postgres:postgres`) è un rischio. **Ruotare immediatamente tutte le chiavi.**

**Fix urgente:**
```bash
# Verificare che .env non sia mai stato committato:
git log --all --full-history -- .env

# Ruotare tutte le chiavi dal pannello provider (Google AI Studio, Resend)
# Usare un vault (1Password, AWS Secrets Manager) o env injection CI/CD
```

---

#### C-02 — Hardcoded fallback secrets in produzione

**File:** `src/app/api/update-commessa/route.ts:54`, `src/app/api/internal/query-db/route.ts:30`, `src/app/api/scheduler/batch-trigger/route.ts:15`, `src/app/actions.ts:2672`, `src/lib/scheduler/scheduler-actions.ts:352`, `src/lib/html-style-utils.ts:18`, `src/lib/scheduler/scheduler-client.ts:78`

```typescript
// Esempio — update-commessa/route.ts:54
const expectedToken = process.env.INTERNAL_QUERY_TOKEN || 'fridai-internal-query-2024';
//                                                         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//                                                         Se env var non è settata → token pubblico e noto
```

Se `INTERNAL_QUERY_TOKEN` non è configurato in produzione, **chiunque conosce il codice sorgente può eseguire SQL arbitrario**. Stesso per `SCHEDULER_SERVICE_SECRET || 'change-me-in-production'`.

**Fix:**
```typescript
const expectedToken = process.env.INTERNAL_QUERY_TOKEN;
if (!expectedToken) throw new Error('INTERNAL_QUERY_TOKEN non configurato');
if (body.internalToken !== expectedToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
```

---

#### C-03 — `/api/update-commessa` — SQL injection + CORS wildcard + no auth

**File:** `src/app/api/update-commessa/route.ts`

Tre problemi sovrapposti:

**1. SQL injection (Mode 1, righe ~55-65):**
```typescript
// body.query viene eseguita DIRETTAMENTE senza sanitizzazione
const result = await pool.request().query(body.query);
```
Chiunque conosca il token `fridai-internal-query-2024` può eseguire `DROP TABLE`, `DELETE FROM users`, `SELECT * FROM ...`.

**2. CORS wildcard:**
```typescript
'Access-Control-Allow-Origin': '*'  // ← no, mai in produzione per endpoint con scrittura DB
```

**3. Escluso dal middleware:**
```typescript
// middleware.ts:13
"api/update-commessa"  // ← escluso, nessuna sessione richiesta
```

---

#### C-04 — `/api/internal/node-script` — Completamente non autenticato, data leak cross-tenant

**File:** `src/app/api/internal/node-script/route.ts`

Questo endpoint è escluso dal middleware (`api/internal` nella regex). Non ha **nessuna** auth. Chiunque può chiamare:
```
GET /api/internal/node-script?nodeId=xyz
```
E il codice fa:
```typescript
const trees = await db.tree.findMany({
    select: { id: true, jsonDecisionTree: true },
    take: 30,
    // ← nessun filtro companyId
});
```
**Legge il Python code di tutti i tenant.** Data leak cross-tenant critico.

---

#### C-05 — 4 vulnerabilità critiche e 28 alte nelle dipendenze

```
Critici: 4, Alti: 28, Medi: 8, Bassi: 15
```

**Fix:**
```bash
npm audit fix
# Per vulnerabilità che richiedono breaking change:
npm audit fix --force  # dopo aver testato
```
Ispezionare manualmente le 4 critiche: `npm audit --json | jq '.vulnerabilities | to_entries[] | select(.value.severity == "critical")'`

---

#### C-06 — `/api/scheduler/batch-trigger` — Endpoint temporaneo in produzione

**File:** `src/app/api/scheduler/batch-trigger/route.ts:1`

```typescript
/**
 * TEMPORARY: Batch trigger all scheduled tasks sequentially.
 * DELETE THIS FILE after testing.
 */
```
Il commento dice "cancella dopo il test" ma il file è ancora presente nel branch AGENT2.0. Esegue tutti i task dello scheduler con protezione solo da un token debole.

---

### 🟠 ALTI

---

#### A-01 — Nessun rate limiting su login e API AI

**File:** `src/lib/auth.ts`, `src/app/api/agents/chat-stream/route.ts`

Il login (`/api/auth/callback/credentials`) non ha rate limiting. Un attaccante può tentare brute force sulle password senza blocco. Stesso per gli endpoint AI che costano token.

**Fix:** Aggiungere `next-rate-limit` o un middleware Upstash Redis:
```typescript
// middleware.ts — aggiungere prima del redirect auth
import { Ratelimit } from '@upstash/ratelimit';
const ratelimit = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, '1m') });
const { success } = await ratelimit.limit(ip);
if (!success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
```

---

#### A-02 — Credenziali database deboli nel docker-compose

**File:** `docker-compose.yml:55`

```yaml
POSTGRES_USER: postgres
POSTGRES_PASSWORD: postgres  # ← triviale
```

In ambienti di staging/produzione questo è inaccettabile. Usare password forti e passarle come secret.

---

#### A-03 — TypeScript e ESLint errori ignorati nel build

**File:** `next.config.ts:4-9`

```typescript
typescript: { ignoreBuildErrors: true },
eslint: { ignoreDuringBuilds: true },
```

Questo nasconde errori di tipo che potrebbero essere bug reali. In produzione il build deve fallire se ci sono errori.

---

#### A-04 — Server Actions body limit 100MB

**File:** `next.config.ts:19`

```typescript
serverActions: { bodySizeLimit: '100mb' }
```

Permette upload di file da 100MB via Server Action, potenziale DoS vector. Ridurre a un valore ragionevole o gestire upload con streaming dedicato.

---

#### A-05 — API key utente (`openRouterApiKey`) salvata in chiaro nel DB

**File:** `prisma/schema.prisma:53`

```prisma
openRouterApiKey String?  // ← chiave API in chiaro nel database
```

PII/secret sensibili nel DB non crittografati. Se il DB viene compromesso, tutte le API key degli utenti sono esposte.

---

#### A-06 — Nessun test, nessuna CI/CD

Nessun file di test rilevato nel progetto. Nessun GitHub Actions o pipeline CI/CD. Ogni deploy è manuale e non verificato.

---

#### A-07 — Stripe, VPN WireGuard, GDPR: completamente assenti

Tre dei requisiti core del target SaaS enterprise non hanno nessuna implementazione. Richiedono sprint dedicati (vedi Roadmap).

---

### 🟡 MEDI

---

#### M-01 — Connector config (credenziali DB clienti) in JSON plain text

**File:** `prisma/schema.prisma` — modello `Connector`

```prisma
config String  // ← JSON con user/password del DB del cliente
```

Le credenziali dei database aziendali dei clienti sono salvate non crittografate. In caso di SQL injection o accesso non autorizzato al DB, le credenziali di tutti i clienti sono esposte.

**Fix:** Cifrare il campo `config` con AES-256 prima del salvataggio (usando una chiave in env var).

---

#### M-02 — Nessun health check endpoint in Next.js

**File:** `docker-compose.yml:24` (commentato)

```yaml
# healthcheck:
#   test: ["CMD", "wget", ... "http://localhost:9002/api/health"]
```

L'health check Docker è commentato. Nessun endpoint `/api/health` esiste. Kubernetes e load balancer non possono verificare la salute dell'app.

---

#### M-03 — Data-lake espone file senza autenticazione post-middleware

**File:** `src/app/api/data-lake/[...path]/route.ts`

Il middleware protegge la rotta (non è nell'exclusion list), ma la route non verifica che il file richiesto appartenga al `companyId` dell'utente. Un utente autenticato può potenzialmente accedere a file di altri tenant se conosce il path.

---

#### M-04 — No paginazione nelle API list

Alcune query usano `take: 30` hardcoded senza cursor/offset. Le API pubbliche `/api/trees`, `/api/lead-generator/leads` non hanno paginazione forzata.

---

#### M-05 — Nessun CSP header né security headers

`next.config.ts` non configura `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`.

**Fix in `next.config.ts`:**
```typescript
headers: async () => [{
    source: '/(.*)',
    headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        // CSP richiede configurazione specifica per l'app
    ],
}]
```

---

#### M-06 — No MFA

NextAuth v4 con CredentialsProvider non supporta MFA out-of-the-box. Per un'app enterprise con dati aziendali sensibili, TOTP è requisito.

---

#### M-07 — Log includono potenzialmente dati sensibili

```typescript
// update-commessa/route.ts:29
console.log('[update-commessa] Received:', JSON.stringify(body).substring(0, 300));
```

Il body può contenere dati aziendali. I log strutturati (JSON) con redazione dei campi sensibili sono necessari.

---

### 🟢 BASSI

- **B-01:** Password reset token non ha protezione brute force (`PasswordResetToken` model, nessun rate limit su `/api/auth/reset`)
- **B-02:** `TriggerLog` non ha `companyId` — i log di trigger sono globali senza isolamento tenant
- **B-03:** `bodySizeLimit` del Server Action (100mb) dovrebbe essere ridotto a 10mb o meno
- **B-04:** `28-ceos-enriched-research.json`, `all-382-leads-aggregated.json` e altri file di lead nella root del progetto — dati personali (email, telefoni) nella working directory git
- **B-05:** `data/preview-cache/` non ha TTL — può crescere indefinitamente

---

## 5. Gap Analysis — Requisiti SaaS Enterprise

| Requisito | Stato | Gap |
|-----------|-------|-----|
| Multi-tenancy isolamento | ✅ Parziale | node-script leak, connector config plain text |
| Stripe Billing | ❌ Assente | Da costruire ex-novo |
| VPN WireGuard per tenant | ❌ Assente | Da costruire ex-novo |
| GDPR — Diritto accesso | ❌ Assente | Nessun export dati utente |
| GDPR — Diritto oblio | ❌ Assente | `CASCADE` su Company delete, ma nessuna UI/API |
| GDPR — Audit trail | ❌ Assente | `TriggerLog` non è un audit trail completo |
| GDPR — Retention policy | ❌ Assente | Nessun job di pulizia automatica |
| GDPR — Consenso | ❌ Assente | Nessun cookie banner, nessuna privacy policy UI |
| Rate limiting | ❌ Assente | Nessun middleware di throttling |
| MFA | ❌ Assente | Solo username/password |
| Health check | ❌ Assente | Endpoint commentato |
| Error tracking (Sentry) | ❌ Assente | Solo `console.error` |
| CI/CD pipeline | ❌ Assente | Deploy manuale |
| Test suite | ❌ Assente | 0 test |
| Security headers | ❌ Assente | Nessun CSP/HSTS |
| Encryption at rest (secrets) | ❌ Assente | API key e credenziali in chiaro nel DB |

---

## 6. Punti di Forza

- ✅ **Schema multi-tenant solido**: `companyId` su tutti i 25+ modelli, con `onDelete: Cascade` per cleanup automatico
- ✅ **Prisma ORM**: parameterized queries prevengono SQL injection nelle operazioni standard
- ✅ **bcryptjs** per hashing password (non MD5/SHA1)
- ✅ **Docker multi-stage build** con utente non-root (`nextjs`, uid 1001)
- ✅ **Path traversal protection** nel data-lake route (`startsWith(base)` check)
- ✅ **RBAC nel DB** (modelli `Role`/`Permission`), anche se non completamente enforced
- ✅ **Scheduler con retry logic** (maxRetries, retryDelayMinutes, ScheduledTaskExecution)
- ✅ **Documentazione** presente in `docs/` con architettura e guide
- ✅ **Backup trees** presenti, backup DB del 10/04/2026 trovato

---

## 7. Roadmap

### Sprint 1-2 (Settimana 1-4) — Fix Critici Sicurezza
- [ ] **C-01** Ruotare tutte le API key esposte (Gemini, Resend, NEXTAUTH_SECRET)
- [ ] **C-02** Rimuovere tutti i fallback hardcoded (`|| 'fridai-internal-query-2024'`), forzare env var obbligatorie
- [ ] **C-03** Aggiungere auth a `/api/update-commessa`, rimuovere SQL injection in Mode 1, restringere CORS
- [ ] **C-04** Aggiungere `companyId` filter in `/api/internal/node-script`, aggiungere autenticazione
- [ ] **C-05** `npm audit fix` — risolvere 4 CVE critici e 28 alti
- [ ] **C-06** Cancellare `src/app/api/scheduler/batch-trigger/route.ts`
- [ ] **M-05** Aggiungere security headers (CSP, HSTS, X-Frame-Options) in next.config.ts
- [ ] **A-01** Rate limiting su login e endpoint AI (Upstash o `next-rate-limit`)

### Sprint 3-4 (Settimana 5-8) — GDPR + Stripe Base
- [ ] Implementare export dati utente (Art. 15 GDPR) — endpoint JSON/CSV
- [ ] Implementare cancellazione account completa (Art. 17) con anonymization
- [ ] Aggiungere audit trail: `AuditLog` model con `userId`, `companyId`, `action`, `resource`, `timestamp`
- [ ] Cookie banner conforme (no dark pattern)
- [ ] Crittografare `Connector.config` (AES-256) e `User.openRouterApiKey`
- [ ] Stripe SDK + subscription lifecycle (create, upgrade, cancel, webhook)
- [ ] Feature gating middleware basato su piano Stripe
- [ ] Piano Free/Starter/Pro/Enterprise con limiti enforced

### Sprint 5-6 (Settimana 9-12) — Stabilità + WireGuard base
- [ ] Health check endpoint `/api/health` e `/api/readiness`
- [ ] Sentry o Axiom per error tracking
- [ ] Structured logging (JSON) con correlation ID
- [ ] Rimuovere `ignoreBuildErrors: true` e `ignoreDuringBuilds: true` — fix errori reali
- [ ] Setup GitHub Actions CI (lint + typecheck + build su ogni PR)
- [ ] WireGuard: provisioning automatico per tenant (keygen, subnet allocation)
- [ ] Dashboard download config VPN utente

### Sprint 7-8 (Settimana 13-16) — Performance + MFA + Deploy Cloud
- [ ] Redis per session caching e rate limiting
- [ ] Connection pooling PgBouncer per PostgreSQL
- [ ] TOTP MFA con authenticator app
- [ ] Paginazione cursor-based su tutti gli endpoint list
- [ ] Terraform/Pulumi per infrastructure AWS/GCP
- [ ] Kubernetes manifests o ECS task definitions
- [ ] CI/CD pipeline completa (build → staging → produzione)
- [ ] GDPR: retention policy job (cancellazione dati > N giorni)
- [ ] DPIA per trattamenti ad alto rischio (AI su dati aziendali)

### Sprint 9+ — Feature Enhancement e Scaling
- [ ] MFA WebAuthn (passkeys)
- [ ] SSO / SAML per tenant Enterprise
- [ ] Multi-region deploy
- [ ] Read replicas per query heavy
- [ ] Customer Portal Stripe self-service
- [ ] Sub-processor DPA management
- [ ] Penetration test esterno

---

*Fine report — generato il 2026-04-12*
