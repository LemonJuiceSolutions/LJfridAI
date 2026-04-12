# CLAUDE.md — Analisi & Hardening SaaS Multi-Tenant Enterprise

## Contesto del Progetto

Questo software deve diventare una piattaforma SaaS multi-tenant enterprise-grade con:

- **Multi-tenancy con isolamento dati rigoroso** (ogni azienda = tenant isolato)
- **Stripe integration** per billing con piani/livelli di utenza
- **VPN WireGuard** per accesso sicuro ai server aziendali per ogni tenant
- **GDPR compliance al 100%** — gestione dati personali conforme al regolamento UE
- **Deploy-ready** sia standalone (on-premise) che cloud (AWS/GCP/Azure)
- **Sicurezza, velocità, stabilità** come requisiti non negoziabili

---

## FASE 1 — RICOGNIZIONE INIZIALE

### 1.1 Mappatura Progetto
1. Struttura cartelle completa (3 livelli)
2. Linguaggi, framework, versioni runtime
3. Dipendenze e relative versioni (cerca CVE noti)
4. Entry point e boot sequence
5. Documentazione esistente (README, docs/, wiki)
6. Configurazione ambiente (.env, config/, secrets)

### 1.2 Stato Attuale
- Il progetto è già in produzione o in sviluppo?
- Ci sono utenti attivi?
- Qual è il database usato? È già multi-tenant?
- Ci sono test? CI/CD? Monitoring?
- Ci sono dei files che non sono di programma ma sono backup o altri file che ha creato gli agenti dentro all'app se si l'agente non deve piu creare file separati ma deve scrivere nel dB e poi bisogna in qualche modo ripulire la directory'

---

## FASE 2 — ARCHITETTURA E MULTI-TENANCY

### 2.1 Analisi Architettura Corrente
- Pattern architetturale in uso (monolite, microservizi, modulare)
- Mappa dipendenze tra moduli
- Flusso di una richiesta HTTP dalla porta d'ingresso al database e ritorno
- Punti di accoppiamento stretto

### 2.2 Multi-Tenancy — Verifica Isolamento Dati

**CRITICO: Ogni azienda/tenant deve avere dati completamente isolati.**

Verifica quale strategia è usata (o suggerisci la migliore):

| Strategia | Pro | Contro | Quando usarla |
|-----------|-----|--------|---------------|
| Database separato per tenant | Isolamento massimo, GDPR semplice, backup/restore per tenant | Più costoso, migration complesse | < 100 tenant, dati sensibili |
| Schema separato per tenant | Buon isolamento, costo medio | Migration per schema | 100-1000 tenant |
| Tabelle condivise + tenant_id | Economico, scalabile | Rischio data leak, GDPR complesso | > 1000 tenant, dati non critici |

**Checklist isolamento dati:**
- [ ] Ogni query include SEMPRE il filtro tenant_id (o usa schema/db separato)
- [ ] Non è possibile accedere ai dati di un altro tenant tramite API
- [ ] I file upload sono separati per tenant (path o bucket diversi)
- [ ] I log non mescolano dati di tenant diversi
- [ ] Le cache sono segmentate per tenant
- [ ] Le code di lavoro (job queue) sono isolate o taggate per tenant
- [ ] I webhook/callback non espongono dati cross-tenant
- [ ] Il search/full-text index è isolato per tenant
- [ ] Le sessioni utente sono legate al tenant corretto
- [ ] I backup possono essere esportati/cancellati per singolo tenant (diritto GDPR)

---

## FASE 3 — SICUREZZA

### 3.1 Autenticazione e Autorizzazione
- [ ] Autenticazione robusta (bcrypt/argon2 per password, JWT con refresh token)
- [ ] MFA (TOTP/WebAuthn) disponibile o integrabile
- [ ] RBAC o ABAC per i livelli di utenza (admin, manager, user, viewer, ecc.)
- [ ] Session management sicuro (httpOnly, secure, SameSite cookies)
- [ ] Rate limiting su login e API sensibili
- [ ] Account lockout dopo tentativi falliti
- [ ] Password policy (minimo 12 char, complessità, no password comuni)
- [ ] Token revocation funzionante

### 3.2 Sicurezza Applicativa
- [ ] Input validation su TUTTI gli endpoint (usa zod/joi/pydantic)
- [ ] Protezione SQL injection (prepared statements, ORM parametrizzato)
- [ ] Protezione XSS (sanitizzazione output, CSP header)
- [ ] Protezione CSRF (token o SameSite cookie)
- [ ] CORS configurato restrittivamente (no wildcard in produzione)
- [ ] Security headers (HSTS, X-Frame-Options, X-Content-Type-Options)
- [ ] File upload sicuro (validazione MIME, dimensione max, sandboxing)
- [ ] No secrets hardcoded nel codice (usa env var o vault)
- [ ] Dependency audit (npm audit / pip-audit / trivy)
- [ ] No informazioni sensibili nei log (PII, token, password)

### 3.3 Crittografia
- [ ] TLS 1.3 in transito (HTTPS everywhere)
- [ ] Dati sensibili crittografati at-rest (AES-256)
- [ ] Chiavi di crittografia gestite con KMS (AWS KMS, Vault, ecc.)
- [ ] Hashing password con Argon2id o bcrypt (cost factor ≥ 12)
- [ ] PII crittografate nel database dove possibile

### 3.4 Infrastruttura
- [ ] Principio del minimo privilegio su tutti i servizi
- [ ] Network segmentation (VPC, subnet private per DB)
- [ ] Firewall rules restrittive
- [ ] SSH con chiavi, no password, no root login
- [ ] Container con utente non-root, immagine minimale
- [ ] Secrets management (Vault, AWS Secrets Manager, o simili)

---

## FASE 4 — STRIPE INTEGRATION

### 4.1 Verifica/Progettazione Billing

**Livelli di utenza da supportare (esempio):**

| Piano | Caratteristiche | Prezzo |
|-------|----------------|--------|
| Free/Trial | Funzionalità base, X utenti, Y GB | Gratis / 14gg trial |
| Starter | Più utenti, più storage, support email | €/mese |
| Professional | Tutte le feature, priority support | €/mese |
| Enterprise | Custom, SLA, VPN dedicata, on-premise | Su richiesta |

### 4.2 Checklist Stripe
- [ ] Stripe SDK integrato con versione aggiornata
- [ ] Webhook endpoint per eventi Stripe (signature verification!)
- [ ] Gestione subscription lifecycle: create, upgrade, downgrade, cancel
- [ ] Gestione pagamenti falliti (dunning: retry automatico + notifica)
- [ ] Prorating per upgrade/downgrade mid-cycle
- [ ] Invoice e receipt automatici
- [ ] Tax management (Stripe Tax o manuale per IVA EU)
- [ ] Customer Portal di Stripe per self-service
- [ ] Trial period con conversione automatica
- [ ] Gestione coupon/promozioni
- [ ] SCA/3D Secure per pagamenti EU (PSD2 compliance)
- [ ] Webhook idempotency (gestire eventi duplicati)
- [ ] Stripe keys SOLO in env var, MAI nel codice
- [ ] Test mode completo prima del go-live
- [ ] Metering/usage tracking se ci sono piani a consumo

### 4.3 Feature Gating
- [ ] Middleware/guard che verifica il piano del tenant ad ogni richiesta
- [ ] Feature flags legati al piano Stripe
- [ ] Limiti d'uso enforced (utenti, storage, API calls)
- [ ] Graceful degradation quando si supera il limite (no crash)
- [ ] Pagina upgrade/upsell quando si raggiunge il limite

---

## FASE 5 — VPN WIREGUARD

### 5.1 Architettura VPN per Tenant

Ogni azienda/tenant deve avere la propria VPN WireGuard per accesso sicuro:

- [ ] Server WireGuard dedicato o namespace di rete per tenant
- [ ] Generazione automatica chiavi (private/public key pair) per tenant
- [ ] Distribuzione sicura delle configurazioni client (.conf)
- [ ] Subnet IP separata per ogni tenant (es. 10.X.0.0/24)
- [ ] Firewall rules che impediscono traffico cross-tenant
- [ ] Dashboard admin per gestione peer (aggiunta/revoca dispositivi)
- [ ] Kill switch / auto-disconnect su inattività
- [ ] Logging accessi VPN (chi, quando, da dove) per audit
- [ ] Rotazione periodica delle chiavi
- [ ] Supporto multi-device per utente

### 5.2 Integrazione con l'Applicazione
- [ ] Provisioning VPN automatico alla creazione del tenant
- [ ] De-provisioning alla cancellazione/sospensione del tenant
- [ ] API interna per gestione peer WireGuard
- [ ] Download configurazione VPN da dashboard utente
- [ ] Stato connessione VPN visibile nella dashboard admin
- [ ] Accesso ai server aziendali SOLO via VPN (no esposizione diretta)

---

## FASE 6 — GDPR COMPLIANCE

### 6.1 Requisiti Legali (Reg. UE 2016/679)

**CRITICO: Questo non è opzionale. Le sanzioni arrivano fino al 4% del fatturato globale.**

- [ ] **Privacy by Design** (Art. 25) — la protezione dati è integrata nell'architettura
- [ ] **Registro dei trattamenti** (Art. 30) — documentare quali dati, perché, per quanto
- [ ] **Base giuridica** (Art. 6) — consenso, contratto, interesse legittimo per ogni trattamento
- [ ] **Informativa privacy** (Art. 13-14) — chiara, accessibile, completa
- [ ] **Consenso** (Art. 7) — esplicito, granulare, revocabile, registrato con timestamp
- [ ] **DPO** (Art. 37-39) — necessario se trattamento su larga scala

### 6.2 Diritti degli Interessati (Artt. 15-22)
- [ ] **Diritto di accesso** (Art. 15) — export dati utente in formato leggibile (JSON/CSV)
- [ ] **Diritto di rettifica** (Art. 16) — modifica dati personali
- [ ] **Diritto alla cancellazione** (Art. 17) — "diritto all'oblio", cancellazione completa
- [ ] **Diritto alla portabilità** (Art. 20) — export in formato strutturato e interoperabile
- [ ] **Diritto di opposizione** (Art. 21) — opt-out da trattamenti specifici
- [ ] **Diritto alla limitazione** (Art. 18) — blocco temporaneo del trattamento
- [ ] Tutti i diritti esercitabili entro 30 giorni dalla richiesta
- [ ] Workflow automatizzato o semi-automatizzato per gestire le richieste

### 6.3 Implementazione Tecnica GDPR
- [ ] **Data mapping** — inventario di tutti i dati personali, dove sono, chi vi accede
- [ ] **Data minimization** — raccogliere SOLO i dati strettamente necessari
- [ ] **Retention policy** — cancellazione automatica dopo il periodo definito
- [ ] **Pseudonimizzazione** — dove possibile, separare identità dai dati
- [ ] **Encryption at rest** — AES-256 per dati personali nel database
- [ ] **Audit trail** — log immutabile di chi accede a quali dati e quando
- [ ] **Breach notification** — procedura per notifica al Garante entro 72h (Art. 33)
- [ ] **DPIA** (Art. 35) — Valutazione d'impatto per trattamenti ad alto rischio
- [ ] **Cookie consent** — banner conforme con opt-in (no dark pattern)
- [ ] **Sub-processor management** — elenco e DPA con tutti i fornitori (Stripe, AWS, ecc.)
- [ ] **Data residency** — dati EU su server EU (o adeguate garanzie per trasferimento extra-UE)
- [ ] **Backup isolation** — possibilità di cancellare dati di un singolo tenant dai backup

---

## FASE 7 — PERFORMANCE E STABILITÀ

### 7.1 Performance
- [ ] Query database ottimizzate (indici, no N+1, query plan analysis)
- [ ] Caching strategico (Redis/Memcached per sessioni, query frequenti, config tenant)
- [ ] Connection pooling database (PgBouncer o equivalente)
- [ ] Asset optimization (minificazione, compressione, CDN)
- [ ] Lazy loading e code splitting frontend
- [ ] API pagination obbligatoria su tutti gli endpoint list
- [ ] Background job per operazioni pesanti (email, report, export)
- [ ] Compression (gzip/brotli) su tutte le response HTTP
- [ ] Database read replicas per query pesanti
- [ ] Profiling e benchmarking prima/dopo le ottimizzazioni

### 7.2 Stabilità e Resilienza
- [ ] Health check endpoint (/health, /readiness)
- [ ] Graceful shutdown (chiusura connessioni in corso)
- [ ] Circuit breaker per servizi esterni (Stripe, email, VPN)
- [ ] Retry con exponential backoff per operazioni fallibili
- [ ] Dead letter queue per job falliti
- [ ] Error tracking (Sentry o equivalente)
- [ ] Structured logging (JSON) con correlation ID
- [ ] Monitoring e alerting (metriche CPU, RAM, disk, latency, error rate)
- [ ] Database migration automatiche e reversibili
- [ ] Backup automatici con test di restore periodico
- [ ] Disaster recovery plan documentato
- [ ] Uptime SLA definito e monitorato

---

## FASE 8 — DEPLOY STANDALONE & CLOUD

### 8.1 Containerizzazione
- [ ] Dockerfile ottimizzato (multi-stage build, immagine minimale)
- [ ] docker-compose per deploy standalone (app + db + redis + wireguard)
- [ ] .dockerignore completo
- [ ] Container non-root
- [ ] Health check nel Dockerfile
- [ ] Volumi per dati persistenti (DB, upload, config WireGuard)
- [ ] Env var per TUTTA la configurazione (twelve-factor app)

### 8.2 Deploy Standalone (On-Premise)
- [ ] Script di installazione one-command (install.sh)
- [ ] Requisiti minimi documentati (CPU, RAM, disco, OS)
- [ ] Auto-update mechanism o procedura documentata
- [ ] Backup automatico locale
- [ ] Certificato TLS automatico (Let's Encrypt / Caddy)
- [ ] Firewall configurato di default
- [ ] Documentazione per sysadmin

### 8.3 Deploy Cloud (AWS/GCP/Azure)
- [ ] Infrastructure as Code (Terraform/Pulumi/CDK)
- [ ] Kubernetes manifests o ECS task definitions
- [ ] Auto-scaling (horizontal pod autoscaler o equivalente)
- [ ] Load balancer con TLS termination
- [ ] Managed database (RDS/Cloud SQL/Azure SQL)
- [ ] Object storage per file (S3/GCS/Azure Blob)
- [ ] CDN per asset statici
- [ ] Logging centralizzato (CloudWatch/Stackdriver)
- [ ] CI/CD pipeline completa (build, test, deploy staging, deploy prod)
- [ ] Blue-green o canary deployment
- [ ] Multi-region per alta disponibilità (opzionale ma consigliato)
- [ ] Cost optimization (right-sizing, reserved instances, spot per batch)

### 8.4 Configurazione Ambiente
```
# Template .env con TUTTE le variabili necessarie

# === App ===
NODE_ENV=production
APP_PORT=3000
APP_URL=https://app.example.com
APP_SECRET=                     # Generare con: openssl rand -hex 64

# === Database ===
DB_HOST=localhost
DB_PORT=5432
DB_NAME=saas_app
DB_USER=app_user
DB_PASSWORD=                    # Generare password forte
DB_SSL=true
DB_POOL_MIN=5
DB_POOL_MAX=20

# === Redis ===
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=

# === Stripe ===
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_ENTERPRISE=price_...

# === WireGuard ===
WG_SERVER_IP=10.0.0.1
WG_SERVER_PORT=51820
WG_INTERFACE=wg0
WG_CONFIG_PATH=/etc/wireguard/
WG_SUBNET_PREFIX=10              # Tenant subnets: 10.X.0.0/24

# === Email ===
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=

# === GDPR ===
DATA_RETENTION_DAYS=730          # 2 anni default
GDPR_DPO_EMAIL=dpo@example.com
DATA_RESIDENCY=EU

# === Security ===
CORS_ORIGIN=https://app.example.com
RATE_LIMIT_WINDOW_MS=900000     # 15 min
RATE_LIMIT_MAX=100
JWT_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d

# === Monitoring ===
SENTRY_DSN=
LOG_LEVEL=info
```

---

## FASE 9 — REPORT FINALE

### Struttura del Report

1. **Executive Summary** — stato attuale in 5 righe + readiness score
2. **Scheda Tecnica** — stack, dimensione, dipendenze
3. **Scorecard** (voto 1-5 per area):

| Area | Voto | Note |
|------|------|------|
| Sicurezza | /5 | |
| Multi-tenancy / Isolamento | /5 | |
| GDPR Compliance | /5 | |
| Performance | /5 | |
| Stabilità | /5 | |
| Stripe Integration | /5 | |
| VPN / Networking | /5 | |
| Deploy Readiness | /5 | |
| Qualità Codice | /5 | |
| Testing | /5 | |

4. **Findings** — ordinati per priorità:
   - 🔴 **Critico** — blocca il go-live, rischio legale/sicurezza
   - 🟠 **Alto** — da risolvere prima del lancio
   - 🟡 **Medio** — da pianificare nel breve termine
   - 🟢 **Basso** — nice to have, miglioramento continuo

5. **Gap Analysis** — cosa manca rispetto ai requisiti sopra elencati
6. **Roadmap** — piano d'azione con stime temporali:
   - Sprint 1-2: Fix critici (sicurezza, data leak)
   - Sprint 3-4: GDPR compliance + Stripe
   - Sprint 5-6: WireGuard + deploy pipeline
   - Sprint 7-8: Performance + monitoring + stabilizzazione
   - Sprint 9+: Feature enhancement, scaling

7. **Punti di Forza** — cosa è già fatto bene

---

## Regole per l'Analisi

- **Sii specifico**: cita SEMPRE file e righe, non fare osservazioni generiche
- **Sii onesto**: se qualcosa è fatto bene, dillo. Se è critico, non edulcorare
- **Sii pratico**: ogni suggerimento deve avere codice di esempio quando possibile
- **Pensa come un attaccante**: per la sicurezza, prova a trovare il modo di rompere il sistema
- **Pensa come un auditor GDPR**: per la compliance, verifica ogni requisito del regolamento
- **Pensa come un utente**: per la UX, verifica che billing e VPN siano usabili
- **Prioritizza**: non tutto è urgente, ma i problemi di sicurezza e data leak sono SEMPRE 🔴
- **Salva il report**: scrivi tutto in `ANALYSIS_REPORT.md` nella root del progetto

